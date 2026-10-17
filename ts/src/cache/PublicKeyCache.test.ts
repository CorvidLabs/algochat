import { describe, expect, test } from 'bun:test';
import { PublicKeyCache } from './PublicKeyCache.js';
import type { DiscoveredKey } from '../models/types.js';

function makeKey(address: string, fill = 0x01): DiscoveredKey {
    return {
        publicKey: new Uint8Array(32).fill(fill),
        isVerified: true,
        address,
        discoveredInTx: `tx-${address}`,
        discoveredAtRound: 1000,
        discoveredAt: new Date('2026-01-01'),
    };
}

describe('PublicKeyCache', () => {
    describe('store and retrieve', () => {
        test('stores and retrieves a key', () => {
            const cache = new PublicKeyCache();
            const key = makeKey('ALICE');
            cache.store(key, 'ALICE');
            const result = cache.retrieve('ALICE');
            expect(result).not.toBeNull();
            expect(result!.publicKey).toEqual(key.publicKey);
            expect(result!.isVerified).toBe(true);
        });

        test('uses key.address when address param not provided', () => {
            const cache = new PublicKeyCache();
            const key = makeKey('BOB');
            cache.store(key);
            expect(cache.retrieve('BOB')).not.toBeNull();
        });

        test('throws when no address available', () => {
            const cache = new PublicKeyCache();
            const key: DiscoveredKey = {
                publicKey: new Uint8Array(32),
                isVerified: false,
            };
            expect(() => cache.store(key)).toThrow(/address is required/i);
        });

        test('returns null for unknown address', () => {
            const cache = new PublicKeyCache();
            expect(cache.retrieve('UNKNOWN')).toBeNull();
        });

        test('overwrites existing entry', () => {
            const cache = new PublicKeyCache();
            cache.store(makeKey('ALICE', 0x01), 'ALICE');
            cache.store(makeKey('ALICE', 0x02), 'ALICE');
            expect(cache.retrieve('ALICE')!.publicKey[0]).toBe(0x02);
            expect(cache.size).toBe(1);
        });
    });

    describe('retrievePublicKey', () => {
        test('returns just the public key bytes', () => {
            const cache = new PublicKeyCache();
            cache.store(makeKey('ALICE'), 'ALICE');
            const pk = cache.retrievePublicKey('ALICE');
            expect(pk).not.toBeNull();
            expect(pk!.length).toBe(32);
        });

        test('returns null for unknown', () => {
            const cache = new PublicKeyCache();
            expect(cache.retrievePublicKey('UNKNOWN')).toBeNull();
        });
    });

    describe('has', () => {
        test('returns true for cached key', () => {
            const cache = new PublicKeyCache();
            cache.store(makeKey('ALICE'), 'ALICE');
            expect(cache.has('ALICE')).toBe(true);
        });

        test('returns false for unknown', () => {
            const cache = new PublicKeyCache();
            expect(cache.has('ALICE')).toBe(false);
        });
    });

    describe('TTL expiration', () => {
        test('expired entries return null on retrieve', () => {
            const cache = new PublicKeyCache(1); // 1ms TTL
            cache.store(makeKey('ALICE'), 'ALICE');
            // Force expiration by waiting slightly
            const start = Date.now();
            while (Date.now() - start < 5) { /* busy wait */ }
            expect(cache.retrieve('ALICE')).toBeNull();
        });

        test('has returns false for expired', () => {
            const cache = new PublicKeyCache(1);
            cache.store(makeKey('ALICE'), 'ALICE');
            const start = Date.now();
            while (Date.now() - start < 5) { /* busy wait */ }
            expect(cache.has('ALICE')).toBe(false);
        });

        test('expired entries are removed from cache on retrieve', () => {
            const cache = new PublicKeyCache(1);
            cache.store(makeKey('ALICE'), 'ALICE');
            const start = Date.now();
            while (Date.now() - start < 5) { /* busy wait */ }
            cache.retrieve('ALICE');
            // Size reflects internal map; entry was deleted
            expect(cache.size).toBe(0);
        });

        test('default TTL is 24 hours', () => {
            const cache = new PublicKeyCache();
            expect(cache.ttl).toBe(24 * 60 * 60 * 1000);
        });
    });

    describe('invalidate', () => {
        test('removes cached entry', () => {
            const cache = new PublicKeyCache();
            cache.store(makeKey('ALICE'), 'ALICE');
            cache.invalidate('ALICE');
            expect(cache.retrieve('ALICE')).toBeNull();
            expect(cache.size).toBe(0);
        });

        test('invalidating nonexistent key is a no-op', () => {
            const cache = new PublicKeyCache();
            cache.invalidate('UNKNOWN'); // should not throw
            expect(cache.size).toBe(0);
        });
    });

    describe('clear', () => {
        test('removes all entries', () => {
            const cache = new PublicKeyCache();
            cache.store(makeKey('ALICE'), 'ALICE');
            cache.store(makeKey('BOB'), 'BOB');
            cache.clear();
            expect(cache.size).toBe(0);
        });
    });

    describe('prune', () => {
        test('removes expired entries and returns count', () => {
            const cache = new PublicKeyCache(1);
            cache.store(makeKey('ALICE'), 'ALICE');
            cache.store(makeKey('BOB'), 'BOB');
            const start = Date.now();
            while (Date.now() - start < 5) { /* busy wait */ }
            const removed = cache.prune();
            expect(removed).toBe(2);
            expect(cache.size).toBe(0);
        });

        test('keeps non-expired entries', () => {
            const cache = new PublicKeyCache(60_000);
            cache.store(makeKey('ALICE'), 'ALICE');
            expect(cache.prune()).toBe(0);
            expect(cache.size).toBe(1);
        });
    });

    describe('addresses', () => {
        test('returns all cached addresses', () => {
            const cache = new PublicKeyCache();
            cache.store(makeKey('ALICE'), 'ALICE');
            cache.store(makeKey('BOB'), 'BOB');
            const addrs = cache.addresses;
            expect(addrs.sort()).toEqual(['ALICE', 'BOB']);
        });
    });

    describe('touch', () => {
        test('refreshes TTL of existing entry', () => {
            const cache = new PublicKeyCache(50); // 50ms TTL
            cache.store(makeKey('ALICE'), 'ALICE');
            // Wait 30ms then touch
            const start = Date.now();
            while (Date.now() - start < 30) { /* busy wait */ }
            expect(cache.touch('ALICE')).toBe(true);
            // Should still be valid since we touched it
            expect(cache.retrieve('ALICE')).not.toBeNull();
        });

        test('returns false for nonexistent entry', () => {
            const cache = new PublicKeyCache();
            expect(cache.touch('UNKNOWN')).toBe(false);
        });
    });
});
