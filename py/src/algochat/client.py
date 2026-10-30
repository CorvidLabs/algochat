"""
Main AlgoChat client for encrypted messaging on Algorand.

This module provides the primary interface for sending and receiving
encrypted messages using the AlgoChat protocol.
"""

import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.asymmetric.x25519 import (
    X25519PrivateKey,
    X25519PublicKey,
)
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    NoEncryption,
    PrivateFormat,
)

from .blockchain import (
    AlgodClient,
    AlgorandConfig,
    IndexerClient,
    NoteTransaction,
    discover_encryption_key,
)
from .crypto import decrypt_message
from .envelope import decode_envelope, is_chat_message
from .hybrid_direct import (
    ClassicalSendRefusedError,
    HybridDirect,
    HybridKeyNotFoundError,
    HybridPeerKeys,
    discover_pq_encaps_key,
)
from .keys import derive_keys_from_seed, public_key_to_bytes
from .models import (
    Conversation,
    DiscoveredKey,
    Message,
    MessageDirection,
    ReplyContext,
)
from .pq import derive_mlkem_keypair, is_pq_handshake, is_pq_message
from .psk_crypto import decrypt_psk_message
from .psk_envelope import decode_psk_envelope, is_psk_message
from .psk_ratchet import derive_psk_at_counter
from .psk_state import PSKState, record_receive, validate_counter
from .queue import SendQueue
from .storage import (
    EncryptionKeyStorage,
    InMemoryKeyStorage,
    InMemoryMessageCache,
    MessageCache,
    PublicKeyCache,
)
from .types import (
    DecryptedContent,
    InvalidEnvelopeError,
    PSKDecryptionError,
    PublicKeyNotFoundError,
    UnverifiedKeyError,
)


@dataclass
class AlgoChatConfig:
    """Configuration for the AlgoChat client."""

    network: AlgorandConfig
    """Algorand network configuration."""

    auto_discover_keys: bool = True
    """Whether to automatically discover recipient keys."""

    cache_public_keys: bool = True
    """Whether to cache public keys."""

    cache_messages: bool = True
    """Whether to cache messages locally."""

    allow_unverified_keys: bool = True
    """Whether to allow using encryption keys without verified Ed25519 binding.

    When ``False``, discovered keys whose signature could not be verified against
    the address's Ed25519 key are rejected at use time, preventing key
    substitution attacks. Defaults to ``True`` for backward compatibility.
    """

    @classmethod
    def localnet(cls) -> "AlgoChatConfig":
        """Creates a configuration for LocalNet."""
        return cls(network=AlgorandConfig.localnet())

    @classmethod
    def testnet(cls) -> "AlgoChatConfig":
        """Creates a configuration for TestNet."""
        return cls(network=AlgorandConfig.testnet())

    @classmethod
    def mainnet(cls) -> "AlgoChatConfig":
        """Creates a configuration for MainNet."""
        return cls(network=AlgorandConfig.mainnet())


