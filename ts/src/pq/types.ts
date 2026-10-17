/**
 * Hybrid X25519 + ML-KEM-768 session constants.
 *
 * Public protocol ids stay clear of 0x01 (everyday) and 0x02 (Extra lock).
 * 0x03 is not assigned here.
 */

import { MAX_NOTE_SIZE, PROTOCOL } from '../models/types.js';

export const PQ_PROTOCOL = {
    /** Header-authenticated envelopes, same version byte as current 0x01 and 0x02 sends. */
    VERSION: PROTOCOL.VERSION_AAD,
    /** One-note session handshake. Delivers the ML-KEM ciphertext once. */
    HANDSHAKE_ID: 0x04,
    /** Steady-state message encrypted under the handshake session key. */
    DATA_ID: 0x05,
    MLKEM_EK_SIZE: 1184,
    MLKEM_DK_SIZE: 2400,
    MLKEM_CT_SIZE: 1088,
    SHARED_SECRET_SIZE: 32,
    EK_HASH_SIZE: 32,
    HANDSHAKE_ID_SIZE: 32,
    NONCE_SIZE: 12,
    ENCRYPTED_SESSION_KEY_SIZE: 48,
    TAG_SIZE: 16,
} as const;

/** version, protocol, sender, recipient, ephemeral, ciphertext, ek hash, nonce, wrapped session key */
export const PQ_HANDSHAKE_SIZE =
    2 +
    32 +
    32 +
    32 +
    PQ_PROTOCOL.MLKEM_CT_SIZE +
    PQ_PROTOCOL.EK_HASH_SIZE +
    PQ_PROTOCOL.NONCE_SIZE +
    PQ_PROTOCOL.ENCRYPTED_SESSION_KEY_SIZE;

/** version + protocol + sender + handshake id + nonce */
export const PQ_DATA_HEADER_SIZE = 2 + 32 + PQ_PROTOCOL.HANDSHAKE_ID_SIZE + PQ_PROTOCOL.NONCE_SIZE;

export const PQ_MAX_PAYLOAD_SIZE = MAX_NOTE_SIZE - PQ_DATA_HEADER_SIZE - PQ_PROTOCOL.TAG_SIZE;

/** ASCII "ACPQ". Keeps a PQ announcement out of the 32-byte X25519 parser. */
export const PQ_ANNOUNCE_MAGIC = new Uint8Array([0x41, 0x43, 0x50, 0x51]);

export const PQ_ANNOUNCE_VERSION = 0x01;

export interface MLKEMKeyPair {
    encapsKey: Uint8Array;
    decapsKey: Uint8Array;
}

export interface PQSession {
    /** 32-byte hybrid session key. */
    sessionKey: Uint8Array;
    senderPublicKey: Uint8Array;
    recipientPublicKey: Uint8Array;
    /** SHA-256 of the handshake note. */
    handshakeId: Uint8Array;
}

export class PQError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PQError';
    }
}
