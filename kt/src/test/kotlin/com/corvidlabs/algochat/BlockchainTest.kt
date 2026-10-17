package com.corvidlabs.algochat

import kotlinx.coroutines.test.runTest
import org.bouncycastle.crypto.params.Ed25519PrivateKeyParameters
import org.junit.jupiter.api.Test
import java.security.MessageDigest
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Fake IndexerClient for testing blockchain discovery logic.
 */
class FakeIndexerClient(
    private val transactions: MutableList<NoteTransaction> = mutableListOf()
) : IndexerClient {
    override suspend fun searchTransactions(
        address: String,
        afterRound: Long?,
        limit: Int?
    ): List<NoteTransaction> {
        return transactions
            .filter { it.sender == address || it.receiver == address }
            .let { txs -> if (afterRound != null) txs.filter { it.confirmedRound > afterRound } else txs }
            .let { txs -> if (limit != null) txs.take(limit) else txs }
    }

    override suspend fun searchTransactionsBetween(
        address1: String,
        address2: String,
        afterRound: Long?,
        limit: Int?
    ): List<NoteTransaction> {
        return transactions
            .filter {
                (it.sender == address1 && it.receiver == address2) ||
                    (it.sender == address2 && it.receiver == address1)
            }
            .let { txs -> if (afterRound != null) txs.filter { it.confirmedRound > afterRound } else txs }
            .let { txs -> if (limit != null) txs.take(limit) else txs }
    }

    override suspend fun getTransaction(txid: String): NoteTransaction {
        return transactions.find { it.txid == txid }
            ?: throw RuntimeException("Transaction not found: $txid")
    }

    override suspend fun waitForIndexer(txid: String, timeoutSecs: Int): NoteTransaction {
        return getTransaction(txid)
    }

    fun addTransaction(tx: NoteTransaction) {
        transactions.add(tx)
    }
}

/**
 * Fake AlgodClient for testing.
 */
class FakeAlgodClient(
    private var currentRound: Long = 1000L,
    private var suggestedParams: SuggestedParams = SuggestedParams(
        fee = 1000,
        minFee = 1000,
        firstValid = 1000,
        lastValid = 2000,
        genesisId = "testnet-v1.0",
        genesisHash = ByteArray(32)
    )
) : AlgodClient {
    override suspend fun getSuggestedParams(): SuggestedParams = suggestedParams

    override suspend fun getAccountInfo(address: String): AccountInfo {
        return AccountInfo(address = address, amount = 10_000_000, minBalance = 100_000)
    }

    override suspend fun submitTransaction(signedTxn: ByteArray): String {
        return "FAKE_TXID_${signedTxn.size}"
    }

    override suspend fun waitForConfirmation(txid: String, rounds: Int): TransactionInfo {
        return TransactionInfo(txid = txid, confirmedRound = currentRound)
    }

    override suspend fun getCurrentRound(): Long = currentRound
}

class BlockchainTest {
    companion object {
        /** A valid Algorand address (58 chars, Base32-encoded 36 bytes). */
        // This is a well-known test address derived from the zero seed.
        const val TEST_ADDRESS = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ"
        const val OTHER_ADDRESS = "7777777777777777777777777777777777777777777777777774MSJUVU"

        fun hexToBytes(hex: String): ByteArray {
            return hex.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
        }

        fun bytesToHex(bytes: ByteArray): String {
            return bytes.joinToString("") { "%02x".format(it) }
        }

        /** Compute an Algorand address from a 32-byte Ed25519 public key. */
        fun algorandAddressFromPublicKey(publicKey: ByteArray): String {
            require(publicKey.size == 32)
            val digest = MessageDigest.getInstance("SHA-512/256")
            val hash = digest.digest(publicKey)
            val checksum = hash.copyOfRange(hash.size - 4, hash.size)
            val addressBytes = publicKey + checksum
            return base32Encode(addressBytes)
        }

        /** Base32 encode (RFC 4648, no padding), accessible to test bodies. */
        fun base32EncodePublic(data: ByteArray): String = base32Encode(data)

        /** Base32 encode (RFC 4648, no padding). */
        private fun base32Encode(data: ByteArray): String {
            val alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
            val sb = StringBuilder()
            var buffer = 0
            var bitsLeft = 0
            for (b in data) {
                buffer = (buffer shl 8) or (b.toInt() and 0xFF)
                bitsLeft += 8
                while (bitsLeft >= 5) {
                    bitsLeft -= 5
                    sb.append(alphabet[(buffer shr bitsLeft) and 0x1F])
                }
            }
            if (bitsLeft > 0) {
                sb.append(alphabet[(buffer shl (5 - bitsLeft)) and 0x1F])
            }
            return sb.toString()
        }

        /** Create a key announcement note (32-byte encryption key). */
        fun makeKeyAnnouncement(encryptionPublicKey: ByteArray): ByteArray {
            return encryptionPublicKey.copyOf()
        }

        /** Create a signed key announcement note (32-byte key + 64-byte signature). */
        fun makeSignedKeyAnnouncement(
            encryptionPublicKey: ByteArray,
            signingKey: Ed25519PrivateKeyParameters
        ): ByteArray {
            val signature = Signature.signEncryptionKey(encryptionPublicKey, signingKey)
            return encryptionPublicKey + signature
        }
    }

