/**
 * AlgoChat Web - PSK Counter State Management
 *
 * Manages send/receive counters for replay protection with a sliding window.
 */

import { PSK_PROTOCOL, type PSKState } from './types.js';

/**
 * Creates a new PSK state with initial counter values.
 */
export function createPSKState(): PSKState {
    return {
        sendCounter: 0,
        peerLastCounter: 0,
        seenCounters: new Set<number>(),
    };
}

/**
 * Validates whether a received counter is acceptable.
 *
 * A counter is valid if:
 * - It has not been seen before (replay protection)
 * - It is within the sliding window of +/- COUNTER_WINDOW from peerLastCounter
 *
 * @param state - Current PSK state
 * @param counter - The received counter to validate
 * @returns true if the counter is valid
 */
export function validateCounter(state: PSKState, counter: number): boolean {
    // Reject already-seen counters
    if (state.seenCounters.has(counter)) {
        return false;
    }

    // Allow any counter within the window around peerLastCounter
    const lower = state.peerLastCounter - PSK_PROTOCOL.COUNTER_WINDOW;
    const upper = state.peerLastCounter + PSK_PROTOCOL.COUNTER_WINDOW;

    return counter >= lower && counter <= upper;
}

/**
 * Records a received counter, returning a new state.
 *
 * Updates peerLastCounter if the received counter is newer, and
 * prunes old entries from seenCounters that fall outside the window.
 *
 * @param state - Current PSK state
 * @param counter - The received counter to record
 * @returns New PSK state with counter recorded
 */
export function recordReceive(state: PSKState, counter: number): PSKState {
    const newSeenCounters = new Set(state.seenCounters);
    newSeenCounters.add(counter);

    const newPeerLastCounter = Math.max(state.peerLastCounter, counter);

    // Prune counters outside the window
    const lowerBound = newPeerLastCounter - PSK_PROTOCOL.COUNTER_WINDOW;
    for (const seen of newSeenCounters) {
        if (seen < lowerBound) {
            newSeenCounters.delete(seen);
        }
    }

    return {
        sendCounter: state.sendCounter,
        peerLastCounter: newPeerLastCounter,
        seenCounters: newSeenCounters,
    };
}

/**
 * Advances the send counter, returning the current counter and new state.
 *
 * @param state - Current PSK state
 * @returns Object with the counter to use and the updated state
 */
export function advanceSendCounter(state: PSKState): { counter: number; state: PSKState } {
    const counter = state.sendCounter;
    return {
        counter,
        state: {
            sendCounter: state.sendCounter + 1,
            peerLastCounter: state.peerLastCounter,
            seenCounters: new Set(state.seenCounters),
        },
    };
}
