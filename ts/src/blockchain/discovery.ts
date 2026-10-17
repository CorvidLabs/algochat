/**
 * AlgoChat Web - Key Discovery
 *
 * Functions for discovering and verifying encryption keys on the blockchain.
 * Supports paginated search to handle accounts with large transaction histories.
 */

import algosdk from 'algosdk';
import type { DiscoveredKey } from '../models/types.js';
import type { IndexerClient } from './interfaces.js';
import type { NoteTransaction } from './types.js';
import { verifyEncryptionKey } from '../crypto/index.js';

/** Default page size for paginated key discovery. */
const DEFAULT_DISCOVERY_PAGE_SIZE = 100;

/**
 * Decodes an Algorand address string to extract the 32-byte Ed25519 public key.
 *
 * Algorand addresses are Base32-encoded: 32 bytes public key + 4 bytes checksum.
 *
 * @param address The Algorand address string (58 characters)
 * @returns The 32-byte Ed25519 public key
 */
function decodeAlgorandAddress(address: string): Uint8Array {
    return algosdk.Address.fromString(address).publicKey;
}

/**
 * Parse a key announcement from a transaction note.
 *
 * Key announcement format:
 * - 32 bytes: X25519 public key
 * - 64 bytes (optional): Ed25519 signature
 *
 * @param note The transaction note field
 * @param ed25519PublicKey The sender's Ed25519 public key (for verification)
 * @returns DiscoveredKey if valid, undefined otherwise
 */
export function parseKeyAnnouncement(
    note: Uint8Array,
    ed25519PublicKey?: Uint8Array
): DiscoveredKey | undefined {
    if (note.length < 32) {
        return undefined;
    }

    const publicKey = note.slice(0, 32);

    if (note.length >= 96) {
        // Signed announcement: verify or reject. A present-but-invalid
        // signature must NOT fall through as an unverified key (#229) —
        // that would let a malicious indexer substitute an attacker key.
        if (!ed25519PublicKey) {
            return undefined;
        }
        const signature = note.slice(32, 96);
        try {
            if (!verifyEncryptionKey(publicKey, ed25519PublicKey, signature)) {
                return undefined;
            }
        } catch {
            return undefined;
        }
        return { publicKey, isVerified: true };
    }

    // Unsigned 32-byte announcement (TOFU / Falcon / legacy).
    return { publicKey, isVerified: false };
}

/**
 * Iterates through an address's transactions page by page.
 *
 * Uses `searchTransactionsPaginated` when available on the indexer for
 * efficient cursor-based pagination. Falls back to a single
 * `searchTransactions` call otherwise.
 *
 * @param indexer The indexer client
 * @param address The address to search
 * @param callback Called for each transaction. Return `true` to stop iteration.
 * @param options Search options
 */
async function paginatedSearch(
    indexer: IndexerClient,
    address: string,
    callback: (tx: NoteTransaction) => boolean,
    options?: { maxDepth?: number; pageSize?: number }
): Promise<void> {
    const pageSize = options?.pageSize ?? DEFAULT_DISCOVERY_PAGE_SIZE;
    const maxDepth = options?.maxDepth;

    // Fast path: indexer supports paginated search
    if (indexer.searchTransactionsPaginated) {
        let searched = 0;
        let nextToken: string | undefined;

        while (true) {
            const limit = maxDepth
                ? Math.min(pageSize, maxDepth - searched)
                : pageSize;

            if (limit <= 0) break;

            const result = await indexer.searchTransactionsPaginated(address, {
                limit,
                nextToken,
            });

            for (const tx of result.transactions) {
                if (callback(tx)) return;
            }

            searched += result.transactions.length;
            nextToken = result.nextToken;

            if (!nextToken || result.transactions.length === 0) break;
            if (maxDepth && searched >= maxDepth) break;
        }
        return;
    }

    // Fallback: single-batch search
    const limit = maxDepth ?? 1000;
    const transactions = await indexer.searchTransactions(address, undefined, limit);
    for (const tx of transactions) {
        if (callback(tx)) return;
    }
}

/**
 * Options for key discovery functions.
 */
export interface DiscoverKeyOptions {
    /**
     * Maximum number of transactions to search.
     * When omitted, searches exhaustively using pagination.
     */
    maxDepth?: number;
    /**
     * Number of transactions to fetch per page (default: 100).
     * Only used when the indexer supports `searchTransactionsPaginated`.
     */
    pageSize?: number;
}

