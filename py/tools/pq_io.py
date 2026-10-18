"""LocalNet mesh tool. One JSON object per stdin line."""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from algochat.crypto import decrypt_message, encrypt_message
from algochat.envelope import decode_envelope, encode_envelope
from algochat.keys import derive_keys_from_seed, public_key_to_bytes
from algochat.types import DecryptedContent
from algochat.group import (
    GroupCounter,
    GroupMembership,
    derive_group_message_key,
    open_group_membership,
    open_group_message,
    seal_group_membership,
    seal_group_message,
)
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
        raise RuntimeError("text must be a string")
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
        raise RuntimeError("seen must be an array")
    accepted: list[GroupCounter] = []
    for item in seen:
        if not isinstance(item, dict):
            raise RuntimeError("seen entries need epoch and counter")
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
