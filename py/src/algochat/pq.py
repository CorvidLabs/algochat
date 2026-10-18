"""Hybrid X25519 + ML-KEM-768 sessions (protocol 1.3.0).

Notes use version byte 0x02. The one-note handshake is protocol 0x04 and is
2366 bytes. Steady-state messages are protocol 0x05 with a 78-byte header.
Protocol id 0x03 is not used.

The account seed is expanded with HKDF-SHA256 into the FIPS 203 key-generation
seed ``d || z`` (64 bytes). ``cryptography`` imports that seed. The PyPI
``mlkem`` package only accepts the expanded 2400-byte decapsulation key, so it
cannot.
"""

import hashlib
import os
from dataclasses import dataclass

from cryptography.exceptions import InvalidSignature, InvalidTag
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)
from cryptography.hazmat.primitives.asymmetric.mlkem import (
    MLKEM768PrivateKey,
    MLKEM768PublicKey,
)
from cryptography.hazmat.primitives.asymmetric.x25519 import (
    X25519PrivateKey,
    X25519PublicKey,
)
from cryptography.hazmat.primitives.ciphers.aead import ChaCha20Poly1305
from cryptography.hazmat.primitives.hashes import SHA256
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from .keys import (
    generate_ephemeral_keypair,
    public_key_from_bytes,
    public_key_to_bytes,
    x25519_ecdh,
)
from .types import MAX_NOTE_SIZE, NONCE_SIZE, TAG_SIZE, PQError

PQ_VERSION = 0x02
PQ_HANDSHAKE_ID = 0x04
PQ_DATA_ID = 0x05
MLKEM_EK_SIZE = 1184
MLKEM_DK_SIZE = 2400
MLKEM_CT_SIZE = 1088
MLKEM_SEED_SIZE = 64
PQ_EK_HASH_SIZE = 32
PQ_HANDSHAKE_ID_SIZE = 32
PQ_WRAPPED_KEY_SIZE = 48
PQ_HANDSHAKE_SIZE = (
    2
    + 32
    + 32
    + 32
    + MLKEM_CT_SIZE
    + PQ_EK_HASH_SIZE
    + MLKEM_CT_SIZE
    + NONCE_SIZE
    + PQ_WRAPPED_KEY_SIZE
)
PQ_DATA_HEADER_SIZE = 2 + 32 + PQ_HANDSHAKE_ID_SIZE + NONCE_SIZE
PQ_MAX_PAYLOAD_SIZE = MAX_NOTE_SIZE - PQ_DATA_HEADER_SIZE - TAG_SIZE

# ASCII "ACPQ". Keeps a PQ announcement out of the 32-byte X25519 parser.
PQ_ANNOUNCE_MAGIC = b"ACPQ"
PQ_ANNOUNCE_VERSION = 0x01

_KEM_SALT = b"AlgoChat-v1-mlkem768"
_KEM_INFO_D = b"mlkem768-d"
_KEM_INFO_Z = b"mlkem768-z"
_SESSION_SALT = b"algochat-pq-v1"
_SESSION_LABEL = b"algochat-pq-v1"
_SENDER_WRAP_INFO = b"AlgoChatPQ-SenderKey"
_ANNOUNCE_SIGN_LABEL = b"AlgoChat-pq-ek-v1"
_ANNOUNCE_UNSIGNED_SIZE = len(PQ_ANNOUNCE_MAGIC) + 1 + MLKEM_EK_SIZE
_ANNOUNCE_SIGNED_SIZE = _ANNOUNCE_UNSIGNED_SIZE + 64


@dataclass
class MLKEMKeyPair:
    """ML-KEM-768 encapsulation key and the 64-byte ``d || z`` seed."""

    encaps_key: bytes
    decaps_key: bytes


@dataclass
class PQSession:
    """Hybrid session established by a 0x04 handshake."""

    session_key: bytes
    sender_public_key: bytes
    recipient_public_key: bytes
    handshake_id: bytes


@dataclass
class PQAnnouncement:
    """Parsed ML-KEM encapsulation-key announcement."""

    encaps_key: bytes
    is_verified: bool


