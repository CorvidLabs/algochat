package com.corvidlabs.algochat

import kotlinx.coroutines.test.runTest
import org.bouncycastle.crypto.params.Ed25519PrivateKeyParameters
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.io.File
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Protocol 1.3.0 against the TypeScript fixture in vectors/pq-mlkem768.json.
 */
class PQTest {
    @Test
    fun `mlkem encapsulation key and shared secret match the fixture`() {
        val kem = PQ.deriveMLKEMKeyPair(seed(0x22))
        assertEquals(PQProtocol.MLKEM_EK_SIZE, kem.encapsKey.size)
        assertEquals(fixture.encapsKey, hex(kem.encapsKey))

        val secret = PQ.decapsulate(unhex(fixture.ciphertext), kem)
        assertEquals(fixture.sharedSecret, hex(secret))

        val encapsulated = PQ.encapsulate(kem.encapsKey, seed(0x33))
        assertEquals(fixture.ciphertext, hex(encapsulated.ciphertext))
        assertEquals(fixture.sharedSecret, hex(encapsulated.sharedSecret))
    }

    @Test
    fun `hybrid combiner is pinned and binds the ciphertext`() {
        val ek = PQ.deriveMLKEMKeyPair(seed(0x22)).encapsKey
        val ciphertext = ByteArray(PQProtocol.MLKEM_CT_SIZE) { 2 }
        val key = PQ.deriveHybridPQKey(
            ByteArray(32) { 5 },
            ByteArray(32) { 6 },
            ByteArray(32) { 1 },
            ciphertext,
            ByteArray(32) { 3 },
            ByteArray(32) { 4 },
            ek
        )
        assertEquals(fixture.combiner, hex(key))
        assertEquals(
            "9b393e8cec553ada4821c1fa04b40bf499446b19ca9218fd8dcf8b705e06d734",
            hex(key)
        )

        val flipped = ciphertext.copyOf()
        flipped[0] = (flipped[0].toInt() xor 1).toByte()
        val other = PQ.deriveHybridPQKey(
            ByteArray(32) { 5 },
            ByteArray(32) { 6 },
            ByteArray(32) { 1 },
            flipped,
            ByteArray(32) { 3 },
            ByteArray(32) { 4 },
            ek
        )
        assertFalse(key.contentEquals(other))
    }

    @Test
    fun `bob accepts a handshake alice built and alice reopens it`() {
        assertEquals(2366, PQProtocol.HANDSHAKE_SIZE)
        val alice = Keys.deriveKeysFromSeed(seed(0x11))
        val bob = Keys.deriveKeysFromSeed(seed(0x22))
        val aliceKem = PQ.deriveMLKEMKeyPair(seed(0x11))
        val bobKem = PQ.deriveMLKEMKeyPair(seed(0x22))
        val started = PQ.initiatePQSession(
            alice,
            Keys.publicKeyToBytes(bob.publicKey),
            bobKem.encapsKey,
            aliceKem.encapsKey
        )
        val note = started.note
        assertEquals(PQProtocol.HANDSHAKE_SIZE, note.size)
        assertEquals(PQProtocol.VERSION, note[0])
        assertEquals(PQProtocol.HANDSHAKE_ID, note[1])
        assertTrue(PQ.isPQHandshake(note))
        assertFalse(isChatMessage(note))
        assertFalse(isPSKMessage(note))

        val session = PQ.acceptPQSession(note, bob, bobKem)
        assertTrue(session.sessionKey.contentEquals(started.session.sessionKey))

        val reopened = PQ.openPQSessionAsSender(note, alice, aliceKem)
        assertTrue(reopened.sessionKey.contentEquals(session.sessionKey))
        assertTrue(reopened.handshakeId.contentEquals(session.handshakeId))

        assertThrows<AlgoChatException.DecryptionFailed> {
            PQ.acceptPQSession(note, alice, bobKem)
        }
        assertThrows<AlgoChatException.DecryptionFailed> {
            PQ.openPQSessionAsSender(note, bob, bobKem)
        }
        assertThrows<AlgoChatException.DecryptionFailed> {
            PQ.openPQSessionAsSender(note, alice, bobKem)
        }
    }

