"""
AGENT-6 and AGENT-7 on LocalNet: a bot in rooms and channels.

An owner makes a room and a channel on a real local chain and adds the bot
(op 13). The bot joins as soon as an authorized key reaches it, with no
request or accept. People write room messages with each implementation's own
tool (TypeScript, Go, Rust, Python, Kotlin); the bot answers with
``AgentCore.serve_rooms``. Every implementation then opens every bot note and
person note and reduces every room chain. Swift does the same from a recorded
file through ``swift test`` (its tool needs macOS 26). Then a member is
removed (new key, the bot carries on), the bot leaves the channel, and the bot
is removed from the room (it stops, in the room and its channel).

Run with ``ALGOCHAT_REQUIRE_LOCALNET=1`` so a missing network or tool fails
instead of skipping. Build the tools first (see ``tests/cross_tools.py``).
Accounts are throwaway and funded only by the local KMD dispenser.
"""

from __future__ import annotations

import json
import os
import secrets

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
from algochat.group_admin import (
    BOT_MODE_EVERY_MESSAGE,
    BOT_MODE_MENTIONS,
    OP_ADD_BOT,
    OP_ADD_MEMBER,
    OP_CREATE,
    OP_REMOVE_MEMBER,
    BotSettings,
)

from .cross_tools import MESH, Tool, ToolError, ToolMissing, swift_replay
from .localnet_support import (
    LocalnetAlgod,
    LocalnetIndexer,
    SigningAccount,
    dispenser,
    localnet_status,
    send_payment,
)
from .room_support import OwnerRoom, public_key

REQUIRED = os.environ.get("ALGOCHAT_REQUIRE_LOCALNET") == "1"
_REASON = localnet_status()
if _REASON is not None and REQUIRED:
    raise RuntimeError(f"ALGOCHAT_REQUIRE_LOCALNET=1 but {_REASON}")

pytestmark = [
    pytest.mark.localnet,
    pytest.mark.skipif(_REASON is not None, reason=_REASON or ""),
]

FUND = 10_000_000


def _config() -> AlgoChatConfig:
    config = AlgoChatConfig.localnet()
    config.allow_unverified_keys = False
    return config


def _tools() -> dict[str, Tool]:
    tools: dict[str, Tool] = {}
    missing: list[str] = []
    for lang in MESH:
        try:
            tools[lang] = Tool(lang)
        except ToolMissing as error:
            missing.append(str(error))
    if missing:
        for tool in tools.values():
            tool.close()
        if REQUIRED:
            pytest.fail("cross-language tools missing: " + "; ".join(missing))
        pytest.skip("cross-language tools missing: " + "; ".join(missing))
    return tools


def _events(room: OwnerRoom | None) -> list[dict] | None:
    if room is None:
        return None
    return [
        {"note": e.note.hex(), "sender": e.sender.hex(), "tx_id": e.tx_id.hex(), "round": e.round, "offset": e.offset}
        for e in room.events
    ]


