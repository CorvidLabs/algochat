/**
 * Signature verification for AlgoChat encryption keys.
 *
 * This module provides functions to sign encryption public keys with an
 * Algorand account's Ed25519 key, and verify those signatures. This prevents
 * key substitution attacks by proving key ownership.
 */

import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';

/** Size of an Ed25519 signature in bytes. */
export const ED25519_SIGNATURE_SIZE = 64;

/** Size of an Ed25519 public key in bytes. */
export const ED25519_PUBLIC_KEY_SIZE = 32;

/** Size of an X25519 public key in bytes. */
export const X25519_PUBLIC_KEY_SIZE = 32;

/**
 * Error thrown when signature operations fail.
 */
export class SignatureError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SignatureError';
    }
}

/**
 * Signs an encryption public key with an Ed25519 signing key.
 *
 * This creates a cryptographic proof that the encryption key belongs to
 * the holder of the Ed25519 private key (Algorand account).
 *
 * @param encryptionPublicKey - The X25519 public key to sign (32 bytes)
 * @param signingKey - The Ed25519 signing key (32 bytes private key)
 * @returns The Ed25519 signature (64 bytes)
 * @throws {SignatureError} If the key lengths are invalid
 */
export function signEncryptionKey(
    encryptionPublicKey: Uint8Array,
    signingKey: Uint8Array
): Uint8Array {
    if (encryptionPublicKey.length !== X25519_PUBLIC_KEY_SIZE) {
        throw new SignatureError(
            `Encryption public key must be ${X25519_PUBLIC_KEY_SIZE} bytes, got ${encryptionPublicKey.length}`
        );
    }

    if (signingKey.length !== ED25519_PUBLIC_KEY_SIZE) {
        throw new SignatureError(
            `Signing key must be ${ED25519_PUBLIC_KEY_SIZE} bytes, got ${signingKey.length}`
        );
    }

    return ed25519.sign(encryptionPublicKey, signingKey);
}

/**
 * Verifies that an encryption public key was signed by an Ed25519 key.
 *
 * This checks that the signature over the X25519 encryption key was
 * created by the Ed25519 private key corresponding to the given public key.
 *
 * @param encryptionPublicKey - The X25519 public key (32 bytes)
 * @param verifyingKey - The Ed25519 public key (32 bytes, e.g., Algorand address bytes)
 * @param signature - The Ed25519 signature to verify (64 bytes)
 * @returns `true` if the signature is valid, `false` otherwise
 * @throws {SignatureError} If the key or signature lengths are invalid
 */
export function verifyEncryptionKey(
    encryptionPublicKey: Uint8Array,
    verifyingKey: Uint8Array,
    signature: Uint8Array
): boolean {
    if (encryptionPublicKey.length !== X25519_PUBLIC_KEY_SIZE) {
        throw new SignatureError(
            `Encryption public key must be ${X25519_PUBLIC_KEY_SIZE} bytes, got ${encryptionPublicKey.length}`
        );
    }

    if (verifyingKey.length !== ED25519_PUBLIC_KEY_SIZE) {
        throw new SignatureError(
            `Verifying key must be ${ED25519_PUBLIC_KEY_SIZE} bytes, got ${verifyingKey.length}`
        );
    }

    if (signature.length !== ED25519_SIGNATURE_SIZE) {
        throw new SignatureError(
            `Signature must be ${ED25519_SIGNATURE_SIZE} bytes, got ${signature.length}`
        );
    }

    try {
        return ed25519.verify(signature, encryptionPublicKey, verifyingKey);
    } catch {
        return false;
    }
}

/**
 * Gets the Ed25519 public key from a private key.
 *
 * @param privateKey - The Ed25519 private key (32 bytes)
 * @returns The Ed25519 public key (32 bytes)
 */
export function getPublicKey(privateKey: Uint8Array): Uint8Array {
    return ed25519.getPublicKey(privateKey);
}

/**
 * Generates a human-readable fingerprint for an encryption public key.
 *
 * The fingerprint is a truncated SHA-256 hash formatted for easy comparison.
 *
 * @param publicKey - The encryption public key (32 bytes)
 * @returns A fingerprint string like "A7B3C9D1 E5F28A4B"
 */
export function fingerprint(publicKey: Uint8Array): string {
    const hash = sha256(publicKey);

    // Take first 8 bytes and format as hex groups
    const hexBytes = Array.from(hash.slice(0, 8))
        .map(b => b.toString(16).toUpperCase().padStart(2, '0'));

    // Group into pairs of bytes (4 chars each), space separated
    const groups: string[] = [];
    for (let i = 0; i < hexBytes.length; i += 2) {
        groups.push(hexBytes[i] + hexBytes[i + 1]);
    }

    return groups.join(' ');
}
