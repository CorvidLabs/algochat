"""Low-funds notice (AGENT-3, AGENT-3.a) and no payments or tips (AGENT-9).

The in-memory chain from test_agent_direct.py stands in for algod and the
indexer; this file adds a balance for the bot that each of its sends pays
the fee out of. Seeds are public test values, not wallets. No test touches a
network.
"""

from __future__ import annotations

import os

import pytest

from algochat.agent import (
    LOW_FUNDS_NOTICE,
    LOW_FUNDS_REPLIES,
    AgentService,
    FundsStatus,
    RoomMessage,
)
from algochat.agent.account import address_from_public_key
from algochat.agent.funds import reply_fee
from algochat.blockchain import AccountInfo
from algochat.group_admin import (
    BOT_MODE_EVERY_MESSAGE,
    OP_ADD_BOT,
    OP_ADD_MEMBER,
    OP_CREATE,
    BotSettings,
)
from algochat.types import MAX_NOTE_SIZE, payment_fee
from tests.room_support import OwnerRoom, public_key
from tests.test_agent_direct import BOT_SEED, PERSON_SEED, _person, _say, _unpack
from tests.test_agent_policy import ADDRESS, OWNER_SEED, Clock, Ledger, _bot, _read

MIN_BALANCE = 100_000
FEE = reply_fee(1000)
THRESHOLD = FEE * LOW_FUNDS_REPLIES


class Wallet(Ledger):
    """The in-memory chain plus a balance for the bot that pays its fees."""

    def __init__(self) -> None:
        super().__init__()
        self.balance = 10_000_000
        self.broken = False
        self.amounts: list[int] = []

    async def get_account_info(self, address: str) -> AccountInfo:
        if self.broken:
            raise ConnectionError("algod is down")
        if address == ADDRESS:
            return AccountInfo(address, self.balance, MIN_BALANCE)
        return AccountInfo(address, 10_000_000, MIN_BALANCE)

    async def submit_transaction(self, signed_txn: bytes) -> str:
        txn = _unpack(signed_txn)[0]["txn"]
        if address_from_public_key(txn["snd"]) == ADDRESS:
            self.balance -= txn["fee"]
            self.amounts.append(txn.get("amt", 0))
        return await super().submit_transaction(signed_txn)


async def _room(chain: Wallet, mailbox_seed: bytes, settings: BotSettings) -> OwnerRoom:
    room = OwnerRoom(chain.apay, os.urandom(32), mailbox_seed)
    await room.admin(OWNER_SEED, OP_CREATE, name="team")
    await room.admin(OWNER_SEED, OP_ADD_MEMBER, subject=public_key(PERSON_SEED))
    add = await room.admin(
        OWNER_SEED, OP_ADD_BOT, subject=public_key(BOT_SEED), bot=settings
    )
    await room.deliver(OWNER_SEED, BOT_SEED, add)
    return room


def _echo(message: RoomMessage) -> str:
    return f"heard: {message.text}"


def _texts(chain: Wallet, room: OwnerRoom) -> list[str]:
    return [
        _read(room, tx.txid, chain)
        for tx in chain.txs
        if tx.sender == ADDRESS and tx.receiver == room.mailbox_address
    ]


EVERY = BotSettings(BOT_MODE_EVERY_MESSAGE, 20, 60)


def test_threshold_is_100_replies_of_the_largest_note_above_the_minimum_balance():
    assert FEE == payment_fee(MAX_NOTE_SIZE, 1000) and FEE >= 1000
    assert reply_fee(0) == FEE and reply_fee(2000) == payment_fee(MAX_NOTE_SIZE, 2000)
    status = FundsStatus(MIN_BALANCE + THRESHOLD, MIN_BALANCE, FEE)
    assert (status.spendable, status.threshold, status.replies_left, status.low) == (
        THRESHOLD,
        THRESHOLD,
        LOW_FUNDS_REPLIES,
        False,
    )
    low = FundsStatus(MIN_BALANCE + THRESHOLD - 1, MIN_BALANCE, FEE)
    assert low.low and low.replies_left == LOW_FUNDS_REPLIES - 1
    assert FundsStatus(MIN_BALANCE - 5, MIN_BALANCE, FEE).spendable == 0
    assert len(LOW_FUNDS_NOTICE) < 120 and "\n" not in LOW_FUNDS_NOTICE


