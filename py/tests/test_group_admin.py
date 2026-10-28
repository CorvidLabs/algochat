"""Protocol 0x03 and 0x06 action 5 against vectors/group-admin-v1.json."""

import importlib.util
import json
from pathlib import Path

import pytest
from cryptography.hazmat.primitives.ciphers.aead import ChaCha20Poly1305

from algochat import (
    PQError,
    PQSession,
    __all__ as PACKAGE_EXPORTS,
    delivery_authorized,
    draft_admin,
    is_group_membership,
    open_group_key_delivery,
    open_group_membership,
    reduce_admin,
    seal_group_key_delivery,
    sender_may_post,
)
from algochat.group_admin import (
    GROUP_ADMIN_MAX,
    GROUP_DELIVER_BATCH,
    GROUP_MEMBER_MAX,
    GROUP_MEMBERS_OMITTED,
    GROUP_NAME_MAX,
    JOINING_ASK,
    JOINING_INVITE,
    OP_ADD_MEMBER,
    OP_CREATE,
    OP_REMOVE_MEMBER,
    OP_REQUEST_JOIN,
    OP_SET_POLICY,
    OP_TRANSFER_OWNER,
    AdminEvent,
    RoomState,
    authorized_recipients,
    channel_departures,
    encode_admin_record,
    next_delivery_batch,
    pending_key_deliveries,
)
from algochat.pq import PQ_DATA_HEADER_SIZE, PQ_VERSION

_VECTOR_PATH = Path(__file__).resolve().parents[2] / "vectors" / "group-admin-v1.json"
_DELTA_VECTOR_PATH = Path(__file__).resolve().parents[2] / "vectors" / "group-admin-delta-v1.json"
_PQ_IO_PATH = Path(__file__).resolve().parents[1] / "tools" / "pq_io.py"
_STATE_FIELDS = (
    "group_id",
    "mailbox",
    "owner",
    "admins",
    "members",
    "pending",
    "policy",
    "name_hex",
    "epoch",
    "head_tx_id",
)
_EXPORTS = (
    "draft_admin",
    "reduce_admin",
    "sender_may_post",
    "delivery_authorized",
    "seal_group_key_delivery",
    "open_group_key_delivery",
)


def _vector() -> dict:
    return json.loads(_VECTOR_PATH.read_text())


def _hex(value: str) -> bytes:
    return bytes.fromhex(value)


def _maybe_hex(value: str | None) -> bytes | None:
    if value is None:
        return None
    return bytes.fromhex(value)


def _revive(state: dict | None) -> RoomState | None:
    if state is None:
        return None
    parent = state.get("parent_group_id")
    return RoomState(
        group_id=_hex(state["group_id"]),
        mailbox=_hex(state["mailbox"]),
        owner=_hex(state["owner"]),
        admins=[_hex(item) for item in state["admins"]],
        members=[_hex(item) for item in state["members"]],
        pending=[_hex(item) for item in state["pending"]],
        policy=state["policy"],
        name=_hex(state["name_hex"]),
        epoch=state["epoch"],
        head_tx_id=_hex(state["head_tx_id"]),
        parent_group_id=_hex(parent) if isinstance(parent, str) else bytes(32),
    )


def _snap(state: RoomState | None) -> dict | None:
    if state is None:
        return None
    return {
        "group_id": state.group_id.hex(),
        "mailbox": state.mailbox.hex(),
        "owner": state.owner.hex(),
        "admins": [item.hex() for item in state.admins],
        "members": [item.hex() for item in state.members],
        "pending": [item.hex() for item in state.pending],
        "policy": state.policy,
        "name_hex": state.name.hex(),
        "epoch": state.epoch,
        "head_tx_id": state.head_tx_id.hex(),
    }


def _draft_note(item: dict) -> bytes:
    name = item.get("name_utf8")
    return draft_admin(
        _revive(item["basis_state"]),
        item["op"],
        _hex(item["sender"]),
        subject=_hex(item["subject"]),
        name=None if name is None else name.encode("utf-8"),
        policy=item.get("policy"),
        group_id=_maybe_hex(item.get("group_id")),
        mailbox=_maybe_hex(item.get("mailbox")),
        parent_room=_revive(item.get("parent_room")),
    )


