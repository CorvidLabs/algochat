"""
AGENT-1.a, AGENT-1.c and AGENT-1.e on LocalNet: the CLI, the MCP server and the webhook bridge.

The real ``algochat-agent`` command (run as ``python -m algochat.agent``) and
its MCP server run as separate processes with the bot's mnemonic only in
their environment. They publish the bot's keys, read and answer one-to-one
messages, and read and answer room messages that people wrote with each
implementation's own tool (TypeScript, Go, Rust, Python, Kotlin). The room
tools refuse what the room's reply policy keeps silent (AGENT-8). ``serve``
sends only what the policy allows to a signed webhook on this machine and
posts its answers. Every implementation opens every bot note and reduces the
room chain; Swift does the same from a recorded file through ``swift test``.
No output carries the mnemonic.

Run with ``ALGOCHAT_REQUIRE_LOCALNET=1`` so a missing network or tool fails
instead of skipping. Build the tools first (see ``tests/cross_tools.py``).
Accounts are throwaway and funded only by the local KMD dispenser.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest

import algochat
from algochat.agent import (
    COMMANDS,
    LEAVE_NOTICE,
    ROOM_ACTIVE,
    ROOM_LEFT,
    SECRET_ENV,
    SKIP_FROM_BOT,
    SKIP_NOT_MENTIONED,
)
from algochat.agent.config import MNEMONIC_ENV, MNEMONIC_FILE_ENV
from algochat.agent.runtime import (
    ALGOD_TOKEN_ENV,
    ALGOD_URL_ENV,
    INDEXER_TOKEN_ENV,
    INDEXER_URL_ENV,
)
from algochat.group_admin import (
    BOT_MODE_COMMANDS,
    BOT_MODE_EVERY_MESSAGE,
    BOT_MODE_MENTIONS,
    OP_ADD_BOT,
    OP_ADD_MEMBER,
    OP_CREATE,
    OP_SET_BOT,
    BotSettings,
)

from .cross_tools import ToolMissing, swift_replay
from .localnet_support import ALGOD_URL, INDEXER_URL, TOKEN, SigningAccount
from .room_support import public_key
from .test_agent_localnet import _assert_no_secret
from .test_agent_rooms_localnet import (
    _REASON,
    REQUIRED,
    Harness,
    _bot_note,
    _core,
    _tools,
)
from .webhook_support import Receiver

pytestmark = [
    pytest.mark.localnet,
    pytest.mark.skipif(_REASON is not None, reason=_REASON or ""),
]

SECRET = "localnet-webhook-secret-0123456789abcdef"
SOURCE = str(Path(algochat.__file__).resolve().parents[1])
GLOBAL = ["--name", "helper", "--command", "echo=Repeat your text"]


class Bot:
    """Runs the CLI and the MCP server as processes, and keeps everything they print."""

    def __init__(self, account: SigningAccount) -> None:
        env = {k: v for k, v in os.environ.items() if not k.startswith("ALGOCHAT_")}
        env.update({
            "PYTHONPATH": SOURCE,
            MNEMONIC_ENV: account.mnemonic,
            ALGOD_URL_ENV: ALGOD_URL,
            ALGOD_TOKEN_ENV: TOKEN,
            INDEXER_URL_ENV: INDEXER_URL,
            INDEXER_TOKEN_ENV: TOKEN,
            SECRET_ENV: SECRET,
        })
        env.pop(MNEMONIC_FILE_ENV, None)
        self.env = env
        self.output: list[str] = []
        self.mcp: subprocess.Popen[str] | None = None
        self._id = 0

    def cli(self, *args: str, ok: bool = True) -> Any:
        run = subprocess.run(
            [sys.executable, "-m", "algochat.agent", *GLOBAL, *args],
            env=self.env, capture_output=True, text=True, timeout=180, check=False,
        )
        self.output += [run.stdout, run.stderr]
        if not ok:
            assert run.returncode == 1, (run.stdout, run.stderr)
            return run.stderr
        assert run.returncode == 0, run.stderr[-4000:]
        return json.loads(run.stdout)

    def start_mcp(self) -> None:
        self.mcp = subprocess.Popen(
            [sys.executable, "-m", "algochat.agent", *GLOBAL, "mcp"],
            env=self.env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )

    def rpc(self, method: str, params: dict | None = None) -> dict:
        assert self.mcp is not None and self.mcp.stdin and self.mcp.stdout
        self._id += 1
        self.mcp.stdin.write(json.dumps({"jsonrpc": "2.0", "id": self._id, "method": method, "params": params or {}}) + "\n")
        self.mcp.stdin.flush()
        line = self.mcp.stdout.readline()
        self.output.append(line)
        reply = json.loads(line)
        assert reply["id"] == self._id and "error" not in reply, reply
        return reply["result"]

    def tool(self, name: str, **arguments: Any) -> tuple[bool, Any]:
        result = self.rpc("tools/call", {"name": name, "arguments": arguments})
        text = result["content"][0]["text"]
        return bool(result.get("isError")), (text if result.get("isError") else json.loads(text))

    def close(self) -> None:
        if self.mcp is not None:
            self.mcp.stdin.close()  # type: ignore[union-attr]
            self.mcp.wait(timeout=30)
            self.output.append(self.mcp.stderr.read())  # type: ignore[union-attr]
            assert self.mcp.returncode == 0
            self.mcp = None


async def test_cli_mcp_and_webhook_on_localnet_across_every_language(tmp_path):
    tools = _tools()
    harness = Harness(tools)
    bot_account = await harness.account()
    bot = Bot(bot_account)
    try:
        owner = await harness.account()
        member = await harness.account()
        other_bot_account = await harness.account()
        mailbox = await harness.account()
        person = await _core(member, harness, name="member")
        other_bot = await _core(other_bot_account, harness, name="other")
        for core in (person, other_bot):
            await harness.indexer.wait_for_indexer(await core.publish_key(), 30)

        # 1. The CLI knows the bot's address and publishes its keys once.
        assert bot.cli("address") == {"address": bot_account.address, "name": "helper"}
        published = bot.cli("publish-keys")
        assert published["encryption_key_txid"] and published["pq_key_txid"]
        for txid in published.values():
            await harness.indexer.wait_for_indexer(txid, 30)
        assert bot.cli("publish-keys") == {"encryption_key_txid": None, "pq_key_txid": None}

        # 2. A room with another bot, and our bot in mentions mode (4 replies per 60 s).
        room = harness.room(mailbox)
        await room.admin(owner.seed, OP_CREATE, name="adapters \u2713")
        await room.admin(owner.seed, OP_ADD_MEMBER, subject=public_key(member.seed))
        await room.admin(
            owner.seed, OP_ADD_BOT, subject=public_key(other_bot_account.seed), bot=BotSettings(BOT_MODE_EVERY_MESSAGE, 5, 60)
        )
        add = await room.admin(
            owner.seed, OP_ADD_BOT, subject=public_key(bot_account.seed), bot=BotSettings(BOT_MODE_MENTIONS, 4, 60)
        )
        await room.deliver(owner.seed, bot_account.seed, add)
        [listed] = bot.cli("rooms")
        assert (listed["group_id"], listed["mailbox"], listed["status"]) == (room.group_id.hex(), mailbox.address, ROOM_ACTIVE)
        assert listed["bot"] == {"mode": BOT_MODE_MENTIONS, "replies": 4, "seconds": 60}

        # 3. One-to-one through the CLI: the person gets an answer, the other bot does not.
        asked = await harness.indexer.wait_for_indexer(await person.send_direct(bot_account.address, "hi bot \u2713"), 30)
        from_bot = await harness.indexer.wait_for_indexer(await other_bot.send_direct(bot_account.address, "bot to bot"), 30)
        read = bot.cli("read")
        assert [(m["txid"], m["text"], m["from_bot"]) for m in read] == [
            (asked.txid, "hi bot \u2713", False),
            (from_bot.txid, "bot to bot", True),
        ]
        reply = bot.cli("reply", "--txid", asked.txid, "--text", "hello from the CLI \U0001f680")
        await harness.indexer.wait_for_indexer(reply["txid"], 30)
        assert SKIP_FROM_BOT in bot.cli("reply", "--txid", from_bot.txid, "--text", "no", ok=False)
        got = await person.read_direct()
        assert [(m.text, m.reply_to) for m in got] == [("hello from the CLI \U0001f680", asked.txid)]

        # 4. Room messages from three languages; the MCP server lists 11 tools and follows the policy.
        quiet = await harness.write("ts", room, owner, "good morning \u2600")
        mentioned = await harness.write("go", room, member, "@helper through MCP?")
        botty = await harness.write("rs", room, other_bot_account, "@helper from a bot")
        bot.start_mcp()
        assert bot.rpc("initialize", {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "t", "version": "0"}})
        assert sorted(t["name"] for t in bot.rpc("tools/list")["tools"]) == sorted(c.tool_name for c in COMMANDS)
        error, messages = bot.tool("read_rooms")
        assert not error
        assert [(m["txid"], m["skipped"]) for m in messages] == [
            (quiet.txid, SKIP_NOT_MENTIONED),
            (mentioned.txid, None),
            (botty.txid, SKIP_FROM_BOT),
        ]
        error, text = bot.tool("reply_room", txid=quiet.txid, text="unasked")
        assert error and SKIP_NOT_MENTIONED in text
        error, text = bot.tool("reply_room", txid=botty.txid, text="to a bot")
        assert error and SKIP_FROM_BOT in text
        error, posted = bot.tool("reply_room", txid=mentioned.txid, text="answered over MCP \u2713")
        assert not error
        bot.close()
        # 5. serve --once: only what the policy allows reaches the signed webhook on this machine.
        ping = await harness.indexer.wait_for_indexer(await person.send_direct(bot_account.address, "ping via webhook"), 30)
        hooked = await harness.write("kt", room, member, "@helper over the webhook \u2713")
        unmentioned = await harness.write("py", room, owner, "no mention here")
        with Receiver(secret=SECRET) as receiver:
            served = bot.cli("serve", "--webhook", receiver.url, "--once")
            assert receiver.bad_signatures == 0
            assert [(p["type"], p["txid"]) for p in receiver.received] == [("direct", ping.txid), ("room", hooked.txid)]
        assert [(d["txid"], d["skipped"], d["reply_txid"] is not None) for d in served["direct"]] == [
            (from_bot.txid, SKIP_FROM_BOT, False),
            (ping.txid, None, True),
        ]
        assert [(r["txid"], r["skipped"], r["reply_txid"] is not None) for r in served["rooms"]] == [
            (hooked.txid, None, True),
            (unmentioned.txid, SKIP_NOT_MENTIONED, False),
        ]
        [hook_reply] = [r["reply_txid"] for r in served["rooms"] if r["reply_txid"]]
        await harness.indexer.wait_for_indexer(next(d["reply_txid"] for d in served["direct"] if d["reply_txid"]), 30)
        got = await person.read_direct()
        assert [(m.text, m.reply_to) for m in got] == [("heard: ping via webhook", ping.txid)]

        # 6. Commands mode: the CLI posts the command list; then the bot leaves through the CLI.
        await room.admin(owner.seed, OP_SET_BOT, subject=public_key(bot_account.seed), bot=BotSettings(BOT_MODE_COMMANDS, 4, 60))
        declared = bot.cli("declare-commands")
        assert declared["command_list"].startswith("Commands for @helper:\n/echo - Repeat your text")
        [list_txid] = declared["txids"]
        left = bot.cli("leave-room", "--group-id", room.group_id.hex(), "--mailbox", mailbox.address)
        [notice] = left["txids"]
        # leave-room confirms on algod; `rooms` is a new process that sees the notice only
        # through the indexer, so wait for the indexer to have it first.
        await harness.indexer.wait_for_indexer(notice, 30)
        [after] = bot.cli("rooms")
        assert after["status"] == ROOM_LEFT

        # 7. Every language opens every bot note; Swift replays them with the room chain.
        for txid, text, name in [
            (posted["txid"], "answered over MCP \u2713", "bot:mcp"),
            (hook_reply, "heard: @helper over the webhook \u2713", "bot:webhook"),
            (list_txid, declared["command_list"], "bot:command-list"),
            (notice, LEAVE_NOTICE, "bot:leave"),
        ]:
            await _bot_note(harness, room, bot_account, txid, text, name)
        rooms = {"room": harness.reduce_everywhere(room)}
        assert dict(zip(rooms["room"]["bots"], rooms["room"]["bot_settings"], strict=True))[
            public_key(bot_account.seed).hex()
        ] == [BOT_MODE_COMMANDS, 4, 60]
        record_path, done_path = tmp_path / "adapters-record.json", tmp_path / "adapters-done"
        record_path.write_text(json.dumps({"notes": harness.notes, "rooms": rooms}, ensure_ascii=False), encoding="utf-8")
        try:
            run = swift_replay(record_path, done_path, "AgentRoomsLocalnetTests", "ALGOCHAT_ROOMS_LOCALNET")
        except ToolMissing as error:
            if REQUIRED:
                pytest.fail(str(error))
            pytest.skip(str(error))
        assert run.returncode == 0, (run.stdout + run.stderr)[-4000:]
        assert done_path.read_text().split() == [str(len(harness.notes)), "1"], "the Swift replay test did not run"

        # 8. Nothing the processes printed carries the bot's key.
        _assert_no_secret("\n".join(bot.output), bot_account)
    finally:
        if bot.mcp is not None:
            bot.mcp.kill()
        for tool in tools.values():
            tool.close()
