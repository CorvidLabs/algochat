"""
Blockchain interfaces for Algorand integration.

This module provides abstract base classes for interacting with Algorand nodes (algod)
and indexers. Implementations can use any Algorand SDK.
"""

import base64
import hashlib
from abc import ABC, abstractmethod
from dataclasses import dataclass

from .envelope import decode_envelope, is_chat_message
from .models import DiscoveredKey
from .signature import verify_encryption_key_bytes

# Length in bytes of a decoded Algorand address: 32-byte public key + 4-byte checksum.
_ADDRESS_DECODED_SIZE = 36
_ADDRESS_PUBLIC_KEY_SIZE = 32
_ADDRESS_CHECKSUM_SIZE = 4


class InvalidAddressError(ValueError):
    """Raised when an Algorand address fails to decode or its checksum is invalid."""


def _decode_algorand_address(address: str) -> bytes:
    """Decodes an Algorand address to extract the 32-byte Ed25519 public key.

    Algorand addresses are base32-encoded (no padding) and decode to 36 bytes:
    a 32-byte Ed25519 public key followed by a 4-byte checksum. The checksum is
    the last 4 bytes of ``SHA-512/256(public_key)``. Addresses whose checksum
    does not match are rejected to prevent accepting forged or corrupt addresses.

    Args:
        address: Algorand address string

    Returns:
        32-byte Ed25519 public key

    Raises:
        InvalidAddressError: If the address cannot be decoded or the checksum is
            invalid.
    """
    try:
        decoded = base64.b32decode(address + "=" * ((8 - len(address) % 8) % 8))
    except Exception as exc:
        raise InvalidAddressError(f"Address is not valid base32: {address}") from exc

    if len(decoded) != _ADDRESS_DECODED_SIZE:
        raise InvalidAddressError(
            f"Decoded address must be {_ADDRESS_DECODED_SIZE} bytes, got {len(decoded)}"
        )

    public_key = decoded[:_ADDRESS_PUBLIC_KEY_SIZE]
    checksum = decoded[_ADDRESS_PUBLIC_KEY_SIZE:]

    expected_checksum = hashlib.new("sha512_256", public_key).digest()[-_ADDRESS_CHECKSUM_SIZE:]
    if checksum != expected_checksum:
        raise InvalidAddressError(f"Address checksum mismatch: {address}")

    return public_key


@dataclass
class AlgorandConfig:
    """Configuration for Algorand node connections."""

    algod_url: str
    """Algod node URL."""

    algod_token: str
    """Algod API token."""

    indexer_url: str | None = None
    """Indexer URL (optional)."""

    indexer_token: str | None = None
    """Indexer API token (optional)."""

    @classmethod
    def localnet(cls) -> "AlgorandConfig":
        """Creates configuration for LocalNet (Algokit sandbox)."""
        return cls(
            algod_url="http://localhost:4001",
            algod_token="a" * 64,
            indexer_url="http://localhost:8980",
            indexer_token="a" * 64,
        )

    @classmethod
    def testnet(cls) -> "AlgorandConfig":
        """Creates configuration for TestNet (via Nodely)."""
        return cls(
            algod_url="https://testnet-api.4160.nodely.dev",
            algod_token="",
            indexer_url="https://testnet-idx.4160.nodely.dev",
            indexer_token="",
        )

    @classmethod
    def mainnet(cls) -> "AlgorandConfig":
        """Creates configuration for MainNet (via Nodely)."""
        return cls(
            algod_url="https://mainnet-api.4160.nodely.dev",
            algod_token="",
            indexer_url="https://mainnet-idx.4160.nodely.dev",
            indexer_token="",
        )

    def with_indexer(self, url: str, token: str) -> "AlgorandConfig":
        """Sets the indexer configuration."""
        return AlgorandConfig(
            algod_url=self.algod_url,
            algod_token=self.algod_token,
            indexer_url=url,
            indexer_token=token,
        )


@dataclass
class TransactionInfo:
    """Transaction information returned after submission."""

    txid: str
    """Transaction ID."""

    confirmed_round: int | None = None
    """Round in which the transaction was confirmed (if confirmed)."""


@dataclass
class NoteTransaction:
    """A note field transaction from the blockchain."""

    txid: str
    """Transaction ID."""

    sender: str
    """Sender address."""

    receiver: str
    """Receiver address."""

    note: bytes
    """Note field contents."""

    confirmed_round: int
    """Round in which the transaction was confirmed."""

    round_time: int
    """Timestamp of the block (Unix time)."""

    intra_round_offset: int = 0
    """Position of the transaction inside its round. Rooms order notes by round, then offset."""


@dataclass
class SuggestedParams:
    """Suggested transaction parameters."""

    fee: int
    """Fee per byte in microAlgos."""

    min_fee: int
    """Minimum fee in microAlgos."""

    first_valid: int
    """First valid round."""

    last_valid: int
    """Last valid round."""

    genesis_id: str
    """Genesis ID."""

    genesis_hash: bytes
    """Genesis hash (32 bytes)."""


@dataclass
class AccountInfo:
    """Account information."""

    address: str
    """Account address."""

    amount: int
    """Account balance in microAlgos."""

    min_balance: int
    """Minimum balance required."""


