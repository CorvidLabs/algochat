/**
 * AlgoChat - Encryption Key Storage
 *
 * Interface and implementations for storing encryption private keys.
 */

/** Interface for storing encryption private keys */
export interface EncryptionKeyStorage {
    /** Store a private key for an address */
    store(privateKey: Uint8Array, address: string, requireBiometric?: boolean): Promise<void>;

    /** Retrieve a private key for an address */
    retrieve(address: string): Promise<Uint8Array>;

    /** Check if a key exists for an address */
    hasKey(address: string): Promise<boolean>;

    /** Delete a key for an address */
    delete(address: string): Promise<void>;

    /** List all stored addresses */
    listStoredAddresses(): Promise<string[]>;
}

/** Error thrown when a key is not found */
export class KeyNotFoundError extends Error {
    constructor(address: string) {
        super(`Key not found for address: ${address}`);
        this.name = 'KeyNotFoundError';
    }
}

/**
 * In-memory implementation of EncryptionKeyStorage (for testing).
 *
 * WARNING: This is NOT secure for production use. Keys are stored in memory
 * without encryption and are lost when the process exits.
 */
export class InMemoryKeyStorage implements EncryptionKeyStorage {
    private keys = new Map<string, Uint8Array>();

    async store(privateKey: Uint8Array, address: string, _requireBiometric?: boolean): Promise<void> {
        this.keys.set(address, new Uint8Array(privateKey));
    }

    async retrieve(address: string): Promise<Uint8Array> {
        const key = this.keys.get(address);
        if (!key) {
            throw new KeyNotFoundError(address);
        }
        return new Uint8Array(key);
    }

    async hasKey(address: string): Promise<boolean> {
        return this.keys.has(address);
    }

    async delete(address: string): Promise<void> {
        this.keys.delete(address);
    }

    async listStoredAddresses(): Promise<string[]> {
        return Array.from(this.keys.keys());
    }
}
