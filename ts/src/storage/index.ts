/**
 * AlgoChat - Storage Module
 *
 * Re-exports all storage interfaces and implementations.
 */

export type { MessageCache } from './message-cache.js';
export { InMemoryMessageCache } from './message-cache.js';
export { PublicKeyCache } from './public-key-cache.js';
export type { EncryptionKeyStorage } from './encryption-key-storage.js';
export {
    InMemoryKeyStorage,
    KeyNotFoundError,
} from './encryption-key-storage.js';

// Error types re-exported for compatibility (these don't require Node.js)
export {
    PasswordRequiredError,
    DecryptionFailedError,
    InvalidKeyDataError,
} from './file-key-storage.errors.js';

// FileKeyStorage is Node.js only - import from 'ts-algochat/node' if needed