class Harness:
    """The chain, the tools and a record of every room note for the Swift replay."""

    def __init__(self, tools: dict[str, Tool]) -> None:
        self.algod, self.indexer = LocalnetAlgod(), LocalnetIndexer()
        self.tools = tools
        self.seeds: dict[bytes, SigningAccount] = {}
        self.notes: list[dict] = []

    async def account(self) -> SigningAccount:
        account = SigningAccount.generate()
        await send_payment(self.algod, dispenser(), account.address, FUND)
        self.seeds[account.seed] = account
        return account

    async def pay(self, seed: bytes, receiver: str, note: bytes):
        info = await send_payment(self.algod, self.seeds[seed], receiver, 0, note)
        return await self.indexer.wait_for_indexer(info.txid, 30)

    def room(self, mailbox: SigningAccount, parent: OwnerRoom | None = None) -> OwnerRoom:
        return OwnerRoom(self.pay, secrets.token_bytes(32), mailbox.seed, parent=parent)

    async def write(self, lang: str, room: OwnerRoom, sender: SigningAccount, text: str):
        """``lang``'s tool seals the message; the person pays it to the mailbox."""
        epoch = room.state().epoch
        counter = room.counters.get((sender.seed, epoch), 0)
        room.counters[(sender.seed, epoch)] = counter + 1
        note = self.tools[lang].ask(
            "groupWrite",
            groupKey=room.keys[epoch].hex(),
            groupId=room.group_id.hex(),
            epoch=epoch,
            counter=counter,
            senderAddress=public_key(sender.seed).hex(),
            text=text,
            nonce=secrets.token_bytes(12).hex(),
        )["note"]
        tx = await self.pay(sender.seed, room.mailbox_address, bytes.fromhex(note))
        self.check(room, tx, public_key(sender.seed), text, f"{lang}:{tx.txid}", from_bot=False)
        return tx

    def check(self, room: OwnerRoom, tx, sender: bytes, text: str, name: str, from_bot: bool) -> None:
        """Every language opens the confirmed note; the note goes into the Swift record."""
        note = bytes(tx.note)
        epoch = int.from_bytes(note[34:38], "big")
        for lang, tool in self.tools.items():
            try:
                tool.ask(
                    "groupRead",
                    note=note.hex(),
                    groupKey=room.keys[epoch].hex(),
                    senderAddress=sender.hex(),
                    text=text,
                    seen=[],
                )
            except ToolError as error:
                raise AssertionError(f"{lang} could not open {name} as {text!r}: {error}") from None
        self.notes.append({
            "name": name,
            "note": note.hex(),
            "key": room.keys[epoch].hex(),
            "sender": sender.hex(),
            "text": text,
            "epoch": epoch,
            "counter": int.from_bytes(note[38:42], "big"),
            "group_id": room.group_id.hex(),
            "from_bot": from_bot,
        })

    def reduce_everywhere(self, room: OwnerRoom) -> dict:
        """Every language reduces the room's chain to the same state as Python's library."""
        expected = room.state()
        parent = None if room.parent is None else _events(room.parent)
        for lang, tool in self.tools.items():
            got = tool.ask("adminReduce", events=_events(room), parent_events=parent)
            assert got["rejected"] == [], f"{lang}: {got['rejected']}"
            state = got["state"]
            assert state["epoch"] == expected.epoch, lang
            assert sorted(state["members"]) == sorted(m.hex() for m in expected.members), lang
            assert [b["account"] for b in state["bots"]] == [b.account.hex() for b in expected.bots], lang
            assert [(b["mode"], b["replies"], b["seconds"]) for b in state["bots"]] == [
                (b.mode, b.replies, b.seconds) for b in expected.bots
            ], lang
            assert state["parent_group_id"] == expected.parent_group_id.hex(), lang
        return {
            "events": _events(room),
            "parent_events": parent,
            "epoch": expected.epoch,
            "members": [m.hex() for m in expected.members],
            "bots": [b.account.hex() for b in expected.bots],
            "bot_settings": [[b.mode, b.replies, b.seconds] for b in expected.bots],
            "parent_group_id": expected.parent_group_id.hex(),
        }


async def _core(account: SigningAccount, harness: Harness, **kwargs) -> AgentCore:
    # Members mention the bot as @bot; the room's mode is mentions and the channel's every message.
    kwargs.setdefault("name", "bot")
    return await AgentCore.create(
        AgentAccount.from_seed(account.seed), _config(), harness.algod, harness.indexer, **kwargs
    )


async def _bot_note(harness: Harness, room: OwnerRoom, bot: SigningAccount, txid: str, text: str, name: str):
    tx = await harness.indexer.wait_for_indexer(txid, 30)
    assert tx.receiver == room.mailbox_address and tx.sender == bot.address
    harness.check(room, tx, public_key(bot.seed), text, name, from_bot=True)


