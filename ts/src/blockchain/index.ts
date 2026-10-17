/**
 * AlgoChat Web - Blockchain Module
 *
 * Abstract interfaces and types for Algorand blockchain integration.
 */

// Types
export type {
    AlgorandConfig,
    TransactionInfo,
    NoteTransaction,
    SuggestedParams,
    AccountInfo,
    PaginatedTransactions,
} from './types.js';

export {
    localnet,
    testnet,
    mainnet,
    withIndexer,
} from './types.js';

// Interfaces
export type {
    AlgodClient,
    IndexerClient,
} from './interfaces.js';

// Discovery
export type { DiscoverKeyOptions } from './discovery.js';
export {
    parseKeyAnnouncement,
    discoverEncryptionKey,
    discoverEncryptionKeyFromMessages,
} from './discovery.js';

// Message Transaction
export type { UnsignedTransaction, SignedTransaction, ChatAccountLike } from './message-transaction.js';
export {
    MessageTransaction,
    MessageTooLargeError,
    MAX_NOTE_SIZE,
    MINIMUM_PAYMENT,
    notePaymentFee,
} from './message-transaction.js';

// Message Indexer
export type { ChatAccountLike as IndexerChatAccount } from './message-indexer.js';
export {
    MessageIndexer,
    PublicKeyNotFoundError,
    DEFAULT_PAGE_SIZE,
    DEFAULT_SEARCH_DEPTH,
} from './message-indexer.js';