    // ========================================================================
    // AlgorandConfig tests
    // ========================================================================

    @Test
    fun `localnet config has correct defaults`() {
        val config = AlgorandConfig.localnet()
        assertEquals("http://localhost:4001", config.algodUrl)
        assertEquals("a".repeat(64), config.algodToken)
        assertEquals("http://localhost:8980", config.indexerUrl)
        assertEquals("a".repeat(64), config.indexerToken)
    }

    @Test
    fun `testnet config has correct defaults`() {
        val config = AlgorandConfig.testnet()
        assertTrue(config.algodUrl.contains("testnet"))
        assertTrue(config.indexerUrl!!.contains("testnet"))
        assertEquals("", config.algodToken)
    }

    @Test
    fun `mainnet config has correct defaults`() {
        val config = AlgorandConfig.mainnet()
        assertTrue(config.algodUrl.contains("mainnet"))
        assertTrue(config.indexerUrl!!.contains("mainnet"))
    }

    @Test
    fun `withIndexer creates copy with new indexer settings`() {
        val config = AlgorandConfig.localnet()
        val updated = config.withIndexer("http://custom:8980", "custom-token")
        assertEquals("http://custom:8980", updated.indexerUrl)
        assertEquals("custom-token", updated.indexerToken)
        // Original algod settings unchanged
        assertEquals(config.algodUrl, updated.algodUrl)
        assertEquals(config.algodToken, updated.algodToken)
    }

    // ========================================================================
    // Data class tests
    // ========================================================================

    @Test
    fun `NoteTransaction equality is based on txid`() {
        val tx1 = NoteTransaction("tx1", "sender", "receiver", byteArrayOf(1), 100, 1000)
        val tx2 = NoteTransaction("tx1", "other", "other", byteArrayOf(2), 200, 2000)
        val tx3 = NoteTransaction("tx2", "sender", "receiver", byteArrayOf(1), 100, 1000)

        assertEquals(tx1, tx2)
        assertEquals(tx1.hashCode(), tx2.hashCode())
        assertTrue(tx1 != tx3)
    }

    @Test
    fun `SuggestedParams equality compares all fields`() {
        val hash1 = ByteArray(32) { 1 }
        val hash2 = ByteArray(32) { 1 }
        val hash3 = ByteArray(32) { 2 }

        val params1 = SuggestedParams(1000, 1000, 100, 200, "testnet-v1.0", hash1)
        val params2 = SuggestedParams(1000, 1000, 100, 200, "testnet-v1.0", hash2)
        val params3 = SuggestedParams(1000, 1000, 100, 200, "testnet-v1.0", hash3)

        assertEquals(params1, params2)
        assertTrue(params1 != params3)
    }

    @Test
    fun `TransactionInfo holds txid and optional round`() {
        val info = TransactionInfo("txid123")
        assertEquals("txid123", info.txid)
        assertNull(info.confirmedRound)

        val confirmed = TransactionInfo("txid456", 42L)
        assertEquals(42L, confirmed.confirmedRound)
    }

    @Test
    fun `AccountInfo holds address and balances`() {
        val info = AccountInfo("ADDR", 5_000_000, 100_000)
        assertEquals("ADDR", info.address)
        assertEquals(5_000_000, info.amount)
        assertEquals(100_000, info.minBalance)
    }

    // ========================================================================
    // discoverEncryptionKey tests (exercises base32Decode + parseKeyAnnouncement)
    // ========================================================================

    @Test
    fun `discoverEncryptionKey returns null when no transactions`() = runTest {
        val indexer = FakeIndexerClient()
        val result = discoverEncryptionKey(indexer, TEST_ADDRESS)
        assertNull(result)
    }

    @Test
    fun `discoverEncryptionKey returns null for non-self-transfer`() = runTest {
        val indexer = FakeIndexerClient()
        val encryptionKey = ByteArray(32) { (it + 1).toByte() }

        // Transaction where sender != receiver (not a self-transfer key announcement)
        indexer.addTransaction(
            NoteTransaction(
                txid = "tx1",
                sender = TEST_ADDRESS,
                receiver = OTHER_ADDRESS,
                note = makeKeyAnnouncement(encryptionKey),
                confirmedRound = 100,
                roundTime = 1000
            )
        )

        val result = discoverEncryptionKey(indexer, TEST_ADDRESS)
        assertNull(result)
    }

