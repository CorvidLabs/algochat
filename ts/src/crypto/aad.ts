/**
 * Associated data (AAD) for ChaCha20-Poly1305 envelope encryption.
 *
 * Binding the fixed header authenticates version/protocol bytes so an
 * attacker cannot silently rewrite them (e.g. 0x02 → 0x01 PSK downgrade).
 * Layout matches the wire header before ciphertext.
 */

/** Standard (0x01) header prefix before encryptedSenderKey: 78 bytes. */
export const STANDARD_PREFIX_AAD_SIZE = 2 + 32 + 32 + 12;

/** PSK (0x02) header prefix before encryptedSenderKey: 82 bytes. */
export const PSK_PREFIX_AAD_SIZE = 2 + 4 + 32 + 32 + 12;

export interface StandardHeaderFields {
    version: number;
    protocolId: number;
    senderPublicKey: Uint8Array;
    ephemeralPublicKey: Uint8Array;
    nonce: Uint8Array;
    encryptedSenderKey: Uint8Array;
}

export interface PskHeaderFields extends StandardHeaderFields {
    ratchetCounter: number;
}

/** Full standard fixed header (PROTOCOL.HEADER_SIZE = 126). */
export function standardHeaderAAD(fields: StandardHeaderFields): Uint8Array {
    const aad = new Uint8Array(STANDARD_PREFIX_AAD_SIZE + 48);
    let offset = 0;
    aad[offset++] = fields.version;
    aad[offset++] = fields.protocolId;
    aad.set(fields.senderPublicKey, offset);
    offset += 32;
    aad.set(fields.ephemeralPublicKey, offset);
    offset += 32;
    aad.set(fields.nonce, offset);
    offset += 12;
    aad.set(fields.encryptedSenderKey, offset);
    return aad;
}

/** Full PSK fixed header (PSK_PROTOCOL.HEADER_SIZE = 130). */
export function pskHeaderAAD(fields: PskHeaderFields): Uint8Array {
    const aad = new Uint8Array(PSK_PREFIX_AAD_SIZE + 48);
    let offset = 0;
    aad[offset++] = fields.version;
    aad[offset++] = fields.protocolId;
    aad[offset++] = (fields.ratchetCounter >>> 24) & 0xff;
    aad[offset++] = (fields.ratchetCounter >>> 16) & 0xff;
    aad[offset++] = (fields.ratchetCounter >>> 8) & 0xff;
    aad[offset++] = fields.ratchetCounter & 0xff;
    aad.set(fields.senderPublicKey, offset);
    offset += 32;
    aad.set(fields.ephemeralPublicKey, offset);
    offset += 32;
    aad.set(fields.nonce, offset);
    offset += 12;
    aad.set(fields.encryptedSenderKey, offset);
    return aad;
}