@pytest.mark.asyncio
async def test_notice_once_in_the_room_where_funds_ran_low_until_refilled():
    chain = Wallet()
    clock = Clock(chain)
    first = await _room(chain, bytes([0x44]) * 32, EVERY)
    second = await _room(chain, bytes([0x45]) * 32, EVERY)
    bot = await _bot(chain, clock)
    await bot.sync_rooms()
    chain.balance = MIN_BALANCE + THRESHOLD + FEE // 2

    # Still above the threshold before this reply, below it after: the notice follows in this room.
    await first.post(PERSON_SEED, "one")
    [served] = await bot.serve_rooms(_echo)
    assert served.txid and served.low_funds_notice
    assert _texts(chain, first) == ["heard: one", LOW_FUNDS_NOTICE]
    assert (await bot.check_funds()).low

    # Still low: more replies in both rooms, no second notice anywhere.
    await first.post(PERSON_SEED, "two")
    await second.post(PERSON_SEED, "three")
    served = await bot.serve_rooms(_echo)
    assert [(r.message.text, bool(r.txid), r.low_funds_notice) for r in served] == [
        ("two", True, None),
        ("three", True, None),
    ]
    assert _texts(chain, second) == ["heard: three"]

    # The operator refills; the bot sees it after its next reply.
    chain.balance = MIN_BALANCE + THRESHOLD + 10 * FEE
    await second.post(PERSON_SEED, "four")
    [served] = await bot.serve_rooms(_echo)
    assert served.txid and served.low_funds_notice is None

    # It runs low again, this time in the second room: one new notice there.
    chain.balance = MIN_BALANCE + THRESHOLD - 1
    await second.post(PERSON_SEED, "five")
    await first.post(PERSON_SEED, "six")
    served = await bot.serve_rooms(_echo)
    assert [(r.message.text, r.low_funds_notice is not None) for r in served] == [
        ("five", True),
        ("six", False),
    ]
    assert _texts(chain, second) == [
        "heard: three",
        "heard: four",
        "heard: five",
        LOW_FUNDS_NOTICE,
    ]
    assert _texts(chain, first).count(LOW_FUNDS_NOTICE) == 1

    # A restarted bot that is still low finds its notice on chain and does not repeat it.
    again = await _bot(chain, clock)
    await again.sync_rooms()
    await first.post(PERSON_SEED, "seven")
    [served] = await again.serve_rooms(_echo)
    assert served.txid and served.low_funds_notice is None
    assert (
        sum(t == LOW_FUNDS_NOTICE for t in _texts(chain, first) + _texts(chain, second))
        == 2
    )

    # The bot never answers its own notice, and it never sent an amount (AGENT-9).
    assert served.message.text == "seven"
    assert set(chain.amounts) == {0}


@pytest.mark.asyncio
async def test_the_notice_is_not_held_back_by_the_rate_limit():
    chain = Wallet()
    clock = Clock(chain)
    room = await _room(
        chain, bytes([0x44]) * 32, BotSettings(BOT_MODE_EVERY_MESSAGE, 1, 60)
    )
    bot = await _bot(chain, clock)
    await bot.sync_rooms()
    chain.balance = MIN_BALANCE + THRESHOLD
    await room.post(PERSON_SEED, "one")
    [served] = await bot.serve_rooms(_echo)
    assert served.low_funds_notice
    assert _texts(chain, room) == ["heard: one", LOW_FUNDS_NOTICE]


@pytest.mark.asyncio
async def test_a_direct_reply_counts_a_refill_but_the_notice_only_goes_in_a_room():
    chain = Wallet()
    clock = Clock(chain)
    room = await _room(chain, bytes([0x44]) * 32, EVERY)
    bot = await _bot(chain, clock)
    await bot.publish_key()
    await bot.sync_rooms()
    person = await _person(chain)

    chain.balance = MIN_BALANCE + THRESHOLD - 1
    await _say(chain, person, PERSON_SEED, bot.address, "hello")
    [direct] = await bot.serve_direct(lambda m: "hi")
    assert direct.reply_txid
    assert _texts(chain, room) == []

    await room.post(PERSON_SEED, "one")
    [served] = await bot.serve_rooms(_echo)
    assert served.low_funds_notice

    # Refilled, and only one-to-one replies since: the next low room reply warns again.
    chain.balance = MIN_BALANCE + THRESHOLD + 10 * FEE
    await _say(chain, person, PERSON_SEED, bot.address, "again")
    await bot.serve_direct(lambda m: "hi")
    chain.balance = MIN_BALANCE + THRESHOLD - 1
    await room.post(PERSON_SEED, "two")
    [served] = await bot.serve_rooms(_echo)
    assert served.low_funds_notice
    assert _texts(chain, room).count(LOW_FUNDS_NOTICE) == 2