class AlgoChat:
    """
    The main AlgoChat client for encrypted messaging.

    This provides a high-level API for sending and receiving encrypted
    messages on the Algorand blockchain.
    """

    def __init__(
        self,
        address: str,
        ed25519_public_key: bytes,
        encryption_private_key: X25519PrivateKey,
        encryption_public_key: X25519PublicKey,
        config: AlgoChatConfig,
        algod: AlgodClient,
        indexer: IndexerClient,
        key_storage: EncryptionKeyStorage,
        message_cache: MessageCache,
    ) -> None:
        self._address = address
        self._ed25519_public_key = ed25519_public_key
        self._encryption_private_key = encryption_private_key
        self._encryption_public_key = encryption_public_key
        self._config = config
        self._algod = algod
        self._indexer = indexer
        self._key_storage = key_storage
        self._message_cache = message_cache
        self._public_key_cache = PublicKeyCache()
        self._send_queue = SendQueue()
        self._conversations: list[Conversation] = []
        self._lock = asyncio.Lock()
        self._psk_channels: dict[str, tuple[bytes, PSKState]] = {}  # address -> (psk, state)
        self._pubkey_to_address: dict[str, str] = {}  # pubkey_hex -> address
        # Tracks the verification status of cached public keys, keyed by address.
        # The PublicKeyCache only stores raw bytes, so verification status is kept
        # here to avoid hardcoding is_verified=True for cached keys.
        self._verification_status: dict[str, bool] = {}
        # Hybrid one-to-one sessions (algochat#63). Set by from_seed, which has
        # the seed the ML-KEM-768 key derives from.
        self._hybrid: HybridDirect | None = None
        self._hybrid_recovered: set[str] = set()

    @classmethod
    async def from_seed(
        cls,
        seed: bytes,
        address: str,
        config: AlgoChatConfig,
        algod: AlgodClient,
        indexer: IndexerClient,
        key_storage: EncryptionKeyStorage | None = None,
        message_cache: MessageCache | None = None,
    ) -> "AlgoChat":
        """
        Creates a new AlgoChat client from an Algorand account seed.

        The seed should be the 32-byte Ed25519 private key from an Algorand account.
        """
        if len(seed) != 32:
            raise ValueError("Seed must be 32 bytes")

        # Derive encryption keys from the seed
        encryption_private_key, encryption_public_key = derive_keys_from_seed(seed)

        # Use default storage if not provided
        if key_storage is None:
            key_storage = InMemoryKeyStorage()
        if message_cache is None:
            message_cache = InMemoryMessageCache()

        # Derive the Ed25519 public key from the seed (private key)
        ed25519_private = Ed25519PrivateKey.from_private_bytes(seed)
        ed25519_public_key = ed25519_private.public_key().public_bytes_raw()

        # Store the encryption key as raw bytes (storage expects bytes, not a key object)
        encryption_private_bytes = encryption_private_key.private_bytes(
            encoding=Encoding.Raw,
            format=PrivateFormat.Raw,
            encryption_algorithm=NoEncryption(),
        )
        await key_storage.store(encryption_private_bytes, address, False)

        chat = cls(
            address=address,
            ed25519_public_key=ed25519_public_key,
            encryption_private_key=encryption_private_key,
            encryption_public_key=encryption_public_key,
            config=config,
            algod=algod,
            indexer=indexer,
            key_storage=key_storage,
            message_cache=message_cache,
        )
        chat._hybrid = HybridDirect(
            address, encryption_private_key, encryption_public_key, derive_mlkem_keypair(seed)
        )
        return chat

    @property
    def address(self) -> str:
        """Returns the user's Algorand address."""
        return self._address

    @property
    def encryption_public_key(self) -> bytes:
        """Returns the user's raw 32-byte X25519 encryption public key."""
        return public_key_to_bytes(self._encryption_public_key)

    async def conversation(self, participant: str) -> Conversation:
        """Gets or creates a conversation with the given participant."""
        async with self._lock:
            for conv in self._conversations:
                if conv.participant == participant:
                    return conv

            conv = Conversation(participant)
            self._conversations.append(conv)
            return conv

    async def conversations(self) -> list[Conversation]:
        """Lists all conversations."""
        async with self._lock:
            return list(self._conversations)

    async def discover_key(self, address: str) -> DiscoveredKey | None:
        """Discovers the encryption public key for an address.

        Never assumes a cached key is verified: the verification status is the
        one established at discovery time and is preserved across cache hits.
        """
        # Check cache first
        if self._config.cache_public_keys:
            cached = await self._public_key_cache.retrieve(address)
            if cached is not None:
                # Preserve the verification status from when the key was discovered.
                # Default to False (unverified) rather than hardcoding True.
                is_verified = self._verification_status.get(address, False)
                return DiscoveredKey(public_key=cached, is_verified=is_verified)

        # Search indexer for key announcement
        key = await discover_encryption_key(self._indexer, address)

        # Cache if found
        if key is not None:
            self._pubkey_to_address[key.public_key.hex()] = address
            if self._config.cache_public_keys:
                await self._public_key_cache.store(address, key.public_key)
                self._verification_status[address] = key.is_verified

        return key

    def _ensure_key_usable(self, address: str, key: DiscoveredKey) -> None:
        """Enforcement hook: rejects use of an unverified key unless allowed.

        A key with ``is_verified=False`` has not been cryptographically bound to
        the Algorand address via an Ed25519 signature, so using it risks a key
        substitution attack. The client currently allows unverified keys by
        default; set ``allow_unverified_keys=False`` to reject them.

        Raises:
            UnverifiedKeyError: If the key is unverified and unverified keys are
                not allowed.
        """
        if not key.is_verified and not self._config.allow_unverified_keys:
            raise UnverifiedKeyError(
                f"Encryption key for {address} is not verified. "
                "Set allow_unverified_keys=True to use it anyway."
            )

    @property
    def hybrid(self) -> HybridDirect:
        """The hybrid one-to-one sessions of this account (needs :meth:`from_seed`)."""
        if self._hybrid is None:
            raise RuntimeError("Build the client with AlgoChat.from_seed to use hybrid messages")
        return self._hybrid

    async def discover_hybrid_keys(self, address: str) -> HybridPeerKeys:
        """The X25519 and signed ML-KEM-768 keys ``address`` published.

        Raises:
            HybridKeyNotFoundError: when either key is missing. Nothing falls
                back to a classical note.
            UnverifiedKeyError: when the X25519 key is unverified and
                unverified keys are not allowed.
        """
        key = await self.discover_key(address)
        if key is None:
            raise HybridKeyNotFoundError(
                f"{address} has not published an encryption key, so no hybrid message "
                "can be sent; AlgoChat never falls back to a classical 0x01 or 0x02 note"
            )
        self._ensure_key_usable(address, key)
        encaps_key = await discover_pq_encaps_key(self._indexer, address)
        if encaps_key is None:
            raise HybridKeyNotFoundError(
                f"{address} has not published a signed ML-KEM-768 key, so no hybrid message "
                "can be sent; AlgoChat never falls back to a classical 0x01 or 0x02 note"
            )
        return HybridPeerKeys(key.public_key, encaps_key, key.is_verified)

    async def encrypt_hybrid(self, message: str, address: str) -> list[bytes]:
        """The notes that carry ``message`` to ``address``: a ``0x04`` handshake when needed, then ``0x05``.

        Pay them in order. Refuses with :class:`HybridKeyNotFoundError` before
        building anything when ``address`` lacks either hybrid key.
        """
        keys = await self.discover_hybrid_keys(address)
        hybrid = self.hybrid
        if not hybrid.has_session(address) and address not in self._hybrid_recovered:
            # Reuse a session this account already opened on chain, so a restart
            # does not pay for a new handshake. Oldest first: the newest one wins.
            history = await self._indexer.search_transactions_between(self._address, address)
            for tx in sorted(history, key=lambda item: (item.confirmed_round, item.intra_round_offset)):
                hybrid.ingest(tx)
            self._hybrid_recovered.add(address)
        return hybrid.seal(address, message, keys)

    def encrypt(
        self,
        message: str,
        recipient_public_key: bytes,
        psk: bytes | None = None,
    ) -> bytes:
        """Refused: AlgoChat no longer sends everyday ``0x01`` or extra-lock ``0x02`` notes.

        Leif's rule (algochat#63, BASE-3 and ENCRYPT-2): classical is never
        sent. Use :meth:`encrypt_hybrid`. Reading ``0x01`` and ``0x02`` notes
        with :meth:`decrypt` and :meth:`process_transaction` is unchanged.

        Raises:
            ClassicalSendRefusedError: always.
        """
        raise ClassicalSendRefusedError(
            "AlgoChat sends only hybrid 0x04 and 0x05 one-to-one notes, never 0x01 or 0x02; "
            "use AlgoChat.encrypt_hybrid"
        )

    def decrypt(
        self,
        envelope_bytes: bytes,
        sender_public_key: bytes = b"",
        psk: bytes | None = None,
    ) -> str:
        """Decrypts a message.

        Automatically detects whether the envelope uses standard v1 or PSK v1.1 protocol.

        Args:
            envelope_bytes: The encoded envelope bytes.
            sender_public_key: Sender's public key (only needed for standard v1).
            psk: Optional pre-shared key (32 bytes). Required if envelope is PSK v1.1.

        Returns:
            Decrypted message text.
        """
        if is_psk_message(envelope_bytes):
            return self._decrypt_psk(envelope_bytes, psk)

        if not is_chat_message(envelope_bytes):
            raise InvalidEnvelopeError("Not an AlgoChat message")

        result = self._standard_content(envelope_bytes)

        if result is None:
            # Key-publish payload
            return ""

        return result.text

    def _standard_content(self, envelope_bytes: bytes) -> DecryptedContent | None:
        """Opens a standard envelope; ``None`` for a key publish."""
        return decrypt_message(
            decode_envelope(envelope_bytes),
            self._encryption_private_key,
            self._encryption_public_key,
        )

    def _decrypt_psk(self, envelope_bytes: bytes, psk: bytes | None = None) -> str:
        """Decrypt a PSK v1.1 envelope."""
        decoded = decode_psk_envelope(envelope_bytes)
        sender_address = self._address_for_key(decoded.sender_public_key)

        # Look up PSK from channel state if not provided
        if psk is None:
            channel = self._psk_channels.get(sender_address)
            if channel is not None:
                psk = channel[0]

        if psk is None:
            raise PSKDecryptionError("No PSK available for this message")
        state = self._get_psk_state(sender_address, psk)

        if not validate_counter(state, decoded.ratchet_counter):
            raise PSKDecryptionError(
                f"Invalid counter: {decoded.ratchet_counter} (replay or out of window)"
            )

        current_psk = derive_psk_at_counter(psk, decoded.ratchet_counter)

        result = decrypt_psk_message(
            decoded,
            self._encryption_private_key,
            self._encryption_public_key,
            current_psk,
        )

        # Record successful receive
        new_state = record_receive(state, decoded.ratchet_counter)
        self._set_psk_state(sender_address, psk, new_state)

        return result

    # --- PSK channel management ---

    def add_psk_channel(self, address: str, psk: bytes, public_key: bytes | None = None) -> None:
        """Register a PSK channel for a participant.

        Args:
            address: The participant's Algorand address.
            psk: The pre-shared key (32 bytes).
            public_key: Optional X25519 public key (32 bytes) to enable lookup by key.
        """
        if len(psk) != 32:
            raise ValueError("PSK must be 32 bytes")
        self._psk_channels[address] = (psk, PSKState())
        if public_key is not None:
            self._pubkey_to_address[public_key.hex()] = address

    def remove_psk_channel(self, address: str) -> None:
        """Remove a PSK channel."""
        self._psk_channels.pop(address, None)

    def has_psk_channel(self, address: str) -> bool:
        """Check if a PSK channel exists for an address."""
        return address in self._psk_channels

    def get_psk_state(self, address: str) -> PSKState | None:
        """Get the PSK state for a channel (for inspection/persistence)."""
        channel = self._psk_channels.get(address)
        if channel is not None:
            return channel[1]
        return None

    def rotate_psk(self, address: str, new_psk: bytes) -> None:
        """Rotate the PSK for a channel, resetting counter state.

        Args:
            address: The participant's Algorand address.
            new_psk: The new pre-shared key (32 bytes).
        """
        if len(new_psk) != 32:
            raise ValueError("PSK must be 32 bytes")
        self._psk_channels[address] = (new_psk, PSKState())

    def _get_psk_state(self, address: str, psk: bytes) -> PSKState:
        """Get or create PSK state for an address."""
        channel = self._psk_channels.get(address)
        if channel is not None and channel[0] == psk:
            return channel[1]
        return PSKState()

    def _set_psk_state(self, address: str, psk: bytes, state: PSKState) -> None:
        """Update PSK state for an address."""
        self._psk_channels[address] = (psk, state)

    def _address_for_key(self, public_key: bytes) -> str:
        """Look up address for a public key, or use key hex as fallback."""
        return self._pubkey_to_address.get(public_key.hex(), public_key.hex())

    async def process_transaction(self, tx: NoteTransaction) -> Message | None:
        """Processes a transaction and extracts any chat message."""
        if self._hybrid is not None and is_pq_handshake(bytes(tx.note or b"")):
            # A handshake carries no text; it opens the session for later 0x05 notes.
            self._hybrid.ingest(tx)
            return None
        if self._hybrid is not None and is_pq_message(bytes(tx.note or b"")):
            return await self._process_hybrid(tx)

        # Check if this is a chat message (standard or PSK)
        is_standard = is_chat_message(tx.note)
        is_psk = is_psk_message(tx.note)

        if not is_standard and not is_psk:
            return None

        # Determine direction
        if tx.sender == self._address:
            direction = MessageDirection.SENT
        elif tx.receiver == self._address:
            direction = MessageDirection.RECEIVED
        else:
            return None  # Not relevant to us

        # Get the other party's address and key
        if direction == MessageDirection.SENT:
            other_address = tx.receiver
        else:
            other_address = tx.sender

        if is_standard:
            key = await self.discover_key(other_address)
            if key is None:
                raise PublicKeyNotFoundError(f"Key not found for {other_address}")
            # Enforce that unverified keys are not used unless explicitly allowed.
            self._ensure_key_usable(other_address, key)
            other_key = key.public_key
        else:
            other_key = b""  # PSK envelopes carry their own sender key
            # Register pubkey→address from the PSK envelope header
            decoded_env = decode_psk_envelope(tx.note)
            self._pubkey_to_address[decoded_env.sender_public_key.hex()] = tx.sender

        # Decrypt the message — auto-detects PSK vs standard
        psk = None
        if is_psk:
            channel = self._psk_channels.get(other_address)
            if channel is not None:
                psk = channel[0]
        reply_context = None
        if is_psk:
            content = self.decrypt(tx.note, other_key, psk=psk)
        else:
            opened = self._standard_content(tx.note)
            content = "" if opened is None else opened.text
            if opened is not None and opened.reply_to_id:
                reply_context = ReplyContext(
                    message_id=opened.reply_to_id,
                    preview=opened.reply_to_preview or "",
                )

        return await self._record(tx, direction, other_address, content, reply_context)

    async def _process_hybrid(self, tx: NoteTransaction) -> Message | None:
        opened = self.hybrid.open(tx)
        if opened is None:
            return None
        direction = MessageDirection.SENT if opened.sent else MessageDirection.RECEIVED
        content = "" if opened.content is None else opened.content.text
        reply_context = None
        if opened.content is not None and opened.content.reply_to_id:
            reply_context = ReplyContext(
                message_id=opened.content.reply_to_id,
                preview=opened.content.reply_to_preview or "",
            )
        return await self._record(tx, direction, opened.peer, content, reply_context)

    async def _record(
        self,
        tx: NoteTransaction,
        direction: MessageDirection,
        other_address: str,
        content: str,
        reply_context: ReplyContext | None,
    ) -> Message:
        # Create message
        timestamp = datetime.fromtimestamp(tx.round_time, tz=timezone.utc)

        message = Message(
            id=tx.txid,
            sender=tx.sender,
            recipient=tx.receiver,
            content=content,
            timestamp=timestamp,
            confirmed_round=tx.confirmed_round,
            direction=direction,
            reply_context=reply_context,
        )

        # Update conversation
        async with self._lock:
            conv = None
            for c in self._conversations:
                if c.participant == other_address:
                    conv = c
                    break

            if conv is None:
                conv = Conversation(other_address)
                self._conversations.append(conv)

            conv.append(message)

        # Cache message
        if self._config.cache_messages:
            await self._message_cache.store([message], message.sender)

        return message

    async def sync(self) -> list[Message]:
        """Fetches new messages from the blockchain."""
        all_messages = []

        # Get transactions for our address
        txs = await self._indexer.search_transactions(self._address, limit=100)
        if self._hybrid is not None:
            # Open hybrid sessions oldest first, before the 0x05 notes that use them.
            for tx in reversed(txs):
                self._hybrid.ingest(tx)

        for tx in txs:
            message = await self.process_transaction(tx)
            if message is not None:
                all_messages.append(message)

        return all_messages

    @property
    def send_queue(self) -> SendQueue:
        """Returns the send queue for managing pending messages."""
        return self._send_queue

    @property
    def message_cache(self) -> MessageCache:
        """Returns the message cache."""
        return self._message_cache

    @property
    def public_key_cache(self) -> PublicKeyCache:
        """Returns the public key cache."""
        return self._public_key_cache
