"""
Command-line tool on the agent core (AGENT-1.a, AGENT-1.e).

``algochat-agent <command>`` (or ``python -m algochat.agent``) has one
subcommand per shared command in :data:`algochat.agent.service.COMMANDS`,
plus ``mcp``, which runs the MCP server with a tool for each of them. Each
command prints its result as JSON. The bot's mnemonic comes only from
``ALGOCHAT_AGENT_MNEMONIC`` or the file named by
``ALGOCHAT_AGENT_MNEMONIC_FILE`` (AGENT-4) and never appears in output.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from collections.abc import Sequence
from importlib.metadata import PackageNotFoundError, version
from typing import Any

from .mcp import McpServer
from .runtime import build_core, parse_command, webhook_factory
from .service import COMMANDS, AgentService, command_by_name, to_json

MCP_COMMAND = "mcp"
"""The CLI subcommand that runs the MCP server; it is the server, so it has no tool."""

DEFAULT_INTERVAL = 5.0


def _version() -> str:
    try:
        return version("py-algochat")
    except PackageNotFoundError:
        return ""


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="algochat-agent",
        description="Run a self-hosted AlgoChat bot. Settings come from ALGOCHAT_* environment variables.",
    )
    parser.add_argument("--name", help="The name members write after @ to mention the bot")
    parser.add_argument(
        "--command",
        action="append",
        default=[],
        metavar="NAME=DESCRIPTION",
        help="A slash command the bot declares (repeat for more)",
    )
    sub = parser.add_subparsers(dest="cmd", required=True, metavar="COMMAND")
    for command in COMMANDS:
        p = sub.add_parser(command.name, help=command.description, description=command.description)
        for param in command.params:
            flag = "--" + param.name.replace("_", "-")
            if param.kind == "boolean":
                p.add_argument(flag, dest=param.name, action="store_true", help=param.description)
            else:
                p.add_argument(
                    flag,
                    dest=param.name,
                    required=param.required,
                    type=int if param.kind == "integer" else str,
                    help=param.description,
                )
        if command.name == "serve":
            p.add_argument("--once", action="store_true", help="Answer what is new once, then stop")
            p.add_argument(
                "--interval",
                type=float,
                default=DEFAULT_INTERVAL,
                help=f"Seconds between passes (default {DEFAULT_INTERVAL:g})",
            )
    sub.add_parser(MCP_COMMAND, help="Run the MCP server over stdio, with a tool for every command above")
    return parser


async def _service(args: argparse.Namespace) -> AgentService:
    core = await build_core(name=args.name, commands=[parse_command(c) for c in args.command])
    return AgentService(core, webhook=webhook_factory())


def _print(value: Any) -> None:
    print(json.dumps(to_json(value), ensure_ascii=False, indent=2))


async def _run(args: argparse.Namespace) -> int:
    if args.cmd == MCP_COMMAND:
        async def factory() -> AgentService:
            return await _service(args)

        await McpServer(factory, _version()).serve()
        return 0
    command = command_by_name(args.cmd)
    arguments = {p.name: getattr(args, p.name) for p in command.params}
    arguments = {k: v for k, v in arguments.items() if v is not None and v is not False}
    service = await _service(args)
    if command.name == "serve" and not args.once:
        while True:
            _print(await service.run(command.name, arguments))
            sys.stdout.flush()
            await asyncio.sleep(args.interval)
    _print(await service.run(command.name, arguments))
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return asyncio.run(_run(args))
    except KeyboardInterrupt:
        return 130
    except Exception as error:  # noqa: BLE001 - one line for the operator, no traceback
        print(f"error: {type(error).__name__}: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
