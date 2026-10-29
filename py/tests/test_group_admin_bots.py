"""Room bots (ops 13 and 14) against vectors/group-admin-bots-v1.json."""

import json
from pathlib import Path

import pytest
from algochat import (
    BotSettings,
    PQError,
    RoomBot,
    delivery_authorized,
    draft_admin,
    reduce_admin,
    room_bot,
)
from algochat.group_admin import (
    BOT_MODE_COMMANDS,
    BOT_MODE_EVERY_MESSAGE,
    BOT_MODE_MENTIONS,
    BOT_RATE_PRESET_REPLIES,
    BOT_RATE_PRESET_SECONDS,
    BOT_SETTINGS_SIZE,
    OP_ADD_BOT,
    OP_ADD_MEMBER,
    OP_REMOVE_MEMBER,
    OP_SET_BOT,
    AdminEvent,
    RoomState,
    channel_departures,
    encode_admin_record,
)

_VECTOR = json.loads(
    (Path(__file__).resolve().parents[2] / "vectors" / "group-admin-bots-v1.json").read_text()
)


def _hex(value: str) -> bytes:
    return bytes.fromhex(value)


def _events(items: list[dict] | None) -> list[AdminEvent] | None:
    if items is None:
        return None
    return [
        AdminEvent(_hex(i["note"]), _hex(i["sender"]), _hex(i["tx_id"]), i["round"], i["offset"])
        for i in items
    ]


def _revive(state: dict | None) -> RoomState | None:
    if state is None:
        return None
    return RoomState(
        group_id=_hex(state["group_id"]),
        mailbox=_hex(state["mailbox"]),
        owner=_hex(state["owner"]),
        admins=[_hex(i) for i in state["admins"]],
        members=[_hex(i) for i in state["members"]],
        pending=[_hex(i) for i in state["pending"]],
        policy=state["policy"],
        name=_hex(state["name_hex"]),
        epoch=state["epoch"],
        head_tx_id=_hex(state["head_tx_id"]),
        parent_group_id=_hex(state["parent_group_id"]),
        bots=[RoomBot(_hex(b["account"]), b["mode"], b["replies"], b["seconds"]) for b in state["bots"]],
    )


def _snap(state: RoomState | None) -> dict | None:
    if state is None:
        return None
    return {
        "group_id": state.group_id.hex(),
        "mailbox": state.mailbox.hex(),
        "owner": state.owner.hex(),
        "admins": [i.hex() for i in state.admins],
        "members": [i.hex() for i in state.members],
        "pending": [i.hex() for i in state.pending],
        "policy": state.policy,
        "name_hex": state.name.hex(),
        "epoch": state.epoch,
        "head_tx_id": state.head_tx_id.hex(),
        "parent_group_id": state.parent_group_id.hex(),
        "bots": [
            {"account": b.account.hex(), "mode": b.mode, "replies": b.replies, "seconds": b.seconds}
            for b in state.bots
        ],
    }


def _draft(item: dict) -> bytes:
    bot = item["bot"]
    return draft_admin(
        _revive(item["basis_state"]),
        item["op"],
        _hex(item["sender"]),
        subject=_hex(item["subject"]),
        name=None if item["name_utf8"] is None else item["name_utf8"].encode(),
        policy=item["policy"],
        group_id=None if item["group_id"] is None else _hex(item["group_id"]),
        mailbox=None if item["mailbox"] is None else _hex(item["mailbox"]),
        parent_room=_revive(item["parent_room"]),
        bot=None if bot is None else BotSettings(bot["mode"], bot["replies"], bot["seconds"]),
    )


def _reduce(name: str):
    reduction = _VECTOR["reductions"][name]
    return reduce_admin(_events(reduction["events"]), _events(reduction.get("parent_events")))


def test_constants_match_the_shared_vector():
    constants = _VECTOR["constants"]
    assert constants["op_add_bot"] == OP_ADD_BOT
    assert constants["op_set_bot"] == OP_SET_BOT
    assert constants["mode_mentions"] == BOT_MODE_MENTIONS
    assert constants["mode_every_message"] == BOT_MODE_EVERY_MESSAGE
    assert constants["mode_commands"] == BOT_MODE_COMMANDS
    assert constants["settings_size"] == BOT_SETTINGS_SIZE
    assert constants["preset_replies"] == BOT_RATE_PRESET_REPLIES
    assert constants["preset_seconds"] == BOT_RATE_PRESET_SECONDS


