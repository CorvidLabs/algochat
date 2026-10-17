/**
 * AlgoChat - Message Indexer
 *
 * Queries and retrieves messages from the Algorand blockchain.
 * Provides high-level methods for fetching messages, conversations,
 * and discovering encryption keys.
 */

import type { IndexerClient } from './interfaces.js';
import type { NoteTransaction } from './types.js';
import type {
    Message,
    MessageDirection,
    Conversation,
    DiscoveredKey,
    ReplyContext,
    X25519KeyPair,
} from '../models/types.js';
import { decodeEnvelope, isChatMessage } from '../crypto/envelope.js';
import { decryptMessage } from '../crypto/index.js';

/** Default page size for fetching messages */
export const DEFAULT_PAGE_SIZE = 50;

/** Default search depth for finding public keys */
export const DEFAULT_SEARCH_DEPTH = 200;

/** Error thrown when a public key cannot be found */
export class PublicKeyNotFoundError extends Error {
    address: string;

    constructor(address: string) {
        super(`Public key not found for address: ${address}`);
        this.name = 'PublicKeyNotFoundError';
        this.address = address;
    }
}

/**
 * Chat account interface for decryption.
 *
 * Only requires the encryption keys and address.
 */
export interface ChatAccountLike {
    address: string;
    encryptionKeys: X25519KeyPair;
}

/**
 * Queries and retrieves messages from the blockchain.
 *
 * @example
 * ```typescript
 * const indexer = new MessageIndexer(indexerClient, chatAccount);
 *
 * // Fetch messages with a specific participant
 * const messages = await indexer.fetchMessages('RECIPIENT_ADDRESS');
 *
 * // Fetch all conversations
 * const conversations = await indexer.fetchConversations();
 *
 * // Find someone's encryption key
 * const key = await indexer.findPublicKey('USER_ADDRESS');
 * ```
 */
export class MessageIndexer {
    private indexerClient: IndexerClient;
    private chatAccount: ChatAccountLike;

    /** Default page size for fetching messages */
    static defaultPageSize = DEFAULT_PAGE_SIZE;

    /**
     * Creates a new message indexer.
     *
     * @param indexerClient - The indexer client for blockchain queries
     * @param chatAccount - The current user's chat account (for decryption)
     */
    constructor(indexerClient: IndexerClient, chatAccount: ChatAccountLike) {
        this.indexerClient = indexerClient;
        this.chatAccount = chatAccount;
    }

    /**
     * Fetches messages for a conversation.
     *
     * @param participant - The other party in the conversation
     * @param afterRound - Only fetch messages after this round (for forward pagination)
     * @param limit - Maximum number of messages to fetch
     * @returns Array of decrypted messages
     */
    async fetchMessages(
        participant: string,
        afterRound?: number,
        limit: number = DEFAULT_PAGE_SIZE
    ): Promise<Message[]> {
        const transactions = await this.indexerClient.searchTransactionsBetween(
            this.chatAccount.address,
            participant,
            afterRound,
            limit
        );

        const messages: Message[] = [];

        for (const tx of transactions) {
            // Only process payment transactions with notes
            if (!tx.note || tx.note.length < 2) continue;
            if (!isChatMessage(tx.note)) continue;

            // Determine direction
            const direction: MessageDirection =
                tx.sender === this.chatAccount.address ? 'sent' : 'received';

            // Filter by participant
            if (direction === 'sent' && tx.receiver !== participant) continue;
            if (direction === 'received' && tx.sender !== participant) continue;

            // Try to parse and decrypt
            try {
                const message = await this.parseMessage(tx, direction);
                if (message) {
                    messages.push(message);
                }
            } catch {
                // Skip messages that can't be decrypted
            }
        }

        // Sort by timestamp
        return messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    }

