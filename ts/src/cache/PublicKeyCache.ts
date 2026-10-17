/**
 * AlgoChat Web - Public Key Cache
 *
 * TTL-based cache for discovered encryption public keys.
 */

import type { DiscoveredKey } from '../models/types.js';

/** Cached key entry with timestamp */
interface CachedEntry {
    key: DiscoveredKey;
    cachedAt: number;
}

/**
 * TTL-based cache for public keys
 *
 * Stores discovered public keys with automatic expiration.
 * Default TTL is 24 hours.
 */
export class PublicKeyCache {
    private cache = new Map<string, CachedEntry>();

    /**
     * Creates a new PublicKeyCache
     *
     * @param ttl - Time-to-live in milliseconds (default: 24 hours)
     */
    constructor(public readonly ttl: number = 24 * 60 * 60 * 1000) {}

    /**
     * Stores a discovered key in the cache
     *
     * @param key - The discovered key to cache
     * @param address - The address to cache under (uses key.address if not provided)
     */
    public store(key: DiscoveredKey, address?: string): void {
        const cacheKey = address ?? key.address;
        if (!cacheKey) {
            throw new Error('Address is required to cache a discovered key');
        }
        this.cache.set(cacheKey, {
            key,
            cachedAt: Date.now(),
        });
    }

    /**
     * Retrieves a cached key for an address
     *
     * @param address - Algorand address to look up
     * @returns The discovered key if cached and not expired, null otherwise
     */
    public retrieve(address: string): DiscoveredKey | null {
        const entry = this.cache.get(address);

        if (!entry) {
            return null;
        }

        // Check if expired
        if (Date.now() - entry.cachedAt > this.ttl) {
            this.cache.delete(address);
            return null;
        }

        return entry.key;
    }

    /**
     * Retrieves just the public key bytes for an address
     *
     * @param address - Algorand address to look up
     * @returns The public key bytes if cached, null otherwise
     */
    public retrievePublicKey(address: string): Uint8Array | null {
        const key = this.retrieve(address);
        return key?.publicKey ?? null;
    }

    /**
     * Checks if a key is cached (and not expired)
     *
     * @param address - Algorand address to check
     */
    public has(address: string): boolean {
        return this.retrieve(address) !== null;
    }

    /**
     * Invalidates a cached key
     *
     * @param address - Algorand address to invalidate
     */
    public invalidate(address: string): void {
        this.cache.delete(address);
    }

    /**
     * Clears all cached keys
     */
    public clear(): void {
        this.cache.clear();
    }

    /**
     * Gets the number of cached entries (including potentially expired)
     */
    public get size(): number {
        return this.cache.size;
    }

    /**
     * Removes expired entries from the cache
     *
     * @returns Number of entries removed
     */
    public prune(): number {
        const now = Date.now();
        let removed = 0;

        for (const [address, entry] of this.cache) {
            if (now - entry.cachedAt > this.ttl) {
                this.cache.delete(address);
                removed++;
            }
        }

        return removed;
    }

    /**
     * Returns all cached addresses
     */
    public get addresses(): string[] {
        return Array.from(this.cache.keys());
    }

    /**
     * Updates the TTL of an existing entry without changing the key
     *
     * @param address - Algorand address to touch
     * @returns true if entry was found and updated
     */
    public touch(address: string): boolean {
        const entry = this.cache.get(address);

        if (!entry) {
            return false;
        }

        entry.cachedAt = Date.now();
        return true;
    }
}
