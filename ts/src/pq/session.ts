/**
 * One-note PQ handshake (protocol 0x04) and steady-state messages (0x05).
 *
 * The ML-KEM ciphertext is 1088 bytes and fits in the 4096-byte note, so the
 * handshake is not split. 0x03 is not used.
 */

import { chacha20poly1305 } from '@noble/ciphers/chacha';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { randomBytes } from '@noble/ciphers/webcrypto';
import { generateEphemeralKeyPair, uint8ArrayEquals, x25519ECDH } from '../crypto/keys.js';
import type { X25519KeyPair } from '../models/types.js';
import { concatBytes, requireLength, sha256Bytes } from './bytes.js';
import { decapsulate, encapsulate } from './kem.js';
import { deriveHybridPQKey } from './kdf.js';
import {
    MAX_NOTE_SIZE,
} from '../models/types.js';
import {
    PQ_DATA_HEADER_SIZE,
    PQ_HANDSHAKE_SIZE,
    PQ_MAX_PAYLOAD_SIZE,
    PQ_PROTOCOL,
    PQError,
    type PQSession,
} from './types.js';

const SENDER_WRAP_INFO = new TextEncoder().encode('AlgoChatPQ-SenderKey');

export interface InitiatePQSessionInput {
    sender: X25519KeyPair;
    recipientPublicKey: Uint8Array;
    recipientEncapsKey: Uint8Array;
    /** 32-byte ML-KEM encapsulation coins. Omit for a random handshake. */
    kemRandomness?: Uint8Array;
}

export function isPQHandshake(note: Uint8Array): boolean {
    return note.length === PQ_HANDSHAKE_SIZE && note[0] === PQ_PROTOCOL.VERSION && note[1] === PQ_PROTOCOL.HANDSHAKE_ID;
}

export function isPQMessage(note: Uint8Array): boolean {
    return (
        note.length >= PQ_DATA_HEADER_SIZE + PQ_PROTOCOL.TAG_SIZE &&
        note[0] === PQ_PROTOCOL.VERSION &&
        note[1] === PQ_PROTOCOL.DATA_ID
    );
}

export function initiatePQSession(input: InitiatePQSessionInput): { note: Uint8Array; session: PQSession } {
    requireLength('recipient public key', input.recipientPublicKey, 32);
    requireLength('encapsulation key', input.recipientEncapsKey, PQ_PROTOCOL.MLKEM_EK_SIZE);

    const ephemeral = generateEphemeralKeyPair();
    const ecShared = x25519ECDH(ephemeral.privateKey, input.recipientPublicKey);
    const encapsulated = encapsulate(input.recipientEncapsKey, input.kemRandomness);
    const sessionKey = deriveHybridPQKey(ecShared, encapsulated.sharedSecret, {
        ephemeralPublicKey: ephemeral.publicKey,
        kemCiphertext: encapsulated.ciphertext,
        senderPublicKey: input.sender.publicKey,
        recipientPublicKey: input.recipientPublicKey,
        recipientEncapsKey: input.recipientEncapsKey,
    });

    const nonce = randomBytes(12);
    const prefix = handshakePrefix({
        senderPublicKey: input.sender.publicKey,
        recipientPublicKey: input.recipientPublicKey,
        ephemeralPublicKey: ephemeral.publicKey,
        kemCiphertext: encapsulated.ciphertext,
        encapsKey: input.recipientEncapsKey,
        nonce,
    });
    const wrapKey = senderWrapKey(
        ephemeral.privateKey,
        input.sender.publicKey,
        input.sender.publicKey,
        ephemeral.publicKey
    );
    const wrapped = chacha20poly1305(wrapKey, nonce, prefix).encrypt(sessionKey);
    if (wrapped.length !== PQ_PROTOCOL.ENCRYPTED_SESSION_KEY_SIZE) {
        throw new PQError('Wrapped session key is the wrong length');
    }
    const note = concatBytes(prefix, wrapped);
    if (note.length !== PQ_HANDSHAKE_SIZE || note.length > MAX_NOTE_SIZE) {
        throw new PQError(`Handshake note is ${note.length} bytes`);
    }
    return {
        note,
        session: sessionFrom(note, sessionKey, input.sender.publicKey, input.recipientPublicKey),
    };
}

