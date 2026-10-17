package com.corvidlabs.algochat

import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Manages PSK ratchet counter state for a peer.
 *
 * Tracks send and receive counters with a sliding window to prevent
 * replay attacks while tolerating out-of-order delivery.
 */
class PSKState(
    /** The initial pre-shared key (32 bytes). */
    val initialPSK: ByteArray,
    /** The peer's identifier (e.g., Algorand address). */
    val peerId: String,
    /** Initial send counter value. */
    sendCounter: UInt = 0u,
    /** Initial receive counter value. */
    receiveCounter: UInt = 0u
) {
    private val mutex = Mutex()

    private var _sendCounter: UInt = sendCounter
    private var _receiveCounter: UInt = receiveCounter
    private val _receivedCounters: MutableSet<UInt> = mutableSetOf()

    /** The current send counter. */
    val sendCounter: UInt get() = _sendCounter

    /** The current receive counter (highest accepted). */
    val receiveCounter: UInt get() = _receiveCounter

    /**
     * Gets the next send counter and advances it.
     *
     * @return The counter value to use for the next message
     */
    suspend fun nextSendCounter(): UInt {
        mutex.withLock {
            val current = _sendCounter
            _sendCounter = current + 1u
            return current
        }
    }

    /**
     * Validates and accepts a received counter value.
     *
     * The counter is accepted if:
     * - It has not been seen before (replay protection)
     * - It is not more than [PSKProtocol.COUNTER_WINDOW] behind the highest
     *   accepted counter
     *
     * Per the protocol specification there is no upper bound: counters arbitrarily
     * far ahead are accepted (they advance the window), and only counters too far
     * behind the peer's last counter are rejected.
     *
     * @param counter The received counter value
     * @return True if the counter is valid and was accepted
     */
    suspend fun acceptReceiveCounter(counter: UInt): Boolean {
        mutex.withLock {
            if (!isCounterAcceptable(counter)) {
                return false
            }
            recordCounter(counter)
            return true
        }
    }

    /**
     * Validates a received counter, runs the decrypt action, then records the
     * counter only if decryption succeeds.
     *
     * This is the secure receive path: it enforces replay protection (a counter is
     * never accepted twice) and the sliding window before decryption is attempted,
     * and it does not consume a counter for messages that fail to decrypt or are
     * rejected as replays. This prevents an attacker from exhausting counter slots
     * or replaying captured ciphertext.
     *
     * @param counter The ratchet counter from the received envelope
     * @param decrypt A block that performs decryption and returns the result; it
     *   should throw if decryption fails
     * @return The decryption result
     * @throws AlgoChatException.DecryptionFailed if the counter is a replay or
     *   outside the acceptable window
     */
    suspend fun <Output> receive(counter: UInt, decrypt: suspend () -> Output): Output {
        mutex.withLock {
            if (!isCounterAcceptable(counter)) {
                throw AlgoChatException.DecryptionFailed(
                    "Rejected PSK counter $counter for peer $peerId (replay or outside window)"
                )
            }

            val result = decrypt()

            // Record only after a successful decryption.
            recordCounter(counter)
            return result
        }
    }

    /**
     * Checks whether a counter would be accepted without mutating any state.
     *
     * @param counter The counter to test
     * @return True if the counter is neither a replay nor too far behind the window
     */
    private fun isCounterAcceptable(counter: UInt): Boolean {
        if (counter in _receivedCounters) {
            return false
        }

        // Reject counters that are too far behind the highest accepted counter.
        val windowStart = if (_receiveCounter >= PSKProtocol.COUNTER_WINDOW.toUInt()) {
            _receiveCounter - PSKProtocol.COUNTER_WINDOW.toUInt()
        } else {
            0u
        }

        return counter >= windowStart
    }

    /**
     * Records an accepted counter and advances window state. Caller must hold the
     * mutex and have already validated the counter with [isCounterAcceptable].
     */
    private fun recordCounter(counter: UInt) {
        _receivedCounters.add(counter)

        // Advance receive counter if needed
        if (counter >= _receiveCounter) {
            _receiveCounter = counter + 1u
        }

        // Prune old counters outside the window
        pruneReceivedCounters()
    }

    /**
     * Derives the PSK for the current send counter without advancing it.
     *
     * @return 32-byte derived PSK for the current counter
     */
    fun currentSendPSK(): ByteArray {
        return PSKRatchet.derivePSKAtCounter(initialPSK, _sendCounter)
    }

    /**
     * Derives the PSK for a specific counter value.
     *
     * @param counter The counter value
     * @return 32-byte derived PSK
     */
    fun pskAtCounter(counter: UInt): ByteArray {
        return PSKRatchet.derivePSKAtCounter(initialPSK, counter)
    }

    /**
     * Resets the state to initial values.
     */
    suspend fun reset() {
        mutex.withLock {
            _sendCounter = 0u
            _receiveCounter = 0u
            _receivedCounters.clear()
        }
    }

    /**
     * Removes received counter entries that are outside the current window.
     */
    private fun pruneReceivedCounters() {
        val windowStart = if (_receiveCounter >= PSKProtocol.COUNTER_WINDOW.toUInt()) {
            _receiveCounter - PSKProtocol.COUNTER_WINDOW.toUInt()
        } else {
            0u
        }
        _receivedCounters.removeAll { it < windowStart }
    }
}
