/**
 * AlgoChat - File-based Key Storage
 *
 * Stores X25519 encryption keys encrypted with AES-256-GCM, using a password
 * derived key via PBKDF2. Keys are stored in `~/.algochat/keys/`.
 *
 * ## Storage Format
 *
 * Each key file contains:
 * - Salt: 32 bytes (random, for PBKDF2)
 * - Nonce: 12 bytes (random, for AES-GCM)
 * - Ciphertext: 32 bytes (encrypted private key)
 * - Tag: 16 bytes (authentication tag)
 *
 * ## Security
 *
 * - Uses PBKDF2 with 100,000 iterations for key derivation
 * - Uses AES-256-GCM for authenticated encryption
 * - Keys are stored with 600 permissions (owner read/write only)
 * - Salt is unique per key file
 */

import { mkdir, readdir, readFile, unlink, writeFile, chmod, access } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes, pbkdf2Sync, createCipheriv, createDecipheriv } from 'node:crypto';
import type { EncryptionKeyStorage } from './encryption-key-storage.js';
import { KeyNotFoundError } from './encryption-key-storage.js';
import {
    PasswordRequiredError,
    DecryptionFailedError,
    InvalidKeyDataError,
} from './file-key-storage.errors.js';

// Re-export errors for backwards compatibility
export { PasswordRequiredError, DecryptionFailedError, InvalidKeyDataError };

/**
 * File-based encryption key storage with password protection.
 *
 * Example usage:
 * ```typescript
 * const storage = new FileKeyStorage('user-password');
 *
 * // Store a key
 * await storage.store(privateKey, 'ADDRESS...');
 *
 * // Retrieve
 * const key = await storage.retrieve('ADDRESS...');
 * ```
 */
export class FileKeyStorage implements EncryptionKeyStorage {
    /** PBKDF2 iteration count (OWASP recommendation for SHA256) */
    private static readonly PBKDF2_ITERATIONS = 100_000;

    /** Salt size in bytes */
    private static readonly SALT_SIZE = 32;

    /** AES-GCM nonce size in bytes */
    private static readonly NONCE_SIZE = 12;

    /** AES-GCM tag size in bytes */
    private static readonly TAG_SIZE = 16;

    /** Directory name for key storage */
    private static readonly DIRECTORY_NAME = '.algochat/keys';

    /** Minimum file size (salt + nonce + ciphertext + tag) */
    private static readonly MIN_FILE_SIZE = 32 + 12 + 32 + 16; // 92 bytes

    private password: string | undefined;
    private cachedDerivedKey: Buffer | undefined;
    private cachedSalt: Buffer | undefined;

    /**
     * Creates a new file key storage.
     *
     * @param password Optional password for encryption. If not provided, must be set before use.
     */
    constructor(password?: string) {
        this.password = password;
    }

    /**
     * Sets the password for encryption/decryption.
     *
     * @param password The password to use.
     */
    setPassword(password: string): void {
        this.password = password;
        this.cachedDerivedKey = undefined;
        this.cachedSalt = undefined;
    }

    /**
     * Clears the password and cached keys from memory.
     */
    clearPassword(): void {
        this.password = undefined;
        this.cachedDerivedKey = undefined;
        this.cachedSalt = undefined;
    }

    async store(privateKey: Uint8Array, address: string, _requireBiometric?: boolean): Promise<void> {
        if (!this.password) {
            throw new PasswordRequiredError();
        }

        // Ensure directory exists
        const directory = await this.ensureDirectory();

        // Generate random salt and nonce
        const salt = randomBytes(FileKeyStorage.SALT_SIZE);
        const nonce = randomBytes(FileKeyStorage.NONCE_SIZE);

        // Derive encryption key from password
        const derivedKey = this.deriveKey(this.password, salt);

        // Encrypt the private key with AES-256-GCM
        const cipher = createCipheriv('aes-256-gcm', derivedKey, nonce);
        const ciphertext = Buffer.concat([
            cipher.update(Buffer.from(privateKey)),
            cipher.final(),
        ]);
        const tag = cipher.getAuthTag();

        // Combine: salt + nonce + ciphertext + tag
        const fileData = Buffer.concat([salt, nonce, ciphertext, tag]);

        // Write to file
        const filePath = this.keyFilePath(address, directory);
        await writeFile(filePath, fileData);

        // Set restrictive permissions (owner read/write only)
        await this.setRestrictivePermissions(filePath);
    }

