"""LocalNet mesh tool. One JSON object per stdin line."""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from algochat.crypto import decrypt_message, encrypt_message
from algochat.envelope import decode_envelope, encode_envelope
from algochat.group import (
    GroupCounter,
    GroupMembership,
    derive_group_message_key,
    open_group_membership,
    open_group_message,
    seal_group_membership,
    seal_group_message,
)
from algochat.group_admin import (
    AcceptedAdmin,
    AdminEvent,
    RoomState,
    delivery_authorized,
    draft_admin,
    open_group_key_delivery,
    reduce_admin,
    seal_group_key_delivery,
    sender_may_post,
)
from algochat.keys import derive_keys_from_seed, public_key_to_bytes
from algochat.pq import (
    PQSession,
    accept_pq_session,
    decrypt_pq_message,
    derive_mlkem_keypair,
    encrypt_pq_message,
    initiate_pq_session,
    open_pq_session_as_sender,
)
from algochat.psk_crypto import decrypt_psk_message, encrypt_psk_message
from algochat.psk_envelope import decode_psk_envelope, encode_psk_envelope
from algochat.psk_ratchet import derive_psk_at_counter
from algochat.types import DecryptedContent


def _hex_bytes(text: str) -> bytes:
    return bytes.fromhex(text)


def identity(seed_hex: str) -> dict:
    seed = _hex_bytes(seed_hex)
    _private, public = derive_keys_from_seed(seed)
    kem = derive_mlkem_keypair(seed)
    return {"x25519": public_key_to_bytes(public).hex(), "encapsKey": kem.encaps_key.hex()}


def write_note(alice_hex: str, bob_hex: str, text: str) -> dict:
    alice_private, alice_public = derive_keys_from_seed(_hex_bytes(alice_hex))
    _bob_private, bob_public = derive_keys_from_seed(_hex_bytes(bob_hex))
    del alice_private
    kem = derive_mlkem_keypair(_hex_bytes(bob_hex))
    alice_kem = derive_mlkem_keypair(_hex_bytes(alice_hex))
    note, session = initiate_pq_session(
        alice_public, bob_public, kem.encaps_key, alice_kem.encaps_key
    )
    message = encrypt_pq_message(text, session)
    return {
        "handshake": note.hex(),
        "message": message.hex(),
        "sessionKey": session.session_key.hex(),
    }


def write01(alice_hex: str, bob_hex: str, text: str) -> dict:
    alice_private, alice_public = derive_keys_from_seed(_hex_bytes(alice_hex))
    _bob_private, bob_public = derive_keys_from_seed(_hex_bytes(bob_hex))
    envelope = encrypt_message(text, alice_private, alice_public, bob_public)
    return {"note": encode_envelope(envelope).hex()}


def _opened_text(content: DecryptedContent | None, who: str) -> str:
    if content is None:
        raise RuntimeError(f"{who} saw a key publish")
    return content.text


def read01(alice_hex: str, bob_hex: str, note_hex: str, text: str) -> dict:
    alice_private, alice_public = derive_keys_from_seed(_hex_bytes(alice_hex))
    bob_private, bob_public = derive_keys_from_seed(_hex_bytes(bob_hex))
    envelope = decode_envelope(_hex_bytes(note_hex))
    recipient = _opened_text(decrypt_message(envelope, bob_private, bob_public), "bob")
    sender = _opened_text(decrypt_message(envelope, alice_private, alice_public), "alice")
    if recipient != text or sender != text:
        raise RuntimeError(f"plaintext {recipient} / {sender}")
    return {"recipient": recipient, "sender": sender}


def write02(alice_hex: str, bob_hex: str, text: str, psk_hex: str, counter: int) -> dict:
    alice_private, alice_public = derive_keys_from_seed(_hex_bytes(alice_hex))
    _bob_private, bob_public = derive_keys_from_seed(_hex_bytes(bob_hex))
    current_psk = derive_psk_at_counter(_hex_bytes(psk_hex), counter)
    envelope = encrypt_psk_message(
        text,
        alice_private,
        alice_public,
        bob_public,
        current_psk,
        counter,
    )
    return {"note": encode_psk_envelope(envelope).hex()}


