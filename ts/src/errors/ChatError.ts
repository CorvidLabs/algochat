/**
 * AlgoChat Web - Comprehensive Error Types
 *
 * Provides typed error handling for all AlgoChat operations.
 */

/**
 * Error codes for AlgoChat operations
 */
export enum ChatErrorCode {
    // Cryptographic errors
    ENCRYPTION_FAILED = 'ENCRYPTION_FAILED',
    DECRYPTION_FAILED = 'DECRYPTION_FAILED',
    INVALID_KEY = 'INVALID_KEY',
    KEY_DERIVATION_FAILED = 'KEY_DERIVATION_FAILED',

    // Network errors
    NETWORK_ERROR = 'NETWORK_ERROR',
    TIMEOUT = 'TIMEOUT',
    INDEXER_ERROR = 'INDEXER_ERROR',

    // Transaction errors
    TRANSACTION_FAILED = 'TRANSACTION_FAILED',
    INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
    CONFIRMATION_TIMEOUT = 'CONFIRMATION_TIMEOUT',

    // Key discovery errors
    PUBLIC_KEY_NOT_FOUND = 'PUBLIC_KEY_NOT_FOUND',
    INVALID_ADDRESS = 'INVALID_ADDRESS',

    // Message errors
    MESSAGE_TOO_LARGE = 'MESSAGE_TOO_LARGE',
    INVALID_ENVELOPE = 'INVALID_ENVELOPE',
    PARSE_ERROR = 'PARSE_ERROR',

    // Queue errors
    QUEUE_FULL = 'QUEUE_FULL',
    MESSAGE_EXPIRED = 'MESSAGE_EXPIRED',

    // General errors
    NOT_CONFIGURED = 'NOT_CONFIGURED',
    UNKNOWN = 'UNKNOWN',
}

/**
 * Comprehensive error class for AlgoChat operations
 */
export class ChatError extends Error {
    public readonly code: ChatErrorCode;
    public readonly cause?: Error;
    public readonly context?: Record<string, unknown>;

