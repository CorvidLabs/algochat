/**
 * AlgoChat Web - Message Indexer Service
 *
 * Handles blockchain indexer operations with pagination,
 * exponential backoff, and public key discovery.
 */

import algosdk from 'algosdk';
import type { Message, DiscoveredKey, MessageDirection, EncryptionOptions } from '../models/types.js';
import { decryptMessage, decodeEnvelope, isChatMessage } from '../crypto/index.js';
import { ChatError } from '../errors/ChatError.js';
import type { ChatAccount } from './algorand.service.js';

/** Configuration for the message indexer */
export interface MessageIndexerConfig {
    /** Indexer API token */
    indexerToken: string;
    /** Indexer server URL */
    indexerServer: string;
    /** Indexer port (optional) */
    indexerPort?: number;
}

/** Options for pagination */
export interface PaginationOptions {
    /** Minimum round (exclusive) */
    afterRound?: number;
    /** Maximum round (exclusive) */
    beforeRound?: number;
    /** Maximum number of results */
    limit?: number;
}

/** Options for waiting on transaction indexing */
export interface WaitForTransactionOptions {
    /** Total timeout in milliseconds (default: 30000) */
    timeout?: number;
    /** Initial polling interval in milliseconds (default: 500) */
    initialInterval?: number;
    /** Maximum polling interval in milliseconds (default: 5000) */
    maxInterval?: number;
    /** Backoff multiplier (default: 1.5) */
    backoffMultiplier?: number;
}

/** Indexer transaction response shape */
interface IndexerTransaction {
    id: string;
    sender: string;
    txType: string;
    note?: string;
    roundTime?: number;
    confirmedRound?: number;
    paymentTransaction?: {
        receiver?: string;
        amount?: number;
    };
}

interface IndexerSearchResponse {
    transactions?: IndexerTransaction[];
    nextToken?: string;
}

/**
 * Message Indexer Service
 *
 * Provides advanced indexer operations including:
 * - Paginated message fetching (afterRound, beforeRound)
 * - Transaction waiting with exponential backoff
 * - Public key discovery with metadata
 */
export class MessageIndexer {
    private indexerClient: algosdk.Indexer;
    private encryptionOptions?: EncryptionOptions;

    constructor(config: MessageIndexerConfig, encryptionOptions?: EncryptionOptions) {
        // Pass empty string for port when not specified to avoid algosdk defaulting to 8080
        this.indexerClient = new algosdk.Indexer(
            config.indexerToken,
            config.indexerServer,
            config.indexerPort ?? ''
        );
        this.encryptionOptions = encryptionOptions;
    }

    /**
     * Fetches messages with a participant using pagination
     *
     * @param chatAccount - The current user's chat account
     * @param participantAddress - Address of the conversation participant
     * @param options - Pagination options
     */
    public async fetchMessages(
        chatAccount: ChatAccount,
        participantAddress: string,
        options: PaginationOptions = {}
    ): Promise<Message[]> {
        const { afterRound, beforeRound, limit = 50 } = options;
        const messages: Message[] = [];

        let query = this.indexerClient
            .searchForTransactions()
            .address(chatAccount.address)
            .limit(limit);

        if (afterRound !== undefined) {
            query = query.minRound(afterRound);
        }

        if (beforeRound !== undefined) {
            query = query.maxRound(beforeRound);
        }

        const response = await query.do() as IndexerSearchResponse;

        for (const tx of response.transactions ?? []) {
            const message = this.processTransaction(tx, chatAccount, participantAddress);
            if (message) {
                messages.push(message);
            }
        }

        return messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    }

    /**
     * Fetches older messages (before a certain round)
     *
     * Useful for "load more" functionality.
     *
     * @param chatAccount - The current user's chat account
     * @param participantAddress - Address of the conversation participant
     * @param beforeRound - Maximum round (exclusive)
     * @param limit - Number of messages to fetch
     */
    public async fetchOlderMessages(
        chatAccount: ChatAccount,
        participantAddress: string,
        beforeRound: number,
        limit = 20
    ): Promise<Message[]> {
        return this.fetchMessages(chatAccount, participantAddress, {
            beforeRound,
            limit,
        });
    }

    /**
     * Fetches newer messages (after a certain round)
     *
     * Useful for syncing new messages.
     *
     * @param chatAccount - The current user's chat account
     * @param participantAddress - Address of the conversation participant
     * @param afterRound - Minimum round (exclusive)
     * @param limit - Number of messages to fetch
     */
    public async fetchNewerMessages(
        chatAccount: ChatAccount,
        participantAddress: string,
        afterRound: number,
        limit = 50
    ): Promise<Message[]> {
        return this.fetchMessages(chatAccount, participantAddress, {
            afterRound,
            limit,
        });
    }

