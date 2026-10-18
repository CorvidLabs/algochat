"""Protocol 0x03 and 0x06 action 5 against vectors/group-admin-v1.json."""

import importlib.util
import json
from pathlib import Path

import pytest

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
from algochat.group_admin import AdminEvent, RoomState

_VECTOR_PATH = Path(__file__).resolve().parents[2] / "vectors" / "group-admin-v1.json"
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
            assert _draft_note(item).hex() == item["note"], item["name"]

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
        assert drafted["note"] == draft["note"]

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
