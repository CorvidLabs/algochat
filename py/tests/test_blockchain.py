"""Tests for blockchain interfaces and key discovery."""

import base64
import hashlib

import pytest
from algochat.blockchain import (
    AccountInfo,
    AlgorandConfig,
    IndexerClient,
    NoteTransaction,
    SuggestedParams,
    TransactionInfo,
    _decode_algorand_address,
    _parse_key_announcement,
    discover_encryption_key,
)
from algochat.keys import derive_keys_from_seed, public_key_to_bytes
from algochat.signature import sign_encryption_key
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey


def _encode_algorand_address(public_key: bytes) -> str:
    """Build a valid Algorand address (with correct checksum) from a 32-byte key."""
    checksum = hashlib.new("sha512_256", public_key).digest()[-4:]
    return base64.b32encode(public_key + checksum).decode().rstrip("=")


# ============================================================================
# Mock Indexer
# ============================================================================


class MockIndexerClient(IndexerClient):
    """Mock indexer for testing key discovery."""

    def __init__(self) -> None:
        self._transactions: list[NoteTransaction] = []

    def add_transaction(self, tx: NoteTransaction) -> None:
        self._transactions.append(tx)

    async def search_transactions(
        self, address: str, after_round: int | None = None, limit: int | None = None,
    ) -> list[NoteTransaction]:
        results = [tx for tx in self._transactions
                   if tx.sender == address or tx.receiver == address]
        if limit is not None:
            results = results[:limit]
        return results

    async def search_transactions_between(
        self, address1: str, address2: str,
        after_round: int | None = None, limit: int | None = None,
    ) -> list[NoteTransaction]:
        return []

    async def get_transaction(self, txid: str) -> NoteTransaction:
        for tx in self._transactions:
            if tx.txid == txid:
                return tx
        raise KeyError(f"Transaction {txid} not found")

    async def wait_for_indexer(self, txid: str, timeout_secs: int) -> NoteTransaction:
        return await self.get_transaction(txid)


# ============================================================================
# AlgorandConfig
# ============================================================================


class TestAlgorandConfig:
    def test_localnet(self):
        config = AlgorandConfig.localnet()
        assert config.algod_url == "http://localhost:4001"
        assert config.algod_token == "a" * 64
        assert config.indexer_url == "http://localhost:8980"
        assert config.indexer_token == "a" * 64

    def test_testnet(self):
        config = AlgorandConfig.testnet()
        assert "testnet" in config.algod_url
        assert "testnet" in config.indexer_url
        assert config.algod_token == ""

    def test_mainnet(self):
        config = AlgorandConfig.mainnet()
        assert "mainnet" in config.algod_url
        assert "mainnet" in config.indexer_url

    def test_with_indexer(self):
        config = AlgorandConfig.localnet().with_indexer("http://custom:9000", "token123")
        assert config.indexer_url == "http://custom:9000"
        assert config.indexer_token == "token123"
        # Original algod settings preserved
        assert config.algod_url == "http://localhost:4001"


# ============================================================================
# _decode_algorand_address
# ============================================================================


class TestDecodeAlgorandAddress:
    def test_returns_32_bytes(self):
        # A valid Algorand address is 58 chars (base32 of 36 bytes: 32 key + 4 checksum)
        public_key = b"\x01" * 32
        address = _encode_algorand_address(public_key)

        result = _decode_algorand_address(address)
        assert len(result) == 32
        assert result == public_key

    def test_extracts_public_key_portion(self):
        key = bytes(range(32))
        address = _encode_algorand_address(key)

        result = _decode_algorand_address(address)
        assert result == key

    def test_rejects_invalid_checksum(self):
        import base64

        from algochat.blockchain import InvalidAddressError
        public_key = b"\x01" * 32
        bad_checksum = b"\x00" * 4  # Not the real SHA-512/256 checksum
        address = base64.b32encode(public_key + bad_checksum).decode().rstrip("=")

        with pytest.raises(InvalidAddressError):
            _decode_algorand_address(address)

    def test_rejects_wrong_length(self):
        import base64

        from algochat.blockchain import InvalidAddressError
        # Only 32 bytes (no checksum)
        address = base64.b32encode(b"\x01" * 32).decode().rstrip("=")
        with pytest.raises(InvalidAddressError):
            _decode_algorand_address(address)


