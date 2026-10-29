"""Rooms and channels in the agent core (AGENT-6, AGENT-7, AGENT-7.c, AGENT-7.d, AGENT-7.g).

The in-memory chain from test_agent_direct.py stands in for algod and the
indexer. The owner's side is drafted with the library, as Raven does. Seeds
are public test values, not wallets. No test touches a network.
"""

from __future__ import annotations

import os

import pytest

from algochat.agent import (
    LEAVE_NOTICE,
    ROOM_ACTIVE,
    ROOM_LEFT,
    ROOM_REMOVED,
    AgentAccount,
    AgentCore,
    RoomMessage,
)
from algochat.client import AlgoChatConfig
from algochat.group import open_group_message
from algochat.group_admin import (
    BOT_MODE_EVERY_MESSAGE,
    BOT_MODE_MENTIONS,
    OP_ADD_BOT,
    OP_ADD_MEMBER,
    OP_APPOINT_ADMIN,
    OP_CREATE,
    OP_REMOVE_MEMBER,
    OP_SET_NAME,
    BotSettings,
)
from tests.room_support import OwnerRoom, address, public_key
from tests.test_agent_direct import BOT_SEED, PERSON_SEED, STRANGER_SEED, Chain

OWNER_SEED = bytes([0x11]) * 32
ADMIN_SEED = bytes([0x22]) * 32
MAILBOX_SEED = bytes([0x44]) * 32
CHANNEL_MAILBOX_SEED = bytes([0x55]) * 32
PRESET = BotSettings(BOT_MODE_MENTIONS, 5, 60)
CONFIG = AlgoChatConfig(network="localnet")


class Ledger(Chain):
    """The in-memory chain, with an async pay for the owner's side."""

    async def apay(self, seed: bytes, receiver: str, note: bytes):
        return self.pay(seed, receiver, note)


async def _bot(chain: Chain) -> AgentCore:
    return await AgentCore.create(AgentAccount.from_seed(BOT_SEED), CONFIG, chain, chain)


async def _room(chain: Ledger, bot_mode: int = BOT_MODE_MENTIONS) -> tuple[OwnerRoom, object]:
    room = OwnerRoom(chain.apay, os.urandom(32), MAILBOX_SEED)
    await room.admin(OWNER_SEED, OP_CREATE, name="team")
    await room.admin(OWNER_SEED, OP_ADD_MEMBER, subject=public_key(PERSON_SEED))
    add = await room.admin(OWNER_SEED, OP_ADD_BOT, subject=public_key(BOT_SEED), bot=BotSettings(bot_mode, 5, 60))
    await room.deliver(OWNER_SEED, BOT_SEED, add)
    return room, add


def _read(room: OwnerRoom, tx, epoch: int | None = None) -> str:
    state = room.state()
    key = room.keys[state.epoch if epoch is None else epoch]
    return open_group_message(bytes(tx.note), key, public_key(BOT_SEED), []).plaintext.decode()


@pytest.mark.asyncio
async def test_bot_joins_as_soon_as_it_is_added_without_a_request_or_accept():
    chain = Ledger()
    room, _ = await _room(chain)
    bot = await _bot(chain)
    rooms = await bot.sync_rooms()
    assert len(rooms) == 1
    joined = rooms[0]
    assert joined.status == ROOM_ACTIVE
    assert joined.group_id == room.group_id and joined.mailbox == room.mailbox_address
    assert joined.name == "team" and not joined.is_channel
    assert joined.bot is not None and (joined.bot.mode, joined.bot.replies, joined.bot.seconds) == (1, 5, 60)
    # The bot sent nothing: no join request and no accept.
    assert not [tx for tx in chain.txs if tx.sender == bot.address]


