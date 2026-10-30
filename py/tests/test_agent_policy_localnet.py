"""
AGENT-8 on LocalNet: the bot follows the reply mode and rate limit in the room's record.

An owner makes a room on a real local chain, appoints an admin, adds another
bot and adds our bot (op 13) in mentions mode. People write room messages with
each implementation's own tool (TypeScript, Go, Rust, Python, Kotlin); the bot
answers with ``AgentCore.serve_rooms`` only where its mode says, within its
rate limit, and never to the other bot. The admin and then the owner change
its mode and limit (op 14); the bot follows from the next message, posts its
command list in commands mode and answers only its own commands. A one-to-one
message from the other bot gets no answer. Every implementation opens every
bot and person note and reduces the room chain with the bots' modes and
limits; Swift does the same from a recorded file through ``swift test``.

Run with ``ALGOCHAT_REQUIRE_LOCALNET=1`` so a missing network or tool fails
instead of skipping. Build the tools first (see ``tests/cross_tools.py``).
Accounts are throwaway and funded only by the local KMD dispenser.
"""

from __future__ import annotations

import asyncio
import json
import time

import pytest

from algochat.agent import (
    SKIP_FROM_BOT,
    SKIP_NOT_A_COMMAND,
    SKIP_NOT_MENTIONED,
    SKIP_RATE_LIMIT,
    BotCommand,
    RoomMessage,
)
from algochat.group_admin import (
    BOT_MODE_COMMANDS,
    BOT_MODE_EVERY_MESSAGE,
    BOT_MODE_MENTIONS,
    OP_ADD_BOT,
    OP_ADD_MEMBER,
    OP_APPOINT_ADMIN,
    OP_CREATE,
    OP_SET_BOT,
    BotSettings,
)

from .cross_tools import ToolMissing, swift_replay
from .room_support import public_key
from .test_agent_rooms_localnet import (
    _REASON,
    REQUIRED,
    Harness,
    _bot_note,
    _core,
    _tools,
)

pytestmark = [
    pytest.mark.localnet,
    pytest.mark.skipif(_REASON is not None, reason=_REASON or ""),
]

COMMANDS = [BotCommand("echo", "Repeat your text")]


def _answer(message: RoomMessage) -> str:
    if message.command is not None:
        return f"echo: {message.command.arguments}"
    return f"heard: {message.text}"


async def _block_time(harness: Harness, ticker) -> int:
    """Adds one empty block (a 0-ALGO self-payment with a short note) and returns its block time."""
    tx = await harness.pay(ticker.seed, ticker.address, b"tick")
    return tx.round_time


async def _catch_up(harness: Harness, ticker) -> None:
    """Adds empty blocks until block time is level with the host's clock.

    In dev mode a block's time is the host's clock, but at most 25 s after the
    block before it, so after an idle spell the chain runs behind the host and
    each new block jumps 25 s. Levelling it first keeps a step's blocks a few
    seconds apart in chain time, which is the time the bot counts (AGENT-8.b).
    """
    for _ in range(20_000):
        if await _block_time(harness, ticker) >= time.time() - 2:
            return
    pytest.fail("LocalNet block time did not catch up with the host clock")


async def _wait_out_window(harness: Harness, ticker, mailbox, bot_address: str, seconds: int) -> None:
    """Waits until the bot's last post in ``mailbox`` is more than ``seconds`` old in chain time."""
    txs = await harness.indexer.search_transactions(mailbox.address)
    target = max(tx.round_time for tx in txs if tx.sender == bot_address) + seconds + 1
    while True:
        await _catch_up(harness, ticker)
        now = await _block_time(harness, ticker)
        if now >= target:
            return
        await asyncio.sleep(target - now)


def _reply(text: str, txid: str) -> str:
    return json.dumps({"text": text, "replyTo": {"txid": txid, "preview": "..."}}, separators=(",", ":"))