export function acceptPQSession(
    note: Uint8Array,
    recipient: X25519KeyPair,
    recipientEncapsKey: Uint8Array,
    recipientDecapsKey: Uint8Array
): PQSession {
    const fields = parseHandshake(note);
    if (!uint8ArrayEquals(fields.recipientPublicKey, recipient.publicKey)) {
        throw new PQError('Handshake is for a different X25519 key');
    }
    if (!uint8ArrayEquals(fields.encapsKeyHash, sha256Bytes(recipientEncapsKey))) {
        throw new PQError('Handshake encapsulation key does not match');
    }
    const ecShared = x25519ECDH(recipient.privateKey, fields.ephemeralPublicKey);
    const pqShared = decapsulate(fields.kemCiphertext, recipientDecapsKey);
    const sessionKey = deriveHybridPQKey(ecShared, pqShared, {
        ephemeralPublicKey: fields.ephemeralPublicKey,
        kemCiphertext: fields.kemCiphertext,
        senderPublicKey: fields.senderPublicKey,
        recipientPublicKey: fields.recipientPublicKey,
        recipientEncapsKey,
    });
    return sessionFrom(note, sessionKey, fields.senderPublicKey, fields.recipientPublicKey);
}

/** Sender recovers the session from the handshake note and the long-term X25519 key. */
export function openPQSessionAsSender(note: Uint8Array, sender: X25519KeyPair): PQSession {
    const fields = parseHandshake(note);
    if (!uint8ArrayEquals(fields.senderPublicKey, sender.publicKey)) {
        throw new PQError('Handshake was not sent by this key');
    }
    const wrapKey = senderWrapKey(
        sender.privateKey,
        fields.ephemeralPublicKey,
        sender.publicKey,
        fields.ephemeralPublicKey
    );
    const prefix = note.slice(0, note.length - PQ_PROTOCOL.ENCRYPTED_SESSION_KEY_SIZE);
    let sessionKey: Uint8Array;
    try {
        sessionKey = chacha20poly1305(wrapKey, fields.nonce, prefix).decrypt(fields.wrappedSessionKey);
    } catch {
        throw new PQError('Handshake sender wrap failed');
    }
    requireLength('session key', sessionKey, 32);
    return sessionFrom(note, sessionKey, fields.senderPublicKey, fields.recipientPublicKey);
}

export function encryptPQMessage(plaintext: string, session: PQSession): Uint8Array {
    const message = new TextEncoder().encode(plaintext);
    if (message.length > PQ_MAX_PAYLOAD_SIZE) {
        throw new PQError(`Message too large: ${message.length} bytes, max ${PQ_MAX_PAYLOAD_SIZE}`);
    }
    const nonce = randomBytes(12);
    const header = dataHeader(session.senderPublicKey, session.handshakeId, nonce);
    const ciphertext = chacha20poly1305(session.sessionKey, nonce, header).encrypt(message);
    const note = concatBytes(header, ciphertext);
    if (note.length > MAX_NOTE_SIZE) {
        throw new PQError(`PQ message note is ${note.length} bytes`);
    }
    return note;
}

export function decryptPQMessage(note: Uint8Array, session: PQSession): string {
    if (!isPQMessage(note)) {
        throw new PQError('Not a PQ message');
    }
    const senderPublicKey = note.slice(2, 34);
    const handshakeId = note.slice(34, 66);
    const nonce = note.slice(66, 78);
    const ciphertext = note.slice(78);
    if (!uint8ArrayEquals(handshakeId, session.handshakeId)) {
        throw new PQError('Message is for a different handshake');
    }
    if (!uint8ArrayEquals(senderPublicKey, session.senderPublicKey)) {
        throw new PQError('Message sender does not match the handshake');
    }
    const header = note.slice(0, PQ_DATA_HEADER_SIZE);
    let plaintext: Uint8Array;
    try {
        plaintext = chacha20poly1305(session.sessionKey, nonce, header).decrypt(ciphertext);
    } catch {
        throw new PQError('PQ message authentication failed');
    }
    return new TextDecoder().decode(plaintext);
}