@pytest.mark.parametrize("item", _VECTOR["drafts"], ids=lambda item: item["name"])
def test_drafts_write_the_shared_bytes(item):
    assert _draft(item).hex() == item["note"]


@pytest.mark.parametrize("item", _VECTOR["draft_errors"], ids=lambda item: item["name"])
def test_drafts_refuse_should_reject_cases(item):
    with pytest.raises(PQError) as caught:
        _draft(item)
    assert item["error_includes"].lower() in str(caught.value).lower()


@pytest.mark.parametrize("name", sorted(_VECTOR["reductions"]))
def test_reductions_fold_to_the_shared_state(name):
    reduction = _VECTOR["reductions"][name]
    result = _reduce(name)
    assert [i.reason for i in result.rejected] == [i["reason"] for i in reduction["rejected"]]
    assert [i.tx_id.hex() for i in result.rejected] == [i["tx_id"] for i in reduction["rejected"]]
    assert [i.op for i in result.accepted] == [i["op"] for i in reduction["accepted"]]
    assert _snap(result.state) == reduction["state"]


def test_delivery_and_bot_lookups_match_the_shared_checks():
    for item in _VECTOR["checks"]["delivery_authorized"]:
        result = _reduce(item["reduction"])
        allowed = delivery_authorized(
            result.accepted,
            _hex(item["admin_tx_id"]),
            _hex(item["sender"]),
            _hex(item["recipient"]),
            item["epoch"],
        )
        assert allowed is item["allowed"], item
    for item in _VECTOR["checks"]["room_bot"]:
        state = _reduce(item["reduction"]).state
        found = room_bot(state, _hex(item["account"]))
        got = None if found is None else {"mode": found.mode, "replies": found.replies, "seconds": found.seconds}
        assert got == item["bot"], item


def test_bot_settings_appear_only_on_ops_13_and_14():
    preset = BotSettings(BOT_MODE_MENTIONS, BOT_RATE_PRESET_REPLIES, BOT_RATE_PRESET_SECONDS)
    base = {
        "parent": bytes(32),
        "group_id": b"\x07" * 32,
        "mailbox": b"\x09" * 32,
        "epoch": 1,
        "name": b"",
        "policy": 1,
        "owner": b"\x01" * 32,
        "admins": [],
        "members": [],
        "subject": b"\x05" * 32,
    }
    with pytest.raises(PQError, match="Only a bot record"):
        encode_admin_record(op=OP_ADD_MEMBER, members_omitted=True, bot=preset, **base)
    with pytest.raises(PQError, match="needs a reply mode"):
        encode_admin_record(op=OP_ADD_BOT, members_omitted=True, **base)
    with pytest.raises(PQError, match="delta note"):
        encode_admin_record(op=OP_ADD_BOT, members_omitted=False, bot=preset, **base)
    note = encode_admin_record(op=OP_ADD_BOT, members_omitted=True, bot=preset, **base)
    assert len(note) == 205 + BOT_SETTINGS_SIZE
    assert list(note[-BOT_SETTINGS_SIZE:]) == [1, 0, 5, 0, 60]


def test_nothing_an_account_posts_about_itself_marks_it_as_a_bot():
    """AGENT-7.b: key announcement, chat note, text flag, join request, self op 13."""
    account = b"\x05" * 32
    reduction = _VECTOR["reductions"]["self_posts_are_not_a_bot"]
    self_sent = [i for i in reduction["events"] if i["sender"] == account.hex()]
    assert len(self_sent) == 5
    result = _reduce("self_posts_are_not_a_bot")
    assert account in result.state.members
    assert result.state.bots == []
    assert room_bot(result.state, account) is None
    assert OP_ADD_BOT not in [i.op for i in result.accepted]
    rejected = {i.tx_id.hex(): i.reason for i in result.rejected}
    assert rejected["57" * 32] == "Sender cannot add that bot"
    for tx in ("54", "55", "56"):
        assert rejected[tx * 32] == "Not a room administration record"


def test_a_removed_bot_is_dropped_from_the_room_and_its_channels():
    """AGENT-7.c: ordinary op 11, a new room key, and op 11 on each channel."""
    checks = _VECTOR["checks"]["channel_departures"]
    assert checks
    for item in checks:
        got = channel_departures(_reduce(item["channel"]).state, _reduce(item["parent"]).state)
        assert [i.hex() for i in got] == item["departures"], item
    for name in ("parent_bot_removed", "channel_bot_removed"):
        result = _reduce(name)
        assert result.accepted[-1].op == OP_REMOVE_MEMBER, name
        assert result.state.epoch == 2, name
        assert result.state.bots == [], name