    /**
     * Fetches all conversations for the current account.
     *
     * Scans recent transactions to discover all chat participants and their
     * message history. Conversations are sorted by most recent message.
     *
     * @param limit - Maximum number of transactions to scan (default: 100)
     * @returns Array of conversations sorted by most recent activity
     */
    async fetchConversations(limit: number = 100): Promise<Conversation[]> {
        const transactions = await this.indexerClient.searchTransactions(
            this.chatAccount.address,
            undefined,
            limit
        );

        const conversationsByAddress = new Map<string, Conversation>();

        for (const tx of transactions) {
            if (!tx.note || tx.note.length < 2) continue;
            if (!isChatMessage(tx.note)) continue;

            // Determine the other party
            let otherAddress: string;
            let direction: MessageDirection;

            if (tx.sender === this.chatAccount.address) {
                otherAddress = tx.receiver;
                direction = 'sent';
            } else {
                otherAddress = tx.sender;
                direction = 'received';
            }

            // Parse and add message
            try {
                const message = await this.parseMessage(tx, direction);
                if (message) {
                    let conversation = conversationsByAddress.get(otherAddress);
                    if (!conversation) {
                        conversation = {
                            participant: otherAddress,
                            messages: [],
                        };
                        conversationsByAddress.set(otherAddress, conversation);
                    }
                    conversation.messages.push(message);
                }
            } catch {
                // Skip messages that can't be decrypted
            }
        }

        // Filter empty conversations and sort by most recent message
        return Array.from(conversationsByAddress.values())
            .filter((c) => c.messages.length > 0)
            .map((c) => ({
                ...c,
                messages: c.messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()),
            }))
            .sort((a, b) => {
                const aTime = a.messages[a.messages.length - 1]?.timestamp.getTime() ?? 0;
                const bTime = b.messages[b.messages.length - 1]?.timestamp.getTime() ?? 0;
                return bTime - aTime;
            });
    }

    /**
     * Finds a user's encryption public key from their past transactions.
     *
     * Uses paginated search when the indexer supports it, allowing exhaustive
     * searches through large transaction histories. Falls back to a single
     * batch with the given search depth.
     *
     * @param address - The user's Algorand address
     * @param searchDepth - Max transactions to search (default: undefined = exhaustive)
     * @returns The discovered key
     * @throws PublicKeyNotFoundError if no chat history exists
     */
    async findPublicKey(
        address: string,
        searchDepth?: number
    ): Promise<DiscoveredKey> {
        // Paginated path
        if (this.indexerClient.searchTransactionsPaginated) {
            const pageSize = 100;
            let searched = 0;
            let nextToken: string | undefined;

            while (true) {
                const limit = searchDepth
                    ? Math.min(pageSize, searchDepth - searched)
                    : pageSize;

                if (limit <= 0) break;

                const result = await this.indexerClient.searchTransactionsPaginated(
                    address,
                    { limit, nextToken }
                );

                for (const tx of result.transactions) {
                    if (tx.sender !== address) continue;
                    if (!tx.note || tx.note.length < 2) continue;
                    if (!isChatMessage(tx.note)) continue;

                    try {
                        const envelope = decodeEnvelope(tx.note);
                        return {
                            publicKey: envelope.senderPublicKey,
                            isVerified: false,
                        };
                    } catch {
                        // Continue searching
                    }
                }

                searched += result.transactions.length;
                nextToken = result.nextToken;

                if (!nextToken || result.transactions.length === 0) break;
                if (searchDepth && searched >= searchDepth) break;
            }

            throw new PublicKeyNotFoundError(address);
        }

        // Fallback: single batch
        const limit = searchDepth ?? DEFAULT_SEARCH_DEPTH;
        const transactions = await this.indexerClient.searchTransactions(
            address,
            undefined,
            limit
        );

        for (const tx of transactions) {
            if (tx.sender !== address) continue;
            if (!tx.note || tx.note.length < 2) continue;
            if (!isChatMessage(tx.note)) continue;

            try {
                const envelope = decodeEnvelope(tx.note);
                return {
                    publicKey: envelope.senderPublicKey,
                    isVerified: false,
                };
            } catch {
                // Continue searching
            }
        }

        throw new PublicKeyNotFoundError(address);
    }

    /**
     * Polls the indexer until a specific transaction appears.
     *
     * Uses exponential backoff with jitter to reduce load on the indexer
     * while still providing timely notification when the transaction appears.
     *
     * @param txid - The transaction ID to wait for
     * @param timeoutMs - Maximum time to wait in milliseconds
     * @param initialIntervalMs - Initial time between polls (default: 500ms)
     * @param maxIntervalMs - Maximum time between polls (default: 5000ms)
     * @param backoffMultiplier - Factor to increase interval each attempt (default: 1.5)
     * @returns true if the transaction was found, false if timeout
     */
    async waitForTransaction(
        txid: string,
        timeoutMs: number,
        initialIntervalMs: number = 500,
        maxIntervalMs: number = 5000,
        backoffMultiplier: number = 1.5
    ): Promise<boolean> {
        const deadline = Date.now() + timeoutMs;
        let currentInterval = initialIntervalMs;

        while (Date.now() < deadline) {
            try {
                const transactions = await this.indexerClient.searchTransactions(
                    this.chatAccount.address,
                    undefined,
                    50
                );

                if (transactions.some((tx) => tx.txid === txid)) {
                    return true;
                }
            } catch {
                // Indexer error - keep trying with backoff
            }

            // Exponential backoff with jitter (±20%)
            const jitter = 0.8 + Math.random() * 0.4;
            const sleepInterval = currentInterval * jitter;
            await this.sleep(sleepInterval);

            // Increase interval for next attempt (capped at maxInterval)
            currentInterval = Math.min(currentInterval * backoffMultiplier, maxIntervalMs);
        }

        return false;
    }

    /**
     * Parses and decrypts a message from a transaction.
     *
     * @param tx - The transaction to parse
     * @param direction - Whether this is a sent or received message
     * @returns The decrypted message, or null if it's a key-publish
     */
    private async parseMessage(
        tx: NoteTransaction,
        direction: MessageDirection
    ): Promise<Message | null> {
        const envelope = decodeEnvelope(tx.note);

        // Decrypt the message
        const decrypted = decryptMessage(
            envelope,
            this.chatAccount.encryptionKeys.privateKey,
            this.chatAccount.encryptionKeys.publicKey
        );

        if (!decrypted) {
            // Key-publish payload - not a real message
            return null;
        }

        // Build reply context if this is a reply
        let replyContext: ReplyContext | undefined;
        if (decrypted.replyToId && decrypted.replyToPreview) {
            replyContext = {
                messageId: decrypted.replyToId,
                preview: decrypted.replyToPreview,
            };
        }

        return {
            id: tx.txid,
            sender: tx.sender,
            recipient: tx.receiver,
            content: decrypted.text,
            timestamp: new Date(tx.roundTime * 1000),
            confirmedRound: tx.confirmedRound,
            direction,
            replyContext,
        };
    }

    /** Sleep for a given number of milliseconds */
    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
