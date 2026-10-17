/**
 * AlgoChat - Public Key Cache
 *
 * In-memory cache for public keys with TTL expiration.
 */

/** Entry in the public key cache with expiration */
interface CacheEntry {
    key: Uint8Array;
    expiresAt: number;
}

/** Default TTL: 24 hours in milliseconds */
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

/** In-memory cache for public keys with TTL expiration */
export class PublicKeyCache {
    private cache = new Map<string, CacheEntry>();
    private ttlMs: number;

    /** Creates a new public key cache with the given TTL in milliseconds (default: 24 hours) */
    constructor(ttlMs: number = DEFAULT_TTL_MS) {
        this.ttlMs = ttlMs;
    }

    /** Store a public key for an address */
    store(address: string, key: Uint8Array): void {
        this.cache.set(address, {
            key: new Uint8Array(key),
            expiresAt: Date.now() + this.ttlMs,
        });
    }

    /** Retrieve a public key for an address (returns undefined if expired) */
    retrieve(address: string): Uint8Array | undefined {
        const entry = this.cache.get(address);
        if (!entry) {
            return undefined;
        }

        if (entry.expiresAt <= Date.now()) {
            this.cache.delete(address);
            return undefined;
        }

        return new Uint8Array(entry.key);
    }

    /** Invalidate the cached key for an address */
    invalidate(address: string): void {
        this.cache.delete(address);
    }

    /** Clear all cached keys */
    clear(): void {
        this.cache.clear();
    }

    /** Remove all expired entries */
    pruneExpired(): void {
        const now = Date.now();
        for (const [address, entry] of this.cache) {
            if (entry.expiresAt <= now) {
                this.cache.delete(address);
            }
        }
    }
}
