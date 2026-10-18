/**
 * ML-KEM-768 key pair derived from the same 32-byte account seed as the
 * X25519 encryption key, under different HKDF labels. The library does not
 * implement ML-KEM itself.
 */

import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';
import { randomBytes } from '@noble/ciphers/webcrypto';
import { concatBytes, requireLength } from './bytes.js';
import { PQ_PROTOCOL, PQError, type MLKEMKeyPair } from './types.js';

const SALT = new TextEncoder().encode('AlgoChat-v1-mlkem768');
const INFO_D = new TextEncoder().encode('mlkem768-d');
const INFO_Z = new TextEncoder().encode('mlkem768-z');

export function deriveMLKEMKeyPair(seed: Uint8Array): MLKEMKeyPair {
    requireLength('account seed', seed, 32);
    const d = hkdf(sha256, seed, SALT, INFO_D, 32);
    const z = hkdf(sha256, seed, SALT, INFO_Z, 32);
    const keys = ml_kem768.keygen(concatBytes(d, z));
    if (keys.publicKey.length !== PQ_PROTOCOL.MLKEM_EK_SIZE) {
        throw new PQError(`Encapsulation key must be ${PQ_PROTOCOL.MLKEM_EK_SIZE} bytes`);
    }
    if (keys.secretKey.length !== PQ_PROTOCOL.MLKEM_DK_SIZE) {
        throw new PQError(`Decapsulation key must be ${PQ_PROTOCOL.MLKEM_DK_SIZE} bytes`);
    }
    return { encapsKey: keys.publicKey, decapsKey: keys.secretKey };
}

export function encapsulate(
    recipientEncapsKey: Uint8Array,
    randomness?: Uint8Array
): { ciphertext: Uint8Array; sharedSecret: Uint8Array } {
    requireLength('encapsulation key', recipientEncapsKey, PQ_PROTOCOL.MLKEM_EK_SIZE);
    const coins = randomness ?? randomBytes(32);
    requireLength('ML-KEM randomness', coins, 32);
    const encapsulated = ml_kem768.encapsulate(recipientEncapsKey, coins);
    if (encapsulated.cipherText.length !== PQ_PROTOCOL.MLKEM_CT_SIZE) {
        throw new PQError(`ML-KEM ciphertext must be ${PQ_PROTOCOL.MLKEM_CT_SIZE} bytes`);
    }
    if (encapsulated.sharedSecret.length !== 32) {
        throw new PQError('ML-KEM shared secret must be 32 bytes');
    }
    return { ciphertext: encapsulated.cipherText, sharedSecret: encapsulated.sharedSecret };
}

export function decapsulate(ciphertext: Uint8Array, decapsKey: Uint8Array): Uint8Array {
    requireLength('ML-KEM ciphertext', ciphertext, PQ_PROTOCOL.MLKEM_CT_SIZE);
    requireLength('decapsulation key', decapsKey, PQ_PROTOCOL.MLKEM_DK_SIZE);
    const secret = ml_kem768.decapsulate(ciphertext, decapsKey);
    requireLength('ML-KEM shared secret', secret, 32);
    return secret;
}
