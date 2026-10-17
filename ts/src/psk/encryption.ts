/**
 * AlgoChat Web - PSK Message Encryption/Decryption
 *
 * Implements hybrid ECDH + PSK encryption with ChaCha20-Poly1305.
 * Provides forward secrecy via ephemeral keys and additional authentication
 * via pre-shared keys.
 */

import { chacha20poly1305 } from '@noble/ciphers/chacha';
import { randomBytes } from '@noble/ciphers/webcrypto';
import { generateEphemeralKeyPair, x25519ECDH, uint8ArrayEquals } from '../crypto/keys.js';
import { pskHeaderAAD } from '../crypto/aad.js';
import { type DecryptedContent } from '../models/types.js';
import { PSK_PROTOCOL, type PSKEnvelope } from './types.js';
import { deriveHybridSymmetricKey, deriveSenderKey } from './ratchet.js';

export class PSKEncryptionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PSKEncryptionError';
    }
}

/**
 * Encrypts a message using the PSK protocol.
 *
 * @param plaintext - Message text to encrypt
 * @param senderPublicKey - Sender's X25519 public key
 * @param recipientPublicKey - Recipient's X25519 public key
 * @param currentPSK - Current ratchet-derived PSK (32 bytes)
 * @param ratchetCounter - Current ratchet counter value
 * @returns PSKEnvelope containing encrypted message
 */
export function encryptPSKMessage(
    plaintext: string,
    senderPublicKey: Uint8Array,
    recipientPublicKey: Uint8Array,
    currentPSK: Uint8Array,
    ratchetCounter: number,
): PSKEnvelope {
    const messageBytes = new TextEncoder().encode(plaintext);

    if (messageBytes.length > PSK_PROTOCOL.MAX_PAYLOAD_SIZE) {
        throw new PSKEncryptionError(
            `Message too large: ${messageBytes.length} bytes, max ${PSK_PROTOCOL.MAX_PAYLOAD_SIZE}`,
        );
    }

    // Step 1: Generate ephemeral key pair
    const ephemeral = generateEphemeralKeyPair();

    // Step 2: ECDH with recipient: ephemeral_private * recipient_public
    const sharedSecret = x25519ECDH(ephemeral.privateKey, recipientPublicKey);

    // Step 3: Derive hybrid symmetric key
    const symmetricKey = deriveHybridSymmetricKey(
        sharedSecret,
        currentPSK,
        ephemeral.publicKey,
        senderPublicKey,
        recipientPublicKey,
    );

    // Step 4: Random 12-byte nonce
    const nonce = randomBytes(12);

    // Step 5: ECDH with sender: ephemeral_private * sender_public
    const senderSharedSecret = x25519ECDH(ephemeral.privateKey, senderPublicKey);

    // Step 6: Derive sender key for bidirectional decryption
    const senderEncryptionKey = deriveSenderKey(
        senderSharedSecret,
        currentPSK,
        ephemeral.publicKey,
        senderPublicKey,
    );

    // Step 7: Encrypt symmetric key with sender key (same nonce) before
    // binding the full fixed header as AAD on the payload (#232).
    const senderCipher = chacha20poly1305(senderEncryptionKey, nonce);
    const encryptedSenderKey = senderCipher.encrypt(symmetricKey);

    // Step 8: Encrypt message with ChaCha20-Poly1305, header as AAD
    const version = PSK_PROTOCOL.VERSION_AAD;
    const aad = pskHeaderAAD({
        version,
        protocolId: PSK_PROTOCOL.PROTOCOL_ID,
        ratchetCounter,
        senderPublicKey,
        ephemeralPublicKey: ephemeral.publicKey,
        nonce,
        encryptedSenderKey,
    });
    const cipher = chacha20poly1305(symmetricKey, nonce, aad);
    const ciphertextWithTag = cipher.encrypt(messageBytes);

    // Step 9: Build PSKEnvelope
    return {
        version,
        protocolId: PSK_PROTOCOL.PROTOCOL_ID,
        ratchetCounter,
        senderPublicKey,
        ephemeralPublicKey: ephemeral.publicKey,
        nonce,
        encryptedSenderKey,
        ciphertext: ciphertextWithTag,
    };
}

/**
 * Decrypts a PSK message envelope.
 *
 * Automatically detects if we are the sender or recipient and uses
 * the appropriate decryption path.
 *
 * @param envelope - PSK envelope to decrypt
 * @param recipientPrivateKey - Our X25519 private key
 * @param recipientPublicKey - Our X25519 public key
 * @param currentPSK - Current ratchet-derived PSK (32 bytes)
 * @returns Decrypted message content, or null for key-publish payloads
 */
