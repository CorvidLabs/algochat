"""PSK encryption and decryption for the v1.1 protocol."""

import os

from cryptography.hazmat.primitives.asymmetric.x25519 import (
    X25519PrivateKey,
    X25519PublicKey,
)
from cryptography.hazmat.primitives.ciphers.aead import ChaCha20Poly1305

from .keys import (
    generate_ephemeral_keypair,
    public_key_from_bytes,
    public_key_to_bytes,
    x25519_ecdh,
)
from .psk_ratchet import (
    derive_hybrid_symmetric_key,
    derive_sender_key,
)
from .psk_types import (
    _PSK_VERSION_AAD,
    PSK_HEADER_SIZE,
    PSK_MAX_PAYLOAD_SIZE,
    PSK_PROTOCOL_ID,
    PSK_VERSION,
    PSKEnvelope,
    _require_u32_counter,
)
from .types import MAX_NOTE_SIZE, NONCE_SIZE, PSKDecryptionError, PSKEncryptionError


def _payload_aad(envelope: PSKEnvelope) -> bytes | None:
    """Associated data for the message ciphertext.

    Version 0x01 keeps ChaCha associated data empty. Version 0x02 binds the
    130-byte header, including the wrapped sender key. The sender-key wrap
    itself always uses empty associated data.
    """
    if envelope.version < _PSK_VERSION_AAD:
        return None
    counter = _require_u32_counter(envelope.ratchet_counter)
    header = (
        bytes([envelope.version, PSK_PROTOCOL_ID])
        + counter.to_bytes(4, byteorder="big")
        + envelope.sender_public_key
        + envelope.ephemeral_public_key
        + envelope.nonce
        + envelope.encrypted_sender_key
    )
    if len(header) != PSK_HEADER_SIZE:
        raise PSKDecryptionError(f"Extra lock header is {len(header)} bytes, expected {PSK_HEADER_SIZE}")
    return header


def encrypt_psk_message(
    plaintext: str,
    sender_private_key: X25519PrivateKey,
    sender_public_key: X25519PublicKey,
    recipient_public_key: X25519PublicKey,
    current_psk: bytes,
    ratchet_counter: int,
) -> PSKEnvelope:
    """Encrypt a message using the PSK v1.1 protocol.

    Args:
        plaintext: Message to encrypt.
        sender_private_key: Sender's X25519 private key.
        sender_public_key: Sender's X25519 public key.
        recipient_public_key: Recipient's X25519 public key.
        current_psk: The current ratcheted PSK (32 bytes).
        ratchet_counter: The ratchet counter for this message.

    Returns:
        PSKEnvelope containing the encrypted message.

    Raises:
        PSKEncryptionError: If encryption fails.
    """
    ratchet_counter = _require_u32_counter(ratchet_counter)
    message_bytes = plaintext.encode("utf-8")

    if len(message_bytes) > PSK_MAX_PAYLOAD_SIZE:
        raise PSKEncryptionError(
            f"Message too large: {len(message_bytes)} bytes (max {PSK_MAX_PAYLOAD_SIZE})"
        )

    # Generate ephemeral key pair for this message
    ephemeral_private, ephemeral_public = generate_ephemeral_keypair()

    # Get raw bytes for all public keys
    sender_pub_bytes = public_key_to_bytes(sender_public_key)
    recipient_pub_bytes = public_key_to_bytes(recipient_public_key)
    ephemeral_pub_bytes = public_key_to_bytes(ephemeral_public)

    # ECDH with recipient
    shared_secret = x25519_ecdh(ephemeral_private, recipient_public_key)

    # Derive hybrid symmetric key (ECDH + PSK)
    symmetric_key = derive_hybrid_symmetric_key(
        shared_secret=shared_secret,
        current_psk=current_psk,
        ephemeral_public_key=ephemeral_pub_bytes,
        sender_public_key=sender_pub_bytes,
        recipient_public_key=recipient_pub_bytes,
    )

    # Generate random nonce
    nonce = os.urandom(NONCE_SIZE)

    # Encrypt message
    cipher = ChaCha20Poly1305(symmetric_key)
    ciphertext = cipher.encrypt(nonce, message_bytes, None)

    # Encrypt the symmetric key for sender (bidirectional decryption)
    sender_shared_secret = x25519_ecdh(ephemeral_private, sender_public_key)

    sender_encryption_key = derive_sender_key(
        sender_shared_secret=sender_shared_secret,
        current_psk=current_psk,
        ephemeral_public_key=ephemeral_pub_bytes,
        sender_public_key=sender_pub_bytes,
    )

    sender_cipher = ChaCha20Poly1305(sender_encryption_key)
    encrypted_sender_key = sender_cipher.encrypt(nonce, symmetric_key, None)

    return PSKEnvelope(
        ratchet_counter=ratchet_counter,
        sender_public_key=sender_pub_bytes,
        ephemeral_public_key=ephemeral_pub_bytes,
        nonce=nonce,
        encrypted_sender_key=encrypted_sender_key,
        ciphertext=ciphertext,
        version=PSK_VERSION,
    )