async def test_bot_in_a_room_and_a_channel_across_every_language(tmp_path):
    tools = _tools()
    harness = Harness(tools)
    try:
        owner = await harness.account()
        member = await harness.account()
        bot_account = await harness.account()
        mailbox = await harness.account()
        channel_mailbox = await harness.account()

        bot = await _core(bot_account, harness)
        await harness.indexer.wait_for_indexer(await bot.publish_key(), 30)
        await harness.indexer.wait_for_indexer(await bot.publish_pq_key(), 30)
        assert await bot.publish_pq_key() is None, "a second publish of the same PQ key is skipped"

        # 1. The owner makes a room, adds a member and the bot (op 13), and a channel with the bot.
        room = harness.room(mailbox)
        await room.admin(owner.seed, OP_CREATE, name="team \u2713")
        await room.admin(owner.seed, OP_ADD_MEMBER, subject=public_key(member.seed))
        add = await room.admin(
            # 10 per 60 s: room for the 7 room replies below (the limit itself is tested in the policy tests).
            owner.seed, OP_ADD_BOT, subject=public_key(bot_account.seed), bot=BotSettings(BOT_MODE_MENTIONS, 10, 60)
        )
        # A plain member may not hand the bot a key: the bot ignores this one.
        await room.deliver(member.seed, bot_account.seed, add)
        assert await bot.sync_rooms() == []
        await room.deliver(owner.seed, bot_account.seed, add)
        channel = harness.room(channel_mailbox, parent=room)
        await channel.admin(owner.seed, OP_CREATE, name="news")
        channel_add = await channel.admin(
            owner.seed, OP_ADD_BOT, subject=public_key(bot_account.seed), bot=BotSettings(BOT_MODE_EVERY_MESSAGE, 5, 60)
        )
        await channel.deliver(owner.seed, bot_account.seed, channel_add)

        joined = {r.mailbox: r for r in await bot.sync_rooms()}
        assert {r.status for r in joined.values()} == {ROOM_ACTIVE}
        assert not joined[room.mailbox_address].is_channel
        assert joined[channel.mailbox_address].is_channel
        assert joined[channel.mailbox_address].parent_group_id == room.group_id
        assert joined[room.mailbox_address].bot.mode == BOT_MODE_MENTIONS
        assert joined[channel.mailbox_address].bot.mode == BOT_MODE_EVERY_MESSAGE
        sent_by_bot = [tx for tx in await harness.indexer.search_transactions(bot.address) if tx.sender == bot.address]
        assert all(tx.receiver == bot.address for tx in sent_by_bot), "the bot sent no request or accept"

        # 2. Each language writes a room message; the member writes one; the owner one in the channel.
        asked = []
        for lang in tools:
            text = f"@bot hello from {lang} \u2713 \u00f1 \U0001f680"
            asked.append((await harness.write(lang, room, owner, text), text))
        asked.append((await harness.write("go", room, member, "@bot from the member"), "@bot from the member"))
        asked.append((await harness.write("ts", channel, owner, "channel news \U0001f4f0"), "channel news \U0001f4f0"))

        def answer(message: RoomMessage) -> str:
            return f"{'channel' if message.is_channel else 'room'} bot heard: {message.text}"

        served = await bot.serve_rooms(answer)
        assert [r.message.txid for r in served] == [tx.txid for tx, _ in asked]
        assert [r.message.text for r in served] == [text for _, text in asked]
        assert all(r.txid and r.error is None for r in served)
        for r in served:
            target = channel if r.message.is_channel else room
            await _bot_note(harness, target, bot_account, r.txid, answer(r.message), f"bot:{r.txid}")
        assert await bot.serve_rooms(answer) == [], "nothing is answered twice"

        # 3. A restarted bot answers nothing old.
        restarted = await _core(bot_account, harness)
        assert await restarted.read_rooms() == []

        # 4. The owner removes the member: a new key (epoch 2) reaches the bot and it carries on.
        removed = await room.admin(owner.seed, OP_REMOVE_MEMBER, subject=public_key(member.seed))
        await room.deliver(owner.seed, bot_account.seed, removed)
        assert room.state().epoch == 2
        late = await harness.write("rs", room, owner, "@bot epoch two")
        served = await restarted.serve_rooms(answer)
        assert [(r.message.txid, r.message.epoch) for r in served] == [(late.txid, 2)]
        await _bot_note(harness, room, bot_account, served[0].txid, answer(served[0].message), "bot:epoch2")

        # 5. The bot leaves the channel; it posts the notice and a fresh core stays out.
        [notice] = await restarted.leave_room(joined[channel.mailbox_address])
        await _bot_note(harness, channel, bot_account, notice, LEAVE_NOTICE, "bot:leave")
        await harness.write("kt", channel, owner, "after the bot left")
        fresh = await _core(bot_account, harness)
        status = {r.mailbox: r.status for r in await fresh.sync_rooms()}
        assert status == {room.mailbox_address: ROOM_ACTIVE, channel.mailbox_address: ROOM_LEFT}
        assert await fresh.read_rooms() == []

        # 6. The owner removes the bot from the room: it stops in the room and its channel.
        await room.admin(owner.seed, OP_REMOVE_MEMBER, subject=public_key(bot_account.seed))
        assert room.state().epoch == 3
        await harness.write("py", room, owner, "@bot are you there?")
        assert await fresh.serve_rooms(answer) == []
        status = {r.mailbox: r.status for r in await fresh.sync_rooms()}
        assert status == {room.mailbox_address: ROOM_REMOVED, channel.mailbox_address: ROOM_LEFT}
        with pytest.raises(PermissionError):
            await fresh.send_room(joined[room.mailbox_address], "hello?")

        # 7. Every language reduces both chains the same way; Swift replays notes and chains.
        rooms = {"room": harness.reduce_everywhere(room), "channel": harness.reduce_everywhere(channel)}
        assert public_key(bot_account.seed).hex() not in rooms["room"]["members"]
        record = {"notes": harness.notes, "rooms": rooms}
        record_path, done_path = tmp_path / "rooms-record.json", tmp_path / "rooms-done"
        record_path.write_text(json.dumps(record, ensure_ascii=False), encoding="utf-8")
        try:
            run = swift_replay(record_path, done_path, "AgentRoomsLocalnetTests", "ALGOCHAT_ROOMS_LOCALNET")
        except ToolMissing as error:
            if REQUIRED:
                pytest.fail(str(error))
            pytest.skip(str(error))
        assert run.returncode == 0, (run.stdout + run.stderr)[-4000:]
        assert done_path.read_text().split() == [str(len(harness.notes)), "2"], "the Swift replay test did not run"
    finally:
        for tool in tools.values():
            tool.close()