    private constructor(
        code: ChatErrorCode,
        message: string,
        cause?: Error,
        context?: Record<string, unknown>
    ) {
        super(message);
        this.name = 'ChatError';
        this.code = code;
        this.cause = cause;
        this.context = context;

        // Maintains proper stack trace for where error was thrown
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, ChatError);
        }
    }

    // MARK: - Factory Methods

    /**
     * Creates an encryption error
     */
    public static encryptionFailed(reason: string, cause?: Error): ChatError {
        return new ChatError(
            ChatErrorCode.ENCRYPTION_FAILED,
            `Encryption failed: ${reason}`,
            cause
        );
    }

    /**
     * Creates a decryption error
     */
    public static decryptionFailed(reason: string, cause?: Error): ChatError {
        return new ChatError(
            ChatErrorCode.DECRYPTION_FAILED,
            `Decryption failed: ${reason}`,
            cause
        );
    }

    /**
     * Creates an invalid key error
     */
    public static invalidKey(keyType: string, reason: string): ChatError {
        return new ChatError(
            ChatErrorCode.INVALID_KEY,
            `Invalid ${keyType} key: ${reason}`,
            undefined,
            { keyType }
        );
    }

    /**
     * Creates a key derivation error
     */
    public static keyDerivationFailed(reason: string, cause?: Error): ChatError {
        return new ChatError(
            ChatErrorCode.KEY_DERIVATION_FAILED,
            `Key derivation failed: ${reason}`,
            cause
        );
    }

    /**
     * Creates a network error
     */
    public static networkError(operation: string, cause?: Error): ChatError {
        return new ChatError(
            ChatErrorCode.NETWORK_ERROR,
            `Network error during ${operation}`,
            cause,
            { operation }
        );
    }

    /**
     * Creates a timeout error
     */
    public static timeout(operation: string, timeoutMs: number): ChatError {
        return new ChatError(
            ChatErrorCode.TIMEOUT,
            `Operation "${operation}" timed out after ${timeoutMs}ms`,
            undefined,
            { operation, timeoutMs }
        );
    }

    /**
     * Creates an indexer error
     */
    public static indexerError(operation: string, cause?: Error): ChatError {
        return new ChatError(
            ChatErrorCode.INDEXER_ERROR,
            `Indexer error during ${operation}`,
            cause,
            { operation }
        );
    }

    /**
     * Creates a transaction failed error
     */
    public static transactionFailed(txid: string, reason: string, cause?: Error): ChatError {
        return new ChatError(
            ChatErrorCode.TRANSACTION_FAILED,
            `Transaction ${txid} failed: ${reason}`,
            cause,
            { txid }
        );
    }

    /**
     * Creates an insufficient funds error
     */
    public static insufficientFunds(address: string, required: bigint, available: bigint): ChatError {
        return new ChatError(
            ChatErrorCode.INSUFFICIENT_FUNDS,
            `Insufficient funds for ${address}: need ${required} microAlgos, have ${available}`,
            undefined,
            { address, required: required.toString(), available: available.toString() }
        );
    }

    /**
     * Creates a confirmation timeout error
     */
    public static confirmationTimeout(txid: string, rounds: number): ChatError {
        return new ChatError(
            ChatErrorCode.CONFIRMATION_TIMEOUT,
            `Transaction ${txid} not confirmed after ${rounds} rounds`,
            undefined,
            { txid, rounds }
        );
    }

    /**
     * Creates a public key not found error
     */
    public static publicKeyNotFound(address: string, searchDepth: number): ChatError {
        return new ChatError(
            ChatErrorCode.PUBLIC_KEY_NOT_FOUND,
            `Public key not found for ${address} after searching ${searchDepth} transactions`,
            undefined,
            { address, searchDepth }
        );
    }

    /**
     * Creates an invalid address error
     */
    public static invalidAddress(address: string): ChatError {
        return new ChatError(
            ChatErrorCode.INVALID_ADDRESS,
            `Invalid Algorand address: ${address}`,
            undefined,
            { address }
        );
    }

    /**
     * Creates a message too large error
     */
    public static messageTooLarge(size: number, maxSize: number): ChatError {
        return new ChatError(
            ChatErrorCode.MESSAGE_TOO_LARGE,
            `Message too large: ${size} bytes exceeds maximum ${maxSize} bytes`,
            undefined,
            { size, maxSize }
        );
    }

    /**
     * Creates an invalid envelope error
     */
    public static invalidEnvelope(reason: string, cause?: Error): ChatError {
        return new ChatError(
            ChatErrorCode.INVALID_ENVELOPE,
            `Invalid message envelope: ${reason}`,
            cause
        );
    }

    /**
     * Creates a parse error
     */
    public static parseError(what: string, cause?: Error): ChatError {
        return new ChatError(
            ChatErrorCode.PARSE_ERROR,
            `Failed to parse ${what}`,
            cause,
            { what }
        );
    }

    /**
     * Creates a queue full error
     */
    public static queueFull(maxSize: number): ChatError {
        return new ChatError(
            ChatErrorCode.QUEUE_FULL,
            `Message queue is full (max ${maxSize} messages)`,
            undefined,
            { maxSize }
        );
    }

    /**
     * Creates a message expired error
     */
    public static messageExpired(messageId: string, maxRetries: number): ChatError {
        return new ChatError(
            ChatErrorCode.MESSAGE_EXPIRED,
            `Message ${messageId} expired after ${maxRetries} retries`,
            undefined,
            { messageId, maxRetries }
        );
    }

    /**
     * Creates a not configured error
     */
    public static notConfigured(component: string): ChatError {
        return new ChatError(
            ChatErrorCode.NOT_CONFIGURED,
            `${component} is not configured`,
            undefined,
            { component }
        );
    }

    /**
     * Creates an unknown error
     */
    public static unknown(message: string, cause?: Error): ChatError {
        return new ChatError(
            ChatErrorCode.UNKNOWN,
            message,
            cause
        );
    }

    // MARK: - Utility Methods

    /**
     * Checks if this is a retryable error
     */
    public get isRetryable(): boolean {
        switch (this.code) {
            case ChatErrorCode.NETWORK_ERROR:
            case ChatErrorCode.TIMEOUT:
            case ChatErrorCode.INDEXER_ERROR:
            case ChatErrorCode.CONFIRMATION_TIMEOUT:
                return true;
            default:
                return false;
        }
    }

    /**
     * Returns a user-friendly description
     */
    public get userMessage(): string {
        switch (this.code) {
            case ChatErrorCode.INSUFFICIENT_FUNDS:
                return 'You do not have enough ALGO to send this message.';
            case ChatErrorCode.PUBLIC_KEY_NOT_FOUND:
                return 'This user has not published their encryption key yet.';
            case ChatErrorCode.NETWORK_ERROR:
            case ChatErrorCode.TIMEOUT:
                return 'Network error. Please check your connection and try again.';
            case ChatErrorCode.MESSAGE_TOO_LARGE:
                return 'Your message is too long. Please shorten it and try again.';
            default:
                return this.message;
        }
    }

    /**
     * Converts to JSON for logging/serialization
     */
    public toJSON(): Record<string, unknown> {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            context: this.context,
            cause: this.cause?.message,
            stack: this.stack,
        };
    }
}

/**
 * Type guard for ChatError
 */
export function isChatError(error: unknown): error is ChatError {
    return error instanceof ChatError;
}

/**
 * Wraps an unknown error in a ChatError
 */
export function wrapError(error: unknown, context?: string): ChatError {
    if (isChatError(error)) {
        return error;
    }

    const message = error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error ? error : undefined;

    return ChatError.unknown(context ? `${context}: ${message}` : message, cause);
}
