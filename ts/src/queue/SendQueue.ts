/**
 * AlgoChat Web - Send Queue
 *
 * Manages offline message queuing and retry logic.
 */

import type { PendingMessage, PendingMessageStatus, SendReplyContext } from '../models/types.js';
import { ChatError } from '../errors/ChatError.js';

/**
 * Storage interface for pending messages
 *
 * Implementations can use in-memory, localStorage, IndexedDB, etc.
 */
export interface SendQueueStorage {
    /**
     * Loads all pending messages
     */
    load(): Promise<PendingMessage[]>;

    /**
     * Saves all pending messages
     */
    save(messages: PendingMessage[]): Promise<void>;

    /**
     * Clears all pending messages
     */
    clear(): Promise<void>;
}

/**
 * In-memory storage implementation
 */
export class InMemorySendQueueStorage implements SendQueueStorage {
    private messages: PendingMessage[] = [];

    public async load(): Promise<PendingMessage[]> {
        return [...this.messages];
    }

    public async save(messages: PendingMessage[]): Promise<void> {
        this.messages = [...messages];
    }

    public async clear(): Promise<void> {
        this.messages = [];
    }
}

/** Options for creating a pending message */
export interface EnqueueOptions {
    /** Recipient Algorand address */
    recipient: string;
    /** Recipient's encryption public key */
    recipientPublicKey: Uint8Array;
    /** Message content */
    content: string;
    /** Optional reply context */
    replyContext?: SendReplyContext;
    /** Maximum retries before expiring (default: 3) */
    maxRetries?: number;
}

/** Callback types for queue events */
export type QueueEventCallback<T = void> = (message: PendingMessage) => T;

/**
 * Send Queue
 *
 * Manages a queue of pending messages for offline support.
 * Messages can be enqueued when offline and processed when online.
 */
export class SendQueue {
    private messages: PendingMessage[] = [];
    private storage: SendQueueStorage;
    private maxQueueSize: number;
    private idCounter = 0;

    // Event callbacks
    private onMessageSent?: QueueEventCallback;
    private onMessageFailed?: QueueEventCallback;
    private onMessageExpired?: QueueEventCallback;

    /**
     * Creates a new SendQueue
     *
     * @param storage - Storage backend (default: in-memory)
     * @param maxQueueSize - Maximum queue size (default: 100)
     */
    constructor(
        storage: SendQueueStorage = new InMemorySendQueueStorage(),
        maxQueueSize = 100
    ) {
        this.storage = storage;
        this.maxQueueSize = maxQueueSize;
    }

    // MARK: - Initialization

    /**
     * Loads pending messages from storage
     */
    public async load(): Promise<void> {
        this.messages = await this.storage.load();

        // Find highest ID to continue sequence
        for (const msg of this.messages) {
            const num = parseInt(msg.id.replace('pending-', ''), 10);
            if (!isNaN(num) && num > this.idCounter) {
                this.idCounter = num;
            }
        }
    }

    /**
     * Saves pending messages to storage
     */
    public async save(): Promise<void> {
        await this.storage.save(this.messages);
    }

    // MARK: - Queue Operations

    /**
     * Adds a message to the queue
     *
     * @param options - Message options
     * @returns The created pending message
     */
    public enqueue(options: EnqueueOptions): PendingMessage {
        if (this.messages.length >= this.maxQueueSize) {
            throw ChatError.queueFull(this.maxQueueSize);
        }

        const message: PendingMessage = {
            id: `pending-${++this.idCounter}`,
            recipient: options.recipient,
            recipientPublicKey: options.recipientPublicKey,
            content: options.content,
            replyContext: options.replyContext,
            status: 'queued',
            retryCount: 0,
            maxRetries: options.maxRetries ?? 3,
            createdAt: new Date(),
        };

        this.messages.push(message);
        return message;
    }

    /**
     * Gets the next queued message for sending
     *
     * @returns The next message, or undefined if queue is empty
     */
    public dequeue(): PendingMessage | undefined {
        return this.messages.find(m => m.status === 'queued');
    }

    /**
     * Gets all messages in a specific status
     */
    public getByStatus(status: PendingMessageStatus): PendingMessage[] {
        return this.messages.filter(m => m.status === status);
    }

    /**
     * Gets a message by ID
     */
    public get(id: string): PendingMessage | undefined {
        return this.messages.find(m => m.id === id);
    }