@pytest.mark.asyncio
async def test_bot_reads_and_replies_in_its_room_once_and_not_again_after_a_restart():
    chain = Ledger()
    room, _ = await _room(chain)
    bot = await _bot(chain)
    await room.post(PERSON_SEED, "hello bot")
    await room.post(OWNER_SEED, "")  # empty text needs no answer
    seen: list[RoomMessage] = []

    def handler(message: RoomMessage) -> str:
        seen.append(message)
        return f"echo: {message.text}"

    replies = await bot.serve_rooms(handler)
    assert [m.text for m in seen] == ["hello bot"]
    assert seen[0].sender == address(PERSON_SEED) and seen[0].epoch == 1
    assert replies[0].txid is not None and replies[0].error is None
    reply = next(tx for tx in chain.txs if tx.txid == replies[0].txid)
    assert reply.receiver == room.mailbox_address and reply.sender == bot.address
    assert _read(room, reply) == "echo: hello bot"
    assert await bot.serve_rooms(handler) == []
    restarted = await _bot(chain)
    assert await restarted.read_rooms() == []
    await room.post(PERSON_SEED, "again")
    later = await restarted.read_rooms()
    assert [m.text for m in later] == ["again"]
    # The restarted bot's counter is above every counter in the epoch, so its notes never collide.
    txid = await restarted.reply_room(later[0], "ok")
    note = next(tx for tx in chain.txs if tx.txid == txid).note
    assert int.from_bytes(note[38:42], "big") > int.from_bytes(reply.note[38:42], "big")


@pytest.mark.asyncio
async def test_messages_from_before_the_bot_joined_are_not_answered():
    chain = Ledger()
    room = OwnerRoom(chain.apay, os.urandom(32), MAILBOX_SEED)
    await room.admin(OWNER_SEED, OP_CREATE, name="team")
    await room.post(OWNER_SEED, "before the bot")
    add = await room.admin(OWNER_SEED, OP_ADD_BOT, subject=public_key(BOT_SEED), bot=PRESET)
    await room.deliver(OWNER_SEED, BOT_SEED, add)
    bot = await _bot(chain)
    assert await bot.read_rooms() == []
    await room.post(OWNER_SEED, "after")
    assert [m.text for m in await bot.read_rooms()] == ["after"]


@pytest.mark.asyncio
async def test_a_key_is_used_only_when_the_room_authorizes_its_delivery():
    chain = Ledger()
    room = OwnerRoom(chain.apay, os.urandom(32), MAILBOX_SEED)
    await room.admin(OWNER_SEED, OP_CREATE, name="team")
    await room.admin(OWNER_SEED, OP_ADD_MEMBER, subject=public_key(PERSON_SEED))
    renamed = await room.admin(OWNER_SEED, OP_SET_NAME, name="renamed")
    add = await room.admin(OWNER_SEED, OP_ADD_BOT, subject=public_key(BOT_SEED), bot=PRESET)
    # A plain member and a stranger may not deliver the key, and set-name authorizes nobody.
    await room.deliver(PERSON_SEED, BOT_SEED, add)
    await room.deliver(STRANGER_SEED, BOT_SEED, add)
    await room.deliver(OWNER_SEED, BOT_SEED, renamed)
    bot = await _bot(chain)
    assert await bot.sync_rooms() == []
    await room.deliver(OWNER_SEED, BOT_SEED, add)
    rooms = await bot.sync_rooms()
    assert [r.status for r in rooms] == [ROOM_ACTIVE]


@pytest.mark.asyncio
async def test_a_delivery_needs_a_session_from_its_own_sender():
    chain = Ledger()
    room = OwnerRoom(chain.apay, os.urandom(32), MAILBOX_SEED)
    await room.admin(OWNER_SEED, OP_CREATE, name="team")
    await room.admin(OWNER_SEED, OP_ADD_MEMBER, subject=public_key(ADMIN_SEED))
    await room.admin(OWNER_SEED, OP_APPOINT_ADMIN, subject=public_key(ADMIN_SEED))
    add = await room.admin(OWNER_SEED, OP_ADD_BOT, subject=public_key(BOT_SEED), bot=PRESET)
    # The owner opens the session, but the admin pays the delivery on it.
    session = await room.session(OWNER_SEED, BOT_SEED)
    room.sessions[(ADMIN_SEED, BOT_SEED)] = session
    await room.deliver(ADMIN_SEED, BOT_SEED, add)
    bot = await _bot(chain)
    assert await bot.sync_rooms() == []


@pytest.mark.asyncio
async def test_notes_from_non_members_and_copied_notes_are_ignored():
    chain = Ledger()
    room, _ = await _room(chain)
    bot = await _bot(chain)
    await bot.sync_rooms()
    await room.post(STRANGER_SEED, "not a member")
    first = await room.post(PERSON_SEED, "one")
    chain.pay(PERSON_SEED, room.mailbox_address, first.note)  # the same counter again
    assert [m.text for m in await bot.read_rooms()] == ["one"]


