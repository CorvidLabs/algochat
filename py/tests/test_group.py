"""Protocols 0x06 and 0x07 against vectors/group-v1.json.

The session key in the vector is an input. It is not a handshake output.
"""

import importlib.util
import json
from pathlib import Path

import pytest
from algochat import (
    GROUP_MAX_PAYLOAD_SIZE,
    GROUP_MEMBERSHIP_NOTE_SIZE,
    GroupCounter,
    GroupMembership,
    PQError,
    PQSession,
    derive_group_message_key,
    is_group_membership,
    is_group_message,
    is_pq_handshake,
    is_pq_message,
    open_group_membership,
    open_group_message,
    seal_group_membership,
    seal_group_message,
)
from algochat import (
    __all__ as PACKAGE_EXPORTS,
)

_VECTOR_PATH = Path(__file__).resolve().parents[2] / "vectors" / "group-v1.json"
_PQ_IO_PATH = Path(__file__).resolve().parents[1] / "tools" / "pq_io.py"
_EXPORTS = (
    "seal_group_membership",
    "open_group_membership",
    "derive_group_message_key",
    "seal_group_message",
    "open_group_message",
)


def _vector() -> dict:
    return json.loads(_VECTOR_PATH.read_text())


def _session(vector: dict) -> PQSession:
    return PQSession(
        session_key=bytes.fromhex(vector["session_key"]),
        sender_public_key=bytes.fromhex(vector["sender_x25519"]),
        recipient_public_key=bytes(32),
        handshake_id=bytes.fromhex(vector["handshake_id"]),
    )


def _membership(vector: dict) -> GroupMembership:
    return GroupMembership(
        action=vector["action"],
        epoch=vector["epoch"],
        group_id=bytes.fromhex(vector["group_id"]),
        mailbox=bytes.fromhex(vector["mailbox"]),
        group_key=bytes.fromhex(vector["group_key"]),
    )