    // MARK: - Status Updates

    /**
     * Marks a message as currently sending
     */
    public markSending(id: string): void {
        const message = this.get(id);
        if (message) {
            message.status = 'sending';
            message.lastAttemptAt = new Date();
            message.retryCount++;
        }
    }

    /**
     * Marks a message as successfully sent
     *
     * @param id - Message ID
     * @param txid - Transaction ID from blockchain
     */
    public markSent(id: string, txid: string): void {
        const message = this.get(id);
        if (message) {
            message.status = 'sent';
            message.txid = txid;
            message.lastError = undefined;

            this.onMessageSent?.(message);
        }
    }

    /**
     * Marks a message as failed
     *
     * If max retries exceeded, expires the message.
     *
     * @param id - Message ID
     * @param error - Error message
     */
    public markFailed(id: string, error: string): void {
        const message = this.get(id);
        if (!message) {
            return;
        }

        message.lastError = error;

        if (message.retryCount >= message.maxRetries) {
            message.status = 'failed';
            this.onMessageExpired?.(message);
        } else {
            message.status = 'queued'; // Back to queue for retry
            this.onMessageFailed?.(message);
        }
    }

    // MARK: - Queue Management

    /**
     * Removes a message from the queue
     *
     * @param id - Message ID to remove
     * @returns true if removed
     */
    public remove(id: string): boolean {
        const index = this.messages.findIndex(m => m.id === id);
        if (index !== -1) {
            this.messages.splice(index, 1);
            return true;
        }
        return false;
    }

    /**
     * Removes all sent messages from the queue
     *
     * @returns Number of messages removed
     */
    public purgeSent(): number {
        const before = this.messages.length;
        this.messages = this.messages.filter(m => m.status !== 'sent');
        return before - this.messages.length;
    }

    /**
     * Removes all failed/expired messages from the queue
     *
     * @returns Number of messages removed
     */
    public purgeFailed(): number {
        const before = this.messages.length;
        this.messages = this.messages.filter(m => m.status !== 'failed');
        return before - this.messages.length;
    }

    /**
     * Clears the entire queue
     */
    public clear(): void {
        this.messages = [];
    }

    /**
     * Resets all failed messages back to queued status
     *
     * Useful when connectivity is restored.
     */
    public retryFailed(): number {
        let count = 0;
        for (const message of this.messages) {
            if (message.status === 'failed' && message.retryCount < message.maxRetries) {
                message.status = 'queued';
                count++;
            }
        }
        return count;
    }

    // MARK: - Properties

    /**
     * Total number of messages in queue
     */
    public get size(): number {
        return this.messages.length;
    }

    /**
     * Number of messages waiting to be sent
     */
    public get queuedCount(): number {
        return this.messages.filter(m => m.status === 'queued').length;
    }

    /**
     * Number of messages currently being sent
     */
    public get sendingCount(): number {
        return this.messages.filter(m => m.status === 'sending').length;
    }

    /**
     * Checks if there are messages to process
     */
    public get hasPending(): boolean {
        return this.messages.some(m => m.status === 'queued' || m.status === 'sending');
    }

    /**
     * Checks if the queue is empty
     */
    public get isEmpty(): boolean {
        return this.messages.length === 0;
    }

    /**
     * Checks if the queue is full
     */
    public get isFull(): boolean {
        return this.messages.length >= this.maxQueueSize;
    }

    // MARK: - Event Handlers

    /**
     * Sets callback for when a message is successfully sent
     */
    public setOnMessageSent(callback: QueueEventCallback): void {
        this.onMessageSent = callback;
    }

    /**
     * Sets callback for when a message fails (will retry)
     */
    public setOnMessageFailed(callback: QueueEventCallback): void {
        this.onMessageFailed = callback;
    }

    /**
     * Sets callback for when a message expires (max retries exceeded)
     */
    public setOnMessageExpired(callback: QueueEventCallback): void {
        this.onMessageExpired = callback;
    }

    // MARK: - Iteration

    /**
     * Gets all pending messages
     */
    public getAll(): PendingMessage[] {
        return [...this.messages];
    }

    /**
     * Iterates over all messages
     */
    public [Symbol.iterator](): Iterator<PendingMessage> {
        return this.messages[Symbol.iterator]();
    }
}