# ============================================================================
# _parse_key_announcement
# ============================================================================


class TestParseKeyAnnouncement:
    def test_returns_none_for_short_note(self):
        result = _parse_key_announcement(b"\x00" * 16, "SOMEADDR")
        assert result is None

    def test_returns_none_for_empty_note(self):
        result = _parse_key_announcement(b"", "SOMEADDR")
        assert result is None

    def test_parses_32_byte_key_unverified(self):
        """32-byte note = public key only, no signature → unverified."""
        key = b"\xab" * 32
        result = _parse_key_announcement(key, "SOMEADDR")
        assert result is not None
        assert result.public_key == key
        assert result.is_verified is False

    def test_parses_key_between_32_and_96_bytes_unverified(self):
        """Note between 32 and 96 bytes: has key but signature is incomplete."""
        note = b"\xab" * 64  # 32 key + 32 partial sig
        result = _parse_key_announcement(note, "SOMEADDR")
        assert result is not None
        assert result.public_key == b"\xab" * 32
        assert result.is_verified is False

    def test_parses_key_with_valid_signature(self):
        """96-byte note with valid signature should be verified."""
        seed = b"\x01" * 32
        ed25519_private = Ed25519PrivateKey.from_private_bytes(seed)
        ed25519_public = ed25519_private.public_key().public_bytes_raw()

        # Derive the encryption public key
        _, encryption_public_key = derive_keys_from_seed(seed)
        enc_pub_bytes = public_key_to_bytes(encryption_public_key)

        # Sign the encryption key with the Ed25519 key
        signature = sign_encryption_key(enc_pub_bytes, ed25519_private)

        # Build the announcement note: 32-byte key + 64-byte signature
        note = enc_pub_bytes + signature

        # Build a valid address (with correct checksum) from the ed25519 public key
        address = _encode_algorand_address(ed25519_public)

        result = _parse_key_announcement(note, address)
        assert result is not None
        assert result.public_key == enc_pub_bytes
        assert result.is_verified is True

    def test_rejects_key_with_invalid_signature(self):
        """A 96-byte note whose signature fails is rejected, as in TS (algochat#63, KEYS-4.b)."""
        key = b"\xab" * 32
        bad_signature = b"\x00" * 64
        note = key + bad_signature

        # Use a valid address (correct checksum) but a signature that won't verify
        address = _encode_algorand_address(b"\x01" * 32)

        assert _parse_key_announcement(note, address) is None


# ============================================================================
# discover_encryption_key
# ============================================================================


class TestDiscoverEncryptionKey:
    @pytest.mark.asyncio
    async def test_returns_none_when_no_transactions(self):
        indexer = MockIndexerClient()
        result = await discover_encryption_key(indexer, "SOMEADDR")
        assert result is None

    @pytest.mark.asyncio
    async def test_finds_key_in_self_transfer(self):
        indexer = MockIndexerClient()
        address = "ALICE"
        key = b"\xcd" * 32

        indexer.add_transaction(NoteTransaction(
            txid="announce-1",
            sender=address,
            receiver=address,  # Self-transfer
            note=key,
            confirmed_round=50,
            round_time=1700000000,
        ))

        result = await discover_encryption_key(indexer, address)
        assert result is not None
        assert result.public_key == key

    @pytest.mark.asyncio
    async def test_ignores_non_self_transfers(self):
        indexer = MockIndexerClient()
        address = "ALICE"

        indexer.add_transaction(NoteTransaction(
            txid="transfer-1",
            sender=address,
            receiver="BOB",  # Not self-transfer
            note=b"\xab" * 32,
            confirmed_round=50,
            round_time=1700000000,
        ))

        result = await discover_encryption_key(indexer, address)
        assert result is None

    @pytest.mark.asyncio
    async def test_ignores_short_notes(self):
        indexer = MockIndexerClient()
        address = "ALICE"

        indexer.add_transaction(NoteTransaction(
            txid="short-note",
            sender=address,
            receiver=address,
            note=b"\x00" * 16,  # Too short to be a key
            confirmed_round=50,
            round_time=1700000000,
        ))

        result = await discover_encryption_key(indexer, address)
        assert result is None

    @pytest.mark.asyncio
    async def test_returns_first_valid_announcement(self):
        """When multiple announcements exist, return the first valid one."""
        indexer = MockIndexerClient()
        address = "ALICE"

        indexer.add_transaction(NoteTransaction(
            txid="announce-1",
            sender=address,
            receiver=address,
            note=b"\x01" * 32,
            confirmed_round=50,
            round_time=1700000000,
        ))
        indexer.add_transaction(NoteTransaction(
            txid="announce-2",
            sender=address,
            receiver=address,
            note=b"\x02" * 32,
            confirmed_round=60,
            round_time=1700000001,
        ))

        result = await discover_encryption_key(indexer, address)
        assert result is not None
        assert result.public_key == b"\x01" * 32  # First one wins

    @pytest.mark.asyncio
    async def test_skips_transactions_from_others(self):
        """Only self-sent transactions count as key announcements."""
        indexer = MockIndexerClient()
        address = "ALICE"

        # Someone else sends to Alice with a 32-byte note
        indexer.add_transaction(NoteTransaction(
            txid="from-bob",
            sender="BOB",
            receiver=address,
            note=b"\xab" * 32,
            confirmed_round=50,
            round_time=1700000000,
        ))

        result = await discover_encryption_key(indexer, address)
        assert result is None