@pytest.mark.asyncio
async def test_a_failed_balance_read_never_blocks_the_reply():
    chain = Wallet()
    clock = Clock(chain)
    room = await _room(chain, bytes([0x44]) * 32, EVERY)
    bot = await _bot(chain, clock)
    await bot.sync_rooms()
    chain.balance = MIN_BALANCE
    chain.broken = True
    await room.post(PERSON_SEED, "one")
    [served] = await bot.serve_rooms(_echo)
    assert served.txid and served.error is None and served.low_funds_notice is None
    chain.broken = False
    await room.post(PERSON_SEED, "two")
    [served] = await bot.serve_rooms(_echo)
    assert served.low_funds_notice


@pytest.mark.asyncio
async def test_the_notice_text_is_reserved_for_the_bot():
    chain = Wallet()
    clock = Clock(chain)
    room = await _room(chain, bytes([0x44]) * 32, EVERY)
    bot = await _bot(chain, clock)
    [joined] = await bot.sync_rooms()
    with pytest.raises(ValueError, match="reserved"):
        await bot.send_room(joined, LOW_FUNDS_NOTICE)
    assert _texts(chain, room) == []


@pytest.mark.asyncio
async def test_the_funds_command_and_reply_room_report_the_notice():
    chain = Wallet()
    clock = Clock(chain)
    room = await _room(chain, bytes([0x44]) * 32, EVERY)
    bot = await _bot(chain, clock)
    service = AgentService(bot)
    chain.balance = MIN_BALANCE + THRESHOLD + 2 * FEE
    funds = await service.run("funds")
    assert funds == {
        "balance": MIN_BALANCE + THRESHOLD + 2 * FEE,
        "min_balance": MIN_BALANCE,
        "spendable": THRESHOLD + 2 * FEE,
        "fee_per_reply": FEE,
        "threshold": THRESHOLD,
        "replies_left": LOW_FUNDS_REPLIES + 2,
        "low": False,
    }
    await room.post(PERSON_SEED, "one")
    [message] = await service.run("read-rooms")
    first = await service.run("reply-room", {"txid": message["txid"], "text": "a"})
    assert first["txid"] and first["low_funds_notice"] is None
    chain.balance = MIN_BALANCE + THRESHOLD
    await room.post(PERSON_SEED, "two")
    [message] = await service.run("read-rooms")
    second = await service.run("reply-room", {"txid": message["txid"], "text": "b"})
    assert second["low_funds_notice"]
    assert (await service.run("funds"))["low"] is True
    assert _texts(chain, room) == ["a", "b", LOW_FUNDS_NOTICE]


@pytest.mark.asyncio
async def test_fresh_runs_see_a_refill_on_chain_like_separate_cli_calls():
    """Each CLI call is a new core: it works out from the chain whether its notice is still current."""
    chain = Wallet()
    clock = Clock(chain)
    room = await _room(chain, bytes([0x44]) * 32, EVERY)

    async def one_run(text: str):
        await room.post(PERSON_SEED, text)
        service = AgentService(await _bot(chain, clock))
        [message] = await service.run("read-rooms")
        return await service.run(
            "reply-room", {"txid": message["txid"], "text": f"heard: {text}"}
        )

    chain.balance = MIN_BALANCE + THRESHOLD + 500
    assert (await one_run("one"))["low_funds_notice"]
    # Still low, nothing came in: later runs stay quiet.
    assert (await one_run("two"))["low_funds_notice"] is None
    assert (await one_run("three"))["low_funds_notice"] is None
    # The operator refills to just above the threshold; the replies after it bring the wallet low again.
    chain.balance = MIN_BALANCE + THRESHOLD + 1500
    assert (await one_run("four"))["low_funds_notice"] is None
    assert (await one_run("five"))["low_funds_notice"]
    assert (await one_run("six"))["low_funds_notice"] is None
    assert _texts(chain, room).count(LOW_FUNDS_NOTICE) == 2
