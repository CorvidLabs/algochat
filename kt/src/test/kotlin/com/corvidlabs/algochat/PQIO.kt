package com.corvidlabs.algochat

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/**
 * LocalNet mesh tool. One JSON object per stdin line.
 * Run with the test runtime classpath. This file is not part of the published jar.
 */
fun main() {
    val json = Json { ignoreUnknownKeys = true }
    while (true) {
        val line = readlnOrNull() ?: break
        if (line.isBlank()) continue
        val req = try {
            json.parseToJsonElement(line).jsonObject
        } catch (error: Exception) {
            reply(0, false, error = error.message ?: "bad json")
            continue
        }
        val id = req.int("id")
        try {
            val fields = when (req.str("op")) {
                "identity" -> identity(req.str("seed"))
                "write" -> writeNote(req.str("aliceSeed"), req.str("bobSeed"), req.str("text"))
                "read" -> readNote(
                    req.str("aliceSeed"),
                    req.str("bobSeed"),
                    req.str("handshake"),
                    req.str("message"),
                    req.str("text")
                )
                else -> throw IllegalArgumentException("unknown op ${req.str("op")}")
            }
            reply(id, true, fields)
        } catch (error: Exception) {
            reply(id, false, error = error.message ?: "failed")
        }
    }
}

private fun identity(seedHex: String): Map<String, String> {
    val seed = hexToBytes(seedHex)
    val keys = Keys.deriveKeysFromSeed(seed)
    val kem = PQ.deriveMLKEMKeyPair(seed)
    return mapOf(
        "x25519" to bytesToHex(Keys.publicKeyToBytes(keys.publicKey)),
        "encapsKey" to bytesToHex(kem.encapsKey)
    )
}

private fun writeNote(aliceHex: String, bobHex: String, text: String): Map<String, String> {
    val alice = Keys.deriveKeysFromSeed(hexToBytes(aliceHex))
    val bob = Keys.deriveKeysFromSeed(hexToBytes(bobHex))
    val kem = PQ.deriveMLKEMKeyPair(hexToBytes(bobHex))
    val handshake = PQ.initiatePQSession(alice, Keys.publicKeyToBytes(bob.publicKey), kem.encapsKey)
    val message = PQ.encryptPQMessage(text, handshake.session)
    return mapOf(
        "handshake" to bytesToHex(handshake.note),
        "message" to bytesToHex(message),
        "sessionKey" to bytesToHex(handshake.session.sessionKey)
    )
}

private fun readNote(
    aliceHex: String,
    bobHex: String,
    handshakeHex: String,
    messageHex: String,
    text: String
): Map<String, String> {
    val alice = Keys.deriveKeysFromSeed(hexToBytes(aliceHex))
    val bob = Keys.deriveKeysFromSeed(hexToBytes(bobHex))
    val kem = PQ.deriveMLKEMKeyPair(hexToBytes(bobHex))
    val handshake = hexToBytes(handshakeHex)
    val message = hexToBytes(messageHex)
    val session = PQ.acceptPQSession(handshake, bob, kem)
    val opened = PQ.decryptPQMessage(message, session)
    val sender = PQ.openPQSessionAsSender(handshake, alice)
    val senderPlain = PQ.decryptPQMessage(message, sender)
    if (opened != text || senderPlain != text) {
        throw IllegalStateException("plaintext $opened / $senderPlain")
    }
    if (!session.sessionKey.contentEquals(sender.sessionKey)) {
        throw IllegalStateException("sender and recipient session keys differ")
    }
    return mapOf(
        "sessionKey" to bytesToHex(session.sessionKey),
        "recipient" to opened,
        "sender" to senderPlain
    )
}

private fun reply(id: Int, ok: Boolean, fields: Map<String, String> = emptyMap(), error: String? = null) {
    println(buildJsonObject {
        put("id", id)
        put("ok", ok)
        if (error != null) put("error", error)
        for ((key, value) in fields) put(key, value)
    })
    System.out.flush()
}

private fun JsonObject.str(name: String): String {
    return this[name]?.jsonPrimitive?.contentOrNull ?: throw IllegalArgumentException("missing $name")
}

private fun JsonObject.int(name: String): Int {
    return this[name]?.jsonPrimitive?.int ?: 0
}

private fun hexToBytes(hex: String): ByteArray {
    if (hex.length % 2 != 0) throw IllegalArgumentException("odd hex")
    return ByteArray(hex.length / 2) { index ->
        hex.substring(index * 2, index * 2 + 2).toInt(16).toByte()
    }
}

private fun bytesToHex(bytes: ByteArray): String {
    return bytes.joinToString("") { byte -> "%02x".format(byte) }
}