@dataclass
class _HandshakeFields:
    sender_public_key: bytes
    recipient_public_key: bytes
    ephemeral_public_key: bytes
    kem_ciphertext: bytes
    encaps_key_hash: bytes
    sender_kem_ciphertext: bytes
    nonce: bytes
    wrapped_session_key: bytes


def derive_mlkem_keypair(seed: bytes) -> MLKEMKeyPair:
    """Derive an ML-KEM-768 key pair from a 32-byte account seed.

    ``d`` and ``z`` are HKDF-SHA256 outputs. The key-generation seed is
    ``d || z``.
    """
    _require_len("account seed", seed, 32)
    d = _hkdf32(seed, _KEM_SALT, _KEM_INFO_D)
    z = _hkdf32(seed, _KEM_SALT, _KEM_INFO_Z)
    decaps_key = d + z
    private = MLKEM768PrivateKey.from_seed_bytes(decaps_key)
    encaps_key = private.public_key().public_bytes_raw()
    _require_len("encapsulation key", encaps_key, MLKEM_EK_SIZE)
    return MLKEMKeyPair(encaps_key=encaps_key, decaps_key=decaps_key)


def encapsulate(recipient_encaps_key: bytes) -> tuple[bytes, bytes]:
    """Encapsulate to an ML-KEM-768 public key.

    Returns:
        ``(shared_secret, ciphertext)``.
    """
    _require_len("encapsulation key", recipient_encaps_key, MLKEM_EK_SIZE)
    public = MLKEM768PublicKey.from_public_bytes(recipient_encaps_key)
    shared_secret, ciphertext = public.encapsulate()
    _require_len("ML-KEM ciphertext", ciphertext, MLKEM_CT_SIZE)
    _require_len("ML-KEM shared secret", shared_secret, 32)
    return shared_secret, ciphertext


def decapsulate(ciphertext: bytes, decaps_key: bytes) -> bytes:
    """Decapsulate an ML-KEM-768 ciphertext with a 64-byte ``d || z`` seed."""
    _require_len("ML-KEM ciphertext", ciphertext, MLKEM_CT_SIZE)
    _require_len("decapsulation key", decaps_key, MLKEM_SEED_SIZE)
    private = MLKEM768PrivateKey.from_seed_bytes(decaps_key)
    secret = private.decapsulate(ciphertext)
    _require_len("ML-KEM shared secret", secret, 32)
    return secret


def derive_hybrid_pq_key(
    ec_shared_secret: bytes,
    pq_shared_secret: bytes,
    ephemeral_public_key: bytes,
    kem_ciphertext: bytes,
    sender_public_key: bytes,
    recipient_public_key: bytes,
    recipient_encaps_key: bytes,
) -> bytes:
    """Combine the X25519 and ML-KEM secrets into a 32-byte session key.

    ``ikm`` is ``x25519_ss || mlkem_ss``. HKDF-SHA256 salt is
    ``algochat-pq-v1``. Info is that same label followed by the ephemeral
    public key, KEM ciphertext, both X25519 public keys, and
    ``SHA-256(encaps_key)``.
    """
    _require_len("X25519 shared secret", ec_shared_secret, 32)
    _require_len("ML-KEM shared secret", pq_shared_secret, 32)
    _require_len("ephemeral public key", ephemeral_public_key, 32)
    _require_len("ML-KEM ciphertext", kem_ciphertext, MLKEM_CT_SIZE)
    _require_len("sender public key", sender_public_key, 32)
    _require_len("recipient public key", recipient_public_key, 32)
    _require_len("encapsulation key", recipient_encaps_key, MLKEM_EK_SIZE)
    ikm = ec_shared_secret + pq_shared_secret
    info = (
        _SESSION_LABEL
        + ephemeral_public_key
        + kem_ciphertext
        + sender_public_key
        + recipient_public_key
        + hashlib.sha256(recipient_encaps_key).digest()
    )
    return _hkdf32(ikm, _SESSION_SALT, info)


def is_pq_handshake(note: bytes) -> bool:
    """Return whether ``note`` is a 2366-byte 0x04 handshake."""
    return (
        len(note) == PQ_HANDSHAKE_SIZE
        and note[0] == PQ_VERSION
        and note[1] == PQ_HANDSHAKE_ID
    )


