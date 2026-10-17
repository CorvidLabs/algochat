/**
 * AlgoChat Web - Encryption Tests
 */

import { describe, test, expect } from 'bun:test';
import { chacha20poly1305 } from '@noble/ciphers/chacha';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { randomBytes } from '@noble/ciphers/webcrypto';
import { PROTOCOL } from '../models/types.js';
import { deriveEncryptionKeys, generateEphemeralKeyPair, uint8ArrayEquals, x25519ECDH } from './keys.js';
import { encryptMessage, decryptMessage } from './encryption.js';
import { encodeEnvelope, decodeEnvelope, isChatMessage } from './envelope.js';

describe('Key Derivation', () => {
    test('derives consistent keys from same seed', () => {
        const seed = new Uint8Array(32).fill(42);

        const keys1 = deriveEncryptionKeys(seed);
        const keys2 = deriveEncryptionKeys(seed);

        expect(uint8ArrayEquals(keys1.privateKey, keys2.privateKey)).toBe(true);
        expect(uint8ArrayEquals(keys1.publicKey, keys2.publicKey)).toBe(true);
    });

    test('derives different keys from different seeds', () => {
        const seed1 = new Uint8Array(32).fill(1);
        const seed2 = new Uint8Array(32).fill(2);

        const keys1 = deriveEncryptionKeys(seed1);
        const keys2 = deriveEncryptionKeys(seed2);

        expect(uint8ArrayEquals(keys1.privateKey, keys2.privateKey)).toBe(false);
    });

    test('public key is 32 bytes', () => {
        const seed = new Uint8Array(32).fill(0);
        const keys = deriveEncryptionKeys(seed);

        expect(keys.publicKey.length).toBe(32);
        expect(keys.privateKey.length).toBe(32);
    });
});

describe('Ephemeral Keys', () => {
    test('generates unique keys each time', () => {
        const pair1 = generateEphemeralKeyPair();
        const pair2 = generateEphemeralKeyPair();

        expect(uint8ArrayEquals(pair1.privateKey, pair2.privateKey)).toBe(false);
    });
});

describe('Envelope Encoding', () => {
    test('encodes and decodes envelope correctly', () => {
        const original = {
            version: 0x01,
            protocolId: 0x01,
            senderPublicKey: new Uint8Array(32).fill(0xaa),
            ephemeralPublicKey: new Uint8Array(32).fill(0xbb),
            nonce: new Uint8Array(12).fill(0xcc),
            encryptedSenderKey: new Uint8Array(48).fill(0xdd),
            ciphertext: new Uint8Array(100).fill(0xee),
        };

        const encoded = encodeEnvelope(original);
        const decoded = decodeEnvelope(encoded);

        expect(decoded.version).toBe(original.version);
        expect(decoded.protocolId).toBe(original.protocolId);
        expect(uint8ArrayEquals(decoded.senderPublicKey, original.senderPublicKey)).toBe(true);
        expect(uint8ArrayEquals(decoded.ephemeralPublicKey, original.ephemeralPublicKey)).toBe(true);
        expect(uint8ArrayEquals(decoded.nonce, original.nonce)).toBe(true);
        expect(uint8ArrayEquals(decoded.encryptedSenderKey, original.encryptedSenderKey)).toBe(true);
        expect(uint8ArrayEquals(decoded.ciphertext, original.ciphertext)).toBe(true);
    });

    test('isChatMessage returns true for valid messages', () => {
        const data = new Uint8Array([0x01, 0x01, ...new Array(140).fill(0)]);
        expect(isChatMessage(data)).toBe(true);
    });

    test('isChatMessage returns false for invalid messages', () => {
        expect(isChatMessage(new Uint8Array([0x03, 0x01]))).toBe(false);
        expect(isChatMessage(new Uint8Array([0x01, 0x02]))).toBe(false);
        expect(isChatMessage(new Uint8Array([0x01]))).toBe(false);
        expect(isChatMessage(new Uint8Array([]))).toBe(false);
    });

    test('isChatMessage accepts VERSION_AAD (#232)', () => {
        expect(isChatMessage(new Uint8Array([0x02, 0x01, ...new Array(140).fill(0)]))).toBe(true);
    });
});

