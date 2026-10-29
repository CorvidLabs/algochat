"""
AGENT-3, AGENT-3.a and AGENT-9 on LocalNet: the bot's own wallet pays its fees
and it warns once when fewer than about 100 replies' worth remain.

The bot's throwaway account is funded by the local KMD dispenser (the
operator's part), then brought to just above the threshold. People write in
two rooms with each implementation's own tool (TypeScript, Go, Rust, Python,
Kotlin). The bot posts the notice once, in the room where its reply took the
wallet below the threshold, and not in the other room. After a refill it warns
again when it runs low, in that room. A restarted core that is still low stays
quiet. Separate ``algochat-agent`` runs (the CLI) work out a refill from the
chain and warn again. Every bot transaction carries no amount. Every
implementation opens every bot note and reduces both rooms; Swift does the same
from a recorded file through ``swift test``.

Run with ``ALGOCHAT_REQUIRE_LOCALNET=1`` so a missing network or tool fails
instead of skipping. Build the tools first (see ``tests/cross_tools.py``).
"""

from __future__ import annotations

import json

import pytest

from algochat.agent import LOW_FUNDS_NOTICE, LOW_FUNDS_REPLIES, RoomMessage
from algochat.group_admin import (
    BOT_MODE_EVERY_MESSAGE,
    OP_ADD_BOT,
    OP_ADD_MEMBER,
    OP_CREATE,
    BotSettings,
)

from .cross_tools import ToolMissing, swift_replay
from .localnet_support import SigningAccount, dispenser, indexer_get, send_payment
from .room_support import public_key
from .test_agent_adapters_localnet import Bot
from .test_agent_localnet import _assert_no_secret
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

EVERY = BotSettings(BOT_MODE_EVERY_MESSAGE, 20, 60)


def _answer(message: RoomMessage) -> str:
    return f"heard: {message.text}"


async def _spendable(harness: Harness, account: SigningAccount) -> int:
    info = await harness.algod.get_account_info(account.address)
    return info.amount - info.min_balance


async def _refill(harness: Harness, account: SigningAccount, target: int) -> None:
    """The operator tops the wallet up so ``target`` microAlgos are spendable."""
    missing = target - await _spendable(harness, account)
    assert missing > 0
    await send_payment(harness.algod, dispenser(), account.address, missing)
    assert await _spendable(harness, account) == target


