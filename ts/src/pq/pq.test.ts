import { describe, expect, test } from 'bun:test';
import { chacha20poly1305 } from '@noble/ciphers/chacha';
import { ed25519 } from '@noble/curves/ed25519';
import { parseKeyAnnouncement } from '../blockchain/discovery.js';
import { deriveEncryptionKeys } from '../crypto/keys.js';
import { isChatMessage } from '../crypto/envelope.js';
import { isPSKMessage } from '../psk/envelope.js';
import { encodePQKeyAnnouncement, parsePQKeyAnnouncement } from './announce.js';
import { deriveMLKEMKeyPair } from './kem.js';
import { deriveHybridPQKey } from './kdf.js';
import {
    acceptPQSession,
    decryptPQMessage,
    encryptPQMessage,
    initiatePQSession,
    isPQHandshake,
    isPQMessage,
    openPQSessionAsSender,
} from './session.js';
import { PQ_DATA_HEADER_SIZE, PQ_HANDSHAKE_SIZE, PQ_MAX_PAYLOAD_SIZE, PQ_PROTOCOL } from './types.js';
import { MAX_NOTE_SIZE } from '../models/types.js';

const HYBRID_VECTOR = '9b393e8cec553ada4821c1fa04b40bf499446b19ca9218fd8dcf8b705e06d734';

const ALICE_SEED = new Uint8Array(32).fill(0x11);
const BOB_SEED = new Uint8Array(32).fill(0x22);
const KEM_COINS = new Uint8Array(32).fill(0x33);