@pytest.mark.asyncio
async def test_after_another_member_is_removed_the_bot_uses_the_new_key():
    chain = Ledger()
    room, _ = await _room(chain)
    bot = await _bot(chain)
    await bot.sync_rooms()
    removed = await room.admin(OWNER_SEED, OP_REMOVE_MEMBER, subject=public_key(PERSON_SEED))
    assert room.state().epoch == 2
    await room.deliver(OWNER_SEED, BOT_SEED, removed)
    await room.post(OWNER_SEED, "epoch two")
    messages = await bot.read_rooms()
    assert [(m.text, m.epoch) for m in messages] == [("epoch two", 2)]
    txid = await bot.reply_room(messages[0], "still here")
    reply = next(tx for tx in chain.txs if tx.txid == txid)
    assert _read(room, reply, epoch=2) == "still here"


@pytest.mark.asyncio
async def test_bot_waits_for_the_new_key_and_cannot_post_meanwhile():
    chain = Ledger()
    room, _ = await _room(chain)
    bot = await _bot(chain)
    [joined] = await bot.sync_rooms()
    await room.admin(OWNER_SEED, OP_REMOVE_MEMBER, subject=public_key(PERSON_SEED))
    [waiting] = await bot.sync_rooms()
    assert waiting.status == "waiting"
    with pytest.raises(PermissionError):
        await bot.send_room(joined, "too early")


async def _channel(chain: Ledger, room: OwnerRoom, mode: int = BOT_MODE_EVERY_MESSAGE) -> OwnerRoom:
    channel = OwnerRoom(chain.apay, os.urandom(32), CHANNEL_MAILBOX_SEED, parent=room)
    await channel.admin(OWNER_SEED, OP_CREATE, name="news")
    add = await channel.admin(OWNER_SEED, OP_ADD_BOT, subject=public_key(BOT_SEED), bot=BotSettings(mode, 5, 60))
    await channel.deliver(OWNER_SEED, BOT_SEED, add)
    return channel


@pytest.mark.asyncio
async def test_bot_reads_and_replies_in_a_channel_it_was_added_to():
    chain = Ledger()
    room, _ = await _room(chain)
    channel = await _channel(chain, room)
    bot = await _bot(chain)
    rooms = {r.mailbox: r for r in await bot.sync_rooms()}
    found = rooms[channel.mailbox_address]
    assert found.is_channel and found.parent_group_id == room.group_id and found.status == ROOM_ACTIVE
    assert found.bot.mode == BOT_MODE_EVERY_MESSAGE
    assert rooms[room.mailbox_address].bot.mode == BOT_MODE_MENTIONS
    await channel.post(OWNER_SEED, "in the channel")
    replies = await bot.serve_rooms(lambda m: f"{'channel' if m.is_channel else 'room'}: {m.text}")
    assert len(replies) == 1
    reply = next(tx for tx in chain.txs if tx.txid == replies[0].txid)
    assert reply.receiver == channel.mailbox_address
    assert _read(channel, reply) == "channel: in the channel"


@pytest.mark.asyncio
async def test_a_channel_key_waits_until_the_bot_is_in_the_parent_room():
    chain = Ledger()
    room = OwnerRoom(chain.apay, os.urandom(32), MAILBOX_SEED)
    await room.admin(OWNER_SEED, OP_CREATE, name="team")
    add = await room.admin(OWNER_SEED, OP_ADD_BOT, subject=public_key(BOT_SEED), bot=PRESET)
    channel = OwnerRoom(chain.apay, os.urandom(32), CHANNEL_MAILBOX_SEED, parent=room)
    await channel.admin(OWNER_SEED, OP_CREATE, name="news")
    channel_add = await channel.admin(OWNER_SEED, OP_ADD_BOT, subject=public_key(BOT_SEED), bot=PRESET)
    await channel.deliver(OWNER_SEED, BOT_SEED, channel_add)
    bot = await _bot(chain)
    assert await bot.sync_rooms() == []
    await room.deliver(OWNER_SEED, BOT_SEED, add)
    assert sorted(r.is_channel for r in await bot.sync_rooms()) == [False, True]