# ============================================================================
# Data Models
# ============================================================================


class TestNoteTransaction:
    def test_fields(self):
        tx = NoteTransaction(
            txid="abc123",
            sender="ALICE",
            receiver="BOB",
            note=b"hello",
            confirmed_round=42,
            round_time=1700000000,
        )
        assert tx.txid == "abc123"
        assert tx.sender == "ALICE"
        assert tx.receiver == "BOB"
        assert tx.note == b"hello"
        assert tx.confirmed_round == 42
        assert tx.round_time == 1700000000


class TestTransactionInfo:
    def test_with_confirmed_round(self):
        info = TransactionInfo(txid="abc", confirmed_round=100)
        assert info.txid == "abc"
        assert info.confirmed_round == 100

    def test_without_confirmed_round(self):
        info = TransactionInfo(txid="abc")
        assert info.confirmed_round is None


class TestSuggestedParams:
    def test_fields(self):
        params = SuggestedParams(
            fee=1000, min_fee=1000, first_valid=100,
            last_valid=200, genesis_id="test", genesis_hash=b"\x00" * 32,
        )
        assert params.fee == 1000
        assert params.first_valid == 100


class TestAccountInfo:
    def test_fields(self):
        info = AccountInfo(address="ALICE", amount=1_000_000, min_balance=100_000)
        assert info.address == "ALICE"
        assert info.amount == 1_000_000


# ============================================================================
# discover_encryption_key matches TypeScript (algochat#63, AC5-AC7)
# ============================================================================


def _account(seed: bytes):
    signer = Ed25519PrivateKey.from_private_bytes(seed)
    address = _encode_algorand_address(signer.public_key().public_bytes_raw())
    private, public = derive_keys_from_seed(seed)
    return signer, address, private, public


def _tx(txid: str, sender: str, receiver: str, note: bytes, round_: int) -> NoteTransaction:
    return NoteTransaction(txid=txid, sender=sender, receiver=receiver, note=note, confirmed_round=round_, round_time=1_700_000_000 + round_)


def _chat_note(private, public, to_public) -> bytes:
    from algochat.crypto import encrypt_message
    from algochat.envelope import encode_envelope

    return encode_envelope(encrypt_message("hi", private, public, to_public))


