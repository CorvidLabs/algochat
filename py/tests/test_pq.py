"""Protocol 1.3.0 parity against the TypeScript fixture vectors/pq-mlkem768.json."""

import json
from pathlib import Path

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from algochat.blockchain import _parse_key_announcement
from algochat.envelope import is_chat_message
from algochat.keys import derive_keys_from_seed
from algochat.pq import (
    MLKEM_CT_SIZE,
    PQ_DATA_HEADER_SIZE,
    PQ_DATA_ID,
    PQ_HANDSHAKE_ID,
    PQ_HANDSHAKE_SIZE,
    PQ_MAX_PAYLOAD_SIZE,
    PQ_VERSION,
    PQError,
    accept_pq_session,
    decrypt_pq_message,
    decapsulate,
    derive_hybrid_pq_key,
    derive_mlkem_keypair,
    encode_pq_key_announcement,
    encrypt_pq_message,
    initiate_pq_session,
    is_pq_handshake,
    is_pq_key_announcement,
    is_pq_message,
    open_pq_session_as_sender,
    parse_pq_key_announcement,
)
from algochat.psk_envelope import is_psk_message
from algochat.types import MAX_NOTE_SIZE

_VECTOR_PATH = Path(__file__).resolve().parents[2] / "vectors" / "pq-mlkem768.json"
_COMBINER = "9b393e8cec553ada4821c1fa04b40bf499446b19ca9218fd8dcf8b705e06d734"
_ALICE_SEED = bytes([0x11]) * 32
_BOB_SEED = bytes([0x22]) * 32


def _vector() -> dict:
    return json.loads(_VECTOR_PATH.read_text())


def _keys(seed: bytes):
    private, public = derive_keys_from_seed(seed)
    return private, public