def decrypt_psk_message(
    envelope: PSKEnvelope,
    recipient_private_key: X25519PrivateKey,
    recipient_public_key: X25519PublicKey,
    current_psk: bytes,
) -> str:
    """Decrypt a PSK v1.1 protocol message.

    Attempts decryption as recipient first, then as sender (bidirectional).

    Args:
        envelope: The PSK envelope to decrypt.
        recipient_private_key: Our X25519 private key.
        recipient_public_key: Our X25519 public key.
        current_psk: The current ratcheted PSK (32 bytes).

    Returns:
        Decrypted message text.

    Raises:
        PSKDecryptionError: If decryption fails.
    """
    note_len = PSK_HEADER_SIZE + len(envelope.ciphertext)
    if note_len > MAX_NOTE_SIZE:
        raise PSKDecryptionError(
            f"Note is {note_len} bytes; the maximum is {MAX_NOTE_SIZE}"
        )
    my_pub_bytes = public_key_to_bytes(recipient_public_key)
    we_are_sender = my_pub_bytes == envelope.sender_public_key

    try:
        if we_are_sender:
            plaintext_bytes = _decrypt_psk_as_sender(
                envelope, recipient_private_key, my_pub_bytes, current_psk
            )
        else:
            plaintext_bytes = _decrypt_psk_as_recipient(
                envelope, recipient_private_key, my_pub_bytes, current_psk
            )

        return plaintext_bytes.decode("utf-8")
    except Exception as e:
        raise PSKDecryptionError(f"PSK decryption failed: {e}") from e


def _decrypt_psk_as_recipient(
    envelope: PSKEnvelope,
    recipient_private_key: X25519PrivateKey,
    recipient_pub_bytes: bytes,
    current_psk: bytes,
) -> bytes:
    """Decrypt a PSK message as the recipient."""
    ephemeral_public = public_key_from_bytes(envelope.ephemeral_public_key)

    shared_secret = x25519_ecdh(recipient_private_key, ephemeral_public)

    symmetric_key = derive_hybrid_symmetric_key(
        shared_secret=shared_secret,
        current_psk=current_psk,
        ephemeral_public_key=envelope.ephemeral_public_key,
        sender_public_key=envelope.sender_public_key,
        recipient_public_key=recipient_pub_bytes,
    )

    cipher = ChaCha20Poly1305(symmetric_key)
    return cipher.decrypt(envelope.nonce, envelope.ciphertext, _payload_aad(envelope))


def _decrypt_psk_as_sender(
    envelope: PSKEnvelope,
    sender_private_key: X25519PrivateKey,
    sender_pub_bytes: bytes,
    current_psk: bytes,
) -> bytes:
    """Decrypt a PSK message as the sender (bidirectional)."""
    ephemeral_public = public_key_from_bytes(envelope.ephemeral_public_key)

    # First, recover the symmetric key
    sender_shared_secret = x25519_ecdh(sender_private_key, ephemeral_public)

    sender_decryption_key = derive_sender_key(
        sender_shared_secret=sender_shared_secret,
        current_psk=current_psk,
        ephemeral_public_key=envelope.ephemeral_public_key,
        sender_public_key=sender_pub_bytes,
    )

    sender_cipher = ChaCha20Poly1305(sender_decryption_key)
    symmetric_key = sender_cipher.decrypt(envelope.nonce, envelope.encrypted_sender_key, None)

    cipher = ChaCha20Poly1305(symmetric_key)
    return cipher.decrypt(envelope.nonce, envelope.ciphertext, _payload_aad(envelope))
