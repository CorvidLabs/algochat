"""LocalNet mesh tool. One JSON object per stdin line."""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from algochat.keys import derive_keys_from_seed, public_key_to_bytes
from algochat.pq import (
    accept_pq_session,
    decrypt_pq_message,
    derive_mlkem_keypair,
    encrypt_pq_message,
    initiate_pq_session,
    open_pq_session_as_sender,
)


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
    note, session = initiate_pq_session(alice_public, bob_public, kem.encaps_key)
    message = encrypt_pq_message(text, session)
    return {
        "handshake": note.hex(),
        "message": message.hex(),
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
    sender = open_pq_session_as_sender(handshake, alice_private, alice_public)
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