def read02(alice_hex: str, bob_hex: str, note_hex: str, text: str, psk_hex: str, counter: int) -> dict:
    alice_private, alice_public = derive_keys_from_seed(_hex_bytes(alice_hex))
    bob_private, bob_public = derive_keys_from_seed(_hex_bytes(bob_hex))
    current_psk = derive_psk_at_counter(_hex_bytes(psk_hex), counter)
    envelope = decode_psk_envelope(_hex_bytes(note_hex))
    recipient = decrypt_psk_message(envelope, bob_private, bob_public, current_psk)
    sender = decrypt_psk_message(envelope, alice_private, alice_public, current_psk)
    if recipient != text or sender != text:
        raise RuntimeError(f"plaintext {recipient} / {sender}")
    return {"recipient": recipient, "sender": sender}


def write05s(alice_hex: str, bob_hex: str, texts: list[str]) -> dict:
    _alice_private, alice_public = derive_keys_from_seed(_hex_bytes(alice_hex))
    _bob_private, bob_public = derive_keys_from_seed(_hex_bytes(bob_hex))
    kem = derive_mlkem_keypair(_hex_bytes(bob_hex))
    alice_kem = derive_mlkem_keypair(_hex_bytes(alice_hex))
    note, session = initiate_pq_session(
        alice_public, bob_public, kem.encaps_key, alice_kem.encaps_key
    )
    return {
        "handshake": note.hex(),
        "messages": [encrypt_pq_message(text, session).hex() for text in texts],
        "sessionKey": session.session_key.hex(),
    }


def read_note(alice_hex: str, bob_hex: str, handshake_hex: str, message_hex: str, text: str) -> dict:
    alice_private, alice_public = derive_keys_from_seed(_hex_bytes(alice_hex))
    bob_private, bob_public = derive_keys_from_seed(_hex_bytes(bob_hex))
    kem = derive_mlkem_keypair(_hex_bytes(bob_hex))
    handshake = _hex_bytes(handshake_hex)
    message = _hex_bytes(message_hex)
    session = accept_pq_session(handshake, bob_private, bob_public, kem)
    opened = decrypt_pq_message(message, session)
    alice_kem = derive_mlkem_keypair(_hex_bytes(alice_hex))
    sender = open_pq_session_as_sender(handshake, alice_private, alice_public, alice_kem)
    sender_plain = decrypt_pq_message(message, sender)
    if opened != text or sender_plain != text:
        raise RuntimeError(f"plaintext {opened} / {sender_plain}")
    if session.session_key != sender.session_key:
        raise RuntimeError("sender and recipient session keys differ")
    return {
        "sessionKey": session.session_key.hex(),
        "recipient": opened,
        "sender": sender_plain,
    }


def _group_session(req: dict) -> PQSession:
    return PQSession(
        session_key=_hex_bytes(req["sessionKey"]),
        sender_public_key=_hex_bytes(req["senderPublicKey"]),
        recipient_public_key=bytes(32),
        handshake_id=_hex_bytes(req["handshakeId"]),
    )


def _optional_nonce(req: dict) -> bytes | None:
    if "nonce" not in req or req["nonce"] is None:
        return None
    return _hex_bytes(req["nonce"])


def _optional_text(req: dict, key: str) -> str | None:
    if key not in req or req[key] is None:
        return None
    value = req[key]
    if not isinstance(value, str):
        raise RuntimeError(f"{key} must be a string")
    return value


def _optional_hex_field(req: dict, key: str) -> bytes | None:
    value = _optional_text(req, key)
    if value is None:
        return None
    return _hex_bytes(value)


def _room_state(value: object) -> RoomState | None:
    if value is None:
        return None
    if not isinstance(value, dict):
        raise RuntimeError("basis_state must be an object or null")
    return RoomState(
        group_id=_hex_bytes(value["group_id"]),
        mailbox=_hex_bytes(value["mailbox"]),
        owner=_hex_bytes(value["owner"]),
        admins=[_hex_bytes(item) for item in value["admins"]],
        members=[_hex_bytes(item) for item in value["members"]],
        pending=[_hex_bytes(item) for item in value["pending"]],
        policy=int(value["policy"]),
        name=_hex_bytes(value["name_hex"]),
        epoch=int(value["epoch"]),
        head_tx_id=_hex_bytes(value["head_tx_id"]),
    )


def _room_state_json(state: RoomState | None) -> dict | None:
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


def _deliver_session(req: dict) -> PQSession:
    return PQSession(
        session_key=_hex_bytes(req["session_key"]),
        sender_public_key=_hex_bytes(req["sender_x25519"]),
        recipient_public_key=bytes(32),
        handshake_id=_hex_bytes(req["handshake_id"]),
    )