    async retrieve(address: string): Promise<Uint8Array> {
        if (!this.password) {
            throw new PasswordRequiredError();
        }

        const directory = this.getDirectory();
        const filePath = this.keyFilePath(address, directory);

        // Check if file exists
        try {
            await access(filePath);
        } catch {
            throw new KeyNotFoundError(address);
        }

        // Read the encrypted file
        const fileData = await readFile(filePath);

        // Validate minimum size
        if (fileData.length < FileKeyStorage.MIN_FILE_SIZE) {
            throw new InvalidKeyDataError();
        }

        // Parse: salt + nonce + ciphertext + tag
        const salt = fileData.subarray(0, FileKeyStorage.SALT_SIZE);
        const nonce = fileData.subarray(
            FileKeyStorage.SALT_SIZE,
            FileKeyStorage.SALT_SIZE + FileKeyStorage.NONCE_SIZE
        );
        const ciphertextAndTag = fileData.subarray(
            FileKeyStorage.SALT_SIZE + FileKeyStorage.NONCE_SIZE
        );

        const ciphertext = ciphertextAndTag.subarray(0, ciphertextAndTag.length - FileKeyStorage.TAG_SIZE);
        const tag = ciphertextAndTag.subarray(ciphertextAndTag.length - FileKeyStorage.TAG_SIZE);

        // Derive decryption key from password
        const derivedKey = this.deriveKey(this.password, salt);

        // Decrypt
        try {
            const decipher = createDecipheriv('aes-256-gcm', derivedKey, nonce);
            decipher.setAuthTag(tag);
            const plaintext = Buffer.concat([
                decipher.update(ciphertext),
                decipher.final(),
            ]);
            return new Uint8Array(plaintext);
        } catch {
            throw new DecryptionFailedError();
        }
    }

    async hasKey(address: string): Promise<boolean> {
        const directory = this.getDirectory();
        const filePath = this.keyFilePath(address, directory);

        try {
            await access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    async delete(address: string): Promise<void> {
        const directory = this.getDirectory();
        const filePath = this.keyFilePath(address, directory);

        try {
            await unlink(filePath);
        } catch (error: unknown) {
            // Ignore if file doesn't exist
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw error;
            }
        }
    }

    async listStoredAddresses(): Promise<string[]> {
        const directory = this.getDirectory();

        try {
            const files = await readdir(directory);
            return files
                .filter(f => f.endsWith('.key'))
                .map(f => f.replace('.key', ''));
        } catch {
            return [];
        }
    }

    /**
     * Gets the key storage directory path.
     */
    private getDirectory(): string {
        return join(homedir(), FileKeyStorage.DIRECTORY_NAME);
    }

    /**
     * Ensures the key storage directory exists.
     */
    private async ensureDirectory(): Promise<string> {
        const directory = this.getDirectory();
        await mkdir(directory, { recursive: true, mode: 0o700 });
        return directory;
    }

    /**
     * Returns the file path for a key.
     */
    private keyFilePath(address: string, directory: string): string {
        return join(directory, `${address}.key`);
    }

    /**
     * Derives an encryption key from password using PBKDF2.
     */
    private deriveKey(password: string, salt: Buffer): Buffer {
        // Check cache
        if (this.cachedDerivedKey && this.cachedSalt?.equals(salt)) {
            return this.cachedDerivedKey;
        }

        const derivedKey = pbkdf2Sync(
            password,
            salt,
            FileKeyStorage.PBKDF2_ITERATIONS,
            32, // 256 bits
            'sha256'
        );

        // Cache for this salt
        this.cachedDerivedKey = derivedKey;
        this.cachedSalt = salt;

        return derivedKey;
    }

    /**
     * Sets restrictive file permissions (600 on Unix).
     */
    private async setRestrictivePermissions(filePath: string): Promise<void> {
        try {
            await chmod(filePath, 0o600);
        } catch {
            // Ignore permission errors on platforms that don't support chmod
        }
    }
}