def is_pq_message(note: bytes) -> bool:
    """Return whether ``note`` is a 0x05 message with room for a tag."""
    return (
        len(note) >= PQ_DATA_HEADER_SIZE + TAG_SIZE
        and note[0] == PQ_VERSION
        and note[1] == PQ_DATA_ID
    )


def initiate_pq_session(
    sender_public_key: X25519PublicKey,
    recipient_public_key: X25519PublicKey,
    recipient_encaps_key: bytes,
    sender_encaps_key: bytes,
) -> tuple[bytes, PQSession]:
    """Build a 0x04 handshake note and the sender's session.

    The sender copy is sealed under X25519 and an ML-KEM ciphertext to the sender.
    """
    _require_len("encapsulation key", recipient_encaps_key, MLKEM_EK_SIZE)
    _require_len("sender encapsulation key", sender_encaps_key, MLKEM_EK_SIZE)
    ephemeral_private, ephemeral_public = generate_ephemeral_keypair()
    ec_shared = x25519_ecdh(ephemeral_private, recipient_public_key)
    pq_shared, kem_ciphertext = encapsulate(recipient_encaps_key)
    sender_mlkem, sender_ciphertext = encapsulate(sender_encaps_key)

    sender_pub = public_key_to_bytes(sender_public_key)
    recipient_pub = public_key_to_bytes(recipient_public_key)
    ephemeral_pub = public_key_to_bytes(ephemeral_public)
    session_key = derive_hybrid_pq_key(
        ec_shared,
        pq_shared,
        ephemeral_pub,
        kem_ciphertext,
        sender_pub,
        recipient_pub,
        recipient_encaps_key,
    )

    nonce = os.urandom(NONCE_SIZE)
    prefix = _handshake_prefix(
        sender_pub,
        recipient_pub,
        ephemeral_pub,
        kem_ciphertext,
        recipient_encaps_key,
        sender_ciphertext,
        nonce,
    )
    wrap_key = _sender_wrap_key(
        x25519_ecdh(ephemeral_private, sender_public_key),
        sender_mlkem,
        sender_pub,
        ephemeral_pub,
    )
    wrapped = ChaCha20Poly1305(wrap_key).encrypt(nonce, session_key, prefix)
    if len(wrapped) != PQ_WRAPPED_KEY_SIZE:
        raise PQError("Wrapped session key is the wrong length")
    note = prefix + wrapped
    if len(note) != PQ_HANDSHAKE_SIZE or len(note) > MAX_NOTE_SIZE:
        raise PQError(f"Handshake note is {len(note)} bytes")
    return note, _session_from(note, session_key, sender_pub, recipient_pub)


def accept_pq_session(
    note: bytes,
    recipient_private_key: X25519PrivateKey,
    recipient_public_key: X25519PublicKey,
    kem: MLKEMKeyPair,
) -> PQSession:
    """Open a 0x04 note with the recipient's X25519 and ML-KEM keys."""
    fields = _parse_handshake(note)
    recipient_pub = public_key_to_bytes(recipient_public_key)
    if fields.recipient_public_key != recipient_pub:
        raise PQError("Handshake is for a different X25519 key")
    if fields.encaps_key_hash != hashlib.sha256(kem.encaps_key).digest():
        raise PQError("Handshake encapsulation key does not match")
    ec_shared = x25519_ecdh(
        recipient_private_key,
        public_key_from_bytes(fields.ephemeral_public_key),
    )
    pq_shared = decapsulate(fields.kem_ciphertext, kem.decaps_key)
    session_key = derive_hybrid_pq_key(
        ec_shared,
        pq_shared,
        fields.ephemeral_public_key,
        fields.kem_ciphertext,
        fields.sender_public_key,
        fields.recipient_public_key,
        kem.encaps_key,
    )
    return _session_from(note, session_key, fields.sender_public_key, fields.recipient_public_key)