    @Test
    fun `discoverEncryptionKey finds unsigned key announcement`() = runTest {
        val indexer = FakeIndexerClient()
        val encryptionKey = ByteArray(32) { (it + 1).toByte() }

        // Self-transfer with 32-byte key in note
        indexer.addTransaction(
            NoteTransaction(
                txid = "tx1",
                sender = TEST_ADDRESS,
                receiver = TEST_ADDRESS,
                note = makeKeyAnnouncement(encryptionKey),
                confirmedRound = 100,
                roundTime = 1000
            )
        )

        val result = discoverEncryptionKey(indexer, TEST_ADDRESS)
        assertNotNull(result)
        assertTrue(result.publicKey.contentEquals(encryptionKey))
        // Unsigned key is not verified
        assertEquals(false, result.isVerified)
        assertEquals(TEST_ADDRESS, result.address)
        assertEquals("tx1", result.discoveredInTx)
        assertEquals(100L, result.discoveredAtRound)
    }

    @Test
    fun `discoverEncryptionKey finds signed and verified key announcement`() = runTest {
        val indexer = FakeIndexerClient()

        // Derive a real Ed25519 key pair from seed
        val seed = ByteArray(32)
        val ed25519Private = Ed25519PrivateKeyParameters(seed, 0)
        val ed25519Public = ed25519Private.generatePublicKey().encoded

        // Compute the correct Algorand address from this Ed25519 public key
        // Address = Base32(pubkey + checksum), where checksum = last 4 bytes of SHA-512/256(pubkey)
        val address = algorandAddressFromPublicKey(ed25519Public)

        // Derive an encryption key
        val encryptionKeys = Keys.deriveKeysFromSeed(seed)
        val encryptionPubBytes = Keys.publicKeyToBytes(encryptionKeys.publicKey)

        // Create a signed key announcement
        val signedNote = makeSignedKeyAnnouncement(encryptionPubBytes, ed25519Private)
        assertEquals(96, signedNote.size) // 32 key + 64 signature

        indexer.addTransaction(
            NoteTransaction(
                txid = "tx_signed",
                sender = address,
                receiver = address,
                note = signedNote,
                confirmedRound = 200,
                roundTime = 2000
            )
        )

        val result = discoverEncryptionKey(indexer, address)
        assertNotNull(result)
        assertTrue(result.publicKey.contentEquals(encryptionPubBytes))
        assertTrue(result.isVerified)
        assertEquals("tx_signed", result.discoveredInTx)
    }

    @Test
    fun `discoverEncryptionKey returns null for note shorter than 32 bytes`() = runTest {
        val indexer = FakeIndexerClient()

        indexer.addTransaction(
            NoteTransaction(
                txid = "tx_short",
                sender = TEST_ADDRESS,
                receiver = TEST_ADDRESS,
                note = ByteArray(16), // Too short
                confirmedRound = 100,
                roundTime = 1000
            )
        )

        val result = discoverEncryptionKey(indexer, TEST_ADDRESS)
        assertNull(result)
    }

    @Test
    fun `discoverEncryptionKey returns first valid announcement`() = runTest {
        val indexer = FakeIndexerClient()
        val key1 = ByteArray(32) { 0x01 }
        val key2 = ByteArray(32) { 0x02 }

        // First transaction: valid key announcement
        indexer.addTransaction(
            NoteTransaction(
                txid = "tx_first",
                sender = TEST_ADDRESS,
                receiver = TEST_ADDRESS,
                note = makeKeyAnnouncement(key1),
                confirmedRound = 100,
                roundTime = 1000
            )
        )

        // Second transaction: also valid
        indexer.addTransaction(
            NoteTransaction(
                txid = "tx_second",
                sender = TEST_ADDRESS,
                receiver = TEST_ADDRESS,
                note = makeKeyAnnouncement(key2),
                confirmedRound = 200,
                roundTime = 2000
            )
        )

        val result = discoverEncryptionKey(indexer, TEST_ADDRESS)
        assertNotNull(result)
        assertTrue(result.publicKey.contentEquals(key1))
        assertEquals("tx_first", result.discoveredInTx)
    }