async def test_bot_follows_the_room_record_across_every_language(tmp_path):
    tools = _tools()
    harness = Harness(tools)
    try:
        owner = await harness.account()
        member = await harness.account()
        other_bot_account = await harness.account()
        bot_account = await harness.account()
        mailbox = await harness.account()
        ticker = await harness.account()

        bot = await _core(bot_account, harness, name="helper", commands=COMMANDS)
        other_bot = await _core(other_bot_account, harness, name="other")
        person = await _core(member, harness, name="member")
        # One-to-one messages are hybrid only (AGENT-5.a, AGENT-5.b), so everyone publishes
        # an X25519 key and a signed ML-KEM-768 key before anyone writes one.
        for core in (bot, other_bot, person):
            await harness.indexer.wait_for_indexer(await core.publish_key(), 30)
            await harness.indexer.wait_for_indexer(await core.publish_pq_key(), 30)

        # 1. A room with an admin, another bot, and our bot in mentions mode: 2 replies per 60 s.
        # A wide window, counted in chain time, so a slow indexer or slow tools cannot open it early.
        room = harness.room(mailbox)
        await room.admin(owner.seed, OP_CREATE, name="policy \u2713")
        await room.admin(owner.seed, OP_ADD_MEMBER, subject=public_key(member.seed))
        await room.admin(owner.seed, OP_APPOINT_ADMIN, subject=public_key(member.seed))
        await room.admin(
            owner.seed, OP_ADD_BOT, subject=public_key(other_bot_account.seed), bot=BotSettings(BOT_MODE_EVERY_MESSAGE, 5, 60)
        )
        add = await room.admin(
            owner.seed, OP_ADD_BOT, subject=public_key(bot_account.seed), bot=BotSettings(BOT_MODE_MENTIONS, 2, 60)
        )
        await room.deliver(owner.seed, bot_account.seed, add)
        [joined] = await bot.sync_rooms()
        assert (joined.bot.mode, joined.bot.replies, joined.bot.seconds) == (BOT_MODE_MENTIONS, 2, 60)

        await _catch_up(harness, ticker)

        # 2. Mentions mode: only @helper counts, at most 2 replies, never to the other bot.
        await harness.write("ts", room, owner, "good morning everyone \u2600")
        await harness.write("go", room, member, "@helper what is new?")
        await harness.write("rs", room, owner, "@HELPER loud \U0001f4e3")
        await harness.write("kt", room, member, "@helper one more")
        await harness.write("py", room, other_bot_account, "@helper hello from a bot")
        served = await bot.serve_rooms(_answer)
        assert [(r.message.text, r.skipped, r.txid is not None) for r in served] == [
            ("good morning everyone \u2600", SKIP_NOT_MENTIONED, False),
            ("@helper what is new?", None, True),
            ("@HELPER loud \U0001f4e3", None, True),
            ("@helper one more", SKIP_RATE_LIMIT, False),
            ("@helper hello from a bot", SKIP_FROM_BOT, False),
        ]
        first = served[1].txid
        answered = [r for r in served if r.txid]

        # 3. A restarted bot counts its replies from their block times: a reply to it waits.
        restarted = await _core(bot_account, harness, name="helper", commands=COMMANDS)
        await harness.write("ts", room, member, _reply("thanks", first))
        served = await restarted.serve_rooms(_answer)
        assert [(r.message.text, r.message.reply_to, r.message.mentioned, r.skipped) for r in served] == [
            ("thanks", first, True, SKIP_RATE_LIMIT)
        ]
        # Every language opens the step 2 replies, after the restart check so their time is not in the window.
        for r in answered:
            await _bot_note(harness, room, bot_account, r.txid, _answer(r.message), f"bot:{r.txid}")
        # After the window, a reply to the bot's message counts as a mention.
        await _wait_out_window(harness, ticker, mailbox, bot.address, 60)
        await harness.write("go", room, member, _reply("thanks again", first))
        served = await restarted.serve_rooms(_answer)
        assert [(r.message.text, r.skipped) for r in served] == [("thanks again", None)]
        await _bot_note(harness, room, bot_account, served[0].txid, "heard: thanks again", "bot:reply-mention")

        # 4. The admin switches the bot to commands, 4 per 60 s: it posts its list, then answers commands.
        # Wait until its earlier replies are out of a 60 s window, so the count starts at zero.
        await _wait_out_window(harness, ticker, mailbox, bot.address, 60)
        await room.admin(member.seed, OP_SET_BOT, subject=public_key(bot_account.seed), bot=BotSettings(BOT_MODE_COMMANDS, 4, 60))
        [listed] = await restarted.declare_commands()
        await harness.write("ts", room, owner, "/echo hi from ts \u2713")
        await harness.write("go", room, member, "hello, no command")
        await harness.write("rs", room, owner, "/help@helper")
        await harness.write("kt", room, member, "/echo@other not for this bot")
        served = await restarted.serve_rooms(_answer)
        assert [(r.message.text, r.skipped) for r in served] == [
            ("/echo hi from ts \u2713", None),
            ("hello, no command", SKIP_NOT_A_COMMAND),
            ("/help@helper", None),
            ("/echo@other not for this bot", SKIP_NOT_A_COMMAND),
        ]
        commanded = served
        assert restarted.command_list.startswith("Commands for @helper:\n/echo - Repeat your text")
        # A fresh core sees its current list on chain and does not post it again.
        fresh = await _core(bot_account, harness, name="helper", commands=COMMANDS)
        assert await fresh.declare_commands() == []
        await harness.write("py", room, owner, "/echo fourth")
        await harness.write("kt", room, member, "/echo fifth")
        served = await fresh.serve_rooms(_answer)
        assert [(r.message.text, r.skipped) for r in served] == [("/echo fourth", None), ("/echo fifth", SKIP_RATE_LIMIT)]
        # Every language opens the step 4 posts, after the rate checks so their time is not in the window.
        harness.reduce_everywhere(room)
        await _bot_note(harness, room, bot_account, listed, restarted.command_list, "bot:command-list")
        await _bot_note(harness, room, bot_account, commanded[0].txid, "echo: hi from ts \u2713", "bot:echo")
        await _bot_note(harness, room, bot_account, commanded[2].txid, restarted.command_list, "bot:help")
        await _bot_note(harness, room, bot_account, served[0].txid, "echo: fourth", "bot:echo-4")

        # 5. The owner switches it to every message, 10 per 60 s: everyone but the other bot is answered.
        await room.admin(owner.seed, OP_SET_BOT, subject=public_key(bot_account.seed), bot=BotSettings(BOT_MODE_EVERY_MESSAGE, 10, 60))
        await harness.write("rs", room, member, "anything goes")
        await harness.write("go", room, other_bot_account, "bots talking")
        served = await fresh.serve_rooms(_answer)
        assert [(r.message.text, r.skipped) for r in served] == [("anything goes", None), ("bots talking", SKIP_FROM_BOT)]
        await _bot_note(harness, room, bot_account, served[0].txid, "heard: anything goes", "bot:every")

        # 6. One-to-one: the person is answered, the other bot is not.
        await harness.indexer.wait_for_indexer(await person.send_direct(bot.address, "hi in private"), 30)
        await harness.indexer.wait_for_indexer(await other_bot.send_direct(bot.address, "bot to bot"), 30)
        direct = await fresh.serve_direct(lambda m: "hello in private")
        assert [(m.message.text, m.reply_txid is not None, m.skipped) for m in direct] == [
            ("hi in private", True, None),
            ("bot to bot", False, SKIP_FROM_BOT),
        ]

        # 7. Every language reduces the chain with both bots' modes and limits; Swift replays it all.
        rooms = {"room": harness.reduce_everywhere(room)}
        by_account = dict(zip(rooms["room"]["bots"], rooms["room"]["bot_settings"], strict=True))
        assert by_account == {
            public_key(bot_account.seed).hex(): [BOT_MODE_EVERY_MESSAGE, 10, 60],
            public_key(other_bot_account.seed).hex(): [BOT_MODE_EVERY_MESSAGE, 5, 60],
        }
        record_path, done_path = tmp_path / "policy-record.json", tmp_path / "policy-done"
        record_path.write_text(json.dumps({"notes": harness.notes, "rooms": rooms}, ensure_ascii=False), encoding="utf-8")
        try:
            run = swift_replay(record_path, done_path, "AgentRoomsLocalnetTests", "ALGOCHAT_ROOMS_LOCALNET")
        except ToolMissing as error:
            if REQUIRED:
                pytest.fail(str(error))
            pytest.skip(str(error))
        assert run.returncode == 0, (run.stdout + run.stderr)[-4000:]
        assert done_path.read_text().split() == [str(len(harness.notes)), "1"], "the Swift replay test did not run"
    finally:
        for tool in tools.values():
            tool.close()
