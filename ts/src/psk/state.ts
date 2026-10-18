/**
 * AlgoChat - PSK Counter State Management
 *
 * Managed send/receive counters for replay protection. This package does not
 * persist PSK state. Callers that restart from storage must store
 * `sendExhausted` with the counters; a fresh `createPSKState()` starts at 0.
 * A repeated counter is a replay of that counter, not by itself proof of
 * nonce reuse: each send still uses a fresh ephemeral ECDH key.
 */

import { PSK_PROTOCOL, type PSKState } from './types.js';

/** Largest legal ratchet counter (uint32). */
export const MAX_PSK_COUNTER = 0xffffffff;

export class PSKCounterError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PSKCounterError';
    }
}

/**
 * Legal counters are integers in `0..=4294967295`.
 * Rejects negative, fractional, non-integer, and out-of-range values
 * before any 4-byte encoding can wrap them to 0.
 */
export function isLegalCounter(value: number): boolean {
    return Number.isInteger(value) && value >= 0 && value <= MAX_PSK_COUNTER;
}

export function assertLegalCounter(value: number): void {
    if (!isLegalCounter(value)) {
        throw new PSKCounterError(`PSK counter is not a uint32: ${String(value)}`);
    }
}

/**
 * Creates a new PSK state with initial counter values.
 */
export function createPSKState(): PSKState {
    return {
        sendCounter: 0,
        peerLastCounter: 0,
        seenCounters: new Set<number>(),
        sendExhausted: false,
    };
}

function receiveWindow(highest: number): { lower: number; upper: number } {
    const lower = Math.max(0, highest - PSK_PROTOCOL.COUNTER_WINDOW);
    const upper = Math.min(MAX_PSK_COUNTER, highest + PSK_PROTOCOL.COUNTER_WINDOW);
    return { lower, upper };
}

/**
 * Validates whether a received counter is acceptable.
 *
 * Before any receive, `peerLastCounter` is 0, so only unseen counters
 * `0..=COUNTER_WINDOW` are accepted. After highest accepted `N`, unseen
 * counters from `max(0, N-200)` through `min(4294967295, N+200)` are accepted
 * in any order. A counter already accepted is a replay.
 */
export function validateCounter(state: PSKState, counter: number): boolean {
    if (!isLegalCounter(counter) || !isLegalCounter(state.peerLastCounter)) {
        return false;
    }

    if (state.seenCounters.has(counter)) {
        return false;
    }

    const { lower, upper } = receiveWindow(state.peerLastCounter);
    return counter >= lower && counter <= upper;
}

/**
 * Records a received counter, returning a new state.
 *
 * Rejects illegal, replayed, and out-of-window counters without changing
 * state. Does not record a counter whose authentication failed; callers
 * must invoke this only after a successful open.
 */
export function recordReceive(state: PSKState, counter: number): PSKState {
    if (!validateCounter(state, counter)) {
        throw new PSKCounterError(`PSK counter rejected: ${String(counter)}`);
    }

    const newSeenCounters = new Set(state.seenCounters);
    newSeenCounters.add(counter);

    const newPeerLastCounter = Math.max(state.peerLastCounter, counter);

    const { lower } = receiveWindow(newPeerLastCounter);
    for (const seen of newSeenCounters) {
        if (seen < lower) {
            newSeenCounters.delete(seen);
        }
    }

    return {
        sendCounter: state.sendCounter,
        peerLastCounter: newPeerLastCounter,
        seenCounters: newSeenCounters,
        sendExhausted: state.sendExhausted === true,
    };
}

/**
 * Returns the current send counter and the next state.
 *
 * At `4294967295` the call returns that counter and marks send state
 * exhausted. The stored counter stays at the maximum and does not become 0.
 * A later call throws and leaves the returned state unchanged.
 */
export function advanceSendCounter(state: PSKState): { counter: number; state: PSKState } {
    if (state.sendExhausted === true) {
        throw new PSKCounterError('PSK send counter is exhausted');
    }
    assertLegalCounter(state.sendCounter);

    const counter = state.sendCounter;
    const exhausted = counter === MAX_PSK_COUNTER;
    return {
        counter,
        state: {
            sendCounter: exhausted ? counter : counter + 1,
            peerLastCounter: state.peerLastCounter,
            seenCounters: new Set(state.seenCounters),
            sendExhausted: exhausted,
        },
    };
}
