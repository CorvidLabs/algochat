package com.corvidlabs.algochat

import kotlinx.coroutines.test.runTest
import org.bouncycastle.crypto.params.Ed25519PrivateKeyParameters
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.security.MessageDigest
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class AlgoChatClientTest {
    companion object {
        val ALICE_SEED = ByteArray(32) { 0x01 }
        val BOB_SEED = ByteArray(32) { 0x02 }
        const val ALICE_ADDRESS = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ"
        const val BOB_ADDRESS = "7777777777777777777777777777777777777777777777777774MSJUVU"

        /** Compute an Algorand address from a 32-byte Ed25519 public key. */
        fun algorandAddressFromPublicKey(publicKey: ByteArray): String {
            require(publicKey.size == 32)
            val hash = MessageDigest.getInstance("SHA-512/256").digest(publicKey)
            val checksum = hash.copyOfRange(hash.size - 4, hash.size)
            return base32Encode(publicKey + checksum)
        }

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

        fun createClient(
            seed: ByteArray = ALICE_SEED,
            address: String = ALICE_ADDRESS,
            algod: AlgodClient = FakeAlgodClient(),
            indexer: IndexerClient = FakeIndexerClient()
        ) = runTest {
            AlgoChatClient.fromSeed(
                seed = seed,
                address = address,
                config = AlgoChatConfig.localnet(),
                algod = algod,
                indexer = indexer
            )
        }
    }

    // ========================================================================
    // fromSeed / construction
    // ========================================================================

    @Test
    fun `fromSeed creates client with correct address`() = runTest {
        val client = AlgoChatClient.fromSeed(
            seed = ALICE_SEED,
            address = ALICE_ADDRESS,
            config = AlgoChatConfig.localnet(),
            algod = FakeAlgodClient(),
            indexer = FakeIndexerClient()
        )

        assertEquals(ALICE_ADDRESS, client.address)
        assertEquals(32, client.encryptionPublicKey.size)
    }

    @Test
    fun `fromSeed with invalid seed length throws`() = runTest {
        assertThrows<IllegalArgumentException> {
            AlgoChatClient.fromSeed(
                seed = ByteArray(16), // Wrong length
                address = ALICE_ADDRESS,
                config = AlgoChatConfig.localnet(),
                algod = FakeAlgodClient(),
                indexer = FakeIndexerClient()
            )
        }
    }

    @Test
    fun `fromSeed produces deterministic encryption keys`() = runTest {
        val client1 = AlgoChatClient.fromSeed(
            seed = ALICE_SEED,
            address = ALICE_ADDRESS,
            config = AlgoChatConfig.localnet(),
            algod = FakeAlgodClient(),
            indexer = FakeIndexerClient()
        )
        val client2 = AlgoChatClient.fromSeed(
            seed = ALICE_SEED,
            address = ALICE_ADDRESS,
            config = AlgoChatConfig.localnet(),
            algod = FakeAlgodClient(),
            indexer = FakeIndexerClient()
        )

        assertTrue(client1.encryptionPublicKey.contentEquals(client2.encryptionPublicKey))
    }

    // ========================================================================
    // encrypt / decrypt
    // ========================================================================

    @Test
    fun `encrypt and decrypt roundtrip between two clients`() = runTest {
        val alice = AlgoChatClient.fromSeed(
            seed = ALICE_SEED,
            address = ALICE_ADDRESS,
            config = AlgoChatConfig.localnet(),
            algod = FakeAlgodClient(),
            indexer = FakeIndexerClient()
        )
        val bob = AlgoChatClient.fromSeed(
            seed = BOB_SEED,
            address = BOB_ADDRESS,
            config = AlgoChatConfig.localnet(),
            algod = FakeAlgodClient(),
            indexer = FakeIndexerClient()
        )

        val message = "Hello from Alice to Bob!"
        val encrypted = alice.encrypt(message, bob.encryptionPublicKey)

        // Bob decrypts
        val decrypted = bob.decrypt(encrypted, alice.encryptionPublicKey)
        assertEquals(message, decrypted)
    }

    @Test
    fun `sender can decrypt own encrypted message`() = runTest {
        val alice = AlgoChatClient.fromSeed(
            seed = ALICE_SEED,
            address = ALICE_ADDRESS,
            config = AlgoChatConfig.localnet(),
            algod = FakeAlgodClient(),
            indexer = FakeIndexerClient()
        )
        val bob = AlgoChatClient.fromSeed(
            seed = BOB_SEED,
            address = BOB_ADDRESS,
            config = AlgoChatConfig.localnet(),
            algod = FakeAlgodClient(),
            indexer = FakeIndexerClient()
        )

        val message = "I sent this"
        val encrypted = alice.encrypt(message, bob.encryptionPublicKey)

        // Alice decrypts her own message (bidirectional)
        val decrypted = alice.decryptFull(encrypted)
        assertEquals(message, decrypted.text)
    }

    @Test
    fun `decryptFull with non-chat bytes throws InvalidEnvelope`() = runTest {
        val client = AlgoChatClient.fromSeed(
            seed = ALICE_SEED,
            address = ALICE_ADDRESS,
            config = AlgoChatConfig.localnet(),
            algod = FakeAlgodClient(),
            indexer = FakeIndexerClient()
        )

        assertThrows<AlgoChatException.InvalidEnvelope> {
            client.decryptFull(byteArrayOf(0x00, 0x00, 0x00))
        }
    }

    // ========================================================================
    // conversation management
    // ========================================================================

    @Test
    fun `conversation creates and retrieves by participant`() = runTest {
        val client = AlgoChatClient.fromSeed(
            seed = ALICE_SEED,
            address = ALICE_ADDRESS,
            config = AlgoChatConfig.localnet(),
            algod = FakeAlgodClient(),
            indexer = FakeIndexerClient()
        )

        val conv = client.conversation(BOB_ADDRESS)
        assertEquals(BOB_ADDRESS, conv.participant)
        assertTrue(conv.isEmpty)

        // Same participant returns same conversation
        val conv2 = client.conversation(BOB_ADDRESS)
        assertTrue(conv === conv2) // Same reference
    }

    @Test
    fun `conversations returns all created conversations`() = runTest {
        val client = AlgoChatClient.fromSeed(
            seed = ALICE_SEED,
            address = ALICE_ADDRESS,
            config = AlgoChatConfig.localnet(),
            algod = FakeAlgodClient(),
            indexer = FakeIndexerClient()
        )

        assertEquals(0, client.conversations().size)

        client.conversation(BOB_ADDRESS)
        client.conversation("CHARLIE")

        assertEquals(2, client.conversations().size)
    }

    // ========================================================================
    // processTransaction
    // ========================================================================

    @Test
    fun `processTransaction returns null for non-chat transaction`() = runTest {
        val client = AlgoChatClient.fromSeed(
            seed = ALICE_SEED,
            address = ALICE_ADDRESS,
            config = AlgoChatConfig.localnet(),
            algod = FakeAlgodClient(),
            indexer = FakeIndexerClient()
        )

        val tx = NoteTransaction(
            txid = "tx1",
            sender = ALICE_ADDRESS,
            receiver = BOB_ADDRESS,
            note = byteArrayOf(0x00, 0x00), // Not a chat message
            confirmedRound = 100,
            roundTime = 1000
        )

        val result = client.processTransaction(tx)
        assertNull(result)
    }

    @Test
    fun `processTransaction returns null for unrelated transaction`() = runTest {
        val client = AlgoChatClient.fromSeed(
            seed = ALICE_SEED,
            address = ALICE_ADDRESS,
            config = AlgoChatConfig.localnet(),
            algod = FakeAlgodClient(),
            indexer = FakeIndexerClient()
        )

        // Create a valid encrypted message between two OTHER parties
        val charlieKeys = Keys.deriveKeysFromSeed(ByteArray(32) { 0x03 })
        val daveKeys = Keys.deriveKeysFromSeed(ByteArray(32) { 0x04 })
        val envelope = Crypto.encryptMessage(
            "hello",
            charlieKeys.privateKey,
            charlieKeys.publicKey,
            daveKeys.publicKey
        )

        val tx = NoteTransaction(
            txid = "tx2",
            sender = "CHARLIE",
            receiver = "DAVE",
            note = envelope.encode(),
            confirmedRound = 100,
            roundTime = 1000
        )

        val result = client.processTransaction(tx)
        assertNull(result) // Neither sender nor receiver is our address
    }

    @Test
    fun `processTransaction decrypts received message and creates conversation`() = runTest {
        // Received messages require a cryptographically verified sender key, so
        // Bob announces a key signed by the Ed25519 key matching his address.
        val bobKeys = Keys.deriveKeysFromSeed(BOB_SEED)
        val bobPubBytes = Keys.publicKeyToBytes(bobKeys.publicKey)
        val bobEd25519 = Ed25519PrivateKeyParameters(BOB_SEED, 0)
        val bobRealAddress = algorandAddressFromPublicKey(bobEd25519.generatePublicKey().encoded)
        val bobSignedNote = bobPubBytes + Signature.signEncryptionKey(bobPubBytes, bobEd25519)

        val indexer = FakeIndexerClient()
        indexer.addTransaction(
            NoteTransaction(
                txid = "bob_key_announce",
                sender = bobRealAddress,
                receiver = bobRealAddress,
                note = bobSignedNote, // Signed key announcement (verifiable)
                confirmedRound = 50,
                roundTime = 500
            )
        )

        val alice = AlgoChatClient.fromSeed(
            seed = ALICE_SEED,
            address = ALICE_ADDRESS,
            config = AlgoChatConfig.localnet(),
            algod = FakeAlgodClient(),
            indexer = indexer
        )

        // Bob encrypts a message to Alice
        val alicePubBytes = alice.encryptionPublicKey
        val envelope = Crypto.encryptMessage(
            "Hello Alice!",
            bobKeys.privateKey,
            bobKeys.publicKey,
            Keys.publicKeyFromBytes(alicePubBytes)
        )

        val tx = NoteTransaction(
            txid = "tx_msg",
            sender = bobRealAddress,
            receiver = ALICE_ADDRESS,
            note = envelope.encode(),
            confirmedRound = 100,
            roundTime = 1000
        )

        val msg = alice.processTransaction(tx)
        assertNotNull(msg)
        assertEquals("Hello Alice!", msg.content)
        assertEquals(bobRealAddress, msg.sender)
        assertEquals(ALICE_ADDRESS, msg.recipient)
        assertEquals(MessageDirection.RECEIVED, msg.direction)
        assertEquals("tx_msg", msg.id)
        assertEquals(100L, msg.confirmedRound)

        // Conversation was auto-created
        val conversations = alice.conversations()
        assertEquals(1, conversations.size)
        assertEquals(bobRealAddress, conversations[0].participant)
        assertEquals(1, conversations[0].messageCount)
    }

    @Test
    fun `processTransaction rejects received message with unverified sender key`() = runTest {
        // Bob announces an UNSIGNED key. Received messages must be rejected because
        // the sender key cannot be verified (key substitution defense).
        val bobKeys = Keys.deriveKeysFromSeed(BOB_SEED)
        val bobPubBytes = Keys.publicKeyToBytes(bobKeys.publicKey)
        val indexer = FakeIndexerClient()
        indexer.addTransaction(
            NoteTransaction(
                txid = "bob_key_announce",
                sender = BOB_ADDRESS,
                receiver = BOB_ADDRESS,
                note = bobPubBytes, // Unsigned key announcement
                confirmedRound = 50,
                roundTime = 500
            )
        )

        val alice = AlgoChatClient.fromSeed(
            seed = ALICE_SEED,
            address = ALICE_ADDRESS,
            config = AlgoChatConfig.localnet(),
            algod = FakeAlgodClient(),
            indexer = indexer
        )

        val alicePubBytes = alice.encryptionPublicKey
        val envelope = Crypto.encryptMessage(
            "Hello Alice!",
            bobKeys.privateKey,
            bobKeys.publicKey,
            Keys.publicKeyFromBytes(alicePubBytes)
        )

        val tx = NoteTransaction(
            txid = "tx_msg",
            sender = BOB_ADDRESS,
            receiver = ALICE_ADDRESS,
            note = envelope.encode(),
            confirmedRound = 100,
            roundTime = 1000
        )

        assertThrows<AlgoChatException.UnverifiedKey> {
            alice.processTransaction(tx)
        }
    }

    @Test
    fun `processTransaction handles sent message direction`() = runTest {
        // Alice sends a message to Bob; we process it from Alice's perspective
        val bobKeys = Keys.deriveKeysFromSeed(BOB_SEED)
        val bobPubBytes = Keys.publicKeyToBytes(bobKeys.publicKey)
        val indexer = FakeIndexerClient()
        indexer.addTransaction(
            NoteTransaction(
                txid = "bob_key_announce",
                sender = BOB_ADDRESS,
                receiver = BOB_ADDRESS,
                note = bobPubBytes,
                confirmedRound = 50,
                roundTime = 500
            )
        )

        val alice = AlgoChatClient.fromSeed(
            seed = ALICE_SEED,
            address = ALICE_ADDRESS,
            config = AlgoChatConfig.localnet(),
            algod = FakeAlgodClient(),
            indexer = indexer
        )

        // Alice encrypts to Bob
        val encrypted = alice.encrypt("From Alice", bobPubBytes)

        val tx = NoteTransaction(
            txid = "tx_sent",
            sender = ALICE_ADDRESS,
            receiver = BOB_ADDRESS,
            note = encrypted,
            confirmedRound = 100,
            roundTime = 1000
        )

        val msg = alice.processTransaction(tx)
        assertNotNull(msg)
        assertEquals("From Alice", msg.content)
        assertEquals(MessageDirection.SENT, msg.direction)
    }

    // ========================================================================
    // discoverKey
    // ========================================================================

    @Test
    fun `discoverKey finds published key via indexer`() = runTest {
        val bobKeys = Keys.deriveKeysFromSeed(BOB_SEED)
        val bobPubBytes = Keys.publicKeyToBytes(bobKeys.publicKey)
        val indexer = FakeIndexerClient()
        indexer.addTransaction(
            NoteTransaction(
                txid = "key_tx",
                sender = BOB_ADDRESS,
                receiver = BOB_ADDRESS,
                note = bobPubBytes,
                confirmedRound = 50,
                roundTime = 500
            )
        )

        val client = AlgoChatClient.fromSeed(
            seed = ALICE_SEED,
            address = ALICE_ADDRESS,
            config = AlgoChatConfig.localnet(),
            algod = FakeAlgodClient(),
            indexer = indexer
        )

        val key = client.discoverKey(BOB_ADDRESS)
        assertNotNull(key)
        assertTrue(key.publicKey.contentEquals(bobPubBytes))
    }

    @Test
    fun `discoverKey returns null when no key published`() = runTest {
        val client = AlgoChatClient.fromSeed(
            seed = ALICE_SEED,
            address = ALICE_ADDRESS,
            config = AlgoChatConfig.localnet(),
            algod = FakeAlgodClient(),
            indexer = FakeIndexerClient()
        )

        val key = client.discoverKey(BOB_ADDRESS)
        assertNull(key)
    }

    @Test
    fun `discoverKey caches result for subsequent calls`() = runTest {
        val bobKeys = Keys.deriveKeysFromSeed(BOB_SEED)
        val bobPubBytes = Keys.publicKeyToBytes(bobKeys.publicKey)
        val indexer = FakeIndexerClient()
        indexer.addTransaction(
            NoteTransaction(
                txid = "key_tx",
                sender = BOB_ADDRESS,
                receiver = BOB_ADDRESS,
                note = bobPubBytes,
                confirmedRound = 50,
                roundTime = 500
            )
        )

        val client = AlgoChatClient.fromSeed(
            seed = ALICE_SEED,
            address = ALICE_ADDRESS,
            config = AlgoChatConfig.localnet(),
            algod = FakeAlgodClient(),
            indexer = indexer
        )

        // First call discovers via indexer
        val key1 = client.discoverKey(BOB_ADDRESS)
        assertNotNull(key1)

        // Second call should use cache (even if indexer is empty, it would still work)
        val key2 = client.discoverKey(BOB_ADDRESS)
        assertNotNull(key2)
        assertTrue(key1.publicKey.contentEquals(key2.publicKey))
    }

    // ========================================================================
    // sync
    // ========================================================================

    @Test
    fun `sync returns empty list when no messages`() = runTest {
        val client = AlgoChatClient.fromSeed(
            seed = ALICE_SEED,
            address = ALICE_ADDRESS,
            config = AlgoChatConfig.localnet(),
            algod = FakeAlgodClient(),
            indexer = FakeIndexerClient()
        )

        val messages = client.sync()
        assertTrue(messages.isEmpty())
    }

    // ========================================================================
    // sendQueue / messageCache / publicKeyCache accessors
    // ========================================================================

    @Test
    fun `accessors return non-null instances`() = runTest {
        val client = AlgoChatClient.fromSeed(
            seed = ALICE_SEED,
            address = ALICE_ADDRESS,
            config = AlgoChatConfig.localnet(),
            algod = FakeAlgodClient(),
            indexer = FakeIndexerClient()
        )

        assertNotNull(client.sendQueue())
        assertNotNull(client.messageCache())
        assertNotNull(client.publicKeyCache())
    }

    // ========================================================================
    // AlgoChatConfig
    // ========================================================================

    @Test
    fun `AlgoChatConfig convenience constructors`() {
        val localnet = AlgoChatConfig.localnet()
        assertTrue(localnet.autoDiscoverKeys)
        assertTrue(localnet.cachePublicKeys)
        assertTrue(localnet.cacheMessages)
        assertEquals("http://localhost:4001", localnet.network.algodUrl)

        val testnet = AlgoChatConfig.testnet()
        assertTrue(testnet.network.algodUrl.contains("testnet"))

        val mainnet = AlgoChatConfig.mainnet()
        assertTrue(mainnet.network.algodUrl.contains("mainnet"))
    }
}
