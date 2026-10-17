/**
 * Tests for signature module.
 */

import { describe, test, expect } from 'bun:test';
import {
    signEncryptionKey,
    verifyEncryptionKey,
    getPublicKey,
    fingerprint,
    SignatureError,
    ED25519_SIGNATURE_SIZE,
} from './signature.js';
import { randomBytes } from '@noble/ciphers/webcrypto';

describe('signature', () => {
    test('sign and verify roundtrip', () => {
        // Generate Ed25519 key pair
        const signingKey = randomBytes(32);
        const verifyingKey = getPublicKey(signingKey);

        // Fake X25519 public key (32 bytes)
        const encryptionKey = new Uint8Array(32).fill(42);

        const signature = signEncryptionKey(encryptionKey, signingKey);
        expect(signature.length).toBe(ED25519_SIGNATURE_SIZE);

        const valid = verifyEncryptionKey(encryptionKey, verifyingKey, signature);
        expect(valid).toBe(true);
    });

    test('verify with wrong key fails', () => {
        const signingKey = randomBytes(32);
        const wrongKey = getPublicKey(randomBytes(32));

        const encryptionKey = new Uint8Array(32).fill(42);
        const signature = signEncryptionKey(encryptionKey, signingKey);

        const valid = verifyEncryptionKey(encryptionKey, wrongKey, signature);
        expect(valid).toBe(false);
    });

    test('verify with wrong message fails', () => {
        const signingKey = randomBytes(32);
        const verifyingKey = getPublicKey(signingKey);

        const encryptionKey = new Uint8Array(32).fill(42);
        const wrongKey = new Uint8Array(32).fill(99);

        const signature = signEncryptionKey(encryptionKey, signingKey);

        const valid = verifyEncryptionKey(wrongKey, verifyingKey, signature);
        expect(valid).toBe(false);
    });

    test('fingerprint format', () => {
        const key = new Uint8Array(32).fill(0);
        const fp = fingerprint(key);

        // Should be 4 groups of 4 hex chars separated by spaces: "XXXX XXXX XXXX XXXX"
        expect(fp.length).toBe(19);
        expect(fp.match(/^[0-9A-F]{4} [0-9A-F]{4} [0-9A-F]{4} [0-9A-F]{4}$/)).toBeTruthy();
    });

    test('fingerprint is deterministic', () => {
        const key = new Uint8Array(32).fill(123);
        const fp1 = fingerprint(key);
        const fp2 = fingerprint(key);

        expect(fp1).toBe(fp2);
    });

    test('different keys have different fingerprints', () => {
        const key1 = new Uint8Array(32).fill(1);
        const key2 = new Uint8Array(32).fill(2);

        expect(fingerprint(key1)).not.toBe(fingerprint(key2));
    });

    test('invalid encryption key length throws', () => {
        const signingKey = randomBytes(32);

        expect(() => {
            signEncryptionKey(new Uint8Array(16), signingKey);
        }).toThrow(SignatureError);
    });

    test('invalid signing key length throws', () => {
        const encryptionKey = new Uint8Array(32).fill(42);

        expect(() => {
            signEncryptionKey(encryptionKey, new Uint8Array(16));
        }).toThrow(SignatureError);
    });

    test('invalid signature length throws', () => {
        const encryptionKey = new Uint8Array(32).fill(42);
        const verifyingKey = getPublicKey(randomBytes(32));

        expect(() => {
            verifyEncryptionKey(encryptionKey, verifyingKey, new Uint8Array(32));
        }).toThrow(SignatureError);
    });
});
