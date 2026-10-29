"""Reply policy from the room record (AGENT-8, AGENT-8.b to AGENT-8.f).

The in-memory chain from test_agent_direct.py stands in for algod and the
indexer, and a fake clock drives the rate limit. The owner's side is drafted
with the library, as Raven does. Seeds are public test values, not wallets.
No test touches a network.
"""

from __future__ import annotations

import json
import os

import pytest

from algochat.agent import (
    SKIP_FROM_BOT,
    SKIP_NO_MODE,
    SKIP_NOT_A_COMMAND,
    SKIP_NOT_MENTIONED,
    SKIP_RATE_LIMIT,
    AgentAccount,
    AgentCore,
    BotCommand,
    RoomMessage,
)
from algochat.agent.policy import (
    CommandCall,
    RoomText,
    check_bot_name,
    command_call,
    command_list_text,
    declared_commands,
    is_command_list,
    mentions,
    parse_room_text,
    within_rate,
)
from algochat.client import AlgoChatConfig
from algochat.group import open_group_message
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
from tests.room_support import OwnerRoom, address, public_key
from tests.test_agent_direct import BOT_SEED, PERSON_SEED, Chain, _person, _say

OWNER_SEED = bytes([0x11]) * 32
ADMIN_SEED = bytes([0x22]) * 32
OTHER_BOT_SEED = bytes([0x66]) * 32
MAILBOX_SEED = bytes([0x44]) * 32
CONFIG = AlgoChatConfig(network="localnet")
ADDRESS = address(BOT_SEED)


class Ledger(Chain):
    async def apay(self, seed: bytes, receiver: str, note: bytes):
        return self.pay(seed, receiver, note)


class Clock:
    """Follows the in-memory chain's block time (one second per round), plus ``now`` seconds."""

    def __init__(self, chain: Chain) -> None:
        self.chain = chain
        self.now = 0.0

    def __call__(self) -> float:
        return 1_800_000_000.0 + self.chain.round + self.now


async def _bot(chain: Chain, clock: Clock, **kwargs) -> AgentCore:
    kwargs.setdefault("name", "helper")
    return await AgentCore.create(AgentAccount.from_seed(BOT_SEED), CONFIG, chain, chain, clock=clock, **kwargs)


async def _room(chain: Ledger, settings: BotSettings | None, other_bot: bool = False) -> OwnerRoom:
    room = OwnerRoom(chain.apay, os.urandom(32), MAILBOX_SEED)
    await room.admin(OWNER_SEED, OP_CREATE, name="team")
    await room.admin(OWNER_SEED, OP_ADD_MEMBER, subject=public_key(PERSON_SEED))
    await room.admin(OWNER_SEED, OP_ADD_MEMBER, subject=public_key(ADMIN_SEED))
    await room.admin(OWNER_SEED, OP_APPOINT_ADMIN, subject=public_key(ADMIN_SEED))
    if other_bot:
        await room.admin(OWNER_SEED, OP_ADD_BOT, subject=public_key(OTHER_BOT_SEED), bot=BotSettings(2, 5, 60))
    if settings is None:
        add = await room.admin(OWNER_SEED, OP_ADD_MEMBER, subject=public_key(BOT_SEED))
    else:
        add = await room.admin(OWNER_SEED, OP_ADD_BOT, subject=public_key(BOT_SEED), bot=settings)
    await room.deliver(OWNER_SEED, BOT_SEED, add)
    return room


def _read(room: OwnerRoom, txid: str, chain: Chain) -> str:
    tx = next(tx for tx in chain.txs if tx.txid == txid)
    epoch = int.from_bytes(tx.note[34:38], "big")
    return open_group_message(bytes(tx.note), room.keys[epoch], public_key(BOT_SEED), []).plaintext.decode()


def _bot_posts(chain: Chain, room: OwnerRoom) -> list:
    return [tx for tx in chain.txs if tx.sender == ADDRESS and tx.receiver == room.mailbox_address]


def _echo(message: RoomMessage) -> str:
    if message.command is not None:
        return f"{message.command.name}: {message.command.arguments}"
    return f"heard: {message.text}"


def _reply_json(text: str, txid: str) -> str:
    return json.dumps({"text": text, "replyTo": {"txid": txid, "preview": "..."}})


# --- helpers ------------------------------------------------------------------


def test_mentions_need_the_at_sign_and_the_whole_name_or_address():
    assert mentions("hey @Helper, ping", "helper", ADDRESS)
    assert mentions("@helper", "helper", ADDRESS)
    assert mentions(f"to @{ADDRESS} now", "helper", ADDRESS)
    assert mentions(f"@{ADDRESS}", None, ADDRESS)
    assert not mentions("helper without the at sign", "helper", ADDRESS)
    assert not mentions("@helpers are many", "helper", ADDRESS)
    assert not mentions("mail me at a@helper.com", "helper", ADDRESS)
    assert not mentions("@helper-two", "helper", ADDRESS)
    assert not mentions(f"@{ADDRESS.lower()}", None, ADDRESS)
    assert not mentions("@helper", None, ADDRESS)