def _load_pq_io():
    spec = importlib.util.spec_from_file_location("algochat_pq_io_group", _PQ_IO_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("pq_io could not be loaded")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class TestGroupMailbox:
    def test_exports(self):
        for name in _EXPORTS:
            assert name in PACKAGE_EXPORTS

    def test_vector_notes_match(self):
        vector = _vector()
        assert GROUP_MEMBERSHIP_NOTE_SIZE == 195
        assert GROUP_MAX_PAYLOAD_SIZE == 4026
        session = _session(vector)
        membership = seal_group_membership(
            session,
            _membership(vector),
            bytes.fromhex(vector["membership_nonce"]),
        )
        assert len(membership) == 195
        assert membership.hex() == vector["membership_note"]
        assert membership[0] == 0x02
        assert membership[1] == 0x06
        assert is_group_membership(membership)
        assert not is_group_message(membership)
        assert not is_pq_message(membership)
        assert not is_pq_handshake(membership)

        opened = open_group_membership(membership, session)
        assert opened.action == 1
        assert opened.epoch == 1
        assert opened.group_id.hex() == vector["group_id"]
        assert opened.mailbox.hex() == vector["mailbox"]
        assert opened.group_key.hex() == vector["group_key"]

        group_key = bytes.fromhex(vector["group_key"])
        group_id = bytes.fromhex(vector["group_id"])
        sender = bytes.fromhex(vector["sender_address"])
        message_key = derive_group_message_key(
            group_key,
            vector["epoch"],
            vector["counter"],
            group_id,
            sender,
        )
        assert message_key.hex() == vector["message_key"]

        message = seal_group_message(
            vector["plaintext_utf8"].encode("utf-8"),
            group_key,
            group_id,
            vector["epoch"],
            vector["counter"],
            sender,
            bytes.fromhex(vector["message_nonce"]),
        )
        assert message.hex() == vector["message_note"]
        assert message[0] == 0x02
        assert message[1] == 0x07
        assert is_group_message(message)
        assert not is_group_membership(message)

        plain = open_group_message(message, group_key, sender, [])
        assert plain.plaintext == b"group-v1"
        assert plain.epoch == 1
        assert plain.counter == 0
        assert plain.group_id == group_id
        again = open_group_message(
            message,
            group_key,
            sender,
            [GroupCounter(epoch=2, counter=0)],
        )
        assert again.plaintext == b"group-v1"

    def test_repeated_counter_and_authentication_failures(self):
        vector = _vector()
        session = _session(vector)
        membership = bytes.fromhex(vector["membership_note"])
        message = bytes.fromhex(vector["message_note"])
        group_key = bytes.fromhex(vector["group_key"])
        sender = bytes.fromhex(vector["sender_address"])

        with pytest.raises(PQError, match="repeated"):
            open_group_message(message, group_key, sender, [GroupCounter(epoch=1, counter=0)])
        with pytest.raises(PQError, match="repeated"):
            open_group_message(message, group_key, sender, [{"epoch": 1, "counter": 0}])
        with pytest.raises(PQError, match="repeated"):
            open_group_message(message, group_key, sender, [(1, 0)])

        flipped = bytearray(message)
        flipped[-1] ^= 0x01
        with pytest.raises(PQError, match="authentication"):
            open_group_message(bytes(flipped), group_key, sender, [])
        with pytest.raises(PQError, match="authentication"):
            open_group_message(message, bytes([0x98]) * 32, sender, [])
        with pytest.raises(PQError, match="authentication"):
            open_group_message(message, group_key, bytes([0xBB]) * 32, [])

        flipped_membership = bytearray(membership)
        flipped_membership[-1] ^= 0x01
        with pytest.raises(PQError, match="authentication"):
            open_group_membership(bytes(flipped_membership), session)
        wrong_key = PQSession(
            session_key=bytes([0x01]) * 32,
            sender_public_key=session.sender_public_key,
            recipient_public_key=session.recipient_public_key,
            handshake_id=session.handshake_id,
        )
        with pytest.raises(PQError, match="authentication"):
            open_group_membership(membership, wrong_key)

    def test_limits_actions_and_fresh_nonce(self):
        vector = _vector()
        session = _session(vector)
        group_key = bytes.fromhex(vector["group_key"])
        group_id = bytes.fromhex(vector["group_id"])
        sender = bytes.fromhex(vector["sender_address"])
        nonce = bytes.fromhex(vector["message_nonce"])

        full = b"\xab" * GROUP_MAX_PAYLOAD_SIZE
        note = seal_group_message(full, group_key, group_id, 4, 0xFFFFFFFF, sender, nonce)
        assert len(note) == 4096
        opened = open_group_message(note, group_key, sender, [])
        assert opened.plaintext == full
        assert opened.epoch == 4
        assert opened.counter == 0xFFFFFFFF

        with pytest.raises(PQError, match="too large"):
            seal_group_message(full + b"\x00", group_key, group_id, 1, 1, sender, nonce)

        empty = seal_group_message(b"", group_key, group_id, 1, 3, sender, nonce)
        assert len(empty) == 54 + 16
        assert open_group_message(empty, group_key, sender, []).plaintext == b""

        for action in (1, 2, 3, 4):
            membership = GroupMembership(
                action=action,
                epoch=action,
                group_id=group_id,
                mailbox=bytes.fromhex(vector["mailbox"]),
                group_key=group_key,
            )
            sealed = seal_group_membership(session, membership, bytes([action]) * 12)
            assert open_group_membership(sealed, session).action == action

        with pytest.raises(PQError, match="action"):
            seal_group_membership(
                session,
                GroupMembership(
                    action=0,
                    epoch=1,
                    group_id=group_id,
                    mailbox=bytes(32),
                    group_key=group_key,
                ),
                nonce,
            )
        with pytest.raises(PQError, match="epoch"):
            seal_group_membership(
                session,
                GroupMembership(
                    action=1,
                    epoch=0,
                    group_id=group_id,
                    mailbox=bytes(32),
                    group_key=group_key,
                ),
                nonce,
            )
        with pytest.raises(PQError, match="counter"):
            seal_group_message(b"a", group_key, group_id, 1, -1, sender, nonce)

        first = seal_group_message(b"hi", group_key, group_id, 1, 8, sender)
        second = seal_group_message(b"hi", group_key, group_id, 1, 8, sender)
        assert first != second
        assert open_group_message(first, group_key, sender, []).plaintext == b"hi"
        assert open_group_message(second, group_key, sender, []).plaintext == b"hi"

    def test_pq_io_ops(self, capsys: pytest.CaptureFixture[str]):
        io = _load_pq_io()
        vector = _vector()
        common = {
            "sessionKey": vector["session_key"],
            "senderPublicKey": vector["sender_x25519"],
            "handshakeId": vector["handshake_id"],
        }
        io.handle(
            json.dumps(
                {
                    "id": 1,
                    "op": "groupSeal",
                    **common,
                    "action": vector["action"],
                    "epoch": vector["epoch"],
                    "groupId": vector["group_id"],
                    "mailbox": vector["mailbox"],
                    "groupKey": vector["group_key"],
                    "nonce": vector["membership_nonce"],
                }
            )
        )
        sealed = json.loads(capsys.readouterr().out)
        assert sealed["ok"] is True
        assert sealed["id"] == 1
        assert sealed["note"] == vector["membership_note"]

        io.handle(json.dumps({"id": 2, "op": "groupOpen", **common, "note": sealed["note"]}))
        opened = json.loads(capsys.readouterr().out)
        assert opened["ok"] is True
        assert opened["action"] == 1
        assert opened["epoch"] == 1
        assert opened["groupId"] == vector["group_id"]
        assert opened["mailbox"] == vector["mailbox"]
        assert opened["groupKey"] == vector["group_key"]

        io.handle(
            json.dumps(
                {
                    "id": 3,
                    "op": "groupWrite",
                    "groupKey": vector["group_key"],
                    "groupId": vector["group_id"],
                    "epoch": vector["epoch"],
                    "counter": vector["counter"],
                    "senderAddress": vector["sender_address"],
                    "text": vector["plaintext_utf8"],
                    "nonce": vector["message_nonce"],
                }
            )
        )
        written = json.loads(capsys.readouterr().out)
        assert written["ok"] is True
        assert written["note"] == vector["message_note"]
        assert written["messageKey"] == vector["message_key"]

        io.handle(
            json.dumps(
                {
                    "id": 4,
                    "op": "groupRead",
                    "note": written["note"],
                    "groupKey": vector["group_key"],
                    "senderAddress": vector["sender_address"],
                    "text": vector["plaintext_utf8"],
                    "seen": [],
                }
            )
        )
        read = json.loads(capsys.readouterr().out)
        assert read["ok"] is True
        assert read["text"] == "group-v1"
        assert read["epoch"] == 1
        assert read["counter"] == 0
        assert read["groupId"] == vector["group_id"]

        io.handle(
            json.dumps(
                {
                    "id": 5,
                    "op": "groupRead",
                    "note": written["note"],
                    "groupKey": vector["group_key"],
                    "senderAddress": vector["sender_address"],
                    "text": vector["plaintext_utf8"],
                    "seen": [{"epoch": 1, "counter": 0}],
                }
            )
        )
        replay = json.loads(capsys.readouterr().out)
        assert replay["ok"] is False
        assert "repeated" in replay["error"]

        io.handle(
            json.dumps(
                {
                    "id": 6,
                    "op": "groupRead",
                    "note": written["note"],
                    "groupKey": vector["group_key"],
                    "senderAddress": vector["sender_address"],
                    "text": "other",
                    "seen": [],
                }
            )
        )
        mismatch = json.loads(capsys.readouterr().out)
        assert mismatch["ok"] is False

        io.handle(json.dumps({"id": 7, "op": "not-a-group-op"}))
        unknown = json.loads(capsys.readouterr().out)
        assert unknown["ok"] is False
        assert "unknown op" in unknown["error"]