def _room_op(req: dict) -> int:
    # `op` is the pqcross command, so the room operation is `admin_op`.
    raw = req.get("admin_op")
    if raw is None and type(req.get("op")) is int:
        raw = req["op"]
    if raw is None:
        raw = 0
    return int(raw)


def admin_draft(req: dict) -> dict:
    name_utf8 = _optional_text(req, "name_utf8")
    policy = req.get("policy")
    note = draft_admin(
        _room_state(req.get("basis_state")),
        _room_op(req),
        _hex_bytes(req["sender"]),
        subject=None if req.get("subject") is None else _hex_bytes(req["subject"]),
        name=None if name_utf8 is None else name_utf8.encode("utf-8"),
        policy=None if policy is None else int(policy),
        group_id=_optional_hex_field(req, "group_id"),
        mailbox=_optional_hex_field(req, "mailbox"),
    )
    return {"note": note.hex()}


def admin_reduce(req: dict) -> dict:
    raw_events = req["events"]
    if not isinstance(raw_events, list):
        raise RuntimeError("events must be an array")
    events = [
        AdminEvent(
            note=_hex_bytes(item["note"]),
            sender=_hex_bytes(item["sender"]),
            tx_id=_hex_bytes(item["tx_id"]),
            round=int(item["round"]),
            offset=int(item["offset"]),
        )
        for item in raw_events
    ]
    result = reduce_admin(events)
    return {
        "state": _room_state_json(result.state),
        "accepted": [
            {
                "tx_id": item.tx_id.hex(),
                "sender": item.sender.hex(),
                "op": item.op,
                "epoch": item.epoch,
                "subject": item.subject.hex(),
                "members": [member.hex() for member in item.members],
            }
            for item in result.accepted
        ],
        "rejected": [{"tx_id": item.tx_id.hex(), "reason": item.reason} for item in result.rejected],
    }


def deliver_seal(req: dict) -> dict:
    note = seal_group_key_delivery(
        _deliver_session(req),
        int(req["epoch"]),
        _hex_bytes(req["group_id"]),
        _hex_bytes(req["mailbox"]),
        _hex_bytes(req["group_key"]),
        _hex_bytes(req["admin_tx_id"]),
        _hex_bytes(req["nonce"]),
    )
    return {"note": note.hex()}


def deliver_open(req: dict) -> dict:
    opened = open_group_key_delivery(_hex_bytes(req["note"]), _deliver_session(req))
    return {
        "epoch": opened.epoch,
        "group_id": opened.group_id.hex(),
        "mailbox": opened.mailbox.hex(),
        "group_key": opened.group_key.hex(),
        "admin_tx_id": opened.admin_tx_id.hex(),
    }


def sender_may_post_op(req: dict) -> dict:
    state = _room_state(req["state"])
    if state is None:
        raise RuntimeError("state must be an object")
    return {"allowed": sender_may_post(state, _hex_bytes(req["sender"]), int(req["epoch"]))}


def delivery_authorized_op(req: dict) -> dict:
    raw_accepted = req["accepted"]
    if not isinstance(raw_accepted, list):
        raise RuntimeError("accepted must be an array")
    accepted = [
        AcceptedAdmin(
            tx_id=_hex_bytes(item["tx_id"]),
            sender=_hex_bytes(item["sender"]),
            op=int(item["op"]),
            epoch=int(item["epoch"]),
            subject=_hex_bytes(item["subject"]),
            members=[_hex_bytes(member) for member in item["members"]],
        )
        for item in raw_accepted
    ]
    return {
        "allowed": delivery_authorized(
            accepted,
            _hex_bytes(req["admin_tx_id"]),
            _hex_bytes(req["sender"]),
            _hex_bytes(req["recipient"]),
            int(req["epoch"]),
        )
    }


def group_seal(req: dict) -> dict:
    note = seal_group_membership(
        _group_session(req),
        GroupMembership(
            action=int(req["action"]),
            epoch=int(req["epoch"]),
            group_id=_hex_bytes(req["groupId"]),
            mailbox=_hex_bytes(req["mailbox"]),
            group_key=_hex_bytes(req["groupKey"]),
        ),
        _optional_nonce(req),
    )
    return {"note": note.hex()}


