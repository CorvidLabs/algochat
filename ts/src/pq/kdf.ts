/**
 * Hybrid session-key combiner.
 *
 * ikm is the X25519 secret followed by the ML-KEM secret. HKDF over that
 * concatenation needs both secrets. The transcript is the HKDF info, so a
 * swapped ciphertext or public key derives a different session key.
 */

import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { concatBytes, requireLength, sha256Bytes } from './bytes.js';
import { PQ_PROTOCOL, PQError } from './types.js';

const SALT = new TextEncoder().encode('algochat-pq-v1');
const INFO_LABEL = new TextEncoder().encode('algochat-pq-v1');

export interface HybridTranscript {
    ephemeralPublicKey: Uint8Array;
    kemCiphertext: Uint8Array;
    senderPublicKey: Uint8Array;
    recipientPublicKey: Uint8Array;
    recipientEncapsKey: Uint8Array;
}

export function deriveHybridPQKey(
    ecSharedSecret: Uint8Array,
    pqSharedSecret: Uint8Array,
    transcript: HybridTranscript
): Uint8Array {
    requireLength('X25519 shared secret', ecSharedSecret, 32);
    requireLength('ML-KEM shared secret', pqSharedSecret, 32);
    requireLength('ephemeral public key', transcript.ephemeralPublicKey, 32);
    requireLength('ML-KEM ciphertext', transcript.kemCiphertext, PQ_PROTOCOL.MLKEM_CT_SIZE);
    requireLength('sender public key', transcript.senderPublicKey, 32);
    requireLength('recipient public key', transcript.recipientPublicKey, 32);
    requireLength('encapsulation key', transcript.recipientEncapsKey, PQ_PROTOCOL.MLKEM_EK_SIZE);

    const ikm = concatBytes(ecSharedSecret, pqSharedSecret);
    const info = concatBytes(
        INFO_LABEL,
        transcript.ephemeralPublicKey,
        transcript.kemCiphertext,
        transcript.senderPublicKey,
        transcript.recipientPublicKey,
        sha256Bytes(transcript.recipientEncapsKey)
    );
    const key = hkdf(sha256, ikm, SALT, info, 32);
    if (key.length !== 32) {
        throw new PQError('Hybrid KDF returned a key that is not 32 bytes');
    }
    return key;
}
