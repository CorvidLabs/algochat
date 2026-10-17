/**
 * AlgoChat Web - Algorand Blockchain Service
 *
 * Handles sending messages and querying the blockchain.
 */

import algosdk from 'algosdk';
import type { Message, Conversation, SendResult, SendOptions, X25519KeyPair, DiscoveredKey, EncryptionOptions } from '../models/types.js';
import { MAX_NOTE_SIZE } from '../models/types.js';
import { encryptMessage, encryptReply, decryptMessage, encodeEnvelope, decodeEnvelope, isChatMessage, signEncryptionKey } from '../crypto/index.js';
import { parseKeyAnnouncement } from '../blockchain/discovery.js';
import { MessageTooLargeError, notePaymentFee, type PaymentScheme } from '../blockchain/message-transaction.js';
import { ChatError } from '../errors/ChatError.js';
import { SIGNING_SCHEME, type SigningScheme } from './mnemonic.service.js';

export { FALCON_FEE_MULTIPLIER } from '../blockchain/message-transaction.js';

export interface AlgorandConfig {
    algodToken: string;
    algodServer: string;
    algodPort?: number;
    indexerToken: string;
    indexerServer: string;
    indexerPort?: number;
}

export interface ChatAccount {
    address: string;
    /** Authorizing signature scheme for payments that carry envelopes. */
    scheme: SigningScheme;
    /**
     * Ed25519 algosdk account. Present only when `scheme` is `ed25519`.
     * Falcon accounts sign through `txnSigner` and do not expose a 64-byte sk.
     */
    account?: algosdk.Account;
    encryptionKeys: X25519KeyPair;
    /**
     * Ed25519 public key derived from mnemonic entropy (32 bytes).
     * Equal to the address public key only when `scheme` is `ed25519`.
     */
    ed25519PublicKey: Uint8Array;
    /** Signs payments for this account (Ed25519 `sig` or Falcon-1024 `pqsig`). */
    txnSigner: algosdk.TransactionSigner;
}

/** Indexer transaction response shape (subset of fields we use) */
interface IndexerTransaction {
    id: string;
    sender: string;
    txType: string;
    note?: string;
    roundTime?: number;
    confirmedRound?: number;
    fee?: number;
    'intra-round-offset'?: number;
    paymentTransaction?: {
        receiver?: string;
        amount?: number;
    };
}

interface IndexerSearchResponse {
    transactions?: IndexerTransaction[];
    'next-token'?: string;
}

/** Default page size for paginated indexer queries */
const DISCOVERY_PAGE_SIZE = 100;

/** Default max entries in the public key LRU cache */
const DEFAULT_KEY_CACHE_SIZE = 128;

export class AlgorandService {
    private algodClient: algosdk.Algodv2;
    private indexerClient: algosdk.Indexer;
    private encryptionOptions?: EncryptionOptions;
    private keyCache: Map<string, DiscoveredKey> = new Map();
    private keyCacheMaxSize: number;

    constructor(config: AlgorandConfig, encryptionOptions?: EncryptionOptions, keyCacheMaxSize = DEFAULT_KEY_CACHE_SIZE) {
        // Pass empty string for port when not specified to avoid algosdk defaulting to 8080
        this.algodClient = new algosdk.Algodv2(
            config.algodToken,
            config.algodServer,
            config.algodPort ?? ''
        );

        this.indexerClient = new algosdk.Indexer(
            config.indexerToken,
            config.indexerServer,
            config.indexerPort ?? ''
        );

        this.encryptionOptions = encryptionOptions;
        this.keyCacheMaxSize = keyCacheMaxSize;
    }

    /**
     * Flat consensus fee for this note. Falcon-1024 pays 3x minFee.
     * Bytes past 1024 add the note surcharge. A missing minFee uses the suggested fee.
     */
    private suggestedParamsFor(
        chatAccount: ChatAccount,
        params: algosdk.SuggestedParams,
        noteBytes: number
    ): algosdk.SuggestedParams {
        const suggestedFee = Number(params.fee);
        const minFee = Number(params.minFee ?? suggestedFee);
        const scheme: PaymentScheme = chatAccount.scheme === SIGNING_SCHEME.FALCON_1024
            ? 'falcon-1024'
            : 'ed25519';
        return {
            ...params,
            flatFee: true,
            fee: notePaymentFee(noteBytes, minFee, scheme),
        };
    }