describe('Message Encryption', () => {
    test('recipient can decrypt message', () => {
        const senderKeys = deriveEncryptionKeys(new Uint8Array(32).fill(1));
        const recipientKeys = deriveEncryptionKeys(new Uint8Array(32).fill(2));

        const original = 'Hello, AlgoChat!';

        const envelope = encryptMessage(
            original,
            senderKeys.publicKey,
            recipientKeys.publicKey
        );

        const decrypted = decryptMessage(envelope, recipientKeys.privateKey, recipientKeys.publicKey);

        expect(decrypted).not.toBeNull();
        expect(decrypted?.text).toBe(original);
    });

    test('sender can decrypt their own message (bidirectional)', () => {
        const senderKeys = deriveEncryptionKeys(new Uint8Array(32).fill(1));
        const recipientKeys = deriveEncryptionKeys(new Uint8Array(32).fill(2));

        const original = 'Hello, AlgoChat!';

        const envelope = encryptMessage(
            original,
            senderKeys.publicKey,
            recipientKeys.publicKey
        );

        const decrypted = decryptMessage(envelope, senderKeys.privateKey, senderKeys.publicKey);

        expect(decrypted).not.toBeNull();
        expect(decrypted?.text).toBe(original);
    });

    test('ephemeral keys are unique per message', () => {
        const senderKeys = deriveEncryptionKeys(new Uint8Array(32).fill(1));
        const recipientKeys = deriveEncryptionKeys(new Uint8Array(32).fill(2));

        const envelope1 = encryptMessage('Message 1', senderKeys.publicKey, recipientKeys.publicKey);
        const envelope2 = encryptMessage('Message 2', senderKeys.publicKey, recipientKeys.publicKey);

        expect(uint8ArrayEquals(envelope1.ephemeralPublicKey, envelope2.ephemeralPublicKey)).toBe(false);
    });

    test('nonces are unique per message', () => {
        const senderKeys = deriveEncryptionKeys(new Uint8Array(32).fill(1));
        const recipientKeys = deriveEncryptionKeys(new Uint8Array(32).fill(2));

        const envelope1 = encryptMessage('Message 1', senderKeys.publicKey, recipientKeys.publicKey);
        const envelope2 = encryptMessage('Message 2', senderKeys.publicKey, recipientKeys.publicKey);

        expect(uint8ArrayEquals(envelope1.nonce, envelope2.nonce)).toBe(false);
    });

    test('handles unicode correctly', () => {
        const senderKeys = deriveEncryptionKeys(new Uint8Array(32).fill(1));
        const recipientKeys = deriveEncryptionKeys(new Uint8Array(32).fill(2));

        const original = 'Hello! Bonjour! Hallo! Ciao! Hola!';

        const envelope = encryptMessage(
            original,
            senderKeys.publicKey,
            recipientKeys.publicKey
        );

        const decrypted = decryptMessage(envelope, recipientKeys.privateKey, recipientKeys.publicKey);

        expect(decrypted?.text).toBe(original);
    });

    test('key-publish payload returns null', () => {
        const senderKeys = deriveEncryptionKeys(new Uint8Array(32).fill(1));

        // Self-encrypt key-publish payload
        const envelope = encryptMessage(
            '{"type":"key-publish"}',
            senderKeys.publicKey,
            senderKeys.publicKey
        );

        const decrypted = decryptMessage(envelope, senderKeys.privateKey, senderKeys.publicKey);

        expect(decrypted).toBeNull();
    });
});

describe('Full Round-Trip', () => {
    test('message survives encode/decode/decrypt cycle', () => {
        const senderKeys = deriveEncryptionKeys(new Uint8Array(32).fill(1));
        const recipientKeys = deriveEncryptionKeys(new Uint8Array(32).fill(2));

        const original = 'This is a test message for the full round-trip!';

        // Encrypt
        const envelope = encryptMessage(
            original,
            senderKeys.publicKey,
            recipientKeys.publicKey
        );

        // Encode to bytes (as would be stored in transaction note)
        const encoded = encodeEnvelope(envelope);

        // Verify it's a chat message
        expect(isChatMessage(encoded)).toBe(true);

        // Decode from bytes
        const decoded = decodeEnvelope(encoded);

        // Decrypt
        const decrypted = decryptMessage(decoded, recipientKeys.privateKey, recipientKeys.publicKey);

        expect(decrypted?.text).toBe(original);
    });
});

