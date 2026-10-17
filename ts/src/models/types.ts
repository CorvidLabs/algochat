/**
 * AlgoChat Web - Core Types
 */

/** 32-byte X25519 key pair */
export interface X25519KeyPair {
    privateKey: Uint8Array;
    publicKey: Uint8Array;
}

/** Parsed message envelope from transaction note */
export interface ChatEnvelope {
    version: number;
    protocolId: number;
    senderPublicKey: Uint8Array;
    ephemeralPublicKey: Uint8Array;
    nonce: Uint8Array;
    encryptedSenderKey: Uint8Array;
    ciphertext: Uint8Array;
}

/** Decrypted message content */
export interface DecryptedContent {
    text: string;
    replyToId?: string;
    replyToPreview?: string;
}

/** Reply context for threaded messages */
export interface ReplyContext {
    messageId: string;
    preview: string;
}

/** Message direction relative to current user */
export type MessageDirection = 'sent' | 'received';

/** A chat message */
export interface Message {
    id: string;
    sender: string;
    recipient: string;
    content: string;
    timestamp: Date;
    confirmedRound: number;
    direction: MessageDirection;
    replyContext?: ReplyContext;
    /** Amount transferred in microAlgos */
    amount?: number;
    /** Transaction fee in microAlgos */
    fee?: number;
    /** Position within the confirmed round (for ordering group transactions) */
    intraRoundOffset?: number;
}

/** A conversation with another user */
export interface Conversation {
    participant: string;
    participantPublicKey?: Uint8Array;
    messages: Message[];
    lastFetchedRound?: number;
}

/** Result of sending a message */
export interface SendResult {
    txid: string;
    message: Message;
    confirmedRound?: number;
    /** Transaction fee in microAlgos */
    fee?: number;
}

/** Reply context used when sending */
export interface SendReplyContext {
    messageId: string;
    preview: string;
}

/** Options for sending messages */
export interface SendOptions {
    /** Wait for transaction confirmation (default: false) */
    waitForConfirmation?: boolean;
    /** Confirmation timeout in rounds (default: 10) */
    timeout?: number;
    /** Wait for indexer to index the transaction (default: false) */
    waitForIndexer?: boolean;
    /** Indexer timeout in milliseconds (default: 30000) */
    indexerTimeout?: number;
    /** Reply context for threaded messages */
    replyContext?: SendReplyContext;
    /** Amount to send in microAlgos (default: 1000 = 0.001 ALGO) */
    amount?: number;
}

/** Preset configurations for SendOptions */
export const SendOptionsPresets = {
    /** Default: fire and forget */
    default: {} as SendOptions,
    /** Wait for transaction confirmation */
    confirmed: { waitForConfirmation: true } as SendOptions,
    /** Wait for both confirmation and indexer */
    indexed: { waitForConfirmation: true, waitForIndexer: true } as SendOptions,
} as const;

/** A discovered public key with metadata */
export interface DiscoveredKey {
    /** The X25519 public key */
    publicKey: Uint8Array;
    /** Whether the key was cryptographically verified via Ed25519 signature */
    isVerified: boolean;
    /** Algorand address that owns this key (optional - not all discovery methods provide this) */
    address?: string;
    /** Transaction ID where key was discovered (optional) */
    discoveredInTx?: string;
    /** Round number where key was discovered (optional) */
    discoveredAtRound?: number;
    /** Timestamp of discovery (optional) */
    discoveredAt?: Date;
}

/** Status of a pending message in the send queue */
export type PendingMessageStatus = 'queued' | 'sending' | 'sent' | 'failed';

/** A message waiting in the send queue */
export interface PendingMessage {
    /** Unique local identifier */
    id: string;
    /** Recipient Algorand address */
    recipient: string;
    /** Recipient's encryption public key */
    recipientPublicKey: Uint8Array;
    /** Message content */
    content: string;
    /** Optional reply context */
    replyContext?: SendReplyContext;
    /** Current status */
    status: PendingMessageStatus;
    /** Number of send attempts */
    retryCount: number;
    /** Maximum retries before expiring */
    maxRetries: number;
    /** When the message was queued */
    createdAt: Date;
    /** Last send attempt time */
    lastAttemptAt?: Date;
    /** Error message if failed */
    lastError?: string;
    /** Transaction ID if sent */
    txid?: string;
}

/** Options for message encryption/decryption */
export interface EncryptionOptions {
    /** Pre-shared key (32 bytes) for hybrid PSK+ECDH encryption; confidentiality requires compromise of both PSK and ECDH secret */
    psk?: Uint8Array;
}

/** Algorand consensus maximum for a transaction note, in bytes. */
export const MAX_NOTE_SIZE = 4096;

const STANDARD_HEADER_SIZE = 126;
const STANDARD_TAG_SIZE = 16;

/** Protocol constants */
export const PROTOCOL = {
    /** Legacy envelopes (no header AAD). Still accepted on decrypt. */
    VERSION: 0x01,
    /** Current envelopes bind the fixed header as ChaCha20-Poly1305 AAD (#232). */
    VERSION_AAD: 0x02,
    PROTOCOL_ID: 0x01,
    HEADER_SIZE: STANDARD_HEADER_SIZE,
    TAG_SIZE: STANDARD_TAG_SIZE,
    ENCRYPTED_SENDER_KEY_SIZE: 48,
    /** Note ceiling minus the fixed header and the Poly1305 tag. */
    MAX_PAYLOAD_SIZE: MAX_NOTE_SIZE - STANDARD_HEADER_SIZE - STANDARD_TAG_SIZE,
    MIN_PAYMENT: 1000,
} as const;