def group_open(req: dict) -> dict:
    opened = open_group_membership(_hex_bytes(req["note"]), _group_session(req))
    return {
        "action": opened.action,
        "epoch": opened.epoch,
        "groupId": opened.group_id.hex(),
        "mailbox": opened.mailbox.hex(),
        "groupKey": opened.group_key.hex(),
    }


def group_write(req: dict) -> dict:
    group_key = _hex_bytes(req["groupKey"])
    group_id = _hex_bytes(req["groupId"])
    epoch = int(req["epoch"])
    counter = int(req["counter"])
    sender = _hex_bytes(req["senderAddress"])
    text = req["text"]
    if not isinstance(text, str):
        raise TypeError("text must be a string")
    note = seal_group_message(
        text.encode("utf-8"),
        group_key,
        group_id,
        epoch,
        counter,
        sender,
        _optional_nonce(req),
    )
    message_key = derive_group_message_key(group_key, epoch, counter, group_id, sender)
    return {"note": note.hex(), "messageKey": message_key.hex()}


def group_read(req: dict) -> dict:
    if "text" not in req or not isinstance(req["text"], str):
        raise RuntimeError("text must be a string")
    seen = req.get("seen") or []
    if not isinstance(seen, list):
        raise TypeError("seen must be an array")
    accepted: list[GroupCounter] = []
    for item in seen:
        if not isinstance(item, dict):
            raise TypeError("seen entries need epoch and counter")
        accepted.append(GroupCounter(epoch=int(item["epoch"]), counter=int(item["counter"])))
    opened = open_group_message(
        _hex_bytes(req["note"]),
        _hex_bytes(req["groupKey"]),
        _hex_bytes(req["senderAddress"]),
        accepted,
    )
    try:
        text = opened.plaintext.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise RuntimeError("group message is not UTF-8") from exc
    if text != req["text"]:
        raise RuntimeError(f"plaintext {text}")
    return {
        "text": text,
        "epoch": opened.epoch,
        "counter": opened.counter,
        "groupId": opened.group_id.hex(),
    }


def handle(line: str) -> None:
    try:
        req = json.loads(line)
    except json.JSONDecodeError as error:
        print(json.dumps({"id": 0, "ok": False, "error": str(error)}), flush=True)
        return
    try:
        op = req.get("op")
        if op == "identity":
            body = identity(req["seed"])
        elif op == "write":
            body = write_note(req["aliceSeed"], req["bobSeed"], req["text"])
        elif op == "read":
            body = read_note(req["aliceSeed"], req["bobSeed"], req["handshake"], req["message"], req["text"])
        elif op == "write01":
            body = write01(req["aliceSeed"], req["bobSeed"], req["text"])
        elif op == "read01":
            body = read01(req["aliceSeed"], req["bobSeed"], req["note"], req["text"])
        elif op == "write02":
            body = write02(
                req["aliceSeed"],
                req["bobSeed"],
                req["text"],
                req["psk"],
                int(req.get("counter") or 0),
            )
        elif op == "read02":
            body = read02(
                req["aliceSeed"],
                req["bobSeed"],
                req["note"],
                req["text"],
                req["psk"],
                int(req.get("counter") or 0),
            )
        elif op == "write05s":
            texts = req.get("texts") or []
            if not isinstance(texts, list):
                raise RuntimeError("texts must be an array")
            body = write05s(req["aliceSeed"], req["bobSeed"], texts)
        elif op == "groupSeal":
            body = group_seal(req)
        elif op == "adminDraft":
            body = admin_draft(req)
        elif op == "adminReduce":
            body = admin_reduce(req)
        elif op == "deliverSeal":
            body = deliver_seal(req)
        elif op == "deliverOpen":
            body = deliver_open(req)
        elif op == "senderMayPost":
            body = sender_may_post_op(req)
        elif op == "deliveryAuthorized":
            body = delivery_authorized_op(req)
        elif op == "groupOpen":
            body = group_open(req)
        elif op == "groupWrite":
            body = group_write(req)
        elif op == "groupRead":
            body = group_read(req)
        else:
            raise RuntimeError(f"unknown op {op}")
        print(json.dumps({"id": req.get("id", 0), "ok": True, **body}), flush=True)
    except Exception as error:  # noqa: BLE001 - the mesh tool reports every failure as JSON
        print(json.dumps({"id": req.get("id", 0), "ok": False, "error": str(error)}), flush=True)


def main() -> None:
    for line in sys.stdin:
        if line.strip():
            handle(line)


if __name__ == "__main__":
    main()