    @Test
    fun `discoverEncryptionKey rejects verification when address checksum is invalid`() = runTest {
        val indexer = FakeIndexerClient()

        // Derive a real Ed25519 key pair from seed.
        val seed = ByteArray(32) { 0x09 }
        val ed25519Private = Ed25519PrivateKeyParameters(seed, 0)
        val ed25519Public = ed25519Private.generatePublicKey().encoded

        // Build an address with the correct public key but a deliberately wrong checksum.
        val badChecksum = ByteArray(4) { 0x00 }
        val badAddressBytes = ed25519Public + badChecksum
        val badAddress = base32EncodePublic(badAddressBytes)

        val encryptionKeys = Keys.deriveKeysFromSeed(seed)
        val encryptionPubBytes = Keys.publicKeyToBytes(encryptionKeys.publicKey)

        // Sign correctly, but the address checksum is invalid, so decode must fail
        // and the key must be reported as unverified rather than trusted.
        val signedNote = makeSignedKeyAnnouncement(encryptionPubBytes, ed25519Private)

        indexer.addTransaction(
            NoteTransaction(
                txid = "tx_bad_checksum",
                sender = badAddress,
                receiver = badAddress,
                note = signedNote,
                confirmedRound = 100,
                roundTime = 1000
            )
        )

        val result = discoverEncryptionKey(indexer, badAddress)
        assertNotNull(result)
        assertTrue(result.publicKey.contentEquals(encryptionPubBytes))
        assertEquals(false, result.isVerified)
    }

    @Test
    fun `discoverEncryptionKey with invalid signature returns unverified key`() = runTest {
        val indexer = FakeIndexerClient()
        val encryptionKey = ByteArray(32) { (it + 1).toByte() }
        val fakeSignature = ByteArray(64) { 0xFF.toByte() } // Invalid signature

        indexer.addTransaction(
            NoteTransaction(
                txid = "tx_bad_sig",
                sender = TEST_ADDRESS,
                receiver = TEST_ADDRESS,
                note = encryptionKey + fakeSignature,
                confirmedRound = 100,
                roundTime = 1000
            )
        )

        val result = discoverEncryptionKey(indexer, TEST_ADDRESS)
        assertNotNull(result)
        assertTrue(result.publicKey.contentEquals(encryptionKey))
        assertEquals(false, result.isVerified) // Invalid signature = not verified
    }

    @Test
    fun `discoverEncryptionKey skips transactions from other senders`() = runTest {
        val indexer = FakeIndexerClient()
        val encryptionKey = ByteArray(32) { 0x42 }

        // Transaction where sender is someone else, but returned in search results
        indexer.addTransaction(
            NoteTransaction(
                txid = "tx_other",
                sender = OTHER_ADDRESS,
                receiver = TEST_ADDRESS,
                note = makeKeyAnnouncement(encryptionKey),
                confirmedRound = 100,
                roundTime = 1000
            )
        )

        val result = discoverEncryptionKey(indexer, TEST_ADDRESS)
        assertNull(result) // Skipped because sender != address
    }

    // ========================================================================
    // FakeAlgodClient tests
    // ========================================================================

    @Test
    fun `FakeAlgodClient returns expected values`() = runTest {
        val algod = FakeAlgodClient(currentRound = 5000)

        val params = algod.getSuggestedParams()
        assertEquals(1000, params.fee)
        assertEquals(5000, algod.getCurrentRound())

        val info = algod.getAccountInfo("SOME_ADDR")
        assertEquals("SOME_ADDR", info.address)
        assertTrue(info.amount > 0)
    }

    // ========================================================================
    // FakeIndexerClient tests
    // ========================================================================

    @Test
    fun `FakeIndexerClient searchTransactions filters by address`() = runTest {
        val indexer = FakeIndexerClient()
        indexer.addTransaction(
            NoteTransaction("tx1", "ALICE", "BOB", byteArrayOf(), 100, 1000)
        )
        indexer.addTransaction(
            NoteTransaction("tx2", "BOB", "CHARLIE", byteArrayOf(), 200, 2000)
        )

        val aliceTxs = indexer.searchTransactions("ALICE")
        assertEquals(1, aliceTxs.size)
        assertEquals("tx1", aliceTxs[0].txid)

        val bobTxs = indexer.searchTransactions("BOB")
        assertEquals(2, bobTxs.size)
    }

    @Test
    fun `FakeIndexerClient searchTransactionsBetween filters correctly`() = runTest {
        val indexer = FakeIndexerClient()
        indexer.addTransaction(
            NoteTransaction("tx1", "ALICE", "BOB", byteArrayOf(), 100, 1000)
        )
        indexer.addTransaction(
            NoteTransaction("tx2", "BOB", "CHARLIE", byteArrayOf(), 200, 2000)
        )

        val txs = indexer.searchTransactionsBetween("ALICE", "BOB")
        assertEquals(1, txs.size)
        assertEquals("tx1", txs[0].txid)
    }
}
