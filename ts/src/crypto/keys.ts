/**
 * AlgoChat Web - Key Derivation
 *
 * Derives X25519 encryption keys from Algorand account.
 */

import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { x25519 } from '@noble/curves/ed25519';
import type { X25519KeyPair } from '../models/types.js';

const KEY_DERIVATION_SALT = new TextEncoder().encode('AlgoChat-v1-encryption');
const KEY_DERIVATION_INFO = new TextEncoder().encode('x25519-key');

/**
 * Derives X25519 encryption keys from an Algorand account seed
 *
 * @param seed - 32-byte private seed from Algorand mnemonic
 * @returns X25519 key pair for encryption
 */
export function deriveEncryptionKeys(seed: Uint8Array): X25519KeyPair {
    if (seed.length !== 32) {
        throw new Error(`Seed must be 32 bytes, got ${seed.length}`);
    }

    // Derive encryption seed using HKDF-SHA256
    const encryptionSeed = hkdf(sha256, seed, KEY_DERIVATION_SALT, KEY_DERIVATION_INFO, 32);

    // Create X25519 key pair
    const privateKey = encryptionSeed;
    const publicKey = x25519.getPublicKey(privateKey);

    return { privateKey, publicKey };
}

/**
 * Generates a random X25519 key pair (for ephemeral keys)
 */
export function generateEphemeralKeyPair(): X25519KeyPair {
    const privateKey = x25519.utils.randomPrivateKey();
    const publicKey = x25519.getPublicKey(privateKey);
    return { privateKey, publicKey };
}

/**
 * Performs X25519 ECDH key agreement
 */
export function x25519ECDH(privateKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
    return x25519.getSharedSecret(privateKey, publicKey);
}

/**
 * Compares two Uint8Arrays for equality in constant time.
 *
 * Uses XOR accumulation to avoid early-return timing side-channels.
 * The length check short-circuits (leaks length difference only, which
 * is not secret in any AlgoChat usage), but the content comparison
 * always examines every byte regardless of where a mismatch occurs.
 */
export function uint8ArrayEquals(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
        diff |= a[i] ^ b[i];
    }
    return diff === 0;
}