function sessionFrom(
    note: Uint8Array,
    sessionKey: Uint8Array,
    senderPublicKey: Uint8Array,
    recipientPublicKey: Uint8Array
): PQSession {
    return {
        sessionKey,
        senderPublicKey,
        recipientPublicKey,
        handshakeId: sha256Bytes(note),
    };
}

function handshakePrefix(fields: {
    senderPublicKey: Uint8Array;
    recipientPublicKey: Uint8Array;
    ephemeralPublicKey: Uint8Array;
    kemCiphertext: Uint8Array;
    encapsKey: Uint8Array;
    nonce: Uint8Array;
}): Uint8Array {
    const prefix = new Uint8Array(PQ_HANDSHAKE_SIZE - PQ_PROTOCOL.ENCRYPTED_SESSION_KEY_SIZE);
    let offset = 0;
    prefix[offset++] = PQ_PROTOCOL.VERSION;
    prefix[offset++] = PQ_PROTOCOL.HANDSHAKE_ID;
    prefix.set(fields.senderPublicKey, offset);
    offset += 32;
    prefix.set(fields.recipientPublicKey, offset);
    offset += 32;
    prefix.set(fields.ephemeralPublicKey, offset);
    offset += 32;
    prefix.set(fields.kemCiphertext, offset);
    offset += PQ_PROTOCOL.MLKEM_CT_SIZE;
    prefix.set(sha256Bytes(fields.encapsKey), offset);
    offset += 32;
    prefix.set(fields.nonce, offset);
    return prefix;
}

interface HandshakeFields {
    senderPublicKey: Uint8Array;
    recipientPublicKey: Uint8Array;
    ephemeralPublicKey: Uint8Array;
    kemCiphertext: Uint8Array;
    encapsKeyHash: Uint8Array;
    nonce: Uint8Array;
    wrappedSessionKey: Uint8Array;
}

function parseHandshake(note: Uint8Array): HandshakeFields {
    if (!isPQHandshake(note)) {
        throw new PQError(`PQ handshake must be ${PQ_HANDSHAKE_SIZE} bytes`);
    }
    let offset = 2;
    const senderPublicKey = note.slice(offset, offset + 32);
    offset += 32;
    const recipientPublicKey = note.slice(offset, offset + 32);
    offset += 32;
    const ephemeralPublicKey = note.slice(offset, offset + 32);
    offset += 32;
    const kemCiphertext = note.slice(offset, offset + PQ_PROTOCOL.MLKEM_CT_SIZE);
    offset += PQ_PROTOCOL.MLKEM_CT_SIZE;
    const encapsKeyHash = note.slice(offset, offset + 32);
    offset += 32;
    const nonce = note.slice(offset, offset + 12);
    offset += 12;
    const wrappedSessionKey = note.slice(offset, offset + PQ_PROTOCOL.ENCRYPTED_SESSION_KEY_SIZE);
    return {
        senderPublicKey,
        recipientPublicKey,
        ephemeralPublicKey,
        kemCiphertext,
        encapsKeyHash,
        nonce,
        wrappedSessionKey,
    };
}

function dataHeader(senderPublicKey: Uint8Array, handshakeId: Uint8Array, nonce: Uint8Array): Uint8Array {
    const header = new Uint8Array(PQ_DATA_HEADER_SIZE);
    header[0] = PQ_PROTOCOL.VERSION;
    header[1] = PQ_PROTOCOL.DATA_ID;
    header.set(senderPublicKey, 2);
    header.set(handshakeId, 34);
    header.set(nonce, 66);
    return header;
}

function senderWrapKey(
    privateKey: Uint8Array,
    otherPublicKey: Uint8Array,
    senderPublicKey: Uint8Array,
    ephemeralPublicKey: Uint8Array
): Uint8Array {
    const agreed = x25519ECDH(privateKey, otherPublicKey);
    return hkdf(sha256, agreed, ephemeralPublicKey, concatBytes(SENDER_WRAP_INFO, senderPublicKey), 32);
}