describe('PSK Encryption', () => {
    const psk = new Uint8Array(32).fill(0xaa);
    const wrongPsk = new Uint8Array(32).fill(0xbb);
    const senderKeys = deriveEncryptionKeys(new Uint8Array(32).fill(1));
    const recipientKeys = deriveEncryptionKeys(new Uint8Array(32).fill(2));
    const original = 'Hello with PSK!';

    test('recipient can decrypt PSK-encrypted message', () => {
        const envelope = encryptMessage(
            original,
            senderKeys.publicKey,
            recipientKeys.publicKey,
            { psk }
        );

        const decrypted = decryptMessage(
            envelope,
            recipientKeys.privateKey,
            recipientKeys.publicKey,
            { psk }
        );

        expect(decrypted).not.toBeNull();
        expect(decrypted?.text).toBe(original);
    });

    test('sender can decrypt PSK-encrypted message (bidirectional)', () => {
        const envelope = encryptMessage(
            original,
            senderKeys.publicKey,
            recipientKeys.publicKey,
            { psk }
        );

        const decrypted = decryptMessage(
            envelope,
            senderKeys.privateKey,
            senderKeys.publicKey,
            { psk }
        );

        expect(decrypted).not.toBeNull();
        expect(decrypted?.text).toBe(original);
    });

    test('PSK-encrypted message cannot be decrypted without PSK', () => {
        const envelope = encryptMessage(
            original,
            senderKeys.publicKey,
            recipientKeys.publicKey,
            { psk }
        );

        expect(() =>
            decryptMessage(
                envelope,
                recipientKeys.privateKey,
                recipientKeys.publicKey
            )
        ).toThrow();
    });

    test('non-PSK message cannot be decrypted with PSK', () => {
        const envelope = encryptMessage(
            original,
            senderKeys.publicKey,
            recipientKeys.publicKey
        );

        expect(() =>
            decryptMessage(
                envelope,
                recipientKeys.privateKey,
                recipientKeys.publicKey,
                { psk }
            )
        ).toThrow();
    });

    test('wrong PSK causes decryption failure', () => {
        const envelope = encryptMessage(
            original,
            senderKeys.publicKey,
            recipientKeys.publicKey,
            { psk }
        );

        expect(() =>
            decryptMessage(
                envelope,
                recipientKeys.privateKey,
                recipientKeys.publicKey,
                { psk: wrongPsk }
            )
        ).toThrow();
    });

    test('empty PSK behaves like no PSK', () => {
        const envelope = encryptMessage(
            original,
            senderKeys.publicKey,
            recipientKeys.publicKey,
            { psk: new Uint8Array(0) }
        );

        const decrypted = decryptMessage(
            envelope,
            recipientKeys.privateKey,
            recipientKeys.publicKey
        );

        expect(decrypted).not.toBeNull();
        expect(decrypted?.text).toBe(original);
    });

    test('invalid PSK length throws EncryptionError', () => {
        const shortPsk = new Uint8Array(16).fill(0xcc);

        expect(() =>
            encryptMessage(
                original,
                senderKeys.publicKey,
                recipientKeys.publicKey,
                { psk: shortPsk }
            )
        ).toThrow(/Invalid PSK length/);
    });

    test('undefined PSK behaves like no PSK (backwards compatible)', () => {
        const envelope = encryptMessage(
            original,
            senderKeys.publicKey,
            recipientKeys.publicKey,
            { psk: undefined }
        );

        // Should decrypt without any options
        const decrypted = decryptMessage(
            envelope,
            recipientKeys.privateKey,
            recipientKeys.publicKey
        );

        expect(decrypted).not.toBeNull();
        expect(decrypted?.text).toBe(original);
    });

    test('full round-trip with PSK: encrypt → encode → decode → decrypt', () => {
        const envelope = encryptMessage(
            original,
            senderKeys.publicKey,
            recipientKeys.publicKey,
            { psk }
        );

        const encoded = encodeEnvelope(envelope);
        expect(isChatMessage(encoded)).toBe(true);

        const decoded = decodeEnvelope(encoded);

        const decrypted = decryptMessage(
            decoded,
            recipientKeys.privateKey,
            recipientKeys.publicKey,
            { psk }
        );

        expect(decrypted?.text).toBe(original);
    });
});

describe('header AAD binding (#232)', () => {
    test('round-trip succeeds with header bound as AAD', () => {
        const senderKeys = deriveEncryptionKeys(new Uint8Array(32).fill(1));
        const recipientKeys = deriveEncryptionKeys(new Uint8Array(32).fill(2));
        const envelope = encryptMessage('aad-bound', senderKeys.publicKey, recipientKeys.publicKey);
        const decrypted = decryptMessage(envelope, recipientKeys.privateKey, recipientKeys.publicKey);
        expect(decrypted?.text).toBe('aad-bound');
    });

    test('tampering with protocolId fails closed', () => {
        const senderKeys = deriveEncryptionKeys(new Uint8Array(32).fill(1));
        const recipientKeys = deriveEncryptionKeys(new Uint8Array(32).fill(2));
        const envelope = encryptMessage('secret', senderKeys.publicKey, recipientKeys.publicKey);
        // Downgrade / rewrite protocol byte after AEAD seal.
        envelope.protocolId = 0x02;
        expect(() =>
            decryptMessage(envelope, recipientKeys.privateKey, recipientKeys.publicKey),
        ).toThrow();
    });

    test('tampering with version fails closed', () => {
        const senderKeys = deriveEncryptionKeys(new Uint8Array(32).fill(1));
        const recipientKeys = deriveEncryptionKeys(new Uint8Array(32).fill(2));
        const envelope = encryptMessage('secret', senderKeys.publicKey, recipientKeys.publicKey);
        // Downgrade to legacy version so decrypt skips AAD against an AAD seal.
        envelope.version = 0x01;
        expect(() =>
            decryptMessage(envelope, recipientKeys.privateKey, recipientKeys.publicKey),
        ).toThrow();
    });

    test('sender path also decrypts AAD-bound envelopes', () => {
        const senderKeys = deriveEncryptionKeys(new Uint8Array(32).fill(3));
        const recipientKeys = deriveEncryptionKeys(new Uint8Array(32).fill(4));
        const envelope = encryptMessage('legacy-ok', senderKeys.publicKey, recipientKeys.publicKey);
        const asSender = decryptMessage(envelope, senderKeys.privateKey, senderKeys.publicKey);
        expect(asSender?.text).toBe('legacy-ok');
    });
});