    @Test
    fun `a message round-trips and a flipped byte fails closed`() {
        val alice = Keys.deriveKeysFromSeed(seed(0x11))
        val bob = Keys.deriveKeysFromSeed(seed(0x22))
        val aliceKem = PQ.deriveMLKEMKeyPair(seed(0x11))
        val bobKem = PQ.deriveMLKEMKeyPair(seed(0x22))
        val started = PQ.initiatePQSession(
            alice,
            Keys.publicKeyToBytes(bob.publicKey),
            bobKem.encapsKey,
            aliceKem.encapsKey
        )
        val session = PQ.acceptPQSession(started.note, bob, bobKem)
        val reopened = PQ.openPQSessionAsSender(started.note, alice, aliceKem)

        val message = PQ.encryptPQMessage("parity", session)
        assertEquals(PQProtocol.DATA_HEADER_SIZE, 78)
        assertEquals(PQProtocol.VERSION, message[0])
        assertEquals(PQProtocol.DATA_ID, message[1])
        assertTrue(PQ.isPQMessage(message))
        assertFalse(isChatMessage(message))
        assertFalse(isPSKMessage(message))
        assertEquals("parity", PQ.decryptPQMessage(message, reopened))
        assertEquals("parity", PQ.decryptPQMessage(message, session))

        val three = PQ.encryptPQMessage("abc", session)
        assertEquals(97, three.size)
        assertEquals("abc", PQ.decryptPQMessage(three, session))

        val tampered = message.copyOf()
        val last = tampered.lastIndex
        tampered[last] = (tampered[last].toInt() xor 1).toByte()
        assertThrows<AlgoChatException.DecryptionFailed> {
            PQ.decryptPQMessage(tampered, session)
        }
        val body = message.copyOf()
        body[PQProtocol.DATA_HEADER_SIZE] = (body[PQProtocol.DATA_HEADER_SIZE].toInt() xor 1).toByte()
        assertThrows<AlgoChatException.DecryptionFailed> {
            PQ.decryptPQMessage(body, session)
        }
    }

    @Test
    fun `plaintext budget is 4002 bytes and the handshake both sides share`() {
        assertEquals(4002, PQProtocol.MAX_PAYLOAD_SIZE)
        val alice = Keys.deriveKeysFromSeed(seed(0x11))
        val bobSeed = seed(0x22)
        val bob = Keys.deriveKeysFromSeed(bobSeed)
        val bobKem = PQ.deriveMLKEMKeyPair(bobSeed)
        val aliceKem = PQ.deriveMLKEMKeyPair(seed(0x11))
        val started = PQ.initiatePQSession(
            alice,
            Keys.publicKeyToBytes(bob.publicKey),
            bobKem.encapsKey,
            aliceKem.encapsKey,
            seed(0x33)
        )
        assertEquals(PQProtocol.HANDSHAKE_SIZE, started.note.size)
        assertEquals(PQProtocol.VERSION, started.note[0])
        assertEquals(PQProtocol.HANDSHAKE_ID, started.note[1])
        assertTrue(started.note.size <= Protocol.MAX_NOTE_SIZE)

        val accepted = PQ.acceptPQSession(started.note, bob, bobKem)
        assertTrue(accepted.sessionKey.contentEquals(started.session.sessionKey))
        val reopened = PQ.openPQSessionAsSender(started.note, alice, aliceKem)
        assertTrue(reopened.sessionKey.contentEquals(started.session.sessionKey))

        val full = "x".repeat(PQProtocol.MAX_PAYLOAD_SIZE)
        val fullNote = PQ.encryptPQMessage(full, started.session)
        assertEquals(Protocol.MAX_NOTE_SIZE, fullNote.size)
        assertEquals(full, PQ.decryptPQMessage(fullNote, accepted))
        assertThrows<AlgoChatException.EncryptionFailed> {
            PQ.encryptPQMessage("x".repeat(PQProtocol.MAX_PAYLOAD_SIZE + 1), started.session)
        }
    }

