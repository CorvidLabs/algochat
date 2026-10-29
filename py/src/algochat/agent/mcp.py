"""
MCP server on the agent core (AGENT-1.a, AGENT-1.e).

A Model Context Protocol server over stdio (one JSON-RPC 2.0 message per
line) with one tool per CLI command, built from the same list
(:data:`algochat.agent.service.COMMANDS`). Design choice: it is written on
the standard library, so the bot needs no extra package.
"""

from __future__ import annotations

import asyncio
import json
import sys
from collections.abc import Awaitable, Callable
from typing import IO, Any

from .service import COMMANDS, AgentService, CommandError, to_json

PROTOCOL_VERSIONS = ("2025-06-18", "2025-03-26", "2024-11-05")
"""MCP protocol versions this server speaks, newest first."""

SERVER_NAME = "algochat-agent"


def tool_list() -> list[dict[str, Any]]:
    """The MCP tools: one per CLI command, with the same parameters."""
    return [
        {"name": c.tool_name, "description": c.description, "inputSchema": c.input_schema()}
        for c in COMMANDS
    ]


class McpServer:
    """Answers MCP requests with a lazily built :class:`AgentService`."""

    def __init__(self, service_factory: Callable[[], Awaitable[AgentService]], version: str = "") -> None:
        self._factory = service_factory
        self._service: AgentService | None = None
        self._version = version

    async def _get_service(self) -> AgentService:
        if self._service is None:
            self._service = await self._factory()
        return self._service

    async def handle(self, request: Any) -> dict[str, Any] | None:
        """Answers one JSON-RPC message. Returns None for notifications."""
        if not isinstance(request, dict) or request.get("jsonrpc") != "2.0" or "method" not in request:
            return _error(request.get("id") if isinstance(request, dict) else None, -32600, "Invalid request")
        method = request["method"]
        if "id" not in request:
            return None  # notifications, such as notifications/initialized, need no answer
        rid = request["id"]
        params = request.get("params") or {}
        if method == "initialize":
            asked = params.get("protocolVersion") if isinstance(params, dict) else None
            version = asked if asked in PROTOCOL_VERSIONS else PROTOCOL_VERSIONS[0]
            return _result(
                rid,
                {
                    "protocolVersion": version,
                    "capabilities": {"tools": {"listChanged": False}},
                    "serverInfo": {"name": SERVER_NAME, "version": self._version},
                },
            )
        if method == "ping":
            return _result(rid, {})
        if method == "tools/list":
            return _result(rid, {"tools": tool_list()})
        if method == "tools/call":
            if not isinstance(params, dict) or not isinstance(params.get("name"), str):
                return _error(rid, -32602, "tools/call needs a tool name")
            name = params["name"]
            if name not in {c.tool_name for c in COMMANDS}:
                return _error(rid, -32602, f"Unknown tool {name}")
            arguments = params.get("arguments") or {}
            if not isinstance(arguments, dict):
                return _error(rid, -32602, "arguments must be an object")
            try:
                service = await self._get_service()
                value = to_json(await service.run(name, arguments))
            except Exception as error:  # noqa: BLE001 - a failed tool is a result, not a crash
                return _result(rid, _content(f"{type(error).__name__}: {error}", True))
            return _result(rid, _content(json.dumps(value, ensure_ascii=False), False))
        return _error(rid, -32601, f"Unknown method {method}")

    async def serve(self, reader: IO[str] | None = None, writer: IO[str] | None = None) -> None:
        """Reads requests from stdin and writes answers to stdout until stdin closes."""
        source = reader or sys.stdin
        sink = writer or sys.stdout
        while True:
            line = await asyncio.to_thread(source.readline)
            if not line:
                return
            if not line.strip():
                continue
            try:
                request = json.loads(line)
            except ValueError:
                answer: dict[str, Any] | None = _error(None, -32700, "Parse error")
            else:
                answer = await self.handle(request)
            if answer is not None:
                sink.write(json.dumps(answer, ensure_ascii=False) + "\n")
                sink.flush()


def _result(rid: Any, result: dict[str, Any]) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": rid, "result": result}


def _error(rid: Any, code: int, message: str) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": rid, "error": {"code": code, "message": message}}


def _content(text: str, is_error: bool) -> dict[str, Any]:
    return {"content": [{"type": "text", "text": text}], "isError": is_error}


__all__ = ["PROTOCOL_VERSIONS", "SERVER_NAME", "CommandError", "McpServer", "tool_list"]
