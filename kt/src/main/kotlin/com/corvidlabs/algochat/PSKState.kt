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
    /** Next receive counter. Zero with an empty history means no message yet. */
    receiveCounter: UInt = 0u
) {
    private val mutex = Mutex()

    private var _sendCounter: UInt = sendCounter
    private var _sendExhausted: Boolean = false
    private var _receiveCounter: UInt = receiveCounter
    private var highestAccepted: UInt? = if (receiveCounter == 0u) null else receiveCounter - 1u
    private val _receivedCounters: MutableSet<UInt> = mutableSetOf()

    /** The current send counter. Stays at [UInt.MAX_VALUE] after that value is issued. */
    val sendCounter: UInt get() = _sendCounter

    /** True after [UInt.MAX_VALUE] has been issued. A later send does not wrap to 0. */
    val sendExhausted: Boolean get() = _sendExhausted

    /**
     * The next receive counter.
     *
     * This is one past the highest accepted counter, except after
     * [UInt.MAX_VALUE], where it stays at [UInt.MAX_VALUE] instead of wrapping.
     */
    val receiveCounter: UInt get() = _receiveCounter

    /**
     * Gets the next send counter and advances it.
     *
     * @return The counter value to use for the next message
     * @throws IllegalStateException when the counter is exhausted
     */
    suspend fun nextSendCounter(): UInt {
        mutex.withLock {
            if (_sendExhausted) {
                throw IllegalStateException("PSK send counter is exhausted")
            }
            val current = _sendCounter
            if (current == UInt.MAX_VALUE) {
                _sendExhausted = true
                return current
            }
            _sendCounter = current + 1u
            return current
        }
    }

    /**
     * Validates and accepts a received counter value.
     *
     * The counter is accepted if it has not been seen and it lies in the
     * window of [PSKProtocol.COUNTER_WINDOW] around the highest accepted
     * counter. Before any receive, only `0` through `200` are accepted.
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
     * A failed decryption does not record the counter or move the window.
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
     * @return True if the counter is inside the window and has not been seen
     */
    private fun isCounterAcceptable(counter: UInt): Boolean {
        if (counter in _receivedCounters) {
            return false
        }
        val (lower, upper) = windowBounds()
        return counter in lower..upper
    }

    /**
     * Records an accepted counter and advances window state. Caller must hold the
     * mutex and have already validated the counter with [isCounterAcceptable].
     */
    private fun recordCounter(counter: UInt) {
        _receivedCounters.add(counter)

        val highest = highestAccepted
        if (highest == null || counter > highest) {
            highestAccepted = counter
            // Do not wrap. Accepting the maximum must not make 0 the next counter.
            _receiveCounter = if (counter == UInt.MAX_VALUE) UInt.MAX_VALUE else counter + 1u
        }

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
            _sendExhausted = false
            _receiveCounter = 0u
            highestAccepted = null
            _receivedCounters.clear()
        }
    }

    /**
     * Accepts unseen counters from `max(0, N - window)` through
     * `min(max, N + window)`, where N is the highest accepted counter.
     * Before any receive, N is absent and the window is `0..=window`.
     */
    private fun windowBounds(): Pair<UInt, UInt> {
        val window = PSKProtocol.COUNTER_WINDOW.toUInt()
        val highest = highestAccepted ?: return 0u to window
        val lower = if (highest >= window) highest - window else 0u
        val room = UInt.MAX_VALUE - highest
        val upper = if (room < window) UInt.MAX_VALUE else highest + window
        return lower to upper
    }

    /**
     * Removes received counter entries that are outside the current window.
     */
    private fun pruneReceivedCounters() {
        val (lower, _) = windowBounds()
        _receivedCounters.removeAll { it < lower }
    }
}