class TestPQParityFixture:
    def test_mlkem_key_and_decapsulation_match_fixture(self):
        vector = _vector()
        kem = derive_mlkem_keypair(_BOB_SEED)
        assert kem.encaps_key.hex() == vector["encaps_key"]
        assert len(kem.decaps_key) == 64
        shared = decapsulate(bytes.fromhex(vector["ciphertext"]), kem.decaps_key)
        assert shared.hex() == vector["mlkem_shared_secret"]

    def test_combiner_pin(self):
        kem = derive_mlkem_keypair(_BOB_SEED)
        key = derive_hybrid_pq_key(
            bytes([0x05]) * 32,
            bytes([0x06]) * 32,
            bytes([0x01]) * 32,
            bytes([0x02]) * MLKEM_CT_SIZE,
            bytes([0x03]) * 32,
            bytes([0x04]) * 32,
            kem.encaps_key,
        )
        assert key.hex() == _COMBINER
        assert key.hex() == _vector()["combiner_session_key"]

    def test_handshake_note_accept_and_sender_reopen(self):
        note_len = PQ_HANDSHAKE_SIZE
        assert note_len == 2366
        assert note_len <= MAX_NOTE_SIZE
        assert PQ_HANDSHAKE_ID != 0x03
        assert PQ_DATA_ID != 0x03

        bob_private, bob_public = _keys(_BOB_SEED)
        alice_private, alice_public = _keys(_ALICE_SEED)
        alice_kem = derive_mlkem_keypair(_ALICE_SEED)
        bob_kem = derive_mlkem_keypair(_BOB_SEED)
        note, session = initiate_pq_session(
            alice_public, bob_public, bob_kem.encaps_key, alice_kem.encaps_key
        )
        assert len(note) == note_len
        assert note[0] == PQ_VERSION == 0x02
        assert note[1] == PQ_HANDSHAKE_ID == 0x04
        assert is_pq_handshake(note)
        assert not is_chat_message(note)
        assert not is_psk_message(note)

        accepted = accept_pq_session(note, bob_private, bob_public, bob_kem)
        assert accepted.session_key == session.session_key

        reopened = open_pq_session_as_sender(note, alice_private, alice_public, alice_kem)
        assert reopened.session_key == accepted.session_key
        assert reopened.handshake_id == accepted.handshake_id
        with pytest.raises(PQError):
            open_pq_session_as_sender(note, alice_private, alice_public, bob_kem)

    def test_round_trip_and_flipped_byte_fails(self):
        alice_private, alice_public = _keys(_ALICE_SEED)
        bob_private, bob_public = _keys(_BOB_SEED)
        alice_kem = derive_mlkem_keypair(_ALICE_SEED)
        bob_kem = derive_mlkem_keypair(_BOB_SEED)
        note, session = initiate_pq_session(
            alice_public,
            bob_public,
            bob_kem.encaps_key,
            alice_kem.encaps_key,
        )
        assert len(note) == PQ_HANDSHAKE_SIZE
        assert note[0] == 0x02
        assert note[1] == 0x04
        assert len(note) <= MAX_NOTE_SIZE

        accepted = accept_pq_session(note, bob_private, bob_public, bob_kem)
        assert accepted.session_key == session.session_key
        reopened = open_pq_session_as_sender(note, alice_private, alice_public, alice_kem)
        assert reopened.session_key == session.session_key

        message = encrypt_pq_message("parity", session)
        assert PQ_DATA_HEADER_SIZE == 78
        assert message[0] == 0x02
        assert message[1] == 0x05
        assert is_pq_message(message)
        assert not is_chat_message(message)
        assert not is_psk_message(message)
        assert decrypt_pq_message(message, accepted) == "parity"
        assert decrypt_pq_message(message, reopened) == "parity"

        tampered = bytearray(message)
        tampered[-1] ^= 0x01
        with pytest.raises(PQError, match="authentication failed"):
            decrypt_pq_message(bytes(tampered), accepted)
        body = bytearray(message)
        body[PQ_DATA_HEADER_SIZE] ^= 0x01
        with pytest.raises(PQError, match="authentication failed"):
            decrypt_pq_message(bytes(body), accepted)

    def test_payload_budget_uses_78_byte_header(self):
        _, alice_public = _keys(_ALICE_SEED)
        _, bob_public = _keys(_BOB_SEED)
        bob_kem = derive_mlkem_keypair(_BOB_SEED)
        alice_kem = derive_mlkem_keypair(_ALICE_SEED)
        _, session = initiate_pq_session(
            alice_public, bob_public, bob_kem.encaps_key, alice_kem.encaps_key
        )
        full = "x" * PQ_MAX_PAYLOAD_SIZE
        note = encrypt_pq_message(full, session)
        assert len(note) == MAX_NOTE_SIZE
        assert decrypt_pq_message(note, session) == full
        with pytest.raises(PQError, match="too large"):
            encrypt_pq_message("x" * (PQ_MAX_PAYLOAD_SIZE + 1), session)

    def test_acpq_announcement_is_not_an_x25519_key(self):
        kem = derive_mlkem_keypair(_BOB_SEED)
        unsigned = encode_pq_key_announcement(kem.encaps_key)
        assert unsigned.startswith(b"ACPQ")
        assert is_pq_key_announcement(unsigned)
        assert _parse_key_announcement(unsigned, "SOMEADDR") is None
        assert _parse_key_announcement(b"ACPQ" + b"\x00" * 28, "SOMEADDR") is None

        parsed = parse_pq_key_announcement(unsigned)
        assert parsed is not None
        assert parsed.is_verified is False
        assert parsed.encaps_key == kem.encaps_key

        signing = Ed25519PrivateKey.generate()
        signed = encode_pq_key_announcement(kem.encaps_key, signing)
        verified = parse_pq_key_announcement(signed, signing.public_key())
        assert verified is not None
        assert verified.is_verified is True
        assert verified.encaps_key == kem.encaps_key
        assert _parse_key_announcement(signed, "SOMEADDR") is None
        assert parse_pq_key_announcement(signed, Ed25519PrivateKey.generate().public_key()) is None

        junk = unsigned + b"\x00" * 64
        assert parse_pq_key_announcement(junk, signing.public_key()) is None
