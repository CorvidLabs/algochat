/**
 * AlgoChat Web - PSK (Pre-Shared Key) Protocol Module
 *
 * Provides PSK v1.1 protocol support with two-level key ratcheting,
 * hybrid ECDH + PSK encryption, and replay protection.
 */

// Types and constants
export { PSK_PROTOCOL, type PSKEnvelope, type PSKState } from './types.js';

// Ratchet key derivation
export {
    deriveSessionPSK,
    derivePositionPSK,
    derivePSKAtCounter,
    deriveHybridSymmetricKey,
    deriveSenderKey,
} from './ratchet.js';

// Envelope encoding/decoding
export {
    encodePSKEnvelope,
    decodePSKEnvelope,
    isPSKMessage,
    PSKEnvelopeError,
} from './envelope.js';

// Counter state management
export {
    createPSKState,
    validateCounter,
    recordReceive,
    advanceSendCounter,
} from './state.js';

// Exchange URI
export {
    createPSKExchangeURI,
    parsePSKExchangeURI,
} from './exchange.js';

// Encryption/Decryption
export {
    encryptPSKMessage,
    decryptPSKMessage,
    PSKEncryptionError,
} from './encryption.js';
