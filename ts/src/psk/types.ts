/**
 * AlgoChat Web - PSK (Pre-Shared Key) Protocol Types
 *
 * Constants and interfaces for PSK v1.1 protocol support.
 */

import { MAX_NOTE_SIZE } from '../models/types.js';

const PSK_HEADER_SIZE = 130;
const PSK_TAG_SIZE = 16;

/** PSK protocol constants */
export const PSK_PROTOCOL = {
    /** Legacy PSK envelopes (no header AAD). */
    VERSION: 0x01,
    /** Current PSK envelopes bind the fixed header as AAD (#232). */
    VERSION_AAD: 0x02,
    PROTOCOL_ID: 0x02,
    HEADER_SIZE: PSK_HEADER_SIZE,
    TAG_SIZE: PSK_TAG_SIZE,
    ENCRYPTED_SENDER_KEY_SIZE: 48,
    /** Note ceiling minus the PSK header and the Poly1305 tag. */
    MAX_PAYLOAD_SIZE: MAX_NOTE_SIZE - PSK_HEADER_SIZE - PSK_TAG_SIZE,
    SESSION_SIZE: 100,
    COUNTER_WINDOW: 200,
} as const;

/** PSK envelope wire format */
export interface PSKEnvelope {
    version: number;
    protocolId: number;
    ratchetCounter: number;
    senderPublicKey: Uint8Array;
    ephemeralPublicKey: Uint8Array;
    nonce: Uint8Array;
    encryptedSenderKey: Uint8Array;
    ciphertext: Uint8Array;
}

/**
 * Counter state for replay protection.
 *
 * `sendExhausted` is set after counter 4294967295 has been issued. This
 * package does not persist the object; callers must keep the flag themselves.
 */
export interface PSKState {
    sendCounter: number;
    peerLastCounter: number;
    seenCounters: Set<number>;
    sendExhausted?: boolean;
}