describe('hybrid PQ session', () => {
    test('handshake fits one note and both sides derive the same key', () => {
        const alice = deriveEncryptionKeys(ALICE_SEED);
        const bob = deriveEncryptionKeys(BOB_SEED);
        const aliceKem = deriveMLKEMKeyPair(ALICE_SEED);
        const bobKem = deriveMLKEMKeyPair(BOB_SEED);
        const { note, session } = initiatePQSession({
            sender: alice,
            senderEncapsKey: aliceKem.encapsKey,
            recipientPublicKey: bob.publicKey,
            recipientEncapsKey: bobKem.encapsKey,
            kemRandomness: KEM_COINS,
        });

        expect(note.length).toBe(PQ_HANDSHAKE_SIZE);
        expect(note.length).toBeLessThanOrEqual(4096);
        expect(isPQHandshake(note)).toBe(true);
        expect(isChatMessage(note)).toBe(false);
        expect(isPSKMessage(note)).toBe(false);

        const accepted = acceptPQSession(note, bob, bobKem.encapsKey, bobKem.decapsKey);
        expect(Buffer.from(accepted.sessionKey).equals(Buffer.from(session.sessionKey))).toBe(true);
        expect(Buffer.from(accepted.handshakeId).equals(Buffer.from(session.handshakeId))).toBe(true);

        const reopened = openPQSessionAsSender(note, alice, aliceKem.decapsKey);
        expect(Buffer.from(reopened.sessionKey).equals(Buffer.from(session.sessionKey))).toBe(true);

        const stranger = deriveMLKEMKeyPair(new Uint8Array(32).fill(0x44));
        expect(() => openPQSessionAsSender(note, alice, stranger.decapsKey)).toThrow(/sender wrap failed/);
    });

    test('a message round-trips and a flipped byte fails closed', () => {
        const alice = deriveEncryptionKeys(ALICE_SEED);
        const bob = deriveEncryptionKeys(BOB_SEED);
        const aliceKem = deriveMLKEMKeyPair(ALICE_SEED);
        const bobKem = deriveMLKEMKeyPair(BOB_SEED);
        const { note, session } = initiatePQSession({
            sender: alice,
            senderEncapsKey: aliceKem.encapsKey,
            recipientPublicKey: bob.publicKey,
            recipientEncapsKey: bobKem.encapsKey,
        });
        const bobSession = acceptPQSession(note, bob, bobKem.encapsKey, bobKem.decapsKey);
        const message = encryptPQMessage('quantum hello', session);
        expect(isPQMessage(message)).toBe(true);
        expect(decryptPQMessage(message, bobSession)).toBe('quantum hello');
        expect(decryptPQMessage(message, openPQSessionAsSender(note, alice, aliceKem.decapsKey))).toBe(
            'quantum hello'
        );

        const tagFlip = new Uint8Array(message);
        tagFlip[tagFlip.length - 1] ^= 0x01;
        expect(() => decryptPQMessage(tagFlip, bobSession)).toThrow(/authentication failed/);
        const bodyFlip = new Uint8Array(message);
        bodyFlip[PQ_DATA_HEADER_SIZE] ^= 0x01;
        expect(() => decryptPQMessage(bodyFlip, bobSession)).toThrow(/authentication failed/);
    });

    test('the full plaintext budget fits and one extra byte does not', () => {
        const alice = deriveEncryptionKeys(ALICE_SEED);
        const bob = deriveEncryptionKeys(BOB_SEED);
        const aliceKem = deriveMLKEMKeyPair(ALICE_SEED);
        const bobKem = deriveMLKEMKeyPair(BOB_SEED);
        const { session } = initiatePQSession({
            sender: alice,
            senderEncapsKey: aliceKem.encapsKey,
            recipientPublicKey: bob.publicKey,
            recipientEncapsKey: bobKem.encapsKey,
        });
        const full = 'x'.repeat(PQ_MAX_PAYLOAD_SIZE);
        const note = encryptPQMessage(full, session);
        expect(note.length).toBeLessThanOrEqual(4096);
        expect(decryptPQMessage(note, session)).toBe(full);
        expect(() => encryptPQMessage('x'.repeat(PQ_MAX_PAYLOAD_SIZE + 1), session)).toThrow(/too large/);

        const extra = new TextEncoder().encode('x'.repeat(PQ_MAX_PAYLOAD_SIZE + 1));
        const nonce = new Uint8Array(12).fill(9);
        const header = new Uint8Array(PQ_DATA_HEADER_SIZE);
        header[0] = PQ_PROTOCOL.VERSION;
        header[1] = PQ_PROTOCOL.DATA_ID;
        header.set(session.senderPublicKey, 2);
        header.set(session.handshakeId, 34);
        header.set(nonce, 66);
        const ciphertext = chacha20poly1305(session.sessionKey, nonce, header).encrypt(extra);
        const oversized = new Uint8Array(header.length + ciphertext.length);
        oversized.set(header, 0);
        oversized.set(ciphertext, header.length);
        expect(oversized.length).toBe(MAX_NOTE_SIZE + 1);
        const authenticated = chacha20poly1305(session.sessionKey, nonce, header).decrypt(ciphertext);
        expect(authenticated.length).toBe(PQ_MAX_PAYLOAD_SIZE + 1);
        expect(() => decryptPQMessage(oversized, session)).toThrow(/4096/);
    });

    test('a signed announcement verifies and is not an X25519 key', () => {
        const bob = deriveEncryptionKeys(BOB_SEED);
        const kem = deriveMLKEMKeyPair(BOB_SEED);
        const signing = ed25519.utils.randomPrivateKey();
        const verifying = ed25519.getPublicKey(signing);
        const note = encodePQKeyAnnouncement(kem.encapsKey, signing);
        expect(note.length).toBeLessThanOrEqual(4096);
        const parsed = parsePQKeyAnnouncement(note, verifying);
        expect(parsed?.isVerified).toBe(true);
        expect(Buffer.from(parsed!.encapsKey).equals(Buffer.from(kem.encapsKey))).toBe(true);
        expect(parseKeyAnnouncement(note, verifying)).toBeUndefined();
        expect(parsePQKeyAnnouncement(note, bob.publicKey)).toBeUndefined();
    });

    test('unsigned announcement is unverified and a bad signature is dropped', () => {
        const kem = deriveMLKEMKeyPair(BOB_SEED);
        const unsigned = encodePQKeyAnnouncement(kem.encapsKey);
        expect(parsePQKeyAnnouncement(unsigned)?.isVerified).toBe(false);
        const junk = new Uint8Array(unsigned.length + 64);
        junk.set(unsigned);
        const verifying = ed25519.getPublicKey(ed25519.utils.randomPrivateKey());
        expect(parsePQKeyAnnouncement(junk, verifying)).toBeUndefined();
    });

    test('the hybrid KDF changes when the ciphertext changes', () => {
        const ek = deriveMLKEMKeyPair(BOB_SEED).encapsKey;
        const base = {
            ephemeralPublicKey: new Uint8Array(32).fill(1),
            kemCiphertext: new Uint8Array(PQ_PROTOCOL.MLKEM_CT_SIZE).fill(2),
            senderPublicKey: new Uint8Array(32).fill(3),
            recipientPublicKey: new Uint8Array(32).fill(4),
            recipientEncapsKey: ek,
        };
        const left = deriveHybridPQKey(new Uint8Array(32).fill(5), new Uint8Array(32).fill(6), base);
        const flipped = new Uint8Array(base.kemCiphertext);
        flipped[0] ^= 1;
        const right = deriveHybridPQKey(new Uint8Array(32).fill(5), new Uint8Array(32).fill(6), {
            ...base,
            kemCiphertext: flipped,
        });
        expect(Buffer.from(left).equals(Buffer.from(right))).toBe(false);
        expect(Buffer.from(left).toString('hex')).toBe(HYBRID_VECTOR);
    });
});