/**
 * Discover the encryption public key for an Algorand address.
 *
 * Searches the indexer for key announcement transactions from the address.
 * A key announcement is a self-transfer (sender === receiver) with the X25519
 * public key in the note field.
 *
 * When the indexer supports paginated search, this iterates through the full
 * transaction history page by page. Otherwise it falls back to a single batch.
 *
 * @param indexer The indexer client to use
 * @param address The Algorand address to find the key for
 * @param optionsOrDepth Discovery options, or a numeric search depth for backward compatibility
 * @returns DiscoveredKey if found, undefined otherwise
 */
export async function discoverEncryptionKey(
    indexer: IndexerClient,
    address: string,
    optionsOrDepth?: number | DiscoverKeyOptions
): Promise<DiscoveredKey | undefined> {
    const options: DiscoverKeyOptions =
        typeof optionsOrDepth === 'number'
            ? { maxDepth: optionsOrDepth }
            : optionsOrDepth ?? {};

    // Decode the Ed25519 public key once before the loop; if the address is
    // malformed we can still search but skip signature verification.
    let ed25519PublicKey: Uint8Array | undefined;
    try {
        ed25519PublicKey = decodeAlgorandAddress(address);
    } catch {
        // Invalid address format — continue without verification
    }

    // Prefer verified (signed) announcements over earlier unsigned TOFU notes,
    // mirroring AlgorandService.paginatedKeyDiscovery (#229).
    let tofuCandidate: DiscoveredKey | undefined;

    await paginatedSearch(
        indexer,
        address,
        (tx) => {
            // Must be sent by this address
            if (tx.sender !== address) return false;

            // Check if this is a key announcement (self-transfer with note)
            if (tx.receiver !== address) return false;

            // Must have a note
            if (!tx.note || tx.note.length < 32) return false;

            const key = parseKeyAnnouncement(tx.note, ed25519PublicKey);
            if (key === undefined) {
                // Invalid 96-byte (forged / unverifiable) — skip and keep scanning.
                return false;
            }
            if (key.isVerified) {
                tofuCandidate = key;
                return true; // verified wins immediately
            }
            // Unsigned 32-byte announcement: remember first as TOFU, keep looking.
            if (!tofuCandidate) {
                tofuCandidate = key;
            }
            return false;
        },
        options
    );

    return tofuCandidate;
}

/**
 * Discover encryption key from a chat message transaction.
 *
 * Extracts the sender's public key from the envelope header of any
 * AlgoChat message they've sent.
 *
 * When the indexer supports paginated search, this iterates through the full
 * transaction history page by page. Otherwise it falls back to a single batch.
 *
 * @param indexer The indexer client to use
 * @param address The Algorand address to find the key for
 * @param isChatMessage Function to check if a note is an AlgoChat message
 * @param decodeEnvelope Function to decode envelope and extract public key
 * @param optionsOrDepth Discovery options, or a numeric search depth for backward compatibility
 * @returns DiscoveredKey if found, undefined otherwise
 */
export async function discoverEncryptionKeyFromMessages(
    indexer: IndexerClient,
    address: string,
    isChatMessage: (note: Uint8Array) => boolean,
    decodeEnvelope: (note: Uint8Array) => { senderPublicKey: Uint8Array },
    optionsOrDepth?: number | DiscoverKeyOptions
): Promise<DiscoveredKey | undefined> {
    const options: DiscoverKeyOptions =
        typeof optionsOrDepth === 'number'
            ? { maxDepth: optionsOrDepth }
            : optionsOrDepth ?? {};

    let found: DiscoveredKey | undefined;

    await paginatedSearch(
        indexer,
        address,
        (tx) => {
            // Only look at transactions SENT by this address
            if (tx.sender !== address) return false;

            if (!tx.note || tx.note.length === 0) return false;

            if (!isChatMessage(tx.note)) return false;

            try {
                const envelope = decodeEnvelope(tx.note);
                found = {
                    publicKey: envelope.senderPublicKey,
                    isVerified: false, // Not verified via signature
                };
                return true; // stop iteration
            } catch {
                // Malformed envelope, continue searching
                return false;
            }
        },
        options
    );

    return found;
}
