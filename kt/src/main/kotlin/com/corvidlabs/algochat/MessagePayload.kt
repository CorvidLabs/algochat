package com.corvidlabs.algochat

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * JSON payload for structured messages with optional reply context.
 *
 * Wire format: `{"text":"...","replyTo":{"txid":"...","preview":"..."}}`
 */
@Serializable
internal data class MessagePayload(
    val text: String,
    val replyTo: ReplyToPayload? = null
)

/**
 * Reply-to reference within a structured message payload.
 */
@Serializable
internal data class ReplyToPayload(
    val txid: String,
    val preview: String? = null
)

/**
 * Shared JSON codec for message payloads, used by both [Crypto] and [PSKCrypto].
 */
internal object MessagePayloadCodec {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = false
    }

    /**
     * Encodes a structured message payload to JSON bytes.
     *
     * @param text Message text
     * @param replyToTxid Transaction ID being replied to (optional)
     * @param replyToPreview Preview of the replied message (optional)
     * @return UTF-8 encoded JSON bytes
     */
    fun encode(text: String, replyToTxid: String? = null, replyToPreview: String? = null): ByteArray {
        val replyTo = if (replyToTxid != null) {
            ReplyToPayload(txid = replyToTxid, preview = replyToPreview)
        } else null

        val payload = MessagePayload(text = text, replyTo = replyTo)
        return json.encodeToString(payload).toByteArray(Charsets.UTF_8)
    }

    /**
     * Parses decrypted bytes into [DecryptedContent].
     *
     * Attempts JSON parsing first. If the data doesn't look like JSON or parsing
     * fails, treats the entire byte array as plain text.
     *
     * @param data Decrypted message bytes
     * @return Parsed content with text and optional reply context
     */
    fun decode(data: ByteArray): DecryptedContent {
        val text = String(data, Charsets.UTF_8)

        if (!text.startsWith("{")) {
            return DecryptedContent(text)
        }

        return try {
            val payload = json.decodeFromString<MessagePayload>(text)
            DecryptedContent(
                text = payload.text,
                replyToId = payload.replyTo?.txid,
                replyToPreview = payload.replyTo?.preview
            )
        } catch (_: Exception) {
            DecryptedContent(text)
        }
    }

    /**
     * Checks if the decrypted data is a key-publish control message.
     */
    fun isKeyPublish(data: ByteArray): Boolean {
        if (data.isEmpty() || data[0] != '{'.code.toByte()) return false
        return try {
            val text = String(data, Charsets.UTF_8)
            text.contains("\"type\"") && text.contains("\"key-publish\"")
        } catch (_: Exception) {
            false
        }
    }
}