    @Test
    fun `an ACPQ announcement is not an X25519 key`() = runTest {
        val kem = PQ.deriveMLKEMKeyPair(seed(0x22))
        val signingKey = Ed25519PrivateKeyParameters(ByteArray(32) { 7 }, 0)
        val verifyingKey = signingKey.generatePublicKey().encoded

        val signed = PQ.encodePQKeyAnnouncement(kem.encapsKey, signingKey)
        assertTrue(signed.size <= Protocol.MAX_NOTE_SIZE)
        val parsed = PQ.parsePQKeyAnnouncement(signed, verifyingKey)
        assertNotNull(parsed)
        assertTrue(parsed.isVerified)
        assertTrue(parsed.encapsKey.contentEquals(kem.encapsKey))

        val unsigned = PQ.encodePQKeyAnnouncement(kem.encapsKey)
        assertEquals(PQProtocol.ANNOUNCE_UNSIGNED_SIZE, unsigned.size)
        val unverified = PQ.parsePQKeyAnnouncement(unsigned)
        assertNotNull(unverified)
        assertFalse(unverified.isVerified)

        val bad = signed.copyOf()
        val last = bad.lastIndex
        bad[last] = (bad[last].toInt() xor 1).toByte()
        assertNull(PQ.parsePQKeyAnnouncement(bad, verifyingKey))
        assertTrue(PQ.isPQKeyAnnouncement(bad))
        assertFalse(isChatMessage(unsigned))
        assertFalse(isPSKMessage(unsigned))

        val x25519 = ByteArray(32) { (it + 1).toByte() }
        val indexer = FakeIndexerClient()
        indexer.addTransaction(
            NoteTransaction(
                txid = "pq_announce",
                sender = BlockchainTest.TEST_ADDRESS,
                receiver = BlockchainTest.TEST_ADDRESS,
                note = unsigned,
                confirmedRound = 100,
                roundTime = 1000
            )
        )
        indexer.addTransaction(
            NoteTransaction(
                txid = "x25519_announce",
                sender = BlockchainTest.TEST_ADDRESS,
                receiver = BlockchainTest.TEST_ADDRESS,
                note = x25519,
                confirmedRound = 200,
                roundTime = 2000
            )
        )

        val discovered = discoverEncryptionKey(indexer, BlockchainTest.TEST_ADDRESS)
        assertNotNull(discovered)
        assertTrue(discovered.publicKey.contentEquals(x25519))
        assertEquals("x25519_announce", discovered.discoveredInTx)

        val onlyPq = FakeIndexerClient()
        onlyPq.addTransaction(
            NoteTransaction(
                txid = "pq_only",
                sender = BlockchainTest.TEST_ADDRESS,
                receiver = BlockchainTest.TEST_ADDRESS,
                note = signed,
                confirmedRound = 100,
                roundTime = 1000
            )
        )
        assertNull(discoverEncryptionKey(onlyPq, BlockchainTest.TEST_ADDRESS))
    }

    private class Fixture(
        val encapsKey: String,
        val ciphertext: String,
        val sharedSecret: String,
        val combiner: String,
        val handshakeNote: String,
        val handshakeSessionKey: String
    )

    companion object {
        private val fixture = loadFixture()

        private fun loadFixture(): Fixture {
            val dir = File(System.getProperty("user.dir"))
            val file = listOf(
                File(dir, "../vectors/pq-mlkem768.json"),
                File(dir, "vectors/pq-mlkem768.json")
            ).firstOrNull { it.isFile } ?: error("pq-mlkem768.json not found from $dir")
            val text = file.readText()
            return Fixture(
                encapsKey = jsonHex(text, "encaps_key"),
                ciphertext = jsonHex(text, "ciphertext"),
                sharedSecret = jsonHex(text, "mlkem_shared_secret"),
                combiner = jsonHex(text, "combiner_session_key"),
                handshakeNote = jsonHex(text, "handshake_note"),
                handshakeSessionKey = jsonHex(text, "handshake_session_key")
            )
        }

        private fun jsonHex(text: String, key: String): String {
            val marker = "\"$key\""
            val keyAt = text.indexOf(marker)
            if (keyAt < 0) error("missing $key")
            val colon = text.indexOf(':', keyAt + marker.length)
            val open = text.indexOf('"', colon + 1)
            val close = text.indexOf('"', open + 1)
            return text.substring(open + 1, close)
        }

        private fun seed(value: Int): ByteArray = ByteArray(32) { value.toByte() }

        private fun unhex(hex: String): ByteArray {
            return hex.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
        }

        private fun hex(bytes: ByteArray): String {
            return bytes.joinToString("") { "%02x".format(it) }
        }
    }
}
