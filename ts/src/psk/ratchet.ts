/**
 * AlgoChat Web - PSK Ratchet Key Derivation
 *
 * Pure stateless crypto functions implementing the two-level ratchet:
 *   initialPSK -> sessionPSK (per SESSION_SIZE messages) -> positionPSK (per message)
 *
 * Uses HKDF-SHA256 at each level to derive deterministic per-message keys.
 */

import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { PSK_PROTOCOL } from './types.js';

const SESSION_SALT = new TextEncoder().encode('AlgoChat-PSK-Session');
const POSITION_SALT = new TextEncoder().encode('AlgoChat-PSK-Position');
const HYBRID_INFO_PREFIX = new TextEncoder().encode('AlgoChatV1-PSK');
const SENDER_KEY_INFO_PREFIX = new TextEncoder().encode('AlgoChatV1-PSK-SenderKey');

/**
 * Derives a session PSK from the initial PSK and session index.
 *
 * @param initialPSK - The shared pre-shared key (32 bytes)
 * @param sessionIndex - Session index (counter / SESSION_SIZE)
 * @returns 32-byte session PSK
 */
export function deriveSessionPSK(initialPSK: Uint8Array, sessionIndex: number): Uint8Array {
    const info = uint32BE(sessionIndex);
    return hkdf(sha256, initialPSK, SESSION_SALT, info, 32);
}

/**
 * Derives a position PSK from a session PSK and position within the session.
 *
 * @param sessionPSK - The session PSK (32 bytes)
 * @param position - Position within the session (counter % SESSION_SIZE)
 * @returns 32-byte position PSK
 */
export function derivePositionPSK(sessionPSK: Uint8Array, position: number): Uint8Array {
    const info = uint32BE(position);
    return hkdf(sha256, sessionPSK, POSITION_SALT, info, 32);
}

/**
 * Derives the PSK for a specific counter value using the two-level ratchet.
 *
 * @param initialPSK - The shared pre-shared key (32 bytes)
 * @param counter - The ratchet counter
 * @returns 32-byte derived PSK for this counter
 */
export function derivePSKAtCounter(initialPSK: Uint8Array, counter: number): Uint8Array {
    const sessionIndex = Math.floor(counter / PSK_PROTOCOL.SESSION_SIZE);
    const position = counter % PSK_PROTOCOL.SESSION_SIZE;

    const sessionPSK = deriveSessionPSK(initialPSK, sessionIndex);
    return derivePositionPSK(sessionPSK, position);
}

/**
 * Derives a hybrid symmetric key combining ECDH shared secret with PSK.
 *
 * @param sharedSecret - ECDH shared secret (ephemeral * recipient)
 * @param currentPSK - The current ratchet-derived PSK
 * @param ephemeralPublicKey - Ephemeral public key (used as salt)
 * @param senderPublicKey - Sender's static public key
 * @param recipientPublicKey - Recipient's static public key
 * @returns 32-byte hybrid symmetric key
 */
export function deriveHybridSymmetricKey(
    sharedSecret: Uint8Array,
    currentPSK: Uint8Array,
    ephemeralPublicKey: Uint8Array,
    senderPublicKey: Uint8Array,
    recipientPublicKey: Uint8Array,
): Uint8Array {
    const ikm = concatBytes(sharedSecret, currentPSK);
    const info = concatBytes(HYBRID_INFO_PREFIX, senderPublicKey, recipientPublicKey);
    return hkdf(sha256, ikm, ephemeralPublicKey, info, 32);
}

/**
 * Derives a sender key for encrypting the symmetric key (bidirectional decryption).
 *
 * @param senderSharedSecret - ECDH shared secret (ephemeral * sender)
 * @param currentPSK - The current ratchet-derived PSK
 * @param ephemeralPublicKey - Ephemeral public key (used as salt)
 * @param senderPublicKey - Sender's static public key
 * @returns 32-byte sender encryption key
 */
export function deriveSenderKey(
    senderSharedSecret: Uint8Array,
    currentPSK: Uint8Array,
    ephemeralPublicKey: Uint8Array,
    senderPublicKey: Uint8Array,
): Uint8Array {
    const ikm = concatBytes(senderSharedSecret, currentPSK);
    const info = concatBytes(SENDER_KEY_INFO_PREFIX, senderPublicKey);
    return hkdf(sha256, ikm, ephemeralPublicKey, info, 32);
}

/**
 * Encodes a number as a 4-byte big-endian Uint8Array.
 */
function uint32BE(value: number): Uint8Array {
    const buf = new Uint8Array(4);
    buf[0] = (value >>> 24) & 0xff;
    buf[1] = (value >>> 16) & 0xff;
    buf[2] = (value >>> 8) & 0xff;
    buf[3] = value & 0xff;
    return buf;
}

/**
 * Concatenates multiple Uint8Arrays.
 */
function concatBytes(...arrays: Uint8Array[]): Uint8Array {
    const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const arr of arrays) {
        result.set(arr, offset);
        offset += arr.length;
    }
    return result;
}