describe('envelope header fuzz (#232)', () => {
    test('random single-byte header mutations fail decrypt', () => {
        const senderKeys = deriveEncryptionKeys(new Uint8Array(32).fill(5));
        const recipientKeys = deriveEncryptionKeys(new Uint8Array(32).fill(6));
        const envelope = encryptMessage('fuzz', senderKeys.publicKey, recipientKeys.publicKey);
        const encoded = encodeEnvelope(envelope);

        let failures = 0;
        // Flip every header byte except we skip ciphertext region.
        for (let i = 0; i < 126; i++) {
            const mutated = new Uint8Array(encoded);
            mutated[i] = (mutated[i] + 1) & 0xff;
            try {
                const decoded = decodeEnvelope(mutated);
                decryptMessage(decoded, recipientKeys.privateKey, recipientKeys.publicKey);
                // version/protocol mutations may throw at decode; others at decrypt.
            } catch {
                failures += 1;
                continue;
            }
            // If decode+decrypt both succeeded, that is a miss — count it.
        }
        // Every header byte flip must fail closed (decode or decrypt).
        expect(failures).toBe(126);
    });
});

describe('legacy VERSION 0x01 no-AAD decrypt path (#232)', () => {
    test('seals with two-arg chacha20poly1305 at PROTOCOL.VERSION and decrypts', () => {
        const senderKeys = deriveEncryptionKeys(new Uint8Array(32).fill(9));
        const recipientKeys = deriveEncryptionKeys(new Uint8Array(32).fill(10));
        const plaintext = new TextEncoder().encode('legacy-no-aad');

        const ephemeral = generateEphemeralKeyPair();
        const sharedSecret = x25519ECDH(ephemeral.privateKey, recipientKeys.publicKey);
        const infoPrefix = new TextEncoder().encode('AlgoChatV1');
        const info = new Uint8Array(infoPrefix.length + 64);
        info.set(infoPrefix, 0);
        info.set(senderKeys.publicKey, infoPrefix.length);
        info.set(recipientKeys.publicKey, infoPrefix.length + 32);
        const symmetricKey = hkdf(sha256, sharedSecret, ephemeral.publicKey, info, 32);

        const nonce = randomBytes(12);

        // Sender-copy key wrap (same as encryptMessage, independent of AAD).
        const senderShared = x25519ECDH(ephemeral.privateKey, senderKeys.publicKey);
        const senderInfoPrefix = new TextEncoder().encode('AlgoChatV1-SenderKey');
        const senderInfo = new Uint8Array(senderInfoPrefix.length + 32);
        senderInfo.set(senderInfoPrefix, 0);
        senderInfo.set(senderKeys.publicKey, senderInfoPrefix.length);
        const senderEncryptionKey = hkdf(sha256, senderShared, ephemeral.publicKey, senderInfo, 32);
        const encryptedSenderKey = chacha20poly1305(senderEncryptionKey, nonce).encrypt(symmetricKey);

        // Two-arg seal — no AAD — at legacy PROTOCOL.VERSION.
        const ciphertext = chacha20poly1305(symmetricKey, nonce).encrypt(plaintext);

        const envelope = {
            version: PROTOCOL.VERSION,
            protocolId: PROTOCOL.PROTOCOL_ID,
            senderPublicKey: senderKeys.publicKey,
            ephemeralPublicKey: ephemeral.publicKey,
            nonce,
            encryptedSenderKey,
            ciphertext,
        };

        const decrypted = decryptMessage(envelope, recipientKeys.privateKey, recipientKeys.publicKey);
        expect(decrypted?.text).toBe('legacy-no-aad');

        const asSender = decryptMessage(envelope, senderKeys.privateKey, senderKeys.publicKey);
        expect(asSender?.text).toBe('legacy-no-aad');
        expect(envelope.version).toBe(PROTOCOL.VERSION);
    });
});
