"""Type definitions for the PSK (Pre-Shared Key) v1.1 protocol."""

from dataclasses import dataclass

from .types import MAX_NOTE_SIZE

# Protocol constants
PSK_VERSION = 0x01
# Decrypt-only. Payload ChaCha associated data is the 130-byte header.
_PSK_VERSION_AAD = 0x02
PSK_PROTOCOL_ID = 0x02
PSK_HEADER_SIZE = 130
PSK_TAG_SIZE = 16
PSK_ENCRYPTED_SENDER_KEY_SIZE = 48  # 32-byte key + 16-byte tag
# Header stays 130 and the Poly1305 tag stays 16, so plaintext max is 3950.
PSK_MAX_PAYLOAD_SIZE = MAX_NOTE_SIZE - PSK_HEADER_SIZE - PSK_TAG_SIZE
PSK_SESSION_SIZE = 100
PSK_COUNTER_WINDOW = 200
# Legal ratchet counters are uint32. Encoding must not wrap these to 0.
_COUNTER_MAX = 4294967295


def _is_u32_counter(counter: object) -> bool:
    """Return whether ``counter`` is an int in ``0..=4294967295``.

    ``bool`` is rejected. It is an ``int`` subclass, not a ratchet counter.
    """
    return (
        isinstance(counter, int)
        and not isinstance(counter, bool)
        and 0 <= counter <= _COUNTER_MAX
    )


def _require_u32_counter(counter: object) -> int:
    """Reject a counter before any 4-byte encoding.

    Negative, fractional, non-integer, and oversized values never become
    counter 0.
    """
    if not _is_u32_counter(counter):
        raise ValueError(
            "Ratchet counter must be an integer from 0 through 4294967295"
        )
    return counter


@dataclass
class PSKEnvelope:
    """PSK protocol message envelope.

    Wire format (130-byte header + variable ciphertext):
        [0]       version (0x01, or 0x02 when the payload binds this header)
        [1]       protocolId (0x02)
        [2..5]    ratchetCounter (4 bytes, big-endian uint32)
        [6..37]   senderPublicKey (32 bytes)
        [38..69]  ephemeralPublicKey (32 bytes)
        [70..81]  nonce (12 bytes)
        [82..129] encryptedSenderKey (48 bytes)
        [130..]   ciphertext + 16-byte tag
    """

    ratchet_counter: int
    sender_public_key: bytes  # 32 bytes
    ephemeral_public_key: bytes  # 32 bytes
    nonce: bytes  # 12 bytes
    encrypted_sender_key: bytes  # 48 bytes (32 + 16 tag)
    ciphertext: bytes  # variable (message + 16-byte tag)
    version: int = PSK_VERSION