def open_pq_session_as_sender(
    note: bytes,
    sender_private_key: X25519PrivateKey,
    sender_public_key: X25519PublicKey,
    sender_kem: MLKEMKeyPair,
) -> PQSession:
    """Recover the session from the sender wrap on a 0x04 note."""
    fields = _parse_handshake(note)
    sender_pub = public_key_to_bytes(sender_public_key)
    if fields.sender_public_key != sender_pub:
        raise PQError("Handshake was not sent by this key")
    sender_mlkem = decapsulate(fields.sender_kem_ciphertext, sender_kem.decaps_key)
    wrap_key = _sender_wrap_key(
        x25519_ecdh(sender_private_key, public_key_from_bytes(fields.ephemeral_public_key)),
        sender_mlkem,
        sender_pub,
        fields.ephemeral_public_key,
    )
    prefix = note[: len(note) - PQ_WRAPPED_KEY_SIZE]
    try:
        session_key = ChaCha20Poly1305(wrap_key).decrypt(
            fields.nonce,
            fields.wrapped_session_key,
            prefix,
        )
    except InvalidTag as exc:
        raise PQError("Handshake sender wrap failed") from exc
    _require_len("session key", session_key, 32)
    return _session_from(note, session_key, fields.sender_public_key, fields.recipient_public_key)


def encrypt_pq_message(plaintext: str, session: PQSession) -> bytes:
    """Seal a UTF-8 message under the handshake session key."""
    message = plaintext.encode("utf-8")
    if len(message) > PQ_MAX_PAYLOAD_SIZE:
        raise PQError(
            f"Message too large: {len(message)} bytes, max {PQ_MAX_PAYLOAD_SIZE}"
        )
    nonce = os.urandom(NONCE_SIZE)
    header = _data_header(session.sender_public_key, session.handshake_id, nonce)
    ciphertext = ChaCha20Poly1305(session.session_key).encrypt(nonce, message, header)
    note = header + ciphertext
    if len(note) > MAX_NOTE_SIZE:
        raise PQError(f"PQ message note is {len(note)} bytes")
    return note


def decrypt_pq_message(note: bytes, session: PQSession) -> str:
    """Open a 0x05 note with the handshake session."""
    if len(note) > MAX_NOTE_SIZE:
        raise PQError(f"Note is {len(note)} bytes; the maximum is {MAX_NOTE_SIZE}")
    if not is_pq_message(note):
        raise PQError("Not a PQ message")
    sender_public_key = note[2:34]
    handshake_id = note[34:66]
    nonce = note[66:78]
    ciphertext = note[78:]
    if handshake_id != session.handshake_id:
        raise PQError("Message is for a different handshake")
    if sender_public_key != session.sender_public_key:
        raise PQError("Message sender does not match the handshake")
    header = note[:PQ_DATA_HEADER_SIZE]
    try:
        plaintext = ChaCha20Poly1305(session.session_key).decrypt(nonce, ciphertext, header)
    except InvalidTag as exc:
        raise PQError("PQ message authentication failed") from exc
    try:
        return plaintext.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise PQError("PQ message is not UTF-8") from exc


def pq_announcement_signing_input(encaps_key: bytes) -> bytes:
    """SHA-256 of the labeled encapsulation key, which Ed25519 signs."""
    _require_len("encapsulation key", encaps_key, MLKEM_EK_SIZE)
    return hashlib.sha256(
        _ANNOUNCE_SIGN_LABEL + bytes([PQ_ANNOUNCE_VERSION]) + encaps_key
    ).digest()


def encode_pq_key_announcement(
    encaps_key: bytes,
    signing_key: Ed25519PrivateKey | None = None,
) -> bytes:
    """Encode an ACPQ encapsulation-key note. A signing key adds 64 bytes."""
    _require_len("encapsulation key", encaps_key, MLKEM_EK_SIZE)
    body = PQ_ANNOUNCE_MAGIC + bytes([PQ_ANNOUNCE_VERSION]) + encaps_key
    if signing_key is None:
        return body
    signature = signing_key.sign(pq_announcement_signing_input(encaps_key))
    return body + signature


def parse_pq_key_announcement(
    note: bytes,
    ed25519_public_key: Ed25519PublicKey | None = None,
) -> PQAnnouncement | None:
    """Parse an ACPQ note.

    An unsigned note is unverified. A signature that is missing its verifying
    key, or that does not verify, is rejected.
    """
    if not is_pq_key_announcement(note):
        return None
    if len(note) not in (_ANNOUNCE_UNSIGNED_SIZE, _ANNOUNCE_SIGNED_SIZE):
        return None
    if note[len(PQ_ANNOUNCE_MAGIC)] != PQ_ANNOUNCE_VERSION:
        return None
    encaps_key = note[len(PQ_ANNOUNCE_MAGIC) + 1 : _ANNOUNCE_UNSIGNED_SIZE]
    if len(note) == _ANNOUNCE_UNSIGNED_SIZE:
        return PQAnnouncement(encaps_key=encaps_key, is_verified=False)
    if ed25519_public_key is None:
        return None
    signature = note[_ANNOUNCE_UNSIGNED_SIZE:]
    try:
        ed25519_public_key.verify(signature, pq_announcement_signing_input(encaps_key))
    except InvalidSignature:
        return None
    return PQAnnouncement(encaps_key=encaps_key, is_verified=True)


