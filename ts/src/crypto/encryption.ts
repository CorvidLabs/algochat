/**
 * AlgoChat Web - Message Encryption/Decryption
 *
 * Implements ChaCha20-Poly1305 encryption with ephemeral key ECDH
 * and bidirectional decryption support.
 */

import { chacha20poly1305 } from '@noble/ciphers/chacha';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { randomBytes } from '@noble/ciphers/webcrypto';
import { ChatEnvelope, DecryptedContent, PROTOCOL, type EncryptionOptions } from '../models/types.js';
import { generateEphemeralKeyPair, x25519ECDH, uint8ArrayEquals } from './keys.js';
import { standardHeaderAAD } from './aad.js';

const ENCRYPTION_INFO_PREFIX = new TextEncoder().encode('AlgoChatV1');
const SENDER_KEY_INFO_PREFIX = new TextEncoder().encode('AlgoChatV1-SenderKey');
const PSK_INFO = new TextEncoder().encode('AlgoChatV1-PSK');

/**
 * Derives input keying material, mixing in PSK when provided.
 *
 * When a PSK is present, the ECDH shared secret is combined with the PSK
 * via HKDF to produce hybrid keying material (similar to TLS 1.3 PSK-DHE).
 */
function deriveIKM(ecdhSecret: Uint8Array, psk?: Uint8Array): Uint8Array {
    if (!psk || psk.length === 0) return ecdhSecret;
    if (psk.length !== 32) {
        throw new EncryptionError(`Invalid PSK length: expected 32 bytes, got ${psk.length}`);
    }
    return new Uint8Array(hkdf(sha256, ecdhSecret, psk, PSK_INFO, 32));
}

export class EncryptionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'EncryptionError';
    }
}

/**
 * Encrypts a message for a recipient with forward secrecy
 *
 * Note: senderPublicKey is used for bidirectional decryption - it allows
 * the sender to decrypt their own sent messages.
 */
export function encryptMessage(
    plaintext: string,
    senderPublicKey: Uint8Array,
    recipientPublicKey: Uint8Array,
    options?: EncryptionOptions
): ChatEnvelope {
    const messageBytes = new TextEncoder().encode(plaintext);

    if (messageBytes.length > PROTOCOL.MAX_PAYLOAD_SIZE) {
        throw new EncryptionError(`Message too large: ${messageBytes.length} bytes, max ${PROTOCOL.MAX_PAYLOAD_SIZE}`);
    }

    // Step 1: Generate ephemeral key pair
    const ephemeral = generateEphemeralKeyPair();

    // Step 2: Derive symmetric key for recipient
    const sharedSecret = x25519ECDH(ephemeral.privateKey, recipientPublicKey);
    const ikm = deriveIKM(sharedSecret, options?.psk);

    const info = concatBytes(ENCRYPTION_INFO_PREFIX, senderPublicKey, recipientPublicKey);
    const symmetricKey = hkdf(sha256, ikm, ephemeral.publicKey, info, 32);

    // Step 3: Generate random nonce
    const nonce = randomBytes(12);

    // Step 4: Encrypt symmetric key for sender (bidirectional decryption)
    // before the payload so the full fixed header can bind as AAD (#232).
    const senderSharedSecret = x25519ECDH(ephemeral.privateKey, senderPublicKey);
    const senderIkm = deriveIKM(senderSharedSecret, options?.psk);

    const senderInfo = concatBytes(SENDER_KEY_INFO_PREFIX, senderPublicKey);
    const senderEncryptionKey = hkdf(sha256, senderIkm, ephemeral.publicKey, senderInfo, 32);

    const senderCipher = chacha20poly1305(senderEncryptionKey, nonce);
    const encryptedSenderKey = senderCipher.encrypt(symmetricKey);

    // Step 5: Encrypt message with the fixed header bound as AAD
    const version = PROTOCOL.VERSION_AAD;
    const aad = standardHeaderAAD({
        version,
        protocolId: PROTOCOL.PROTOCOL_ID,
        senderPublicKey,
        ephemeralPublicKey: ephemeral.publicKey,
        nonce,
        encryptedSenderKey,
    });
    const cipher = chacha20poly1305(symmetricKey, nonce, aad);
    const ciphertextWithTag = cipher.encrypt(messageBytes);

    return {
        version,
        protocolId: PROTOCOL.PROTOCOL_ID,
        senderPublicKey,
        ephemeralPublicKey: ephemeral.publicKey,
        nonce,
        encryptedSenderKey,
        ciphertext: ciphertextWithTag,
    };
}

/**
 * Encrypts a reply message
 */