class TestDiscoveryMatchesTypeScript:
    ALICE = bytes([0x11]) * 32
    BOB = bytes([0x22]) * 32

    @pytest.mark.asyncio
    async def test_a_psk_self_note_is_never_read_as_a_key(self):
        """AC5/AC7: the 0x0102 self-note that shifted the key by 6 bytes is skipped."""
        from algochat.psk_crypto import encrypt_psk_message
        from algochat.psk_envelope import encode_psk_envelope

        _, alice, private, public = _account(self.ALICE)
        psk_note = encode_psk_envelope(encrypt_psk_message("note to self", private, public, public, b"\x07" * 32, 0))
        assert psk_note[:2] == b"\x01\x02" and len(psk_note) not in (32, 96)
        indexer = MockIndexerClient()
        indexer.add_transaction(_tx("psk-self", alice, alice, psk_note, 90))
        assert await discover_encryption_key(indexer, alice) is None

        # With a 0x01 message the account sent, its header key is used instead.
        _, _, _, bob_public = _account(self.BOB)
        indexer.add_transaction(_tx("to-bob", alice, "BOB", _chat_note(private, public, bob_public), 80))
        found = await discover_encryption_key(indexer, alice)
        assert found is not None and found.is_verified is False
        assert found.public_key == public_key_to_bytes(public)

    @pytest.mark.asyncio
    async def test_a_rekeyed_account_falls_back_to_its_own_header_key(self):
        """AC5/AC6/AC7: an announcement signed by another key is skipped, not trusted."""
        _, alice, private, public = _account(self.ALICE)
        other_signer = Ed25519PrivateKey.from_private_bytes(bytes([0x33]) * 32)
        stale = b"\x44" * 32
        forged = stale + sign_encryption_key(stale, other_signer)
        _, _, _, bob_public = _account(self.BOB)
        indexer = MockIndexerClient()
        indexer.add_transaction(_tx("forged", alice, alice, forged, 90))
        indexer.add_transaction(_tx("to-bob", alice, "BOB", _chat_note(private, public, bob_public), 80))
        found = await discover_encryption_key(indexer, alice)
        assert found is not None and found.is_verified is False
        assert found.public_key == public_key_to_bytes(public)

    @pytest.mark.asyncio
    async def test_a_signed_announcement_wins_over_earlier_candidates(self):
        signer, alice, private, public = _account(self.ALICE)
        key = public_key_to_bytes(public)
        _, _, _, bob_public = _account(self.BOB)
        indexer = MockIndexerClient()
        indexer.add_transaction(_tx("unsigned", alice, alice, b"\x55" * 32, 95))
        indexer.add_transaction(_tx("to-bob", alice, "BOB", _chat_note(private, public, bob_public), 90))
        indexer.add_transaction(_tx("signed", alice, alice, key + sign_encryption_key(key, signer), 80))
        found = await discover_encryption_key(indexer, alice)
        assert found is not None and found.is_verified is True and found.public_key == key

    @pytest.mark.asyncio
    async def test_the_first_unsigned_candidate_wins_without_a_signed_one(self):
        _, alice, private, public = _account(self.ALICE)
        _, _, _, bob_public = _account(self.BOB)
        indexer = MockIndexerClient()
        indexer.add_transaction(_tx("to-bob", alice, "BOB", _chat_note(private, public, bob_public), 95))
        indexer.add_transaction(_tx("unsigned", alice, alice, b"\x55" * 32, 90))
        found = await discover_encryption_key(indexer, alice)
        assert found.public_key == public_key_to_bytes(public) and found.is_verified is False

    @pytest.mark.asyncio
    async def test_other_self_note_sizes_and_hybrid_headers_are_not_keys(self):
        """Q2: only 32- or 96-byte self-notes and 0x01 headers count; never 0x04/0x05."""
        from algochat.pq import (
            derive_mlkem_keypair,
            encode_pq_key_announcement,
            initiate_pq_session,
        )

        signer, alice, _, public = _account(self.ALICE)
        _, _, _, bob_public = _account(self.BOB)
        bob_kem = derive_mlkem_keypair(self.BOB)
        handshake, _ = initiate_pq_session(public, bob_public, bob_kem.encaps_key, derive_mlkem_keypair(self.ALICE).encaps_key)
        indexer = MockIndexerClient()
        indexer.add_transaction(_tx("acpq", alice, alice, encode_pq_key_announcement(derive_mlkem_keypair(self.ALICE).encaps_key, signer), 99))
        indexer.add_transaction(_tx("handshake", alice, "BOB", handshake, 98))
        indexer.add_transaction(_tx("64", alice, alice, b"\x66" * 64, 97))
        indexer.add_transaction(_tx("33", alice, alice, b"\x66" * 33, 96))
        assert await discover_encryption_key(indexer, alice) is None

    @pytest.mark.asyncio
    async def test_search_depth_defaults_to_every_transaction(self):
        class Recording(MockIndexerClient):
            def __init__(self) -> None:
                super().__init__()
                self.limits: list[int | None] = []

            async def search_transactions(self, address, after_round=None, limit=None):
                self.limits.append(limit)
                return await super().search_transactions(address, after_round, limit)

        indexer = Recording()
        await discover_encryption_key(indexer, "ALICE")
        await discover_encryption_key(indexer, "ALICE", search_depth=5)
        assert indexer.limits == [None, 5]