def is_pq_key_announcement(note: bytes) -> bool:
    """Return whether ``note`` starts with the ACPQ magic."""
    return note.startswith(PQ_ANNOUNCE_MAGIC)


def _hkdf32(ikm: bytes, salt: bytes, info: bytes) -> bytes:
    return HKDF(algorithm=SHA256(), length=32, salt=salt, info=info).derive(ikm)


def _require_len(name: str, value: bytes, length: int) -> None:
    if len(value) != length:
        raise PQError(f"{name} must be {length} bytes, got {len(value)}")


def _session_from(
    note: bytes,
    session_key: bytes,
    sender_public_key: bytes,
    recipient_public_key: bytes,
) -> PQSession:
    return PQSession(
        session_key=session_key,
        sender_public_key=sender_public_key,
        recipient_public_key=recipient_public_key,
        handshake_id=hashlib.sha256(note).digest(),
    )


def _handshake_prefix(
    sender_public_key: bytes,
    recipient_public_key: bytes,
    ephemeral_public_key: bytes,
    kem_ciphertext: bytes,
    encaps_key: bytes,
    sender_kem_ciphertext: bytes,
    nonce: bytes,
) -> bytes:
    return (
        bytes([PQ_VERSION, PQ_HANDSHAKE_ID])
        + sender_public_key
        + recipient_public_key
        + ephemeral_public_key
        + kem_ciphertext
        + hashlib.sha256(encaps_key).digest()
        + sender_kem_ciphertext
        + nonce
    )


def _data_header(sender_public_key: bytes, handshake_id: bytes, nonce: bytes) -> bytes:
    header = bytes([PQ_VERSION, PQ_DATA_ID]) + sender_public_key + handshake_id + nonce
    if len(header) != PQ_DATA_HEADER_SIZE:
        raise PQError(f"PQ data header is {len(header)} bytes")
    return header


def _parse_handshake(note: bytes) -> _HandshakeFields:
    if not is_pq_handshake(note):
        raise PQError(f"PQ handshake must be {PQ_HANDSHAKE_SIZE} bytes")
    offset = 2
    sender_public_key = note[offset : offset + 32]
    offset += 32
    recipient_public_key = note[offset : offset + 32]
    offset += 32
    ephemeral_public_key = note[offset : offset + 32]
    offset += 32
    kem_ciphertext = note[offset : offset + MLKEM_CT_SIZE]
    offset += MLKEM_CT_SIZE
    encaps_key_hash = note[offset : offset + 32]
    offset += 32
    sender_kem_ciphertext = note[offset : offset + MLKEM_CT_SIZE]
    offset += MLKEM_CT_SIZE
    nonce = note[offset : offset + NONCE_SIZE]
    offset += NONCE_SIZE
    wrapped_session_key = note[offset : offset + PQ_WRAPPED_KEY_SIZE]
    return _HandshakeFields(
        sender_public_key=sender_public_key,
        recipient_public_key=recipient_public_key,
        ephemeral_public_key=ephemeral_public_key,
        kem_ciphertext=kem_ciphertext,
        encaps_key_hash=encaps_key_hash,
        sender_kem_ciphertext=sender_kem_ciphertext,
        nonce=nonce,
        wrapped_session_key=wrapped_session_key,
    )


def _sender_wrap_key(
    x25519_shared: bytes,
    sender_mlkem_shared: bytes,
    sender_public_key: bytes,
    ephemeral_public_key: bytes,
) -> bytes:
    info = _SENDER_WRAP_INFO + sender_public_key
    return _hkdf32(x25519_shared + sender_mlkem_shared, ephemeral_public_key, info)
