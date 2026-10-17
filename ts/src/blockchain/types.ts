/**
 * AlgoChat Web - Blockchain Types
 *
 * Data types for blockchain interactions.
 */

/**
 * Configuration for Algorand node connections.
 */
export interface AlgorandConfig {
    /** Algod node URL. */
    algodUrl: string;
    /** Algod API token. */
    algodToken: string;
    /** Indexer URL (optional). */
    indexerUrl?: string;
    /** Indexer API token (optional). */
    indexerToken?: string;
}

/** Read an env var if available (works in Node, Bun, Deno; no-ops in browsers). */
function env(key: string): string | undefined {
    try {
        return typeof process !== 'undefined' ? process.env[key] : undefined;
    } catch {
        return undefined;
    }
}

/**
 * Create configuration for LocalNet (AlgoKit sandbox).
 */
export function localnet(): AlgorandConfig {
    return {
        algodUrl: 'http://localhost:4001',
        algodToken: 'a'.repeat(64),
        indexerUrl: 'http://localhost:8980',
        indexerToken: 'a'.repeat(64),
    };
}

/**
 * Create configuration for TestNet.
 * Defaults to Nodely. Override with ALGOCHAT_ALGOD_URL / ALGOCHAT_INDEXER_URL env vars.
 */
export function testnet(): AlgorandConfig {
    return {
        algodUrl: env('ALGOCHAT_ALGOD_URL') ?? 'https://testnet-api.4160.nodely.dev',
        algodToken: env('ALGOCHAT_ALGOD_TOKEN') ?? '',
        indexerUrl: env('ALGOCHAT_INDEXER_URL') ?? 'https://testnet-idx.4160.nodely.dev',
        indexerToken: env('ALGOCHAT_INDEXER_TOKEN') ?? '',
    };
}

/**
 * Create configuration for MainNet.
 * Defaults to Nodely. Override with ALGOCHAT_ALGOD_URL / ALGOCHAT_INDEXER_URL env vars.
 */
export function mainnet(): AlgorandConfig {
    return {
        algodUrl: env('ALGOCHAT_ALGOD_URL') ?? 'https://mainnet-api.4160.nodely.dev',
        algodToken: env('ALGOCHAT_ALGOD_TOKEN') ?? '',
        indexerUrl: env('ALGOCHAT_INDEXER_URL') ?? 'https://mainnet-idx.4160.nodely.dev',
        indexerToken: env('ALGOCHAT_INDEXER_TOKEN') ?? '',
    };
}

/**
 * Returns a new config with indexer settings.
 */
export function withIndexer(
    config: AlgorandConfig,
    url: string,
    token = ''
): AlgorandConfig {
    return {
        ...config,
        indexerUrl: url,
        indexerToken: token,
    };
}

/**
 * Transaction information returned after submission.
 */
export interface TransactionInfo {
    /** Transaction ID. */
    txid: string;
    /** Round in which the transaction was confirmed (if confirmed). */
    confirmedRound?: number;
}

/**
 * A note field transaction from the blockchain.
 */
export interface NoteTransaction {
    /** Transaction ID. */
    txid: string;
    /** Sender address. */
    sender: string;
    /** Receiver address. */
    receiver: string;
    /** Note field contents. */
    note: Uint8Array;
    /** Round in which the transaction was confirmed. */
    confirmedRound: number;
    /** Timestamp of the block (Unix time in seconds). */
    roundTime: number;
}

/**
 * Suggested transaction parameters.
 */
export interface SuggestedParams {
    /** Fee per byte in microAlgos. */
    fee: number;
    /** Minimum fee in microAlgos. */
    minFee: number;
    /** First valid round. */
    firstValid: number;
    /** Last valid round. */
    lastValid: number;
    /** Genesis ID. */
    genesisId: string;
    /** Genesis hash (32 bytes). */
    genesisHash: Uint8Array;
}

/**
 * Account information.
 */
export interface AccountInfo {
    /** Account address. */
    address: string;
    /** Account balance in microAlgos. */
    amount: bigint;
    /** Minimum balance required. */
    minBalance: bigint;
}

/**
 * Paginated transaction search result.
 *
 * Wraps the transactions with an optional `nextToken` for cursor-based
 * pagination. When `nextToken` is present, more results are available.
 */
export interface PaginatedTransactions {
    /** The transactions in this page. */
    transactions: NoteTransaction[];
    /** Opaque cursor for fetching the next page. Absent when no more results. */
    nextToken?: string;
}