class AlgodClient(ABC):
    """Abstract base class for interacting with an Algorand node (algod)."""

    @abstractmethod
    async def get_suggested_params(self) -> SuggestedParams:
        """Get the current network parameters."""

    @abstractmethod
    async def get_account_info(self, address: str) -> AccountInfo:
        """Get account information."""

    @abstractmethod
    async def submit_transaction(self, signed_txn: bytes) -> str:
        """Submit a signed transaction."""

    @abstractmethod
    async def wait_for_confirmation(self, txid: str, rounds: int) -> TransactionInfo:
        """Wait for a transaction to be confirmed."""

    @abstractmethod
    async def get_current_round(self) -> int:
        """Get the current round."""


class IndexerClient(ABC):
    """Abstract base class for interacting with an Algorand indexer."""

    @abstractmethod
    async def search_transactions(
        self,
        address: str,
        after_round: int | None = None,
        limit: int | None = None,
    ) -> list[NoteTransaction]:
        """Search for transactions with notes sent to/from an address."""

    @abstractmethod
    async def search_transactions_between(
        self,
        address1: str,
        address2: str,
        after_round: int | None = None,
        limit: int | None = None,
    ) -> list[NoteTransaction]:
        """Search for transactions between two addresses."""

    @abstractmethod
    async def get_transaction(self, txid: str) -> NoteTransaction:
        """Get a specific transaction by ID."""

    @abstractmethod
    async def wait_for_indexer(self, txid: str, timeout_secs: int) -> NoteTransaction:
        """Wait for a transaction to be indexed."""


async def discover_encryption_key(
    indexer: IndexerClient,
    address: str,
    search_depth: int | None = None,
) -> DiscoveredKey | None:
    """
    Discovers the X25519 encryption public key for an Algorand address.

    Matches the TypeScript library (``AlgorandService.paginatedKeyDiscovery``)
    exactly (algochat#63):

    - Only notes the address itself sent are read, in the order the indexer
      returns them.
    - A self-payment note of exactly 32 or 96 bytes is a key announcement.
      The first 96-byte announcement whose Ed25519 signature verifies wins.
      A 96-byte announcement whose signature fails is skipped entirely. A
      32-byte announcement is an unverified trust-on-first-use candidate.
    - Any other self-note (an ``ACPQ`` key, a PSK ``0x02`` note, a room note)
      is never read as an X25519 key.
    - Otherwise the sender key in the header of the account's own ``0x01``
      chat envelopes (to anyone) is an unverified candidate.

    The first candidate seen is returned when no verified announcement is
    found. ``search_depth`` limits how many of the address's transactions
    are searched; ``None`` searches all of them, as TypeScript does by default.
    """
    transactions = await indexer.search_transactions(address, limit=search_depth)
    tofu_candidate: DiscoveredKey | None = None

    for tx in transactions:
        if tx.sender != address:
            continue
        note = bytes(tx.note or b"")
        if not note:
            continue

        if tx.receiver == address and len(note) in (_ANNOUNCEMENT_SIZE, _SIGNED_ANNOUNCEMENT_SIZE):
            announced = _parse_key_announcement(note, address)
            if announced is not None and announced.is_verified:
                return announced
            if len(note) == _SIGNED_ANNOUNCEMENT_SIZE:
                # A signed announcement whose signature fails is rejected (KEYS-4.b).
                continue
            if announced is not None and tofu_candidate is None:
                tofu_candidate = announced
            continue

        header_key = _envelope_sender_key(note)
        if header_key is not None and tofu_candidate is None:
            tofu_candidate = DiscoveredKey(public_key=header_key, is_verified=False)

    return tofu_candidate


_ANNOUNCEMENT_SIZE = 32
_SIGNED_ANNOUNCEMENT_SIZE = 96


def _envelope_sender_key(note: bytes) -> bytes | None:
    """The sender X25519 key in the header of a ``0x01`` chat envelope, as TS reads it.

    Only protocol ``0x01`` envelopes count, as in TypeScript's ``isChatMessage``
    and ``decodeEnvelope``. Leif chose to match TypeScript exactly (algochat#63,
    Q2): the X25519 key in ``0x04`` and ``0x05`` headers is not used here.
    """
    if not is_chat_message(note):
        return None
    try:
        return bytes(decode_envelope(note).sender_public_key)
    except Exception:  # noqa: BLE001 - a malformed envelope is skipped, as in TS
        return None


def _parse_key_announcement(note: bytes, address: str) -> DiscoveredKey | None:
    """Parses a key announcement, as TypeScript's ``parseKeyAnnouncement`` does.

    Format: 32 bytes of X25519 public key, then an optional 64-byte Ed25519
    signature. A note that carries a signature is verified or rejected: a
    present but invalid signature never falls through as an unverified key.
    """
    if len(note) < 32:
        return None

    # PQ encapsulation-key notes start with "ACPQ" and are not X25519 keys.
    if note[0:4] == b"ACPQ":
        return None

    public_key = bytes(note[:32])

    if len(note) >= 96:
        signature = bytes(note[32:96])
        try:
            ed25519_public_key = _decode_algorand_address(address)
            verified = verify_encryption_key_bytes(public_key, ed25519_public_key, signature)
        except Exception:  # noqa: BLE001 - any failure to verify is a rejection
            return None
        if not verified:
            return None
        return DiscoveredKey(public_key=public_key, is_verified=True)

    return DiscoveredKey(public_key=public_key, is_verified=False)