async def test_removing_the_bot_from_the_room_takes_it_out_of_a_channel_it_never_left():
    tools: dict[str, Tool] = {}
    harness = Harness(tools)
    owner = await harness.account()
    bot_account = await harness.account()
    mailbox = await harness.account()
    channel_mailbox = await harness.account()
    bot = await _core(bot_account, harness)
    room = harness.room(mailbox)
    await room.admin(owner.seed, OP_CREATE, name="team")
    add = await room.admin(owner.seed, OP_ADD_BOT, subject=public_key(bot_account.seed), bot=BotSettings(1, 5, 60))
    await room.deliver(owner.seed, bot_account.seed, add)
    channel = harness.room(channel_mailbox, parent=room)
    await channel.admin(owner.seed, OP_CREATE, name="news")
    channel_add = await channel.admin(owner.seed, OP_ADD_BOT, subject=public_key(bot_account.seed), bot=BotSettings(2, 5, 60))
    await channel.deliver(owner.seed, bot_account.seed, channel_add)
    assert {r.status for r in await bot.sync_rooms()} == {ROOM_ACTIVE}
    await room.admin(owner.seed, OP_REMOVE_MEMBER, subject=public_key(bot_account.seed))
    await channel.post(owner.seed, "still in the channel?")
    assert {r.status for r in await bot.sync_rooms()} == {ROOM_REMOVED}
    assert await bot.read_rooms() == []
