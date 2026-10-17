package com.corvidlabs.algochat

import java.net.URLDecoder
import java.net.URLEncoder
import java.util.Base64

/**
 * PSK exchange URI for sharing pre-shared keys.
 *
 * Format: algochat-psk://v1?addr=...&psk=<base64url>&label=...
 */
data class PSKExchangeURI(
    /** The Algorand address associated with this PSK. */
    val address: String,
    /** The pre-shared key (32 bytes). */
    val psk: ByteArray,
    /** Optional human-readable label. */
    val label: String? = null
) {
    /**
     * Encodes this exchange URI to a string.
     *
     * @return The URI string
     */
    fun encode(): String {
        val base64Psk = Base64.getUrlEncoder().withoutPadding().encodeToString(psk)
        val encodedAddr = URLEncoder.encode(address, "UTF-8")

        val sb = StringBuilder("algochat-psk://v1?addr=")
        sb.append(encodedAddr)
        sb.append("&psk=")
        sb.append(base64Psk)

        if (label != null) {
            sb.append("&label=")
            sb.append(URLEncoder.encode(label, "UTF-8"))
        }

        return sb.toString()
    }

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false

        other as PSKExchangeURI

        if (address != other.address) return false
        if (!psk.contentEquals(other.psk)) return false
        if (label != other.label) return false

        return true
    }

    override fun hashCode(): Int {
        var result = address.hashCode()
        result = 31 * result + psk.contentHashCode()
        result = 31 * result + (label?.hashCode() ?: 0)
        return result
    }

    companion object {
        /**
         * Decodes a PSK exchange URI string.
         *
         * @param uriString The URI string to decode
         * @return Decoded PSKExchangeURI
         * @throws AlgoChatException if the URI is invalid
         */
        fun decode(uriString: String): PSKExchangeURI {
            if (!uriString.startsWith("algochat-psk://v1?")) {
                throw AlgoChatException.InvalidEnvelope("Invalid PSK exchange URI scheme")
            }

            val queryString = uriString.substringAfter("algochat-psk://v1?")
            val params = parseQueryString(queryString)

            val address = params["addr"]
                ?: throw AlgoChatException.InvalidEnvelope("Missing addr parameter in PSK URI")

            val pskBase64 = params["psk"]
                ?: throw AlgoChatException.InvalidEnvelope("Missing psk parameter in PSK URI")

            val psk = try {
                Base64.getUrlDecoder().decode(pskBase64)
            } catch (e: Exception) {
                throw AlgoChatException.InvalidEnvelope("Invalid base64url PSK: ${e.message}")
            }

            if (psk.size != 32) {
                throw AlgoChatException.InvalidEnvelope("PSK must be 32 bytes, got ${psk.size}")
            }

            val label = params["label"]

            return PSKExchangeURI(
                address = address,
                psk = psk,
                label = label
            )
        }

        private fun parseQueryString(query: String): Map<String, String> {
            val params = mutableMapOf<String, String>()
            for (pair in query.split("&")) {
                val parts = pair.split("=", limit = 2)
                if (parts.size == 2) {
                    val key = URLDecoder.decode(parts[0], "UTF-8")
                    val value = URLDecoder.decode(parts[1], "UTF-8")
                    params[key] = value
                }
            }
            return params
        }
    }
}