async def test_low_funds_notice_once_per_drop_across_every_language(tmp_path):
    tools = _tools()
    harness = Harness(tools)
    cli: Bot | None = None
    try:
        owner = await harness.account()
        member = await harness.account()
        bot_account = await harness.account()
        mailbox_a = await harness.account()
        mailbox_b = await harness.account()

        bot = await _core(bot_account, harness, name="helper")
        await harness.indexer.wait_for_indexer(await bot.publish_key(), 30)
        rooms = {}
        for label, mailbox in (("a", mailbox_a), ("b", mailbox_b)):
            room = harness.room(mailbox)
            await room.admin(owner.seed, OP_CREATE, name=f"funds {label} \u2713")
            await room.admin(owner.seed, OP_ADD_MEMBER, subject=public_key(member.seed))
            add = await room.admin(
                owner.seed, OP_ADD_BOT, subject=public_key(bot_account.seed), bot=EVERY
            )
            await room.deliver(owner.seed, bot_account.seed, add)
            rooms[label] = room
        assert len(await bot.sync_rooms()) == 2
        room_a, room_b = rooms["a"], rooms["b"]

        # 1. The operator's funding pays the fees; one reply's worth is the largest note's fee.
        funds = await bot.check_funds()
        assert not funds.low and funds.fee_per_reply >= 1000
        threshold = funds.threshold
        assert threshold == funds.fee_per_reply * LOW_FUNDS_REPLIES
        # Test only: the throwaway account sends most of its funds back to the dispenser
        # (not the bot's code), so one more reply takes it below the threshold.
        drain = await send_payment(
            harness.algod,
            bot_account,
            dispenser().address,
            await _spendable(harness, bot_account) - threshold - 1500,
        )
        assert await _spendable(harness, bot_account) == threshold + 500

        # 2. A reply in room A takes the wallet low: the notice follows there, once.
        await harness.write("ts", room_a, member, "first from ts \u2600")
        [served] = await bot.serve_rooms(_answer)
        assert served.txid and served.low_funds_notice
        await _bot_note(
            harness,
            room_a,
            bot_account,
            served.txid,
            "heard: first from ts \u2600",
            "bot:a1",
        )
        await _bot_note(
            harness,
            room_a,
            bot_account,
            served.low_funds_notice,
            LOW_FUNDS_NOTICE,
            "bot:notice-a",
        )
        assert (await bot.check_funds()).low

        # 3. Still low: replies in both rooms, no second notice anywhere.
        await harness.write("go", room_a, member, "from go")
        await harness.write("rs", room_b, owner, "from rs \U0001f980")
        served = await bot.serve_rooms(_answer)
        assert [
            (r.message.text, r.txid is not None, r.low_funds_notice) for r in served
        ] == [
            ("from go", True, None),
            ("from rs \U0001f980", True, None),
        ]
        await _bot_note(
            harness, room_a, bot_account, served[0].txid, "heard: from go", "bot:a2"
        )
        await _bot_note(
            harness,
            room_b,
            bot_account,
            served[1].txid,
            "heard: from rs \U0001f980",
            "bot:b1",
        )

        # 4. The operator refills to just above the threshold. The next reply leaves it above
        # (the bot sees the refill); the one after takes it low again, in room B: a new notice there.
        await _refill(harness, bot_account, threshold + 1500)
        await harness.write("kt", room_b, member, "from kt")
        [served] = await bot.serve_rooms(_answer)
        assert served.txid and served.low_funds_notice is None
        await _bot_note(
            harness, room_b, bot_account, served.txid, "heard: from kt", "bot:b2"
        )
        await harness.write("py", room_b, owner, "from py")
        [served] = await bot.serve_rooms(_answer)
        assert served.txid and served.low_funds_notice
        await _bot_note(
            harness, room_b, bot_account, served.txid, "heard: from py", "bot:b3"
        )
        await _bot_note(
            harness,
            room_b,
            bot_account,
            served.low_funds_notice,
            LOW_FUNDS_NOTICE,
            "bot:notice-b",
        )

        # 5. A restarted core, still low, finds its notice on chain and stays quiet.
        restarted = await _core(bot_account, harness, name="helper")
        await harness.write("ts", room_a, member, "after a restart")
        [served] = await restarted.serve_rooms(_answer)
        assert served.txid and served.low_funds_notice is None
        await _bot_note(
            harness,
            room_a,
            bot_account,
            served.txid,
            "heard: after a restart",
            "bot:a3",
        )

        # 6. Separate CLI runs: refill, then replies until low. A new run works out the refill from the chain.
        cli = Bot(bot_account)
        await _refill(harness, bot_account, threshold + 1500)
        shown = cli.cli("funds")
        assert (
            shown["low"] is False
            and shown["threshold"] == threshold
            and shown["replies_left"] >= LOW_FUNDS_REPLIES
        )
        for lang, text, warned in (("go", "cli one", False), ("rs", "cli two", True)):
            await harness.write(lang, room_a, member, text)
            [message] = [m for m in cli.cli("read-rooms") if m["text"] == text]
            reply = cli.cli(
                "reply-room", "--txid", message["txid"], "--text", f"heard: {text}"
            )
            await _bot_note(
                harness,
                room_a,
                bot_account,
                reply["txid"],
                f"heard: {text}",
                f"bot:{text}",
            )
            assert (reply["low_funds_notice"] is not None) is warned
            if warned:
                await _bot_note(
                    harness,
                    room_a,
                    bot_account,
                    reply["low_funds_notice"],
                    LOW_FUNDS_NOTICE,
                    "bot:notice-cli",
                )
        assert cli.cli("funds")["low"] is True

        # 7. AGENT-9: no bot transaction carries an amount; the only one is the test's own drain.
        found = indexer_get(
            f"/v2/transactions?address={bot_account.address}&limit=1000"
        )["transactions"]
        sent = [tx for tx in found if tx["sender"] == bot_account.address]
        amounts = {
            tx["id"]: tx["payment-transaction"]["amount"]
            for tx in sent
            if tx["tx-type"] == "pay"
        }
        assert amounts.pop(drain.txid) > 0
        assert amounts and set(amounts.values()) == {0}

        # 8. Three notices in all, every language reduces both rooms, and Swift replays everything.
        assert (
            sum(
                name.startswith("bot:notice")
                for name in (n["name"] for n in harness.notes)
            )
            == 3
        )
        reduced = {
            label: harness.reduce_everywhere(room) for label, room in rooms.items()
        }
        record_path, done_path = tmp_path / "funds-record.json", tmp_path / "funds-done"
        record_path.write_text(
            json.dumps({"notes": harness.notes, "rooms": reduced}, ensure_ascii=False),
            encoding="utf-8",
        )
        try:
            run = swift_replay(
                record_path,
                done_path,
                "AgentRoomsLocalnetTests",
                "ALGOCHAT_ROOMS_LOCALNET",
            )
        except ToolMissing as error:
            if REQUIRED:
                pytest.fail(str(error))
            pytest.skip(str(error))
        assert run.returncode == 0, (run.stdout + run.stderr)[-4000:]
        assert done_path.read_text().split() == [str(len(harness.notes)), str(len(reduced))], (
            "the Swift replay test did not run"
        )
        _assert_no_secret("\n".join(cli.output), bot_account)
    finally:
        if cli is not None and cli.mcp is not None:
            cli.mcp.kill()
        for tool in tools.values():
            tool.close()
