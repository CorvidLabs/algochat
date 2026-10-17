/**
 * AlgoChat Web - Envelope Encoding/Decoding
 */

import { ChatEnvelope, PROTOCOL } from '../models/types.js';

export class EnvelopeError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'EnvelopeError';
    }
}

/**
 * Encodes a ChatEnvelope to bytes for transaction note
 */
export function encodeEnvelope(envelope: ChatEnvelope): Uint8Array {
    const totalSize =
        2 + // version + protocol
        32 + // sender public key
        32 + // ephemeral public key
        12 + // nonce
        48 + // encrypted sender key
        envelope.ciphertext.length;

    const result = new Uint8Array(totalSize);
    let offset = 0;

    result[offset++] = envelope.version;
    result[offset++] = envelope.protocolId;

    result.set(envelope.senderPublicKey, offset);
    offset += 32;

    result.set(envelope.ephemeralPublicKey, offset);
    offset += 32;

    result.set(envelope.nonce, offset);
    offset += 12;

    result.set(envelope.encryptedSenderKey, offset);
    offset += 48;

    result.set(envelope.ciphertext, offset);

    return result;
}

/**
 * Decodes bytes from transaction note to ChatEnvelope
 */
export function decodeEnvelope(data: Uint8Array): ChatEnvelope {
    if (data.length < 2) {
        throw new EnvelopeError(`Data too short: ${data.length} bytes`);
    }

    const version = data[0];
    const protocolId = data[1];

    if (protocolId !== PROTOCOL.PROTOCOL_ID) {
        throw new EnvelopeError(`Unsupported protocol: ${protocolId}`);
    }

    if (version !== PROTOCOL.VERSION && version !== PROTOCOL.VERSION_AAD) {
        throw new EnvelopeError(`Unsupported version: ${version}`);
    }

    const minSize = PROTOCOL.HEADER_SIZE + PROTOCOL.TAG_SIZE;
    if (data.length < minSize) {
        throw new EnvelopeError(`Data too short: ${data.length} bytes, need ${minSize}`);
    }

    return {
        version,
        protocolId,
        senderPublicKey: data.slice(2, 34),
        ephemeralPublicKey: data.slice(34, 66),
        nonce: data.slice(66, 78),
        encryptedSenderKey: data.slice(78, 126),
        ciphertext: data.slice(126),
    };
}

/**
 * Checks if data is an AlgoChat message
 */
export function isChatMessage(data: Uint8Array): boolean {
    if (data.length < 2 || data[1] !== PROTOCOL.PROTOCOL_ID) return false;
    return data[0] === PROTOCOL.VERSION || data[0] === PROTOCOL.VERSION_AAD;
}