    /**
     * Waits for a transaction to be indexed
     *
     * Uses exponential backoff with jitter for efficient polling.
     *
     * @param txid - Transaction ID to wait for
     * @param options - Wait options
     * @returns true if found, false if timeout
     */
    public async waitForTransaction(
        txid: string,
        options: WaitForTransactionOptions = {}
    ): Promise<boolean> {
        const {
            timeout = 30000,
            initialInterval = 500,
            maxInterval = 5000,
            backoffMultiplier = 1.5,
        } = options;

        const deadline = Date.now() + timeout;
        let interval = initialInterval;

        while (Date.now() < deadline) {
            try {
                await this.indexerClient.lookupTransactionByID(txid).do();
                return true;
            } catch {
                // Transaction not yet indexed, continue waiting
            }

            // Calculate remaining time
            const remaining = deadline - Date.now();
            if (remaining <= 0) {
                break;
            }

            // Apply jitter (0.8x to 1.2x)
            const jitter = 0.8 + Math.random() * 0.4;
            const sleepTime = Math.min(interval * jitter, remaining);

            await sleep(sleepTime);

            // Exponential backoff
            interval = Math.min(interval * backoffMultiplier, maxInterval);
        }

        return false;
    }

    /**
     * Discovers a user's encryption public key
     *
     * Returns full metadata about where the key was discovered.
     *
     * @param address - Algorand address to discover key for
     * @param searchDepth - Maximum transactions to search (default: 1000)
     */
    public async findPublicKey(
        address: string,
        searchDepth = 1000
    ): Promise<DiscoveredKey> {
        const response = await this.indexerClient
            .searchForTransactions()
            .address(address)
            .limit(searchDepth)
            .do() as IndexerSearchResponse;

        for (const tx of response.transactions ?? []) {
            // Only look at transactions SENT by this address
            if (tx.sender !== address) {
                continue;
            }

            if (!tx.note) {
                continue;
            }

            const noteBytes = base64ToBytes(tx.note);

            if (!isChatMessage(noteBytes)) {
                continue;
            }

            try {
                const envelope = decodeEnvelope(noteBytes);

                return {
                    publicKey: envelope.senderPublicKey,
                    isVerified: false,
                    address,
                    discoveredInTx: tx.id,
                    discoveredAtRound: Number(tx.confirmedRound ?? 0),
                    discoveredAt: new Date(Number(tx.roundTime ?? 0) * 1000),
                };
            } catch {
                // Log but continue searching
                continue;
            }
        }

        throw ChatError.publicKeyNotFound(address, searchDepth);
    }

    /**
     * Checks if a transaction exists in the indexer
     *
     * @param txid - Transaction ID to check
     */
    public async transactionExists(txid: string): Promise<boolean> {
        try {
            await this.indexerClient.lookupTransactionByID(txid).do();
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Gets the latest round from the indexer
     */
    public async getLatestRound(): Promise<number> {
        const health = await this.indexerClient.makeHealthCheck().do();
        return Number(health.round);
    }

    // MARK: - Private Methods

    private processTransaction(
        tx: IndexerTransaction,
        chatAccount: ChatAccount,
        participantAddress: string
    ): Message | null {
        // Filter: payment transactions with notes
        if (tx.txType !== 'pay' || !tx.note) {
            return null;
        }

        const noteBytes = base64ToBytes(tx.note);

        // Filter: AlgoChat messages
        if (!isChatMessage(noteBytes)) {
            return null;
        }

        // Determine direction and filter by participant
        const sender: string = tx.sender;
        const receiver: string | undefined = tx.paymentTransaction?.receiver;

        if (!receiver) {
            return null;
        }

        let direction: MessageDirection;

        if (sender === chatAccount.address) {
            if (receiver !== participantAddress) {
                return null;
            }
            direction = 'sent';
        } else {
            if (sender !== participantAddress) {
                return null;
            }
            if (receiver !== chatAccount.address) {
                return null;
            }
            direction = 'received';
        }

        // Decrypt message
        try {
            const envelope = decodeEnvelope(noteBytes);
            const decrypted = decryptMessage(
                envelope,
                chatAccount.encryptionKeys.privateKey,
                chatAccount.encryptionKeys.publicKey,
                this.encryptionOptions
            );

            if (!decrypted) {
                return null; // Key-publish, skip
            }

            return {
                id: tx.id,
                sender,
                recipient: receiver,
                content: decrypted.text,
                timestamp: new Date(Number(tx.roundTime ?? 0) * 1000),
                confirmedRound: Number(tx.confirmedRound ?? 0),
                direction,
                replyContext: decrypted.replyToId
                    ? {
                          messageId: decrypted.replyToId,
                          preview: decrypted.replyToPreview || '',
                      }
                    : undefined,
            };
        } catch {
            return null;
        }
    }
}

// MARK: - Helpers

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function base64ToBytes(input: string | Uint8Array): Uint8Array {
    if (input instanceof Uint8Array) {
        return input;
    }

    if (typeof input !== 'string') {
        return new Uint8Array(0);
    }

    // Convert base64url to standard base64
    const standardBase64 = input.replace(/-/g, '+').replace(/_/g, '/');
    const padded = standardBase64 + '='.repeat((4 - (standardBase64.length % 4)) % 4);

    const binaryString = atob(padded);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}