def test_room_text_reads_plain_text_and_section_9_payloads():
    assert parse_room_text("plain") == RoomText("plain")
    assert parse_room_text('{"text":"hi"}') == RoomText("hi")
    assert parse_room_text(_reply_json("thanks", "TXID")) == RoomText("thanks", "TXID")
    assert parse_room_text('{"other":1}') == RoomText('{"other":1}')
    assert parse_room_text("{not json}") == RoomText("{not json}")
    assert parse_room_text('{"text":"t","replyTo":{"txid":""}}') == RoomText("t")


def test_command_calls_match_declared_commands_only():
    declared = ["echo", "help"]
    assert command_call("/echo hi there", declared, "helper", ADDRESS) == CommandCall("echo", "hi there")
    assert command_call("  /ECHO@Helper  a\nb ", declared, "helper", ADDRESS) == CommandCall("echo", "a\nb")
    assert command_call(f"/help@{ADDRESS}", declared, None, ADDRESS) == CommandCall("help", "")
    assert command_call("/echo@otherbot hi", declared, "helper", ADDRESS) is None
    assert command_call("/price", declared, "helper", ADDRESS) is None
    assert command_call("echo hi", declared, "helper", ADDRESS) is None
    assert command_call("/", declared, "helper", ADDRESS) is None


def test_the_command_list_is_plain_text_with_help_added():
    commands = declared_commands([BotCommand("echo", "Repeat your text")])
    assert [c.name for c in commands] == ["echo", "help"]
    text = command_list_text(commands, "helper")
    assert text == "Commands for @helper:\n/echo - Repeat your text\n/help - List these commands"
    assert is_command_list(text) and is_command_list(command_list_text(commands, None))
    assert not is_command_list("Commands are fun")
    own_help = declared_commands([BotCommand("help", "My help")])
    assert [(c.name, c.description) for c in own_help] == [("help", "My help")]
    with pytest.raises(ValueError, match="once"):
        declared_commands([BotCommand("a", ""), BotCommand("a", "")])
    with pytest.raises(ValueError, match="does not fit"):
        command_list_text([BotCommand(f"c{i}", "x" * 200) for i in range(30)], None)


@pytest.mark.parametrize("name", ["Echo", "-x", "", "a" * 33, "with space", "a/b"])
def test_bad_command_names_are_refused(name):
    with pytest.raises(ValueError):
        BotCommand(name, "")


def test_bot_names_and_descriptions_are_checked():
    assert check_bot_name("helper.bot-1") == "helper.bot-1"
    assert check_bot_name(None) is None
    for bad in ["", "@helper", "two words", "-x", "a" * 65]:
        with pytest.raises(ValueError):
            check_bot_name(bad)
    with pytest.raises(ValueError):
        BotCommand("ok", "two\nlines")


def test_rate_window_counts_posts_inside_the_window():
    assert within_rate([], 100.0, 1, 60)
    assert not within_rate([50.0], 100.0, 1, 60)
    assert within_rate([40.0], 100.0, 1, 60)
    assert within_rate([95.0, 99.0], 100.0, 3, 60)
    assert not within_rate([95.0, 99.0, 99.5], 100.0, 3, 60)


# --- AGENT-8: modes ---------------------------------------------------------


@pytest.mark.asyncio
async def test_mentions_mode_answers_at_name_at_address_and_replies_to_its_messages():
    chain = Ledger()
    clock = Clock(chain)
    room = await _room(chain, BotSettings(BOT_MODE_MENTIONS, 5, 60))
    bot = await _bot(chain, clock)
    await bot.sync_rooms()
    await room.post(PERSON_SEED, "nobody asked the bot")
    await room.post(PERSON_SEED, "@helper what time is it?")
    await room.post(OWNER_SEED, f"@{ADDRESS} by address")
    served = await bot.serve_rooms(_echo)
    assert [(r.message.text, r.skipped, r.txid is not None) for r in served] == [
        ("nobody asked the bot", SKIP_NOT_MENTIONED, False),
        ("@helper what time is it?", None, True),
        (f"@{ADDRESS} by address", None, True),
    ]
    first = served[1].txid
    await room.post(PERSON_SEED, _reply_json("thanks", first))
    await room.post(PERSON_SEED, _reply_json("not to the bot", room.notes[0].txid))
    served = await bot.serve_rooms(_echo)
    assert [(r.message.text, r.message.reply_to, r.message.mentioned, r.skipped) for r in served] == [
        ("thanks", first, True, None),
        ("not to the bot", room.notes[0].txid, False, SKIP_NOT_MENTIONED),
    ]
    assert _read(room, served[0].txid, chain) == "heard: thanks"


