"""
One-to-one hybrid messages: a ``0x04`` handshake, then ``0x05`` messages.

Leif's rule (algochat#63, confirmed October 30, 2026): AlgoChat and Raven use
protocol ``0x03`` and up only. A one-to-one message is sent as a hybrid
X25519 + ML-KEM-768 session (PROTOCOL.md section 5.7) and never as an
everyday ``0x01`` or extra-lock ``0x02`` note. When the recipient has not
published both an X25519 key and a signed ML-KEM-768 key, sending refuses
with :class:`HybridKeyNotFoundError`; it never falls back to classical.

:class:`HybridDirect` keeps the sessions for one account:

- outbound sessions it opened to each peer, recovered from its own
  handshakes on chain through the sender wrap, so a restart reuses the
  session instead of paying for a new handshake;
- inbound sessions accepted from handshakes sent to it.

A ``0x05`` note opens only under a session from a handshake the same paying
account sent (section 5.7: retain the authenticated payment sender).
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.hazmat.primitives.asymmetric.x25519 import (
    X25519PrivateKey,
    X25519PublicKey,
)

from .blockchain import IndexerClient, NoteTransaction, _decode_algorand_address
from .crypto import _is_key_publish_payload, _parse_message_payload
from .keys import public_key_from_bytes, public_key_to_bytes
from .pq import (
    PQ_DATA_ID,
    PQ_HANDSHAKE_ID,
    PQ_VERSION,
    MLKEMKeyPair,
    PQSession,
    accept_pq_session,
    decrypt_pq_message,
    encrypt_pq_message,
    initiate_pq_session,
    is_pq_handshake,
    is_pq_message,
    open_pq_session_as_sender,
    parse_pq_key_announcement,
)
from .types import DecryptedContent, EncryptionError, PublicKeyNotFoundError

_EK_HASH_START = 1186
_EK_HASH_END = 1218
MIN_PROTOCOL_ID = 0x03
"""The lowest protocol id AlgoChat and Raven send (Leif, algochat#63)."""


class HybridKeyNotFoundError(PublicKeyNotFoundError, LookupError):
    """The recipient has no X25519 key or no signed ML-KEM-768 key, so nothing is sent."""


class ClassicalSendRefusedError(EncryptionError):
    """A ``0x01`` or ``0x02`` note was about to be sent. AlgoChat sends ``0x03`` and up only."""


def is_hybrid_direct_note(note: bytes) -> bool:
    """Whether ``note`` is a ``0x04`` handshake or a ``0x05`` message."""
    return is_pq_handshake(note) or is_pq_message(note)


def require_hybrid_note(note: bytes) -> bytes:
    """Returns ``note`` when it is a hybrid ``0x02 0x04`` or ``0x02 0x05`` note; raises otherwise.

    This is the last check before a one-to-one note is paid for.
    """
    note = bytes(note)
    if len(note) < 2 or note[0] != PQ_VERSION or note[1] not in (PQ_HANDSHAKE_ID, PQ_DATA_ID):
        protocol = note[1:2].hex() or "missing"
        raise ClassicalSendRefusedError(
            f"Refused to send a one-to-one note with protocol {protocol}: "
            "AlgoChat sends only hybrid 0x04 and 0x05 notes, never 0x01 or 0x02"
        )
    if not is_hybrid_direct_note(note):
        raise ClassicalSendRefusedError("Refused to send a malformed hybrid note")
    return note


@dataclass(frozen=True)
class HybridPeerKeys:
    """A peer's keys for a hybrid session."""

    x25519: bytes
    """32-byte X25519 public key, from :func:`discover_encryption_key`."""

    encaps_key: bytes
    """1184-byte ML-KEM-768 encapsulation key from a signed ``ACPQ`` announcement."""

    x25519_verified: bool
    """Whether the X25519 key came from a signed announcement."""


async def discover_pq_encaps_key(
    indexer: IndexerClient,
    address: str,
    search_depth: int | None = None,
) -> bytes | None:
    """The first signed ``ACPQ`` self-announcement of ``address`` that verifies, in indexer order.

    Unsigned announcements and announcements whose signature fails are not
    used: a hybrid session needs an ML-KEM key bound to the address.
    """
    try:
        verifier = Ed25519PublicKey.from_public_bytes(_decode_algorand_address(address))
    except Exception:  # noqa: BLE001 - an address that is not an Ed25519 key cannot verify one
        return None
    for tx in await indexer.search_transactions(address, limit=search_depth):
        if tx.sender != address or tx.receiver != address:
            continue
        found = parse_pq_key_announcement(bytes(tx.note or b""), verifier)
        if found is not None and found.is_verified:
            return found.encaps_key
    return None


@dataclass(frozen=True)
class HybridOpened:
    """A ``0x05`` message opened by :class:`HybridDirect`."""

    content: DecryptedContent | None
    """The section 9 payload, or ``None`` for a key-publish marker."""

    peer: str
    """The other party's address."""

    sent: bool
    """True when this account sent the message."""


class HybridDirect:
    """Hybrid one-to-one sessions for one account."""

    def __init__(
        self,
        address: str,
        private_key: X25519PrivateKey,
        public_key: X25519PublicKey,
        kem: MLKEMKeyPair,
    ) -> None:
        self._address = address
        self._private = private_key
        self._public = public_key
        self._public_bytes = public_key_to_bytes(public_key)
        self._kem = kem
        self._outbound: dict[str, tuple[PQSession, bytes]] = {}
        """peer address -> (session, SHA-256 of the peer encapsulation key it used)."""
        self._inbound: dict[bytes, tuple[PQSession, str]] = {}
        """handshake id -> (session, the address that paid for the handshake)."""
        self._own: dict[bytes, tuple[PQSession, str]] = {}
        """handshake id -> (session, receiver) for handshakes this account sent."""

    @property
    def encaps_key(self) -> bytes:
        """This account's ML-KEM-768 encapsulation key."""
        return self._kem.encaps_key

    def ingest(self, tx: NoteTransaction) -> bool:
        """Records the session of a ``0x04`` handshake to or from this account.

        Returns whether ``tx`` was a handshake that opened. Feed
        transactions oldest first, so the newest own handshake to a peer is
        the outbound session that is reused.
        """
        note = bytes(tx.note or b"")
        if not is_pq_handshake(note):
            return False
        handshake_id = hashlib.sha256(note).digest()
        if handshake_id in self._own or handshake_id in self._inbound:
            return False
        try:
            if tx.sender == self._address and tx.receiver != self._address:
                session = open_pq_session_as_sender(note, self._private, self._public, self._kem)
                self._own[bytes(session.handshake_id)] = (session, tx.receiver)
                self._outbound[tx.receiver] = (session, note[_EK_HASH_START:_EK_HASH_END])
                return True
            if tx.receiver == self._address and tx.sender != self._address:
                session = accept_pq_session(note, self._private, self._public, self._kem)
                self._inbound[bytes(session.handshake_id)] = (session, tx.sender)
                return True
        except Exception:  # noqa: BLE001 - a handshake for other keys is skipped
            return False
        return False

    def open(self, tx: NoteTransaction) -> HybridOpened | None:
        """Opens a ``0x05`` note to or from this account, or returns ``None``.

        Raises :class:`~algochat.types.PQError` when the session is known
        but the note does not authenticate.
        """
        note = bytes(tx.note or b"")
        if not is_pq_message(note):
            return None
        handshake_id = note[34:66]
        if tx.sender == self._address:
            entry = self._own.get(handshake_id)
            if entry is None or entry[1] != tx.receiver:
                return None
            text = decrypt_pq_message(note, entry[0])
            return HybridOpened(self._content(text), tx.receiver, sent=True)
        if tx.receiver == self._address:
            entry = self._inbound.get(handshake_id)
            # The session must come from a handshake the same account paid for.
            if entry is None or entry[1] != tx.sender:
                return None
            text = decrypt_pq_message(note, entry[0])
            return HybridOpened(self._content(text), tx.sender, sent=False)
        return None

    @staticmethod
    def _content(text: str) -> DecryptedContent | None:
        data = text.encode("utf-8")
        if _is_key_publish_payload(data):
            return None
        return _parse_message_payload(data)

    def seal(self, address: str, text: str, keys: HybridPeerKeys) -> list[bytes]:
        """The notes that carry ``text`` to ``address``, in the order they must be paid.

        A ``0x05`` message under the current session, preceded by a new
        ``0x04`` handshake when there is no session for the peer's current
        keys. Every note is checked to be hybrid.
        """
        if address == self._address:
            raise ValueError("A one-to-one message needs another address")
        ek_hash = hashlib.sha256(keys.encaps_key).digest()
        notes: list[bytes] = []
        current = self._outbound.get(address)
        if (
            current is None
            or current[0].recipient_public_key != keys.x25519
            or current[1] != ek_hash
            or current[0].sender_public_key != self._public_bytes
        ):
            handshake, session = initiate_pq_session(
                self._public, public_key_from_bytes(keys.x25519), keys.encaps_key, self._kem.encaps_key
            )
            self._own[bytes(session.handshake_id)] = (session, address)
            self._outbound[address] = (session, ek_hash)
            notes.append(require_hybrid_note(handshake))
            current = self._outbound[address]
        notes.append(require_hybrid_note(encrypt_pq_message(text, current[0])))
        return notes

    def has_session(self, address: str) -> bool:
        """Whether there is an outbound session to ``address``."""
        return address in self._outbound

    def forget(self, address: str) -> None:
        """Drops the outbound session to ``address``, so the next send opens a new one."""
        self._outbound.pop(address, None)
