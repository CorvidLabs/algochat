/**
 * AlgoChat Web - Crypto Module
 */

export { deriveEncryptionKeys, generateEphemeralKeyPair, uint8ArrayEquals } from './keys.js';
export { encryptMessage, encryptReply, decryptMessage, EncryptionError } from './encryption.js';
export { encodeEnvelope, decodeEnvelope, isChatMessage, EnvelopeError } from './envelope.js';
export {
    signEncryptionKey,
    verifyEncryptionKey,
    getPublicKey,
    fingerprint,
    SignatureError,
    ED25519_SIGNATURE_SIZE,
    ED25519_PUBLIC_KEY_SIZE,
    X25519_PUBLIC_KEY_SIZE,
} from './signature.js';

export { standardHeaderAAD, pskHeaderAAD, STANDARD_PREFIX_AAD_SIZE, PSK_PREFIX_AAD_SIZE } from './aad.js';