@pytest.mark.asyncio
async def test_every_message_mode_answers_everything_but_another_bot():
    chain = Ledger()
    clock = Clock(chain)
    room = await _room(chain, BotSettings(BOT_MODE_EVERY_MESSAGE, 5, 60), other_bot=True)
    bot = await _bot(chain, clock)
    await bot.sync_rooms()
    await room.post(PERSON_SEED, "anything")
    await room.post(OTHER_BOT_SEED, "@helper I am a bot too")
    await room.post(OTHER_BOT_SEED, "/help")
    served = await bot.serve_rooms(_echo)
    assert [(r.message.text, r.message.from_bot, r.skipped) for r in served] == [
        ("anything", False, None),
        ("@helper I am a bot too", True, SKIP_FROM_BOT),
        ("/help", True, SKIP_FROM_BOT),
    ]
    assert len(_bot_posts(chain, room)) == 1


@pytest.mark.asyncio
async def test_a_bot_added_as_a_plain_member_has_no_mode_and_stays_silent():
    chain = Ledger()
    clock = Clock(chain)
    room = await _room(chain, None)
    bot = await _bot(chain, clock)
    [joined] = await bot.sync_rooms()
    assert joined.bot is None
    await room.post(PERSON_SEED, "@helper hello")
    served = await bot.serve_rooms(_echo)
    assert [(r.skipped, r.txid) for r in served] == [(SKIP_NO_MODE, None)]
    assert await bot.declare_commands() == []
    assert _bot_posts(chain, room) == []


@pytest.mark.asyncio
async def test_commands_mode_posts_the_list_once_and_answers_declared_commands():
    chain = Ledger()
    clock = Clock(chain)
    room = await _room(chain, BotSettings(BOT_MODE_COMMANDS, 10, 60))
    bot = await _bot(chain, clock, commands=[BotCommand("echo", "Repeat your text")])
    await room.post(PERSON_SEED, "/echo hi there")
    await room.post(PERSON_SEED, "@helper not a command")
    await room.post(PERSON_SEED, "/price 3")
    await room.post(PERSON_SEED, "/echo@otherbot not for me")
    await room.post(OWNER_SEED, "/help@helper")
    served = await bot.serve_rooms(_echo)
    posts = _bot_posts(chain, room)
    assert _read(room, posts[0].txid, chain) == bot.command_list
    assert [(r.message.text, r.skipped) for r in served] == [
        ("/echo hi there", None),
        ("@helper not a command", SKIP_NOT_A_COMMAND),
        ("/price 3", SKIP_NOT_A_COMMAND),
        ("/echo@otherbot not for me", SKIP_NOT_A_COMMAND),
        ("/help@helper", None),
    ]
    assert _read(room, served[0].txid, chain) == "echo: hi there"
    assert _read(room, served[4].txid, chain) == bot.command_list
    assert len(posts) == 3
    # The list is up to date: neither this core nor a restarted one posts it again.
    assert await bot.declare_commands() == []
    restarted = await _bot(chain, clock, commands=[BotCommand("echo", "Repeat your text")])
    assert await restarted.declare_commands() == []
    # New commands mean a new list.
    changed = await _bot(chain, clock, commands=[BotCommand("echo", "Repeat"), BotCommand("roll", "Roll a die")])
    [txid] = await changed.declare_commands()
    assert _read(room, txid, chain) == changed.command_list
    assert "/roll - Roll a die" in changed.command_list


@pytest.mark.asyncio
async def test_an_operator_help_command_replaces_the_built_in_list():
    chain = Ledger()
    clock = Clock(chain)
    room = await _room(chain, BotSettings(BOT_MODE_COMMANDS, 10, 60))
    bot = await _bot(chain, clock, commands=[BotCommand("help", "Ask me anything")])
    await room.post(PERSON_SEED, "/help")
    served = await bot.serve_rooms(lambda m: "my own help")
    assert _read(room, served[0].txid, chain) == "my own help"