@pytest.mark.asyncio
async def test_removing_the_bot_takes_it_out_of_the_room_and_its_channels():
    chain = Ledger()
    room, _ = await _room(chain)
    channel = await _channel(chain, room)
    bot = await _bot(chain)
    before = {r.mailbox: r for r in await bot.sync_rooms()}
    await room.admin(OWNER_SEED, OP_REMOVE_MEMBER, subject=public_key(BOT_SEED))
    after = {r.mailbox: r for r in await bot.sync_rooms()}
    assert after[room.mailbox_address].status == ROOM_REMOVED
    # The channel is out at once, before the owner posts the channel removal.
    assert after[channel.mailbox_address].status == ROOM_REMOVED
    assert after[room.mailbox_address].bot is None
    await room.post(OWNER_SEED, "after removal")
    await channel.post(OWNER_SEED, "channel after removal", epoch=1)
    assert await bot.read_rooms() == []
    for target in before.values():
        with pytest.raises(PermissionError):
            await bot.send_room(target, "hello?")


@pytest.mark.asyncio
async def test_bot_leaves_a_room_and_its_channels_and_stays_out_after_a_restart():
    chain = Ledger()
    room, _ = await _room(chain)
    channel = await _channel(chain, room)
    bot = await _bot(chain)
    rooms = {r.mailbox: r for r in await bot.sync_rooms()}
    with pytest.raises(ValueError, match="leave_room"):
        await bot.send_room(rooms[room.mailbox_address], LEAVE_NOTICE)
    txids = await bot.leave_room(rooms[room.mailbox_address])
    assert len(txids) == 2
    notices = [tx for tx in chain.txs if tx.txid in txids]
    assert {tx.receiver for tx in notices} == {room.mailbox_address, channel.mailbox_address}
    assert _read(room, next(tx for tx in notices if tx.receiver == room.mailbox_address)) == LEAVE_NOTICE
    assert {r.status for r in await bot.sync_rooms()} == {ROOM_LEFT}
    await room.post(PERSON_SEED, "anyone there?")
    assert await bot.read_rooms() == []
    restarted = await _bot(chain)
    assert {r.status for r in await restarted.sync_rooms()} == {ROOM_LEFT}
    assert await restarted.read_rooms() == []


@pytest.mark.asyncio
async def test_handler_errors_are_reported_and_silence_sends_nothing():
    chain = Ledger()
    room, _ = await _room(chain)
    bot = await _bot(chain)
    await bot.sync_rooms()
    await room.post(PERSON_SEED, "quiet")
    await room.post(PERSON_SEED, "boom")

    def handler(message: RoomMessage):
        if message.text == "boom":
            raise RuntimeError("handler failed")

    sent = chain.submitted
    replies = await bot.serve_rooms(handler)
    assert [(r.message.text, r.txid, r.error) for r in replies] == [("quiet", None, None), ("boom", None, "RuntimeError")]
    assert chain.submitted == sent
    assert await bot.serve_rooms(handler) == []


@pytest.mark.asyncio
async def test_publish_pq_key_posts_a_signed_key_once():
    chain = Ledger()
    bot = await _bot(chain)
    first = await bot.publish_pq_key()
    assert first is not None
    note = next(tx for tx in chain.txs if tx.txid == first).note
    assert note.startswith(b"ACPQ") and len(note) == 1253
    assert await bot.publish_pq_key() is None
    assert await bot.publish_pq_key(force=True) is not None


@pytest.mark.asyncio
async def test_unknown_rooms_are_refused():
    chain = Ledger()
    bot = await _bot(chain)
    with pytest.raises(LookupError):
        await bot.send_room((bytes(32), address(MAILBOX_SEED)), "hi")


# --- public_key_from_address (used to match room members to addresses) -----


def test_public_key_from_address_round_trips_and_checks_the_checksum():
    from algochat.agent.account import address_from_public_key, public_key_from_address

    key = public_key(BOT_SEED)
    addr = address_from_public_key(key)
    assert public_key_from_address(addr) == key
    # Change one character inside the checksum (bits 265-269 of the 288 decoded bits).
    swap = "A" if addr[53] != "A" else "B"
    with pytest.raises(ValueError, match="checksum"):
        public_key_from_address(addr[:53] + swap + addr[54:])
    # Change one public-key character: the checksum no longer matches either.
    first = "A" if addr[0] != "A" else "B"
    with pytest.raises(ValueError, match="checksum"):
        public_key_from_address(first + addr[1:])
    with pytest.raises(ValueError, match="58 characters"):
        public_key_from_address(addr[:-1])
    with pytest.raises(ValueError, match="base32"):
        public_key_from_address("1" * 58)