export function decryptPSKMessage(
    envelope: PSKEnvelope,
    recipientPrivateKey: Uint8Array,
    recipientPublicKey: Uint8Array,
    currentPSK: Uint8Array,
): DecryptedContent | null {
    const weAreSender = uint8ArrayEquals(recipientPublicKey, envelope.senderPublicKey);

    let plaintext: Uint8Array;

    if (weAreSender) {
        plaintext = decryptPSKAsSender(envelope, recipientPrivateKey, recipientPublicKey, currentPSK);
    } else {
        plaintext = decryptPSKAsRecipient(envelope, recipientPrivateKey, recipientPublicKey, currentPSK);
    }

    // Check for key-publish payload
    if (isKeyPublishPayload(plaintext)) {
        return null;
    }

    return parseMessagePayload(plaintext);
}

/**
 * Decrypts a PSK message as the recipient.
 */
function decryptPSKAsRecipient(
    envelope: PSKEnvelope,
    recipientPrivateKey: Uint8Array,
    recipientPublicKey: Uint8Array,
    currentPSK: Uint8Array,
): Uint8Array {
    // ECDH: recipient_private * ephemeral_public
    const sharedSecret = x25519ECDH(recipientPrivateKey, envelope.ephemeralPublicKey);

    // Derive hybrid symmetric key
    const symmetricKey = deriveHybridSymmetricKey(
        sharedSecret,
        currentPSK,
        envelope.ephemeralPublicKey,
        envelope.senderPublicKey,
        recipientPublicKey,
    );

    return decryptPskCiphertextWithHeaderAAD(symmetricKey, envelope);
}

/**
 * Decrypts a PSK message as the sender (bidirectional decryption).
 */
function decryptPSKAsSender(
    envelope: PSKEnvelope,
    senderPrivateKey: Uint8Array,
    senderPublicKey: Uint8Array,
    currentPSK: Uint8Array,
): Uint8Array {
    // Step 1: ECDH: sender_private * ephemeral_public
    const sharedSecret = x25519ECDH(senderPrivateKey, envelope.ephemeralPublicKey);

    // Step 2: Derive sender key
    const senderDecryptionKey = deriveSenderKey(
        sharedSecret,
        currentPSK,
        envelope.ephemeralPublicKey,
        senderPublicKey,
    );

    // Step 3: Decrypt the symmetric key
    const senderCipher = chacha20poly1305(senderDecryptionKey, envelope.nonce);
    const symmetricKey = senderCipher.decrypt(envelope.encryptedSenderKey);

    // Step 4: Decrypt message using recovered symmetric key (header as AAD)
    return decryptPskCiphertextWithHeaderAAD(symmetricKey, envelope);
}

/**
 * Decrypts PSK payload ciphertext. VERSION_AAD requires header AAD (#232);
 * legacy VERSION decrypts without AAD so history stays readable.
 */
function decryptPskCiphertextWithHeaderAAD(symmetricKey: Uint8Array, envelope: PSKEnvelope): Uint8Array {
    if (envelope.version >= PSK_PROTOCOL.VERSION_AAD) {
        const aad = pskHeaderAAD(envelope);
        return chacha20poly1305(symmetricKey, envelope.nonce, aad).decrypt(envelope.ciphertext);
    }
    return chacha20poly1305(symmetricKey, envelope.nonce).decrypt(envelope.ciphertext);
}

/**
 * Checks if payload is a key-publish message.
 */
function isKeyPublishPayload(data: Uint8Array): boolean {
    if (data.length === 0 || data[0] !== 0x7b) {
        return false;
    }

    try {
        const json = JSON.parse(new TextDecoder().decode(data));
        return json.type === 'key-publish';
    } catch {
        return false;
    }
}

/**
 * Parses decrypted message payload.
 */
function parseMessagePayload(data: Uint8Array): DecryptedContent {
    const text = new TextDecoder().decode(data);

    // Try JSON first
    if (text.startsWith('{')) {
        try {
            const json = JSON.parse(text);
            if (typeof json.text === 'string') {
                return {
                    text: json.text,
                    replyToId: json.replyTo?.txid,
                    replyToPreview: json.replyTo?.preview,
                };
            }
        } catch {
            // Fall through to plain text
        }
    }

    // Plain text (legacy format)
    return { text };
}