@pytest.mark.asyncio
async def test_an_admin_changes_the_mode_and_the_bot_follows_from_the_next_message():
    chain = Ledger()
    clock = Clock(chain)
    room = await _room(chain, BotSettings(BOT_MODE_MENTIONS, 5, 60))
    bot = await _bot(chain, clock, commands=[BotCommand("echo", "")])
    await bot.sync_rooms()
    await room.post(PERSON_SEED, "plain")
    assert [r.skipped for r in await bot.serve_rooms(_echo)] == [SKIP_NOT_MENTIONED]
    await room.admin(ADMIN_SEED, OP_SET_BOT, subject=public_key(BOT_SEED), bot=BotSettings(BOT_MODE_EVERY_MESSAGE, 5, 60))
    await room.post(PERSON_SEED, "plain again")
    assert [r.skipped for r in await bot.serve_rooms(_echo)] == [None]
    await room.admin(OWNER_SEED, OP_SET_BOT, subject=public_key(BOT_SEED), bot=BotSettings(BOT_MODE_COMMANDS, 5, 60))
    await room.post(PERSON_SEED, "plain once more")
    await room.post(PERSON_SEED, "/echo yes")
    served = await bot.serve_rooms(_echo)
    assert [r.skipped for r in served] == [SKIP_NOT_A_COMMAND, None]
    texts = [_read(room, tx.txid, chain) for tx in _bot_posts(chain, room)]
    assert texts == ["heard: plain again", bot.command_list, "echo: yes"]
    [joined] = await bot.sync_rooms()
    assert (joined.bot.mode, joined.bot.replies, joined.bot.seconds) == (BOT_MODE_COMMANDS, 5, 60)


# --- AGENT-8.b: rate limit ---------------------------------------------------


@pytest.mark.asyncio
async def test_the_rate_limit_skips_replies_over_it_and_survives_a_restart():
    chain = Ledger()
    clock = Clock(chain)
    room = await _room(chain, BotSettings(BOT_MODE_EVERY_MESSAGE, 2, 60))
    bot = await _bot(chain, clock)
    await bot.sync_rooms()
    for text in ("one", "two", "three"):
        await room.post(PERSON_SEED, text)
    served = await bot.serve_rooms(_echo)
    assert [(r.message.text, r.skipped) for r in served] == [("one", None), ("two", None), ("three", SKIP_RATE_LIMIT)]
    # A restarted bot counts its posts from their block times.
    restarted = await _bot(chain, clock)
    await room.post(PERSON_SEED, "four")
    assert [r.skipped for r in await restarted.serve_rooms(_echo)] == [SKIP_RATE_LIMIT]
    clock.now += 61
    await room.post(PERSON_SEED, "five")
    assert [r.skipped for r in await restarted.serve_rooms(_echo)] == [None]
    await room.post(PERSON_SEED, "six")
    assert [r.skipped for r in await restarted.serve_rooms(_echo)] == [None]
    await room.post(PERSON_SEED, "seven")
    assert [r.skipped for r in await restarted.serve_rooms(_echo)] == [SKIP_RATE_LIMIT]
    # The owner raises the limit: the next message fits at once.
    await room.admin(OWNER_SEED, OP_SET_BOT, subject=public_key(BOT_SEED), bot=BotSettings(BOT_MODE_EVERY_MESSAGE, 3, 60))
    await room.post(PERSON_SEED, "eight")
    assert [r.skipped for r in await restarted.serve_rooms(_echo)] == [None]
    assert len(_bot_posts(chain, room)) == 5


@pytest.mark.asyncio
async def test_the_command_list_waits_when_the_limit_is_full():
    chain = Ledger()
    clock = Clock(chain)
    room = await _room(chain, BotSettings(BOT_MODE_EVERY_MESSAGE, 1, 60))
    bot = await _bot(chain, clock, commands=[BotCommand("echo", "")])
    await bot.sync_rooms()
    await room.post(PERSON_SEED, "hello")
    await bot.serve_rooms(_echo)
    await room.admin(OWNER_SEED, OP_SET_BOT, subject=public_key(BOT_SEED), bot=BotSettings(BOT_MODE_COMMANDS, 1, 60))
    assert await bot.declare_commands() == []
    clock.now += 60
    [txid] = await bot.declare_commands()
    assert _read(room, txid, chain) == bot.command_list


# --- AGENT-8.c: one-to-one messages from a bot ---------------------------------


@pytest.mark.asyncio
async def test_a_one_to_one_message_from_a_room_bot_gets_no_answer():
    chain = Ledger()
    clock = Clock(chain)
    await _room(chain, BotSettings(BOT_MODE_EVERY_MESSAGE, 5, 60), other_bot=True)
    bot = await _bot(chain, clock)
    await bot.publish_key()
    await bot.sync_rooms()
    person = await _person(chain)
    other = await _person(chain, OTHER_BOT_SEED)
    await _say(chain, person, PERSON_SEED, bot.address, "hi from a person")
    await _say(chain, other, OTHER_BOT_SEED, bot.address, "hi from a bot")
    served = await bot.serve_direct(lambda m: "hello")
    assert [(m.message.text, m.reply_txid is not None, m.skipped) for m in served] == [
        ("hi from a person", True, None),
        ("hi from a bot", False, SKIP_FROM_BOT),
    ]
    assert await bot.serve_direct(lambda m: "hello") == []