export function encryptReply(
    text: string,
    replyToTxid: string,
    replyToPreview: string,
    senderPublicKey: Uint8Array,
    recipientPublicKey: Uint8Array,
    options?: EncryptionOptions
): ChatEnvelope {
    // Truncate preview to 80 chars
    const preview = replyToPreview.length > 80 ? replyToPreview.slice(0, 77) + '...' : replyToPreview;

    const payload = JSON.stringify({
        text,
        replyTo: {
            txid: replyToTxid,
            preview,
        },
    });

    return encryptMessage(payload, senderPublicKey, recipientPublicKey, options);
}

/**
 * Decrypts a message envelope
 *
 * Automatically detects if we're the sender or recipient
 * and uses the appropriate decryption path.
 */
export function decryptMessage(
    envelope: ChatEnvelope,
    myPrivateKey: Uint8Array,
    myPublicKey: Uint8Array,
    options?: EncryptionOptions
): DecryptedContent | null {
    const weAreSender = uint8ArrayEquals(myPublicKey, envelope.senderPublicKey);

    let plaintext: Uint8Array;

    if (weAreSender) {
        plaintext = decryptAsSender(envelope, myPrivateKey, myPublicKey, options);
    } else {
        plaintext = decryptAsRecipient(envelope, myPrivateKey, myPublicKey, options);
    }

    // Check for key-publish payload
    if (isKeyPublishPayload(plaintext)) {
        return null;
    }

    return parseMessagePayload(plaintext);
}

/**
 * Decrypts as the message recipient
 */
function decryptAsRecipient(
    envelope: ChatEnvelope,
    recipientPrivateKey: Uint8Array,
    recipientPublicKey: Uint8Array,
    options?: EncryptionOptions
): Uint8Array {
    // Derive symmetric key
    const sharedSecret = x25519ECDH(recipientPrivateKey, envelope.ephemeralPublicKey);
    const ikm = deriveIKM(sharedSecret, options?.psk);

    const info = concatBytes(ENCRYPTION_INFO_PREFIX, envelope.senderPublicKey, recipientPublicKey);
    const symmetricKey = hkdf(sha256, ikm, envelope.ephemeralPublicKey, info, 32);

    return decryptCiphertextWithHeaderAAD(symmetricKey, envelope);
}

/**
 * Decrypts as the message sender (bidirectional decryption)
 */
function decryptAsSender(
    envelope: ChatEnvelope,
    senderPrivateKey: Uint8Array,
    senderPublicKey: Uint8Array,
    options?: EncryptionOptions
): Uint8Array {
    // Step 1: Derive key to decrypt the symmetric key
    const sharedSecret = x25519ECDH(senderPrivateKey, envelope.ephemeralPublicKey);
    const ikm = deriveIKM(sharedSecret, options?.psk);

    const senderInfo = concatBytes(SENDER_KEY_INFO_PREFIX, senderPublicKey);
    const senderDecryptionKey = hkdf(sha256, ikm, envelope.ephemeralPublicKey, senderInfo, 32);

    // Step 2: Decrypt the symmetric key
    const senderCipher = chacha20poly1305(senderDecryptionKey, envelope.nonce);
    const symmetricKey = senderCipher.decrypt(envelope.encryptedSenderKey);

    // Step 3: Decrypt message using recovered symmetric key (header as AAD)
    return decryptCiphertextWithHeaderAAD(symmetricKey, envelope);
}

/**
 * Decrypts payload ciphertext. VERSION_AAD envelopes require header AAD (#232);
 * legacy VERSION envelopes decrypt without AAD so history stays readable.
 */
function decryptCiphertextWithHeaderAAD(symmetricKey: Uint8Array, envelope: ChatEnvelope): Uint8Array {
    if (envelope.version >= PROTOCOL.VERSION_AAD) {
        const aad = standardHeaderAAD(envelope);
        return chacha20poly1305(symmetricKey, envelope.nonce, aad).decrypt(envelope.ciphertext);
    }
    return chacha20poly1305(symmetricKey, envelope.nonce).decrypt(envelope.ciphertext);
}

/**
 * Checks if payload is a key-publish message
 */
function isKeyPublishPayload(data: Uint8Array): boolean {
    if (data.length === 0 || data[0] !== 0x7b) {
        // 0x7b = '{'
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
 * Parses decrypted message payload
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

/**
 * Concatenates multiple Uint8Arrays
 */
function concatBytes(...arrays: Uint8Array[]): Uint8Array {
    const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const arr of arrays) {
        result.set(arr, offset);
        offset += arr.length;
    }
    return result;
}
