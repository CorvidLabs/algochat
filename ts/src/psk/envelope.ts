/**
 * AlgoChat Web - PSK Envelope Encoding/Decoding
 *
 * Wire format (130-byte header):
 *   [0]:      version (0x01)
 *   [1]:      protocolId (0x02)
 *   [2..5]:   ratchetCounter (4 bytes, big-endian uint32)
 *   [6..37]:  senderPublicKey (32 bytes)
 *   [38..69]: ephemeralPublicKey (32 bytes)
 *   [70..81]: nonce (12 bytes)
 *   [82..129]: encryptedSenderKey (48 bytes)
 *   [130..]:  ciphertext + 16-byte tag
 */

import { PSK_PROTOCOL, type PSKEnvelope } from './types.js';

export class PSKEnvelopeError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PSKEnvelopeError';
    }
}

/**
 * Encodes a PSKEnvelope to bytes for transaction note.
 */
export function encodePSKEnvelope(envelope: PSKEnvelope): Uint8Array {
    const totalSize =
        2 +  // version + protocolId
        4 +  // ratchetCounter
        32 + // senderPublicKey
        32 + // ephemeralPublicKey
        12 + // nonce
        48 + // encryptedSenderKey
        envelope.ciphertext.length;

    const result = new Uint8Array(totalSize);
    let offset = 0;

    // [0]: version
    result[offset++] = envelope.version;

    // [1]: protocolId
    result[offset++] = envelope.protocolId;

    // [2..5]: ratchetCounter (big-endian uint32)
    result[offset++] = (envelope.ratchetCounter >>> 24) & 0xff;
    result[offset++] = (envelope.ratchetCounter >>> 16) & 0xff;
    result[offset++] = (envelope.ratchetCounter >>> 8) & 0xff;
    result[offset++] = envelope.ratchetCounter & 0xff;

    // [6..37]: senderPublicKey
    result.set(envelope.senderPublicKey, offset);
    offset += 32;

    // [38..69]: ephemeralPublicKey
    result.set(envelope.ephemeralPublicKey, offset);
    offset += 32;

    // [70..81]: nonce
    result.set(envelope.nonce, offset);
    offset += 12;

    // [82..129]: encryptedSenderKey
    result.set(envelope.encryptedSenderKey, offset);
    offset += 48;

    // [130..]: ciphertext
    result.set(envelope.ciphertext, offset);

    return result;
}

/**
 * Decodes bytes from transaction note to PSKEnvelope.
 */
export function decodePSKEnvelope(data: Uint8Array): PSKEnvelope {
    if (data.length < 2) {
        throw new PSKEnvelopeError(`Data too short: ${data.length} bytes`);
    }

    const version = data[0];
    const protocolId = data[1];

    if (version !== PSK_PROTOCOL.VERSION && version !== PSK_PROTOCOL.VERSION_AAD) {
        throw new PSKEnvelopeError(`Unsupported version: ${version}`);
    }

    if (protocolId !== PSK_PROTOCOL.PROTOCOL_ID) {
        throw new PSKEnvelopeError(`Unsupported protocol: ${protocolId}, expected PSK (0x02)`);
    }

    const minSize = PSK_PROTOCOL.HEADER_SIZE + PSK_PROTOCOL.TAG_SIZE;
    if (data.length < minSize) {
        throw new PSKEnvelopeError(`Data too short: ${data.length} bytes, need at least ${minSize}`);
    }

    // [2..5]: ratchetCounter (big-endian uint32)
    const ratchetCounter =
        (data[2] << 24) |
        (data[3] << 16) |
        (data[4] << 8) |
        data[5];
    // Ensure unsigned interpretation
    const unsignedCounter = ratchetCounter >>> 0;

    return {
        version,
        protocolId,
        ratchetCounter: unsignedCounter,
        senderPublicKey: data.slice(6, 38),
        ephemeralPublicKey: data.slice(38, 70),
        nonce: data.slice(70, 82),
        encryptedSenderKey: data.slice(82, 130),
        ciphertext: data.slice(130),
    };
}

/**
 * Checks if data is a PSK protocol message.
 */
export function isPSKMessage(data: Uint8Array): boolean {
    if (data.length < 2 || data[1] !== PSK_PROTOCOL.PROTOCOL_ID) return false;
    return data[0] === PSK_PROTOCOL.VERSION || data[0] === PSK_PROTOCOL.VERSION_AAD;
}