def _reduce_all(vector: dict) -> dict[str, object]:
    reduced = {}
    for name, reduction in vector["reductions"].items():
        result = reduce_admin(
            [
                AdminEvent(
                    note=_hex(item["note"]),
                    sender=_hex(item["sender"]),
                    tx_id=_hex(item["tx_id"]),
                    round=item["round"],
                    offset=item["offset"],
                )
                for item in reduction["events"]
            ]
        )
        reduced[name] = result
    return reduced


def _load_pq_io():
    spec = importlib.util.spec_from_file_location("algochat_pq_io_admin", _PQ_IO_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("pq_io could not be loaded")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class TestGroupAdmin:
    def test_exports(self):
        for name in _EXPORTS:
            assert name in PACKAGE_EXPORTS

    def test_drafts_match_notes(self):
        vector = _vector()
        assert vector["constants"]["deliver_plaintext_size"] == 133
        for item in vector["drafts"]:
            stored = _hex(item["note"])
            assert stored[0] == 0x02
            assert stored[1] == 0x03
            member_count = _member_count(stored)
            assert member_count != GROUP_MEMBERS_OMITTED
            assert member_count <= 100
            delta = _draft_note(item)
            assert len(delta) <= 4096
            assert _member_count(delta) == GROUP_MEMBERS_OMITTED, item["name"]

    def test_draft_errors(self):
        for item in _vector()["draft_errors"]:
            with pytest.raises(PQError) as caught:
                _draft_note(item)
            message = str(caught.value)
            assert item["error_includes"].lower() in message.lower(), message

    def test_reductions_match_chain(self):
        vector = _vector()
        for name, reduction in vector["reductions"].items():
            result = _reduce_all(vector)[name]
            assert [item.reason for item in result.rejected] == [
                item["reason"] for item in reduction["rejected"]
            ], name
            assert [item.op for item in result.accepted] == [
                item["op"] for item in reduction["accepted"]
            ], name
            snapped = _snap(result.state)
            if reduction["state"] is None:
                assert snapped is None, name
                continue
            assert snapped is not None, name
            for field in _STATE_FIELDS:
                assert snapped[field] == reduction["state"][field], f"{name} {field}"

    def test_authorization_checks(self):
        vector = _vector()
        reduced = _reduce_all(vector)
        for check in vector["checks"]["delivery_authorized"]:
            result = reduced[check["reduction"]]
            allowed = delivery_authorized(
                result.accepted,
                _hex(check["admin_tx_id"]),
                _hex(check["sender"]),
                _hex(check["recipient"]),
                check["epoch"],
            )
            assert allowed is check["allowed"], check
        for check in vector["checks"]["may_post"]:
            result = reduced[check["reduction"]]
            assert result.state is not None
            allowed = sender_may_post(result.state, _hex(check["sender"]), check["epoch"])
            assert allowed is check["allowed"], check

    def test_key_delivery_note(self):
        delivery = _vector()["delivery"]
        session = PQSession(
            session_key=_hex(delivery["session_key"]),
            sender_public_key=_hex(delivery["sender_x25519"]),
            recipient_public_key=bytes(32),
            handshake_id=_hex(delivery["handshake_id"]),
        )
        note = seal_group_key_delivery(
            session,
            delivery["epoch"],
            _hex(delivery["group_id"]),
            _hex(delivery["mailbox"]),
            _hex(delivery["group_key"]),
            _hex(delivery["admin_tx_id"]),
            _hex(delivery["nonce"]),
        )
        assert note.hex() == delivery["note"]
        assert len(note) == 227
        assert note[1] == 0x06
        assert not is_group_membership(note)
        with pytest.raises(PQError):
            open_group_membership(note, session)
        opened = open_group_key_delivery(note, session)
        assert opened.group_key == _hex(delivery["group_key"])
        assert opened.epoch == delivery["epoch"]
        assert opened.group_id == _hex(delivery["group_id"])
        assert opened.mailbox == _hex(delivery["mailbox"])
        assert opened.admin_tx_id == _hex(delivery["admin_tx_id"])

    def test_pq_io_ops(self, capsys: pytest.CaptureFixture[str]):
        io = _load_pq_io()
        vector = _vector()
        draft = vector["drafts"][0]
        io.handle(
            json.dumps(
                {
                    "id": 1,
                    "op": "adminDraft",
                    "basis_state": draft["basis_state"],
                    "admin_op": draft["op"],
                    "sender": draft["sender"],
                    "subject": draft["subject"],
                    "name_utf8": draft["name_utf8"],
                    "policy": draft["policy"],
                    "group_id": draft["group_id"],
                    "mailbox": draft["mailbox"],
                }
            )
        )
        drafted = json.loads(capsys.readouterr().out)
        assert drafted["ok"] is True, drafted
        stored = _hex(draft["note"])
        assert _member_count(stored) != GROUP_MEMBERS_OMITTED
        drafted_note = _hex(drafted["note"])
        assert _member_count(drafted_note) == GROUP_MEMBERS_OMITTED
        assert len(drafted_note) <= 4096

        reduction = vector["reductions"]["create_invite"]
        io.handle(json.dumps({"id": 2, "op": "adminReduce", "events": reduction["events"]}))
        reduced = json.loads(capsys.readouterr().out)
        assert reduced["ok"] is True, reduced
        assert [item["op"] for item in reduced["accepted"]] == [item["op"] for item in reduction["accepted"]]
        assert [item["reason"] for item in reduced["rejected"]] == [item["reason"] for item in reduction["rejected"]]
        for field in _STATE_FIELDS:
            assert reduced["state"][field] == reduction["state"][field]

        delivery = vector["delivery"]
        io.handle(
            json.dumps(
                {
                    "id": 3,
                    "op": "deliverSeal",
                    "session_key": delivery["session_key"],
                    "sender_x25519": delivery["sender_x25519"],
                    "handshake_id": delivery["handshake_id"],
                    "epoch": delivery["epoch"],
                    "group_id": delivery["group_id"],
                    "mailbox": delivery["mailbox"],
                    "group_key": delivery["group_key"],
                    "admin_tx_id": delivery["admin_tx_id"],
                    "nonce": delivery["nonce"],
                }
            )
        )
        sealed = json.loads(capsys.readouterr().out)
        assert sealed["ok"] is True, sealed
        assert sealed["note"] == delivery["note"]

        io.handle(
            json.dumps(
                {
                    "id": 4,
                    "op": "deliverOpen",
                    "note": sealed["note"],
                    "session_key": delivery["session_key"],
                    "sender_x25519": delivery["sender_x25519"],
                    "handshake_id": delivery["handshake_id"],
                }
            )
        )
        opened = json.loads(capsys.readouterr().out)
        assert opened["ok"] is True, opened
        assert opened["group_key"] == delivery["group_key"]
        assert opened["epoch"] == delivery["epoch"]
        assert opened["admin_tx_id"] == delivery["admin_tx_id"]

        check = vector["checks"]["may_post"][0]
        io.handle(
            json.dumps(
                {
                    "id": 5,
                    "op": "senderMayPost",
                    "state": vector["reductions"][check["reduction"]]["state"],
                    "sender": check["sender"],
                    "epoch": check["epoch"],
                }
            )
        )
        posted = json.loads(capsys.readouterr().out)
        assert posted["ok"] is True, posted
        assert posted["allowed"] is check["allowed"]

        auth = vector["checks"]["delivery_authorized"][0]
        io.handle(
            json.dumps(
                {
                    "id": 6,
                    "op": "deliveryAuthorized",
                    "accepted": vector["reductions"][auth["reduction"]]["accepted"],
                    "admin_tx_id": auth["admin_tx_id"],
                    "sender": auth["sender"],
                    "recipient": auth["recipient"],
                    "epoch": auth["epoch"],
                }
            )
        )
        allowed = json.loads(capsys.readouterr().out)
        assert allowed["ok"] is True, allowed
        assert allowed["allowed"] is auth["allowed"]

    def test_delivery_binds_version_session_and_positive_epoch(self):
        session = PQSession(bytes([0x42]) * 32, bytes([0x11]) * 32, bytes(32), bytes([0x43]) * 32)
        nonce = bytes([0x55]) * 12
        group_id = bytes([7]) * 32
        mailbox = bytes([9]) * 32
        note = seal_group_key_delivery(session, 1, group_id, mailbox, bytes([4]) * 32, bytes([10]) * 32, nonce)
        assert open_group_key_delivery(note, session).admin_tx_id == bytes([10]) * 32
        with pytest.raises(PQError, match="sender"):
            open_group_key_delivery(note, PQSession(session.session_key, bytes([0x22]) * 32, bytes(32), session.handshake_id))
        with pytest.raises(PQError, match="handshake"):
            open_group_key_delivery(note, PQSession(session.session_key, session.sender_public_key, bytes(32), bytes([0x44]) * 32))
        flipped = bytearray(note)
        flipped[-1] ^= 1
        with pytest.raises(PQError, match="authentication"):
            open_group_key_delivery(bytes(flipped), session)
        plain = bytes([5]) + (0).to_bytes(4, "big") + group_id + mailbox + bytes([4]) * 32 + bytes([10]) * 32
        for version in (0, 1, 3, 255):
            with pytest.raises(PQError, match="Not a group key delivery"):
                open_group_key_delivery(_seal_raw(session, plain, version, nonce), session)
        with pytest.raises(PQError, match="epoch"):
            open_group_key_delivery(_seal_raw(session, plain, PQ_VERSION, nonce), session)

    def test_undefined_policy_is_rejected_without_changing_state(self):
        owner = bytes([1]) * 32
        group_id = bytes([7]) * 32
        mailbox = bytes([9]) * 32
        create = draft_admin(None, OP_CREATE, owner, name=b"team", policy=JOINING_INVITE, group_id=group_id, mailbox=mailbox)
        for policy in (0, 3, 255):
            reduced = reduce_admin([AdminEvent(_with_policy(create, policy), owner, bytes([10]) * 32, 1, 0)])
            assert reduced.state is None
            assert reduced.accepted == []
            assert "invite-only or ask-to-join" in reduced.rejected[0].reason
        created = reduce_admin([AdminEvent(create, owner, bytes([10]) * 32, 1, 0)])
        assert created.state is not None
        set_policy = draft_admin(created.state, OP_SET_POLICY, owner, policy=JOINING_ASK)
        for policy in (0, 3, 255):
            reduced = reduce_admin([
                AdminEvent(create, owner, bytes([10]) * 32, 1, 0),
                AdminEvent(_with_policy(set_policy, policy), owner, bytes([11]) * 32, 1, 1),
            ])
            assert reduced.state is not None
            assert reduced.state.policy == JOINING_INVITE
            assert reduced.state.head_tx_id == bytes([10]) * 32
            assert len(reduced.rejected) == 1
            assert "invite-only or ask-to-join" in reduced.rejected[0].reason

    def test_join_request_parent_must_be_an_accepted_transaction(self):
        owner = bytes([1]) * 32
        friend = bytes([2]) * 32
        group_id = bytes([7]) * 32
        mailbox = bytes([9]) * 32
        create = draft_admin(None, OP_CREATE, owner, name=b"general", policy=JOINING_ASK, group_id=group_id, mailbox=mailbox)
        created = reduce_admin([AdminEvent(create, owner, bytes([10]) * 32, 1, 0)])
        assert created.state is not None
        real = draft_admin(created.state, OP_REQUEST_JOIN, friend, subject=friend)
        zero = bytearray(real)
        zero[2:34] = bytes(32)
        unknown = bytearray(real)
        unknown[2:34] = bytes([0x99]) * 32
        base = AdminEvent(create, owner, bytes([10]) * 32, 1, 0)
        zeroed = reduce_admin([base, AdminEvent(bytes(zero), friend, bytes([11]) * 32, 1, 1)])
        assert zeroed.state is not None
        assert zeroed.state.pending == []
        assert zeroed.state.head_tx_id == bytes([10]) * 32
        assert "cite" in zeroed.rejected[0].reason
        missed = reduce_admin([base, AdminEvent(bytes(unknown), friend, bytes([11]) * 32, 1, 1)])
        assert missed.state is not None
        assert missed.state.pending == []
        assert missed.state.policy == JOINING_ASK
        assert "cite" in missed.rejected[0].reason
        accepted = reduce_admin([base, AdminEvent(real, friend, bytes([11]) * 32, 1, 1)])
        assert accepted.rejected == []
        assert accepted.state is not None
        assert accepted.state.pending == [friend]
        assert accepted.state.head_tx_id == bytes([10]) * 32

    def test_full_list_of_256_is_too_large_and_delta_folds_through_256(self):
        roster = [_person(index + 1) for index in range(256)]
        admins = [_person(1000 + index) for index in range(GROUP_ADMIN_MAX)]
        owner = _fill(1)
        friend = _fill(2)
        group_id = _fill(7)
        mailbox = _fill(9)
        assert GROUP_MEMBER_MAX == 256
        assert GROUP_NAME_MAX == 64
        assert GROUP_ADMIN_MAX == 16
        with pytest.raises(PQError, match="too large"):
            encode_admin_record(
                bytes(32),
                group_id,
                mailbox,
                1,
                OP_CREATE,
                bytes(GROUP_NAME_MAX),
                JOINING_INVITE,
                roster[0],
                admins,
                roster,
                bytes(32),
                members_omitted=False,
            )
        legacy = encode_admin_record(
            bytes(32),
            group_id,
            mailbox,
            1,
            OP_CREATE,
            b"team",
            JOINING_INVITE,
            owner,
            [],
            [owner],
            bytes(32),
            members_omitted=False,
        )
        legacy_room = reduce_admin([_event(legacy, owner, 10)])
        assert legacy_room.rejected == []
        assert legacy_room.state is not None
        assert len(legacy_room.state.members) == 1
        legacy_add = draft_admin(legacy_room.state, OP_ADD_MEMBER, owner, subject=friend)
        legacy_grown = reduce_admin([
            _event(legacy, owner, 10),
            _event(legacy_add, owner, 11, 2),
        ])
        assert legacy_grown.rejected == []
        assert legacy_grown.state is not None
        assert len(legacy_grown.state.members) == 2

        hall_id = _person(900)
        hall_mail = _person(901)
        hall_owner = _person(1)
        events: list[AdminEvent] = []
        created_note = draft_admin(
            None,
            OP_CREATE,
            hall_owner,
            name=b"hall",
            policy=JOINING_INVITE,
            group_id=hall_id,
            mailbox=hall_mail,
        )
        events.append(_marked(created_note, hall_owner, 1))
        reduced = reduce_admin(events)
        assert reduced.rejected == []
        assert reduced.state is not None
        assert len(reduced.state.members) == 1
        for count in range(2, 257):
            note = draft_admin(reduced.state, OP_ADD_MEMBER, hall_owner, subject=_person(count))
            assert len(note) <= 4096
            assert _member_count(note) == GROUP_MEMBERS_OMITTED
            events.append(_marked(note, hall_owner, count))
            reduced = reduce_admin(events)
            assert reduced.rejected == []
            if count == 101:
                assert reduced.state is not None
                assert len(reduced.state.members) == 101
        assert reduced.state is not None
        assert len(reduced.state.members) == 256
        assert reduced.state.epoch == 1

    def test_channel_keeps_its_own_roster_and_a_missed_key_payment_can_resume(self):
        owner = _fill(1)
        parent_id = _person(700)
        parent_mail = _person(701)
        channel_id = _person(702)
        channel_mail = _person(703)
        alice = _person(2)
        bob = _person(3)
        cara = _person(4)
        extra = [_person(20 + index) for index in range(16)]
        parent_create = draft_admin(
            None,
            OP_CREATE,
            owner,
            name=b"hall",
            policy=JOINING_INVITE,
            group_id=parent_id,
            mailbox=parent_mail,
        )
        parent_events = [_event(parent_create, owner, 10)]
        parent = reduce_admin(parent_events)
        for index, member in enumerate([alice, bob, cara, *extra]):
            note = draft_admin(parent.state, OP_ADD_MEMBER, owner, subject=member)
            parent_events.append(_event(note, owner, 11 + index, index + 2))
            parent = reduce_admin(parent_events)
        assert parent.rejected == []
        assert parent.state is not None
        assert len(parent.state.members) == 1 + 3 + len(extra)

        with pytest.raises(PQError, match="group owner"):
            draft_admin(
                None,
                OP_CREATE,
                alice,
                name=b"ops",
                policy=JOINING_INVITE,
                group_id=channel_id,
                mailbox=channel_mail,
                parent_room=parent.state,
            )
        channel_create = draft_admin(
            None,
            OP_CREATE,
            owner,
            name=b"ops",
            policy=JOINING_INVITE,
            group_id=channel_id,
            mailbox=channel_mail,
            parent_room=parent.state,
        )
        channel_events = [_event(channel_create, owner, 80, 30)]
        channel = reduce_admin(channel_events, parent_events)
        assert channel.rejected == []
        assert channel.state is not None
        assert len(channel.state.members) == 1
        assert channel.state.parent_group_id == parent_id
        assert channel.state.group_id == channel_id
        assert channel.state.mailbox == channel_mail
        assert channel.state.group_id != parent.state.group_id

        for index, member in enumerate([alice, bob, *extra]):
            note = draft_admin(
                channel.state,
                OP_ADD_MEMBER,
                owner,
                subject=member,
                parent_room=parent.state,
            )
            channel_events.append(_event(note, owner, 81 + index, 31 + index))
            channel = reduce_admin(channel_events, parent_events)
        assert channel.rejected == []
        assert channel.state is not None
        assert all(item != cara for item in channel.state.members)
        assert any(item == alice for item in channel.state.members)
        with pytest.raises(PQError, match="parent room"):
            draft_admin(
                channel.state,
                OP_ADD_MEMBER,
                owner,
                subject=_person(500),
                parent_room=parent.state,
            )
        with pytest.raises(PQError, match="group owner keeps"):
            draft_admin(
                channel.state,
                OP_TRANSFER_OWNER,
                owner,
                subject=bob,
                parent_room=parent.state,
            )

        parent_remove = draft_admin(parent.state, OP_REMOVE_MEMBER, owner, subject=alice)
        parent_events = [*parent_events, _event(parent_remove, owner, 60, 80)]
        parent = reduce_admin(parent_events)
        assert parent.state is not None
        assert parent.state.epoch == 2
        assert sender_may_post(parent.state, alice, 2) is False
        stale = reduce_admin(channel_events, parent_events)
        assert stale.state is not None
        assert any(item == alice for item in stale.state.members)
        assert [item[3] for item in channel_departures(stale.state, parent.state)] == [alice[3]]

        channel_remove = draft_admin(
            stale.state,
            OP_REMOVE_MEMBER,
            owner,
            subject=alice,
            parent_room=parent.state,
        )
        channel_events = [*channel_events, _event(channel_remove, owner, 120, 90)]
        channel = reduce_admin(channel_events, parent_events)
        assert channel.rejected == []
        assert channel.state is not None
        assert channel.state.epoch == 2
        assert all(item != alice for item in channel.state.members)
        remove_tx = channel.accepted[-1]
        assert delivery_authorized(channel.accepted, remove_tx.tx_id, owner, alice, 2) is False
        assert delivery_authorized(channel.accepted, remove_tx.tx_id, bob, bob, 2) is False
        recipients = authorized_recipients(channel.accepted, remove_tx.tx_id, owner, 2)
        assert all(item != alice for item in recipients)
        assert any(item == bob for item in recipients)
        assert len(recipients) > GROUP_DELIVER_BATCH
        batch = next_delivery_batch(recipients)
        assert len(batch) == GROUP_DELIVER_BATCH
        missed = batch[-1]
        landed = batch[:-1]
        pending = pending_key_deliveries(recipients, landed)
        assert any(item == missed for item in pending)
        assert next_delivery_batch(pending)[0] == missed
        resumed = [*landed, missed]
        assert all(item != missed for item in pending_key_deliveries(recipients, resumed))
        assert len(pending_key_deliveries(recipients, resumed)) == len(recipients) - len(resumed)

    def test_group_admin_delta_v1_vector_matches_frozen_bytes(self):
        vector = json.loads(_DELTA_VECTOR_PATH.read_text())
        assert vector["constants"]["member_max"] == GROUP_MEMBER_MAX
        assert vector["constants"]["members_omitted"] == GROUP_MEMBERS_OMITTED
        assert vector["constants"]["deliver_batch"] == GROUP_DELIVER_BATCH
        for draft in vector["drafts"]:
            assert _draft_note(draft).hex() == draft["note"], draft["name"]
        for item in vector["draft_errors"]:
            with pytest.raises(PQError) as caught:
                _draft_note(item)
            message = str(caught.value)
            assert item["error_includes"].lower() in message.lower(), (item["name"], message)
        for name, reduction in vector["reductions"].items():
            parent_events = reduction.get("parent_events")
            result = reduce_admin(
                _wire_events(reduction["events"]),
                None if parent_events is None else _wire_events(parent_events),
            )
            assert [item.reason for item in result.rejected] == [
                item["reason"] for item in reduction["rejected"]
            ], name
            assert [item.op for item in result.accepted] == [
                item["op"] for item in reduction["accepted"]
            ], name
            assert _snap_parent(result.state) == reduction["state"], name


def _with_policy(note: bytes, policy: int) -> bytes:
    out = bytearray(note)
    out[104 + out[103]] = policy
    return bytes(out)


def _fill(byte: int) -> bytes:
    return bytes([byte]) * 32


def _person(identifier: int) -> bytes:
    return identifier.to_bytes(4, "big") + bytes(28)


def _member_count(note: bytes) -> int:
    name_len = note[103]
    admin_count = int.from_bytes(note[137 + name_len : 139 + name_len], "big")
    at = 139 + name_len + (32 * admin_count)
    return int.from_bytes(note[at : at + 2], "big")


def _event(note: bytes, sender: bytes, tx: int, round_number: int = 1, offset: int = 0) -> AdminEvent:
    return AdminEvent(note, sender, _fill(tx), round_number, offset)


def _marked(note: bytes, sender: bytes, number: int) -> AdminEvent:
    return AdminEvent(note, sender, _person(10_000 + number), number, 0)


def _wire_events(items: list[dict]) -> list[AdminEvent]:
    return [
        AdminEvent(
            note=_hex(item["note"]),
            sender=_hex(item["sender"]),
            tx_id=_hex(item["tx_id"]),
            round=item["round"],
            offset=item["offset"],
        )
        for item in items
    ]


def _snap_parent(state: RoomState | None) -> dict | None:
    snapped = _snap(state)
    if snapped is None or state is None:
        return None
    return {**snapped, "parent_group_id": state.parent_group_id.hex()}


def _seal_raw(session: PQSession, plaintext: bytes, version: int, nonce: bytes) -> bytes:
    header = bytes([version, 0x06]) + session.sender_public_key + session.handshake_id + nonce
    assert len(header) == PQ_DATA_HEADER_SIZE
    return header + ChaCha20Poly1305(session.session_key).encrypt(nonce, plaintext, header)
