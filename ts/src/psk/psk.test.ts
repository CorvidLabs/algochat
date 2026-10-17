/**
 * AlgoChat Web - PSK v1.1 Protocol Tests
 */

import { describe, test, expect } from 'bun:test';
import { deriveEncryptionKeys, uint8ArrayEquals } from '../crypto/keys.js';
import {
    deriveSessionPSK,
    derivePositionPSK,
    derivePSKAtCounter,
} from './ratchet.js';
import {
    encodePSKEnvelope,
    decodePSKEnvelope,
    isPSKMessage,
} from './envelope.js';
import {
    encryptPSKMessage,
    decryptPSKMessage,
} from './encryption.js';
import {
    createPSKState,
    validateCounter,
    recordReceive,
    advanceSendCounter,
} from './state.js';
import {
    createPSKExchangeURI,
    parsePSKExchangeURI,
} from './exchange.js';
import { PSK_PROTOCOL } from './types.js';
import { MAX_NOTE_SIZE } from '../models/types.js';

/**
 * Helper: convert Uint8Array to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

// Test vectors from the Swift reference implementation
const INITIAL_PSK = new Uint8Array(32).fill(0xaa);

describe('PSK Ratchet Vectors', () => {
    test('session 0 matches test vector', () => {
        const session0 = deriveSessionPSK(INITIAL_PSK, 0);
        expect(bytesToHex(session0)).toBe(
            'a031707ea9e9e50bd8ea4eb9a2bd368465ea1aff14caab293d38954b4717e888',
        );
    });

    test('session 1 matches test vector', () => {
        const session1 = deriveSessionPSK(INITIAL_PSK, 1);
        expect(bytesToHex(session1)).toBe(
            '994cffbb4f84fa5410d44574bb9fa7408a8c2f1ed2b3a00f5168fc74c71f7cea',
        );
    });

    test('counter 0 matches test vector', () => {
        const counter0 = derivePSKAtCounter(INITIAL_PSK, 0);
        expect(bytesToHex(counter0)).toBe(
            '2918fd486b9bd024d712f6234b813c0f4167237d60c2c1fca37326b20497c165',
        );
    });

    test('counter 99 matches test vector', () => {
        const counter99 = derivePSKAtCounter(INITIAL_PSK, 99);
        expect(bytesToHex(counter99)).toBe(
            '5b48a50a25261f6b63fe9c867b46be46de4d747c3477db6290045ba519a4d38b',
        );
    });

    test('counter 100 matches test vector (session boundary)', () => {
        const counter100 = derivePSKAtCounter(INITIAL_PSK, 100);
        expect(bytesToHex(counter100)).toBe(
            '7a15d3add6a28858e6a1f1ea0d22bdb29b7e129a1330c4908d9b46a460992694',
        );
    });

    test('counter 100 uses session 1, position 0', () => {
        // Verify that counter 100 equals session1's position 0
        const session1 = deriveSessionPSK(INITIAL_PSK, 1);
        const position0 = derivePositionPSK(session1, 0);
        const counter100 = derivePSKAtCounter(INITIAL_PSK, 100);

        expect(uint8ArrayEquals(position0, counter100)).toBe(true);
    });

    test('different counters produce different keys', () => {
        const key0 = derivePSKAtCounter(INITIAL_PSK, 0);
        const key1 = derivePSKAtCounter(INITIAL_PSK, 1);

        expect(uint8ArrayEquals(key0, key1)).toBe(false);
    });
});

describe('PSK Envelope Encoding/Decoding', () => {
    test('round-trip encode and decode', () => {
        const original = {
            version: PSK_PROTOCOL.VERSION,
            protocolId: PSK_PROTOCOL.PROTOCOL_ID,
            ratchetCounter: 42,
            senderPublicKey: new Uint8Array(32).fill(0xaa),
            ephemeralPublicKey: new Uint8Array(32).fill(0xbb),
            nonce: new Uint8Array(12).fill(0xcc),
            encryptedSenderKey: new Uint8Array(48).fill(0xdd),
            ciphertext: new Uint8Array(100).fill(0xee),
        };

        const encoded = encodePSKEnvelope(original);
        const decoded = decodePSKEnvelope(encoded);

        expect(decoded.version).toBe(original.version);
        expect(decoded.protocolId).toBe(original.protocolId);
        expect(decoded.ratchetCounter).toBe(original.ratchetCounter);
        expect(uint8ArrayEquals(decoded.senderPublicKey, original.senderPublicKey)).toBe(true);
        expect(uint8ArrayEquals(decoded.ephemeralPublicKey, original.ephemeralPublicKey)).toBe(true);
        expect(uint8ArrayEquals(decoded.nonce, original.nonce)).toBe(true);
        expect(uint8ArrayEquals(decoded.encryptedSenderKey, original.encryptedSenderKey)).toBe(true);
        expect(uint8ArrayEquals(decoded.ciphertext, original.ciphertext)).toBe(true);
    });

    test('header size is 130 bytes', () => {
        const envelope = {
            version: PSK_PROTOCOL.VERSION,
            protocolId: PSK_PROTOCOL.PROTOCOL_ID,
            ratchetCounter: 0,
            senderPublicKey: new Uint8Array(32),
            ephemeralPublicKey: new Uint8Array(32),
            nonce: new Uint8Array(12),
            encryptedSenderKey: new Uint8Array(48),
            ciphertext: new Uint8Array(0),
        };

        const encoded = encodePSKEnvelope(envelope);
        expect(encoded.length).toBe(PSK_PROTOCOL.HEADER_SIZE);
    });

    test('isPSKMessage detects PSK messages', () => {
        const pskData = new Uint8Array([0x01, 0x02, ...new Array(150).fill(0)]);
        expect(isPSKMessage(pskData)).toBe(true);
    });

    test('isPSKMessage rejects non-PSK messages', () => {
        // Standard protocol (either version)
        expect(isPSKMessage(new Uint8Array([0x01, 0x01]))).toBe(false);
        expect(isPSKMessage(new Uint8Array([0x02, 0x01]))).toBe(false);
        // Unsupported version
        expect(isPSKMessage(new Uint8Array([0x03, 0x02]))).toBe(false);
        // Too short
        expect(isPSKMessage(new Uint8Array([0x01]))).toBe(false);
        expect(isPSKMessage(new Uint8Array([]))).toBe(false);
    });

    test('isPSKMessage accepts VERSION and VERSION_AAD (#232)', () => {
        expect(isPSKMessage(new Uint8Array([0x01, 0x02]))).toBe(true);
        expect(isPSKMessage(new Uint8Array([0x02, 0x02]))).toBe(true);
    });

    test('preserves large counter values', () => {
        const original = {
            version: PSK_PROTOCOL.VERSION,
            protocolId: PSK_PROTOCOL.PROTOCOL_ID,
            ratchetCounter: 0xffffffff,
            senderPublicKey: new Uint8Array(32),
            ephemeralPublicKey: new Uint8Array(32),
            nonce: new Uint8Array(12),
            encryptedSenderKey: new Uint8Array(48),
            ciphertext: new Uint8Array(20),
        };

        const encoded = encodePSKEnvelope(original);
        const decoded = decodePSKEnvelope(encoded);

        expect(decoded.ratchetCounter).toBe(0xffffffff);
    });
});

describe('PSK note capacity', () => {
    const aliceKeys = deriveEncryptionKeys(new Uint8Array(32).fill(1));
    const bobKeys = deriveEncryptionKeys(new Uint8Array(32).fill(2));
    const currentPSK = derivePSKAtCounter(INITIAL_PSK, 0);

    test('plaintext of 878 bytes still encrypts inside 1024', () => {
        const plaintext = 'A'.repeat(878);
        const envelope = encryptPSKMessage(
            plaintext,
            aliceKeys.publicKey,
            bobKeys.publicKey,
            currentPSK,
            0,
        );
        const note = encodePSKEnvelope(envelope);
        const decrypted = decryptPSKMessage(
            envelope,
            bobKeys.privateKey,
            bobKeys.publicKey,
            currentPSK,
        );

        expect(decrypted?.text).toBe(plaintext);
        expect(note.length).toBe(1024);
        expect(note.length).toBeLessThanOrEqual(1024);
    });

    test('plaintext of 3950 bytes encodes to a note of exactly 4096', () => {
        expect(PSK_PROTOCOL.MAX_PAYLOAD_SIZE).toBe(3950);
        const plaintext = 'B'.repeat(PSK_PROTOCOL.MAX_PAYLOAD_SIZE);
        const envelope = encryptPSKMessage(
            plaintext,
            aliceKeys.publicKey,
            bobKeys.publicKey,
            currentPSK,
            0,
        );
        const note = encodePSKEnvelope(envelope);

        expect(note.length).toBe(4096);
        expect(note.length).toBe(MAX_NOTE_SIZE);
    });

    test('one byte over the PSK plaintext max fails before a note is built', () => {
        expect(() =>
            encryptPSKMessage(
                'C'.repeat(PSK_PROTOCOL.MAX_PAYLOAD_SIZE + 1),
                aliceKeys.publicKey,
                bobKeys.publicKey,
                currentPSK,
                0,
            ),
        ).toThrow(/too large/i);
    });
});

describe('PSK Encrypt/Decrypt', () => {
    const aliceKeys = deriveEncryptionKeys(new Uint8Array(32).fill(1));
    const bobKeys = deriveEncryptionKeys(new Uint8Array(32).fill(2));
    const currentPSK = derivePSKAtCounter(INITIAL_PSK, 0);

    test('recipient can decrypt message', () => {
        const original = 'Hello from PSK protocol!';

        const envelope = encryptPSKMessage(
            original,
            aliceKeys.publicKey,
            bobKeys.publicKey,
            currentPSK,
            0,
        );

        const decrypted = decryptPSKMessage(
            envelope,
            bobKeys.privateKey,
            bobKeys.publicKey,
            currentPSK,
        );

        expect(decrypted).not.toBeNull();
        expect(decrypted?.text).toBe(original);
    });

    test('sender can decrypt own message (bidirectional)', () => {
        const original = 'Testing PSK sender self-decrypt';

        const envelope = encryptPSKMessage(
            original,
            aliceKeys.publicKey,
            bobKeys.publicKey,
            currentPSK,
            0,
        );

        const decrypted = decryptPSKMessage(
            envelope,
            aliceKeys.privateKey,
            aliceKeys.publicKey,
            currentPSK,
        );

        expect(decrypted).not.toBeNull();
        expect(decrypted?.text).toBe(original);
    });

    test('wrong PSK fails to decrypt', () => {
        const original = 'Secret message';
        const wrongPSK = derivePSKAtCounter(INITIAL_PSK, 1);

        const envelope = encryptPSKMessage(
            original,
            aliceKeys.publicKey,
            bobKeys.publicKey,
            currentPSK,
            0,
        );

        expect(() => {
            decryptPSKMessage(
                envelope,
                bobKeys.privateKey,
                bobKeys.publicKey,
                wrongPSK,
            );
        }).toThrow();
    });

    test('handles unicode correctly', () => {
        const original = 'Hello! Bonjour! Hallo! Ciao! Hola!';

        const envelope = encryptPSKMessage(
            original,
            aliceKeys.publicKey,
            bobKeys.publicKey,
            currentPSK,
            0,
        );

        const decrypted = decryptPSKMessage(
            envelope,
            bobKeys.privateKey,
            bobKeys.publicKey,
            currentPSK,
        );

        expect(decrypted?.text).toBe(original);
    });

    test('envelope has correct protocol fields', () => {
        const envelope = encryptPSKMessage(
            'test',
            aliceKeys.publicKey,
            bobKeys.publicKey,
            currentPSK,
            42,
        );

        expect(envelope.version).toBe(PSK_PROTOCOL.VERSION_AAD);
        expect(envelope.protocolId).toBe(PSK_PROTOCOL.PROTOCOL_ID);
        expect(envelope.ratchetCounter).toBe(42);
    });

    test('full round-trip with encode/decode', () => {
        const original = 'Full PSK round-trip test!';

        const envelope = encryptPSKMessage(
            original,
            aliceKeys.publicKey,
            bobKeys.publicKey,
            currentPSK,
            0,
        );

        // Encode to bytes
        const encoded = encodePSKEnvelope(envelope);
        expect(isPSKMessage(encoded)).toBe(true);

        // Decode from bytes
        const decoded = decodePSKEnvelope(encoded);

        // Decrypt
        const decrypted = decryptPSKMessage(
            decoded,
            bobKeys.privateKey,
            bobKeys.publicKey,
            currentPSK,
        );

        expect(decrypted?.text).toBe(original);
    });
});

describe('PSK State Counter Management', () => {
    test('createPSKState initializes with zeros', () => {
        const state = createPSKState();

        expect(state.sendCounter).toBe(0);
        expect(state.peerLastCounter).toBe(0);
        expect(state.seenCounters.size).toBe(0);
    });

    test('advanceSendCounter increments', () => {
        let state = createPSKState();

        const result0 = advanceSendCounter(state);
        expect(result0.counter).toBe(0);
        state = result0.state;

        const result1 = advanceSendCounter(state);
        expect(result1.counter).toBe(1);
        state = result1.state;

        const result2 = advanceSendCounter(state);
        expect(result2.counter).toBe(2);
    });

    test('validateCounter accepts new counters within window', () => {
        const state = createPSKState();

        expect(validateCounter(state, 0)).toBe(true);
        expect(validateCounter(state, 100)).toBe(true);
        expect(validateCounter(state, 200)).toBe(true);
    });

    test('validateCounter rejects seen counters', () => {
        let state = createPSKState();
        state = recordReceive(state, 5);

        expect(validateCounter(state, 5)).toBe(false);
    });

    test('validateCounter rejects counters outside window', () => {
        let state = createPSKState();
        state = recordReceive(state, 500);

        // Counter 0 is now outside window (500 - 200 = 300)
        expect(validateCounter(state, 0)).toBe(false);
        // Counter within window is still valid
        expect(validateCounter(state, 400)).toBe(true);
    });

    test('recordReceive updates peerLastCounter', () => {
        let state = createPSKState();

        state = recordReceive(state, 10);
        expect(state.peerLastCounter).toBe(10);

        state = recordReceive(state, 5);
        expect(state.peerLastCounter).toBe(10); // Should not decrease

        state = recordReceive(state, 20);
        expect(state.peerLastCounter).toBe(20);
    });

    test('recordReceive prunes old counters', () => {
        let state = createPSKState();

        // Add several counters
        state = recordReceive(state, 0);
        state = recordReceive(state, 1);
        state = recordReceive(state, 2);

        // Jump far ahead
        state = recordReceive(state, 500);

        // Old counters (0, 1, 2) should be pruned (below 500 - 200 = 300)
        expect(state.seenCounters.has(0)).toBe(false);
        expect(state.seenCounters.has(1)).toBe(false);
        expect(state.seenCounters.has(2)).toBe(false);
        expect(state.seenCounters.has(500)).toBe(true);
    });
});

describe('PSK Exchange URI', () => {
    test('round-trip encode and parse', () => {
        const address = 'TESTADDRESS1234567890';
        const psk = new Uint8Array(32).fill(0xab);
        const label = 'My Chat';

        const uri = createPSKExchangeURI(address, psk, label);
        const parsed = parsePSKExchangeURI(uri);

        expect(parsed.address).toBe(address);
        expect(uint8ArrayEquals(parsed.psk, psk)).toBe(true);
        expect(parsed.label).toBe(label);
    });

    test('round-trip without label', () => {
        const address = 'ALGO_ADDRESS';
        const psk = new Uint8Array(32).fill(0xcd);

        const uri = createPSKExchangeURI(address, psk);
        const parsed = parsePSKExchangeURI(uri);

        expect(parsed.address).toBe(address);
        expect(uint8ArrayEquals(parsed.psk, psk)).toBe(true);
        expect(parsed.label).toBeUndefined();
    });

    test('URI starts with correct scheme', () => {
        const uri = createPSKExchangeURI('ADDR', new Uint8Array(32));
        expect(uri.startsWith('algochat-psk://v1?')).toBe(true);
    });

    test('rejects invalid scheme', () => {
        expect(() => {
            parsePSKExchangeURI('https://example.com');
        }).toThrow();
    });

    test('rejects missing addr parameter', () => {
        expect(() => {
            parsePSKExchangeURI('algochat-psk://v1?psk=AAAA');
        }).toThrow();
    });

    test('rejects missing psk parameter', () => {
        expect(() => {
            parsePSKExchangeURI('algochat-psk://v1?addr=TEST');
        }).toThrow();
    });

    test('handles special characters in label', () => {
        const address = 'ADDR';
        const psk = new Uint8Array(32).fill(0xef);
        const label = 'My Chat & Friends!';

        const uri = createPSKExchangeURI(address, psk, label);
        const parsed = parsePSKExchangeURI(uri);

        expect(parsed.label).toBe(label);
    });
});

describe('PSK header AAD binding (#232)', () => {
    const aliceKeys = deriveEncryptionKeys(new Uint8Array(32).fill(1));
    const bobKeys = deriveEncryptionKeys(new Uint8Array(32).fill(2));
    const currentPSK = derivePSKAtCounter(INITIAL_PSK, 0);

    test('round-trip succeeds with header bound as AAD', () => {
        const envelope = encryptPSKMessage('aad-psk', aliceKeys.publicKey, bobKeys.publicKey, currentPSK, 7);
        const decrypted = decryptPSKMessage(envelope, bobKeys.privateKey, bobKeys.publicKey, currentPSK);
        expect(decrypted?.text).toBe('aad-psk');
    });

    test('version 0x02→0x01 downgrade fails closed', () => {
        const envelope = encryptPSKMessage('secret', aliceKeys.publicKey, bobKeys.publicKey, currentPSK, 0);
        envelope.version = PSK_PROTOCOL.VERSION;
        expect(() =>
            decryptPSKMessage(envelope, bobKeys.privateKey, bobKeys.publicKey, currentPSK),
        ).toThrow();
    });

    test('protocolId flip fails closed', () => {
        const envelope = encryptPSKMessage('secret', aliceKeys.publicKey, bobKeys.publicKey, currentPSK, 0);
        envelope.protocolId = 0x01;
        expect(() =>
            decryptPSKMessage(envelope, bobKeys.privateKey, bobKeys.publicKey, currentPSK),
        ).toThrow();
    });

    test('ratchetCounter mutation fails closed', () => {
        const envelope = encryptPSKMessage('secret', aliceKeys.publicKey, bobKeys.publicKey, currentPSK, 3);
        envelope.ratchetCounter = 4;
        expect(() =>
            decryptPSKMessage(envelope, bobKeys.privateKey, bobKeys.publicKey, currentPSK),
        ).toThrow();
    });
});

describe('PSK envelope header fuzz (#232)', () => {
    test('random single-byte header mutations fail decrypt', () => {
        const aliceKeys = deriveEncryptionKeys(new Uint8Array(32).fill(7));
        const bobKeys = deriveEncryptionKeys(new Uint8Array(32).fill(8));
        const currentPSK = derivePSKAtCounter(INITIAL_PSK, 0);
        const envelope = encryptPSKMessage('fuzz', aliceKeys.publicKey, bobKeys.publicKey, currentPSK, 0);
        const encoded = encodePSKEnvelope(envelope);

        let failures = 0;
        for (let i = 0; i < PSK_PROTOCOL.HEADER_SIZE; i++) {
            const mutated = new Uint8Array(encoded);
            mutated[i] = (mutated[i] + 1) & 0xff;
            try {
                const decoded = decodePSKEnvelope(mutated);
                decryptPSKMessage(decoded, bobKeys.privateKey, bobKeys.publicKey, currentPSK);
            } catch {
                failures += 1;
                continue;
            }
        }
        expect(failures).toBe(PSK_PROTOCOL.HEADER_SIZE);
    });
});
