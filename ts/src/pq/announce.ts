/**
 * One-note ML-KEM encapsulation-key announcement.
 *
 * Magic "ACPQ" keeps these notes out of the 32-byte X25519 announcement parser.
 * A 64-byte Ed25519 signature is optional. A present signature that does not
 * verify is rejected. No signature is unverified trust-on-first-use, the same
 * rule as an unsigned X25519 announcement.
 */

import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { ED25519_SIGNATURE_SIZE } from '../crypto/signature.js';
import { concatBytes, requireLength } from './bytes.js';
import { PQ_ANNOUNCE_MAGIC, PQ_ANNOUNCE_VERSION, PQ_PROTOCOL } from './types.js';

const SIGN_LABEL = new TextEncoder().encode('AlgoChat-pq-ek-v1');

const UNSIGNED_SIZE = PQ_ANNOUNCE_MAGIC.length + 1 + PQ_PROTOCOL.MLKEM_EK_SIZE;
const SIGNED_SIZE = UNSIGNED_SIZE + ED25519_SIGNATURE_SIZE;

export interface PQAnnouncement {
    encapsKey: Uint8Array;
    isVerified: boolean;
}

export function pqAnnouncementSigningInput(encapsKey: Uint8Array): Uint8Array {
    requireLength('encapsulation key', encapsKey, PQ_PROTOCOL.MLKEM_EK_SIZE);
    return sha256(concatBytes(SIGN_LABEL, new Uint8Array([PQ_ANNOUNCE_VERSION]), encapsKey));
}

export function encodePQKeyAnnouncement(encapsKey: Uint8Array, signingKey?: Uint8Array): Uint8Array {
    requireLength('encapsulation key', encapsKey, PQ_PROTOCOL.MLKEM_EK_SIZE);
    const body = concatBytes(PQ_ANNOUNCE_MAGIC, new Uint8Array([PQ_ANNOUNCE_VERSION]), encapsKey);
    if (!signingKey) return body;
    requireLength('Ed25519 signing key', signingKey, 32);
    const signature = ed25519.sign(pqAnnouncementSigningInput(encapsKey), signingKey);
    return concatBytes(body, signature);
}

export function parsePQKeyAnnouncement(note: Uint8Array, ed25519PublicKey?: Uint8Array): PQAnnouncement | undefined {
    if (!startsWithMagic(note)) return undefined;
    if (note.length !== UNSIGNED_SIZE && note.length !== SIGNED_SIZE) return undefined;
    if (note[PQ_ANNOUNCE_MAGIC.length] !== PQ_ANNOUNCE_VERSION) return undefined;
    const encapsKey = note.slice(PQ_ANNOUNCE_MAGIC.length + 1, UNSIGNED_SIZE);
    if (note.length === UNSIGNED_SIZE) {
        return { encapsKey, isVerified: false };
    }
    if (!ed25519PublicKey) return undefined;
    const signature = note.slice(UNSIGNED_SIZE);
    try {
        const ok = ed25519.verify(signature, pqAnnouncementSigningInput(encapsKey), ed25519PublicKey);
        if (!ok) return undefined;
    } catch {
        return undefined;
    }
    return { encapsKey, isVerified: true };
}

export function isPQKeyAnnouncement(note: Uint8Array): boolean {
    return startsWithMagic(note);
}

function startsWithMagic(note: Uint8Array): boolean {
    if (note.length < PQ_ANNOUNCE_MAGIC.length) return false;
    for (let index = 0; index < PQ_ANNOUNCE_MAGIC.length; index++) {
        if (note[index] !== PQ_ANNOUNCE_MAGIC[index]) return false;
    }
    return true;
}