    private async submitSigned(
        chatAccount: ChatAccount,
        txn: algosdk.Transaction
    ): Promise<string> {
        const [blob] = await chatAccount.txnSigner([txn], [0]);
        const { txid } = await this.algodClient.sendRawTransaction(blob).do();
        return txid;
    }

    /**
     * Sends an encrypted message to a recipient
     *
     * @param chatAccount - The sender's chat account
     * @param recipientAddress - Recipient's Algorand address
     * @param recipientPublicKey - Recipient's encryption public key
     * @param message - Message content
     * @param options - Send options (waitForConfirmation, waitForIndexer, etc.)
     */
    async sendMessage(
        chatAccount: ChatAccount,
        recipientAddress: string,
        recipientPublicKey: Uint8Array,
        message: string,
        options: SendOptions = {}
    ): Promise<SendResult> {
        // Encrypt message
        const envelope = encryptMessage(
            message,
            chatAccount.encryptionKeys.publicKey,
            recipientPublicKey,
            this.encryptionOptions
        );

        // Encode to bytes
        const note = encodeEnvelope(envelope);
        if (note.length > MAX_NOTE_SIZE) {
            throw new MessageTooLargeError(note.length, MAX_NOTE_SIZE);
        }

        // Get transaction parameters
        const params = this.suggestedParamsFor(
            chatAccount,
            await this.algodClient.getTransactionParams().do(),
            note.length
        );

        // Build payment transaction
        const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
            sender: chatAccount.address,
            receiver: recipientAddress,
            amount: options?.amount ?? 1000, // 0.001 ALGO minimum
            note,
            suggestedParams: params,
        });

        const txid = await this.submitSigned(chatAccount, txn);

        // Build optimistic message for UI
        const sentMessage: Message = {
            id: txid,
            sender: chatAccount.address,
            recipient: recipientAddress,
            content: message,
            timestamp: new Date(),
            confirmedRound: 0,
            direction: 'sent',
            replyContext: options.replyContext,
            amount: options?.amount ?? 1000,
        };

        const result: SendResult = { txid, message: sentMessage };

        // Capture fee from the built transaction
        result.fee = Number(txn.fee);
        sentMessage.fee = result.fee;

        // Wait for confirmation if requested
        if (options.waitForConfirmation) {
            const timeout = options.timeout ?? 10;
            const confirmation = await algosdk.waitForConfirmation(this.algodClient, txid, timeout);
            result.confirmedRound = Number(confirmation.confirmedRound);
            sentMessage.confirmedRound = result.confirmedRound;
        }

        // Wait for indexer if requested
        if (options.waitForIndexer) {
            const indexed = await this.waitForIndexer(txid, options.indexerTimeout ?? 30000);
            if (!indexed) {
                throw ChatError.timeout('waitForIndexer', options.indexerTimeout ?? 30000);
            }
        }

        return result;
    }

    /**
     * Sends a reply to a message
     *
     * @param chatAccount - The sender's chat account
     * @param recipientAddress - Recipient's Algorand address
     * @param recipientPublicKey - Recipient's encryption public key
     * @param message - Message content
     * @param replyToTxid - Transaction ID of the message being replied to
     * @param replyToPreview - Preview text of the message being replied to
     * @param options - Send options (waitForConfirmation, waitForIndexer, etc.)
     */
    async sendReply(
        chatAccount: ChatAccount,
        recipientAddress: string,
        recipientPublicKey: Uint8Array,
        message: string,
        replyToTxid: string,
        replyToPreview: string,
        options: SendOptions = {}
    ): Promise<SendResult> {
        const envelope = encryptReply(
            message,
            replyToTxid,
            replyToPreview,
            chatAccount.encryptionKeys.publicKey,
            recipientPublicKey,
            this.encryptionOptions
        );

        const note = encodeEnvelope(envelope);
        if (note.length > MAX_NOTE_SIZE) {
            throw new MessageTooLargeError(note.length, MAX_NOTE_SIZE);
        }
        const params = this.suggestedParamsFor(
            chatAccount,
            await this.algodClient.getTransactionParams().do(),
            note.length
        );

        const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
            sender: chatAccount.address,
            receiver: recipientAddress,
            amount: options?.amount ?? 1000,
            note,
            suggestedParams: params,
        });

        const txid = await this.submitSigned(chatAccount, txn);

        const replyContext = {
            messageId: replyToTxid,
            preview: replyToPreview,
        };

        const sentMessage: Message = {
            id: txid,
            sender: chatAccount.address,
            recipient: recipientAddress,
            content: message,
            timestamp: new Date(),
            confirmedRound: 0,
            direction: 'sent',
            replyContext,
            amount: options?.amount ?? 1000,
        };

        const result: SendResult = { txid, message: sentMessage };

        // Capture fee from the built transaction
        result.fee = Number(txn.fee);
        sentMessage.fee = result.fee;

        // Wait for confirmation if requested
        if (options.waitForConfirmation) {
            const timeout = options.timeout ?? 10;
            const confirmation = await algosdk.waitForConfirmation(this.algodClient, txid, timeout);
            result.confirmedRound = Number(confirmation.confirmedRound);
            sentMessage.confirmedRound = result.confirmedRound;
        }

        // Wait for indexer if requested
        if (options.waitForIndexer) {
            const indexed = await this.waitForIndexer(txid, options.indexerTimeout ?? 30000);
            if (!indexed) {
                throw ChatError.timeout('waitForIndexer', options.indexerTimeout ?? 30000);
            }
        }

        return result;
    }

    /**
     * Fetches messages with a participant
     *
     * @param chatAccount - The user's chat account
     * @param participantAddress - Address of the conversation participant
     * @param afterRound - Only fetch messages after this round (for polling new messages)
     * @param limit - Maximum number of messages to fetch
     * @param beforeRound - Only fetch messages before this round (for pagination/loading older)
     */
    async fetchMessages(
        chatAccount: ChatAccount,
        participantAddress: string,
        afterRound?: number,
        limit = 50,
        beforeRound?: number
    ): Promise<Message[]> {
        const messages: Message[] = [];

        // Query transactions
        let query = this.indexerClient
            .searchForTransactions()
            .address(chatAccount.address)
            .limit(limit);

        if (afterRound) {
            query = query.minRound(afterRound);
        }
        if (beforeRound) {
            query = query.maxRound(beforeRound - 1);
        }

        const response = await query.do() as unknown as IndexerSearchResponse;

        for (const tx of response.transactions ?? []) {
            // Filter: payment transactions with notes
            if (tx.txType !== 'pay' || !tx.note) {
                continue;
            }

            // Decode note from base64
            const noteBytes = base64ToBytes(tx.note);

            // Filter: AlgoChat messages
            if (!isChatMessage(noteBytes)) {
                continue;
            }

            // Determine direction and filter by participant
            const sender: string = tx.sender;
            const receiver: string | undefined = tx.paymentTransaction?.receiver;

            if (!receiver) continue;

            let direction: 'sent' | 'received';

            if (sender === chatAccount.address) {
                if (receiver !== participantAddress) continue;
                direction = 'sent';
            } else {
                if (sender !== participantAddress) continue;
                if (receiver !== chatAccount.address) continue;
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

                if (!decrypted) continue; // Key-publish, skip

                messages.push({
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
                    amount: tx.paymentTransaction?.amount != null ? Number(tx.paymentTransaction.amount) : undefined,
                    fee: tx.fee != null ? Number(tx.fee) : undefined,
                    intraRoundOffset: tx['intra-round-offset'] != null ? Number(tx['intra-round-offset']) : undefined,
                });
            } catch (error) {
                // Log decryption failures for debugging - may indicate
                // corrupted data or messages we can't decrypt
                console.warn(`[AlgoChat] Failed to decrypt message ${tx.id}:`, error);
                continue;
            }
        }

        // Sort by timestamp, then by intra-round offset for messages in the same round
        // (ensures group transaction chunks appear in correct order)
        return messages.sort((a, b) => {
            const timeDiff = a.timestamp.getTime() - b.timestamp.getTime();
            if (timeDiff !== 0) return timeDiff;
            return (a.intraRoundOffset ?? 0) - (b.intraRoundOffset ?? 0);
        });
    }

    /**
     * Discovers a user's encryption public key from their transaction history.
     *
     * Uses paginated indexer queries to search exhaustively. Results are cached
     * in an LRU cache to avoid repeated full scans for the same address.
     *
     * @param address - Algorand address to discover key for
     * @param searchDepth - Max transactions to search (default: undefined = exhaustive)
     */
    async discoverPublicKey(address: string, searchDepth?: number): Promise<Uint8Array> {
        const result = await this.discoverPublicKeyWithMetadata(address, searchDepth);
        return result.publicKey;
    }

    /**
     * Discovers a user's encryption public key with full metadata.
     *
     * Uses paginated indexer queries with the `next-token` cursor to walk the
     * full transaction history. Falls back to a single batch when `searchDepth`
     * is provided for backward compatibility.
     *
     * @param address - Algorand address to discover key for
     * @param searchDepth - Max transactions to search (default: undefined = exhaustive)
     */
    async discoverPublicKeyWithMetadata(address: string, searchDepth?: number): Promise<DiscoveredKey> {
        // Check cache first
        const cached = this.keyCache.get(address);
        if (cached) return cached;

        const result = await this.paginatedKeyDiscovery(address, searchDepth);
        if (!result) {
            throw ChatError.publicKeyNotFound(address, searchDepth ?? -1);
        }

        // Cache the result (LRU eviction)
        this.cacheKey(address, result);
        return result;
    }

    /**
     * Clears the public key cache, or removes a specific address.
     */
    clearKeyCache(address?: string): void {
        if (address) {
            this.keyCache.delete(address);
        } else {
            this.keyCache.clear();
        }
    }

    /**
     * Paginated key discovery using the indexer's next-token cursor.
     */
    private async paginatedKeyDiscovery(
        address: string,
        maxDepth?: number
    ): Promise<DiscoveredKey | undefined> {
        let searched = 0;
        let nextToken: string | undefined;
        let tofuCandidate: DiscoveredKey | undefined;

        // Algorand address encodes the Ed25519 verifying key for classical
        // accounts. Falcon addresses are not Ed25519 keys — announcement
        // verification is skipped and payment authorization remains the bind.
        let ed25519PublicKey: Uint8Array | undefined;
        try {
            ed25519PublicKey = algosdk.Address.fromString(address).publicKey;
        } catch {
            ed25519PublicKey = undefined;
        }

        while (true) {
            const limit = maxDepth
                ? Math.min(DISCOVERY_PAGE_SIZE, maxDepth - searched)
                : DISCOVERY_PAGE_SIZE;

            if (limit <= 0) break;

            let query = this.indexerClient
                .searchForTransactions()
                .address(address)
                .limit(limit);

            if (nextToken) {
                query = query.nextToken(nextToken);
            }

            const response = await query.do() as unknown as IndexerSearchResponse;

            for (const tx of response.transactions ?? []) {
                if (tx.sender !== address) continue;
                if (!tx.note) continue;

                const noteBytes = base64ToBytes(tx.note);
                const receiver = tx.paymentTransaction?.receiver;
                const meta = {
                    address,
                    discoveredInTx: tx.id,
                    discoveredAtRound: Number(tx.confirmedRound ?? 0),
                    discoveredAt: new Date(Number(tx.roundTime ?? 0) * 1000),
                };

                // Prefer signed key announcements (self-transfer notes of exactly
                // 32 or 96 bytes). verifyEncryptionKey runs inside parseKeyAnnouncement (#229).
                // Chat envelopes are much larger; do not mis-parse them as announcements.
                if (receiver === address && (noteBytes.length === 32 || noteBytes.length === 96)) {
                    const announced = parseKeyAnnouncement(noteBytes, ed25519PublicKey);
                    if (announced?.isVerified) {
                        return { ...announced, ...meta };
                    }
                    // Forged signed announcement: skip entirely.
                    if (noteBytes.length === 96) continue;
                    // Unsigned 32-byte announcement: TOFU candidate.
                    if (announced && !tofuCandidate) {
                        tofuCandidate = { ...announced, ...meta };
                    }
                    continue;
                }

                if (!isChatMessage(noteBytes)) continue;

                try {
                    const envelope = decodeEnvelope(noteBytes);
                    if (!tofuCandidate) {
                        tofuCandidate = {
                            publicKey: envelope.senderPublicKey,
                            isVerified: false,
                            ...meta,
                        };
                    }
                } catch (error) {
                    console.warn(`[AlgoChat] Failed to decode envelope from ${tx.id}:`, error);
                    continue;
                }
            }

            searched += (response.transactions ?? []).length;
            nextToken = response['next-token'];

            if (!nextToken || (response.transactions ?? []).length === 0) break;
            if (maxDepth && searched >= maxDepth) break;
        }

        return tofuCandidate;
    }

    /**
     * Adds a key to the LRU cache, evicting the oldest entry if at capacity.
     */
    private cacheKey(address: string, key: DiscoveredKey): void {
        // Delete first to refresh insertion order (Map iterates in insertion order)
        this.keyCache.delete(address);
        this.keyCache.set(address, key);

        // Evict oldest entries if over capacity
        if (this.keyCache.size > this.keyCacheMaxSize) {
            const oldest = this.keyCache.keys().next().value;
            if (oldest !== undefined) {
                this.keyCache.delete(oldest);
            }
        }
    }

    /**
     * Publishes the account's encryption key to the blockchain
     */
    async publishKey(chatAccount: ChatAccount): Promise<string> {
        // Ed25519 accounts publish a signed key announcement (X25519 || Ed25519
        // sig) so discovery can verifyEncryptionKey-bind identity (#229).
        // Falcon accounts keep the legacy self-encrypted envelope; the payment
        // pqsig is the protocol bind and address bytes are not an Ed25519 key.
        let note: Uint8Array;
        if (chatAccount.scheme === 'ed25519' && chatAccount.account) {
            const signingSeed = chatAccount.account.sk.slice(0, 32);
            const signature = signEncryptionKey(chatAccount.encryptionKeys.publicKey, signingSeed);
            note = new Uint8Array(96);
            note.set(chatAccount.encryptionKeys.publicKey, 0);
            note.set(signature, 32);
        } else {
            const payload = JSON.stringify({ type: 'key-publish' });
            const envelope = encryptMessage(
                payload,
                chatAccount.encryptionKeys.publicKey,
                chatAccount.encryptionKeys.publicKey, // Self
                this.encryptionOptions
            );
            note = encodeEnvelope(envelope);
        }

        if (note.length > MAX_NOTE_SIZE) {
            throw new MessageTooLargeError(note.length, MAX_NOTE_SIZE);
        }

        const params = this.suggestedParamsFor(
            chatAccount,
            await this.algodClient.getTransactionParams().do(),
            note.length
        );

        // Zero-amount self-payment
        const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
            sender: chatAccount.address,
            receiver: chatAccount.address,
            amount: 0,
            note,
            suggestedParams: params,
        });

        const txid = await this.submitSigned(chatAccount, txn);

        return txid;
    }

    /**
     * Gets account balance in microAlgos
     */
    async getBalance(address: string): Promise<bigint> {
        const info = await this.algodClient.accountInformation(address).do();
        return info.amount;
    }

    /**
     * Fetches all conversations for an account
     *
     * Scans transaction history and groups messages by participant.
     * Returns conversations sorted by most recent message.
     */
    async fetchConversations(
        chatAccount: ChatAccount,
        limit = 100
    ): Promise<Conversation[]> {
        const response = await this.indexerClient
            .searchForTransactions()
            .address(chatAccount.address)
            .limit(limit)
            .do() as unknown as IndexerSearchResponse;

        const conversationsMap = new Map<string, Conversation>();

        for (const tx of response.transactions ?? []) {
            if (tx.txType !== 'pay' || !tx.note) continue;

            const noteBytes = base64ToBytes(tx.note);
            if (!isChatMessage(noteBytes)) continue;

            const sender: string = tx.sender;
            const receiver: string | undefined = tx.paymentTransaction?.receiver;
            if (!receiver) continue;

            try {
                const envelope = decodeEnvelope(noteBytes);
                const decrypted = decryptMessage(
                    envelope,
                    chatAccount.encryptionKeys.privateKey,
                    chatAccount.encryptionKeys.publicKey,
                    this.encryptionOptions
                );

                if (!decrypted) continue;

                // Skip key-publish transactions (self-tx with key-publish payload)
                if (sender === receiver) {
                    try {
                        const parsed = JSON.parse(decrypted.text);
                        if (parsed.type === 'key-publish') continue;
                    } catch {
                        // Not JSON, check plain text
                        if (decrypted.text === 'key-publish') continue;
                    }
                }

                const otherParty = sender === chatAccount.address ? receiver : sender;
                const direction: 'sent' | 'received' = sender === chatAccount.address ? 'sent' : 'received';

                const message: Message = {
                    id: tx.id,
                    sender,
                    recipient: receiver,
                    content: decrypted.text,
                    timestamp: new Date(Number(tx.roundTime ?? 0) * 1000),
                    confirmedRound: Number(tx.confirmedRound ?? 0),
                    direction,
                    replyContext: decrypted.replyToId
                        ? { messageId: decrypted.replyToId, preview: decrypted.replyToPreview || '' }
                        : undefined,
                    amount: tx.paymentTransaction?.amount != null ? Number(tx.paymentTransaction.amount) : undefined,
                    fee: tx.fee != null ? Number(tx.fee) : undefined,
                    intraRoundOffset: tx['intra-round-offset'] != null ? Number(tx['intra-round-offset']) : undefined,
                };

                if (!conversationsMap.has(otherParty)) {
                    conversationsMap.set(otherParty, {
                        participant: otherParty,
                        messages: [],
                    });
                }

                const conv = conversationsMap.get(otherParty)!;
                conv.messages.push(message);

                // Store public key from received messages
                if (direction === 'received') {
                    conv.participantPublicKey = envelope.senderPublicKey;
                }

                // Track the latest round
                const round = Number(tx.confirmedRound ?? 0);
                if (!conv.lastFetchedRound || round > conv.lastFetchedRound) {
                    conv.lastFetchedRound = round;
                }
            } catch {
                continue;
            }
        }

        // Sort messages within each conversation
        const conversations = Array.from(conversationsMap.values());
        for (const conv of conversations) {
            conv.messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        }

        // Sort conversations by most recent message
        conversations.sort((a, b) => {
            const aLast = a.messages[a.messages.length - 1]?.timestamp.getTime() ?? 0;
            const bLast = b.messages[b.messages.length - 1]?.timestamp.getTime() ?? 0;
            return bLast - aLast;
        });

        return conversations;
    }

    /**
     * Waits for transaction confirmation
     *
     * @param txid - Transaction ID to wait for
     * @param timeout - Timeout in rounds (default: 10)
     * @returns Confirmed round number
     */
    async waitForConfirmation(txid: string, timeout = 10): Promise<number> {
        const result = await algosdk.waitForConfirmation(this.algodClient, txid, timeout);
        return Number(result.confirmedRound);
    }

    /**
     * Waits for a transaction to be indexed
     *
     * Uses exponential backoff with jitter for efficient polling.
     *
     * @param txid - Transaction ID to wait for
     * @param timeout - Timeout in milliseconds (default: 30000)
     * @param initialInterval - Initial polling interval (default: 500ms)
     * @param maxInterval - Maximum polling interval (default: 5000ms)
     * @param backoffMultiplier - Backoff multiplier (default: 1.5)
     * @returns true if indexed, false if timeout
     */
    async waitForIndexer(
        txid: string,
        timeout = 30000,
        initialInterval = 500,
        maxInterval = 5000,
        backoffMultiplier = 1.5
    ): Promise<boolean> {
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
     * Checks if a transaction exists in the indexer
     *
     * @param txid - Transaction ID to check
     */
    async transactionExists(txid: string): Promise<boolean> {
        try {
            await this.indexerClient.lookupTransactionByID(txid).do();
            return true;
        } catch {
            return false;
        }
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Decodes base64 or base64url string to Uint8Array
 *
 * The Algorand indexer returns notes as base64url encoded strings,
 * so we need to handle both standard base64 and base64url formats.
 */
function base64ToBytes(input: string | Uint8Array): Uint8Array {
    // If already Uint8Array, return as-is
    if (input instanceof Uint8Array) {
        return input;
    }

    if (typeof input !== 'string') {
        return new Uint8Array(0);
    }

    // Convert base64url to standard base64
    const standardBase64 = input.replace(/-/g, '+').replace(/_/g, '/');

    // Add padding if needed
    const padded = standardBase64 + '='.repeat((4 - (standardBase64.length % 4)) % 4);

    const binaryString = atob(padded);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}
