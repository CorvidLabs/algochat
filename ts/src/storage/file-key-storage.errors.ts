/**
 * AlgoChat - File Key Storage Errors
 *
 * Browser-safe error types for file key storage.
 * These can be imported without pulling in Node.js dependencies.
 */

/** Error thrown when password is required but not set */
export class PasswordRequiredError extends Error {
    constructor() {
        super('Password is required for file key storage');
        this.name = 'PasswordRequiredError';
    }
}

/** Error thrown when decryption fails (wrong password) */
export class DecryptionFailedError extends Error {
    constructor() {
        super('Decryption failed - incorrect password or corrupted data');
        this.name = 'DecryptionFailedError';
    }
}

/** Error thrown when key data is invalid */
export class InvalidKeyDataError extends Error {
    constructor() {
        super('Invalid key data format');
        this.name = 'InvalidKeyDataError';
    }
}
