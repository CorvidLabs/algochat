/**
 * AlgoChat Web
 *
 * TypeScript implementation of the AlgoChat protocol for web applications.
 *
 * @example
 * ```typescript
 * import { AlgorandService, createChatAccountFromMnemonic, SendOptionsPresets } from '@corvidlabs/ts-algochat';
 *
 * // Initialize
 * const service = new AlgorandService({
 *   algodToken: 'your-token',
 *   algodServer: 'https://testnet-api.algonode.cloud',
 *   indexerToken: 'your-token',
 *   indexerServer: 'https://testnet-idx.algonode.cloud',
 * });
 *
 * const chatAccount = createChatAccountFromMnemonic('your 25 word mnemonic...');
 *
 * // Discover recipient's key
 * const recipientPubKey = await service.discoverPublicKey('RECIPIENT_ADDRESS...');
 *
 * // Send a message (with confirmation)
 * const result = await service.sendMessage(
 *   chatAccount,
 *   'RECIPIENT_ADDRESS...',
 *   recipientPubKey,
 *   'Hello from AlgoChat!',
 *   SendOptionsPresets.confirmed
 * );
 *
 * console.log('Sent:', result.txid, 'Round:', result.confirmedRound);
 *
 * // Fetch messages
 * const messages = await service.fetchMessages(chatAccount, 'RECIPIENT_ADDRESS...');
 * ```
 */

// Core types
export type {
    X25519KeyPair,
    ChatEnvelope,
    DecryptedContent,
    ReplyContext,
    Message,
    MessageDirection,
    Conversation as ConversationData,
    SendResult,
    SendOptions,
    SendReplyContext,
    DiscoveredKey,
    PendingMessage,
    PendingMessageStatus,
    EncryptionOptions,
} from './models/types.js';

export { PROTOCOL, SendOptionsPresets } from './models/types.js';

// Conversation class
export { Conversation } from './models/Conversation.js';

// Storage
export type {
    MessageCache,
    EncryptionKeyStorage,
} from './storage/index.js';

export {
    InMemoryMessageCache,
    PublicKeyCache,
    InMemoryKeyStorage,
    KeyNotFoundError,
    // FileKeyStorage - Node.js only, import from 'ts-algochat/node' if needed
    PasswordRequiredError,
    DecryptionFailedError,
    InvalidKeyDataError,
} from './storage/index.js';

// Crypto functions
export {
    deriveEncryptionKeys,
    generateEphemeralKeyPair,
    uint8ArrayEquals,
    encryptMessage,
    encryptReply,
    decryptMessage,
    encodeEnvelope,
    decodeEnvelope,
    isChatMessage,
    EncryptionError,
    EnvelopeError,
    // Signature functions
    signEncryptionKey,
    verifyEncryptionKey,
    getPublicKey,
    fingerprint,
    SignatureError,
    ED25519_SIGNATURE_SIZE,
    ED25519_PUBLIC_KEY_SIZE,
    X25519_PUBLIC_KEY_SIZE,
} from './crypto/index.js';

// Errors
export {
    ChatError,
    ChatErrorCode,
    isChatError,
    wrapError,
} from './errors/index.js';

// Caches (re-export from cache for backwards compatibility)
export {
    type MessageCache as LegacyMessageCache,
} from './cache/index.js';

// Queue and sync
export {
    SendQueue,
    InMemorySendQueueStorage,
    type SendQueueStorage,
    type EnqueueOptions,
    type QueueEventCallback,
    SyncManager,
    type SyncState,
    type SyncEvents,
    type SyncManagerConfig,
    // FileSendQueueStorage - Node.js only, import from 'ts-algochat/node' if needed
} from './queue/index.js';

// Blockchain interfaces (abstract)
export type {
    AlgodClient,
    IndexerClient,
    AlgorandConfig as BlockchainConfig,
    TransactionInfo,
    NoteTransaction,
    SuggestedParams,
    AccountInfo,
    PaginatedTransactions,
    DiscoverKeyOptions,
} from './blockchain/index.js';

export {
    localnet,
    testnet,
    mainnet,
    withIndexer,
    parseKeyAnnouncement,
    discoverEncryptionKey,
    discoverEncryptionKeyFromMessages,
} from './blockchain/index.js';

// Services (concrete implementations)
export {
    AlgorandService,
    FALCON_FEE_MULTIPLIER,
    type AlgorandConfig,
    type ChatAccount,
    SIGNING_SCHEME,
    type SigningScheme,
    type ChatAccountOptions,
    createChatAccountFromMnemonic,
    createRandomChatAccount,
    validateMnemonic,
    validateAddress,
    publicKeyToBase64,
    base64ToPublicKey,
    MessageIndexer,
    type MessageIndexerConfig,
    type PaginationOptions,
    type WaitForTransactionOptions,
} from './services/index.js';

// PSK (Pre-Shared Key) v1.1 Protocol
export {
    PSK_PROTOCOL,
    type PSKEnvelope,
    type PSKState,
    deriveSessionPSK,
    derivePositionPSK,
    derivePSKAtCounter,
    deriveHybridSymmetricKey,
    deriveSenderKey,
    encodePSKEnvelope,
    decodePSKEnvelope,
    isPSKMessage,
    PSKEnvelopeError,
    createPSKState,
    validateCounter,
    recordReceive,
    advanceSendCounter,
    createPSKExchangeURI,
    parsePSKExchangeURI,
    encryptPSKMessage,
    decryptPSKMessage,
    PSKEncryptionError,
} from './psk/index.js';
