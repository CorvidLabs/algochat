/**
 * AlgoChat Web - Blockchain Interfaces
 *
 * Abstract interfaces for interacting with Algorand nodes and indexers.
 * Implementations can use any Algorand SDK (e.g., algosdk, use-wallet).
 */

import type {
    TransactionInfo,
    NoteTransaction,
    SuggestedParams,
    AccountInfo,
    PaginatedTransactions,
} from './types.js';

/**
 * Interface for interacting with an Algorand node (algod).
 *
 * Implementations should wrap the algosdk Algodv2 client or equivalent.
 */
export interface AlgodClient {
    /**
     * Get the current network parameters.
     */
    getSuggestedParams(): Promise<SuggestedParams>;

    /**
     * Get account information.
     */
    getAccountInfo(address: string): Promise<AccountInfo>;

    /**
     * Submit a signed transaction. Returns the transaction ID.
     */
    submitTransaction(signedTxn: Uint8Array): Promise<string>;

    /**
     * Wait for a transaction to be confirmed.
     * @param txid Transaction ID to wait for
     * @param rounds Maximum rounds to wait (default: 10)
     */
    waitForConfirmation(txid: string, rounds?: number): Promise<TransactionInfo>;

    /**
     * Get the current round.
     */
    getCurrentRound(): Promise<number>;
}

/**
 * Interface for interacting with an Algorand indexer.
 *
 * Implementations should wrap the algosdk Indexer client or equivalent.
 */
export interface IndexerClient {
    /**
     * Search for transactions with notes sent to/from an address.
     * @param address Address to search for
     * @param afterRound Only return transactions after this round
     * @param limit Maximum number of transactions to return
     */
    searchTransactions(
        address: string,
        afterRound?: number,
        limit?: number
    ): Promise<NoteTransaction[]>;

    /**
     * Search for transactions between two addresses.
     * @param address1 First address
     * @param address2 Second address
     * @param afterRound Only return transactions after this round
     * @param limit Maximum number of transactions to return
     */
    searchTransactionsBetween(
        address1: string,
        address2: string,
        afterRound?: number,
        limit?: number
    ): Promise<NoteTransaction[]>;

    /**
     * Get a specific transaction by ID.
     */
    getTransaction(txid: string): Promise<NoteTransaction>;

    /**
     * Wait for a transaction to be indexed.
     * @param txid Transaction ID to wait for
     * @param timeoutSecs Maximum seconds to wait (default: 30)
     */
    waitForIndexer(txid: string, timeoutSecs?: number): Promise<NoteTransaction>;

    /**
     * Search for transactions with cursor-based pagination.
     *
     * Returns a page of transactions and an optional `nextToken` for fetching
     * the next page. Implementations should use the Algorand indexer's native
     * `next-token` pagination when available.
     *
     * This method is optional. When not implemented, discovery functions
     * fall back to `searchTransactions` with a single batch.
     *
     * @param address Address to search for
     * @param options Pagination options
     */
    searchTransactionsPaginated?(
        address: string,
        options?: {
            afterRound?: number;
            limit?: number;
            nextToken?: string;
        }
    ): Promise<PaginatedTransactions>;
}
