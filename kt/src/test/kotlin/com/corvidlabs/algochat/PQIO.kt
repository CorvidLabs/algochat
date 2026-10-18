package com.corvidlabs.algochat

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
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
            val op = req.str("op")
            if (op == "write05s") {
                val many = writeMany(req.str("aliceSeed"), req.str("bobSeed"), req.texts("texts"))
                reply(id, true, mapOf("handshake" to many.first, "sessionKey" to many.third), messages = many.second)
                continue
            }
            if (op == "groupSeal" || op == "groupOpen" || op == "groupWrite" || op == "groupRead") {
                val result = groupCall(op, req)
                reply(id, true, result.first, numbers = result.second)
                continue
            }
            val fields = when (op) {
                "identity" -> identity(req.str("seed"))
                "write" -> writeNote(req.str("aliceSeed"), req.str("bobSeed"), req.str("text"))
                "read" -> readNote(
                    req.str("aliceSeed"),
                    req.str("bobSeed"),
                    req.str("handshake"),
                    req.str("message"),
                    req.str("text")
                )
                "write01" -> writeClassical(req.str("aliceSeed"), req.str("bobSeed"), req.str("text"), null, 0)
                "read01" -> readClassical(req.str("aliceSeed"), req.str("bobSeed"), req.str("note"), req.str("text"), null, 0)
                "write02" -> writeClassical(req.str("aliceSeed"), req.str("bobSeed"), req.str("text"), req.str("psk"), req.int("counter"))
                "read02" -> readClassical(req.str("aliceSeed"), req.str("bobSeed"), req.str("note"), req.str("text"), req.str("psk"), req.int("counter"))
                else -> throw IllegalArgumentException("unknown op $op")
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
    val aliceKem = PQ.deriveMLKEMKeyPair(hexToBytes(aliceHex))
    val handshake = PQ.initiatePQSession(
        alice,
        Keys.publicKeyToBytes(bob.publicKey),
        kem.encapsKey,
        aliceKem.encapsKey
    )
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
    val aliceKem = PQ.deriveMLKEMKeyPair(hexToBytes(aliceHex))
    val sender = PQ.openPQSessionAsSender(handshake, alice, aliceKem)
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

private fun writeClassical(aliceHex: String, bobHex: String, text: String, pskHex: String?, counter: Int): Map<String, String> {
    val alice = Keys.deriveKeysFromSeed(hexToBytes(aliceHex))
    val bob = Keys.deriveKeysFromSeed(hexToBytes(bobHex))
    val note = if (pskHex == null) {
        Crypto.encryptMessage(text, alice.privateKey, alice.publicKey, bob.publicKey).encode()
    } else {
        val current = PSKRatchet.derivePSKAtCounter(hexToBytes(pskHex), counter.toUInt())
        val envelope = PSKCrypto.encryptMessage(
            text,
            alice.privateKey,
            alice.publicKey,
            bob.publicKey,
            current,
            counter.toUInt()
        )
        PSKEnvelopeCodec.encode(envelope)
    }
    return mapOf("note" to bytesToHex(note))
}

private fun readClassical(
    aliceHex: String,
    bobHex: String,
    noteHex: String,
    text: String,
    pskHex: String?,
    counter: Int
): Map<String, String> {
    val alice = Keys.deriveKeysFromSeed(hexToBytes(aliceHex))
    val bob = Keys.deriveKeysFromSeed(hexToBytes(bobHex))
    val raw = hexToBytes(noteHex)
    val recipient: String
    val sender: String
    if (pskHex == null) {
        val envelope = ChatEnvelope.decode(raw)
        recipient = Crypto.decryptMessage(envelope, bob.privateKey, bob.publicKey)?.text
            ?: throw IllegalStateException("bob failed")
        sender = Crypto.decryptMessage(envelope, alice.privateKey, alice.publicKey)?.text
            ?: throw IllegalStateException("alice failed")
    } else {
        val current = PSKRatchet.derivePSKAtCounter(hexToBytes(pskHex), counter.toUInt())
        val envelope = PSKEnvelopeCodec.decode(raw)
        recipient = PSKCrypto.decryptMessage(envelope, bob.privateKey, bob.publicKey, current)?.text
            ?: throw IllegalStateException("bob failed")
        sender = PSKCrypto.decryptMessage(envelope, alice.privateKey, alice.publicKey, current)?.text
            ?: throw IllegalStateException("alice failed")
    }
    if (recipient != text || sender != text) throw IllegalStateException("plaintext $recipient / $sender")
    return mapOf("recipient" to recipient, "sender" to sender)
}

private fun writeMany(aliceHex: String, bobHex: String, texts: List<String>): Triple<String, List<String>, String> {
    val alice = Keys.deriveKeysFromSeed(hexToBytes(aliceHex))
    val bob = Keys.deriveKeysFromSeed(hexToBytes(bobHex))
    val kem = PQ.deriveMLKEMKeyPair(hexToBytes(bobHex))
    val aliceKem = PQ.deriveMLKEMKeyPair(hexToBytes(aliceHex))
    val handshake = PQ.initiatePQSession(
        alice,
        Keys.publicKeyToBytes(bob.publicKey),
        kem.encapsKey,
        aliceKem.encapsKey
    )
    val messages = texts.map { text -> bytesToHex(PQ.encryptPQMessage(text, handshake.session)) }
    return Triple(bytesToHex(handshake.note), messages, bytesToHex(handshake.session.sessionKey))
}

private fun groupCall(op: String, req: JsonObject): Pair<Map<String, String>, Map<String, Int>> {
    return when (op) {
        "groupSeal" -> groupSeal(req) to emptyMap()
        "groupOpen" -> groupOpen(req)
        "groupWrite" -> groupWrite(req) to emptyMap()
        "groupRead" -> groupRead(req)
        else -> throw IllegalArgumentException("unknown op $op")
    }
}

private fun groupSession(req: JsonObject): PQSession {
    return PQSession(
        hexToBytes(req.str("sessionKey")),
        hexToBytes(req.str("senderPublicKey")),
        ByteArray(32),
        hexToBytes(req.str("handshakeId"))
    )
}

private fun groupSeal(req: JsonObject): Map<String, String> {
    val note = Group.sealGroupMembership(
        groupSession(req),
        GroupMembership(
            req.reqInt("action"),
            req.reqInt("epoch"),
            hexToBytes(req.str("groupId")),
            hexToBytes(req.str("mailbox")),
            hexToBytes(req.str("groupKey"))
        ),
        hexToBytes(req.str("nonce"))
    )
    return mapOf("note" to bytesToHex(note))
}

private fun groupOpen(req: JsonObject): Pair<Map<String, String>, Map<String, Int>> {
    val opened = Group.openGroupMembership(hexToBytes(req.str("note")), groupSession(req))
    return mapOf(
        "groupId" to bytesToHex(opened.groupId),
        "mailbox" to bytesToHex(opened.mailbox),
        "groupKey" to bytesToHex(opened.groupKey)
    ) to mapOf(
        "action" to opened.action,
        "epoch" to opened.epoch
    )
}

private fun groupWrite(req: JsonObject): Map<String, String> {
    val groupKey = hexToBytes(req.str("groupKey"))
    val groupId = hexToBytes(req.str("groupId"))
    val epoch = req.reqInt("epoch")
    val counter = req.reqInt("counter")
    val senderAddress = hexToBytes(req.str("senderAddress"))
    val note = Group.sealGroupMessage(
        req.str("text").toByteArray(Charsets.UTF_8),
        groupKey,
        groupId,
        epoch,
        counter,
        senderAddress,
        hexToBytes(req.str("nonce"))
    )
    val messageKey = Group.deriveGroupMessageKey(groupKey, epoch, counter, groupId, senderAddress)
    return mapOf(
        "note" to bytesToHex(note),
        "messageKey" to bytesToHex(messageKey)
    )
}

private fun groupRead(req: JsonObject): Pair<Map<String, String>, Map<String, Int>> {
    val opened = Group.openGroupMessage(
        hexToBytes(req.str("note")),
        hexToBytes(req.str("groupKey")),
        hexToBytes(req.str("senderAddress")),
        req.counterList("seen")
    )
    val text = opened.plaintext.toString(Charsets.UTF_8)
    val expected = req.str("text")
    if (text != expected) throw IllegalStateException("plaintext $text")
    return mapOf(
        "text" to text,
        "groupId" to bytesToHex(opened.groupId)
    ) to mapOf(
        "epoch" to opened.epoch,
        "counter" to opened.counter
    )
}

private fun reply(
    id: Int,
    ok: Boolean,
    fields: Map<String, String> = emptyMap(),
    error: String? = null,
    messages: List<String>? = null,
    numbers: Map<String, Int> = emptyMap()
) {
    println(buildJsonObject {
        put("id", id)
        put("ok", ok)
        if (error != null) put("error", error)
        for ((key, value) in fields) put(key, value)
        for ((key, value) in numbers) put(key, value)
        if (messages != null) put("messages", JsonArray(messages.map { JsonPrimitive(it) }))
    })
    System.out.flush()
}

private fun JsonObject.str(name: String): String {
    return this[name]?.jsonPrimitive?.contentOrNull ?: throw IllegalArgumentException("missing $name")
}

private fun JsonObject.int(name: String): Int {
    return this[name]?.jsonPrimitive?.int ?: 0
}

private fun JsonObject.reqInt(name: String): Int {
    val value = this[name] ?: throw IllegalArgumentException("missing $name")
    return value.jsonPrimitive.int
}

private fun JsonObject.counterList(name: String): List<GroupCounter> {
    val value = this[name] ?: return emptyList()
    return value.jsonArray.map { element ->
        val item = element.jsonObject
        GroupCounter(item.reqInt("epoch"), item.reqInt("counter"))
    }
}

private fun JsonObject.texts(name: String): List<String> {
    val value = this[name] ?: throw IllegalArgumentException("missing $name")
    return value.jsonArray.map { it.jsonPrimitive.content }
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
