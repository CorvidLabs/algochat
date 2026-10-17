/**
 * AlgoChat Web - Sync Manager
 *
 * Manages background synchronization of messages and queue processing.
 */

import type { Message, SendResult } from '../models/types.js';
import type { ChatAccount } from '../services/algorand.service.js';
import type { AlgorandService } from '../services/algorand.service.js';
import { SendQueue, type EnqueueOptions } from './SendQueue.js';
import { Conversation } from '../models/Conversation.js';

/** Sync state */
export type SyncState = 'idle' | 'syncing' | 'offline';

/** Sync event types */
export interface SyncEvents {
    /** Called when new messages are received */
    onMessagesReceived?: (participant: string, messages: Message[]) => void;
    /** Called when a queued message is sent */
    onMessageSent?: (result: SendResult) => void;
    /** Called when a queued message fails permanently */
    onMessageFailed?: (messageId: string, error: string) => void;
    /** Called when sync state changes */
    onStateChange?: (state: SyncState) => void;
    /** Called when an error occurs during sync */
    onSyncError?: (error: Error) => void;
}

/** Configuration for SyncManager */
export interface SyncManagerConfig {
    /** Sync interval in milliseconds (default: 30000) */
    syncInterval?: number;
    /** Whether to process send queue during sync (default: true) */
    processQueue?: boolean;
    /** Maximum messages to fetch per sync (default: 50) */
    fetchLimit?: number;
}

/**
 * Sync Manager
 *
 * Coordinates background synchronization:
 * - Periodically fetches new messages
 * - Processes the send queue when online
 * - Tracks online/offline state
 */
export class SyncManager {
    private service: AlgorandService;
    private chatAccount: ChatAccount;
    private queue: SendQueue;
    private conversations = new Map<string, Conversation>();
    private config: Required<SyncManagerConfig>;
    private events: SyncEvents = {};

    private state: SyncState = 'idle';
    private syncTimer?: ReturnType<typeof setInterval>;
    private isOnline = true;

    constructor(
        service: AlgorandService,
        chatAccount: ChatAccount,
        queue: SendQueue = new SendQueue(),
        config: SyncManagerConfig = {}
    ) {
        this.service = service;
        this.chatAccount = chatAccount;
        this.queue = queue;
        this.config = {
            syncInterval: config.syncInterval ?? 30000,
            processQueue: config.processQueue ?? true,
            fetchLimit: config.fetchLimit ?? 50,
        };

        // Wire up queue events
        this.queue.setOnMessageSent(msg => {
            if (msg.txid) {
                this.events.onMessageSent?.({
                    txid: msg.txid,
                    message: {
                        id: msg.txid,
                        sender: this.chatAccount.address,
                        recipient: msg.recipient,
                        content: msg.content,
                        timestamp: new Date(),
                        confirmedRound: 0,
                        direction: 'sent',
                        replyContext: msg.replyContext,
                    },
                });
            }
        });

        this.queue.setOnMessageExpired(msg => {
            this.events.onMessageFailed?.(msg.id, msg.lastError ?? 'Max retries exceeded');
        });
    }

    // MARK: - Lifecycle

    /**
     * Starts background synchronization
     */
    public start(): void {
        if (this.syncTimer) {
            return; // Already started
        }

        this.syncTimer = setInterval(() => {
            if (this.isOnline && this.state === 'idle') {
                this.sync().catch(err => {
                    this.events.onSyncError?.(err);
                });
            }
        }, this.config.syncInterval);

        // Run initial sync
        this.sync().catch(err => {
            this.events.onSyncError?.(err);
        });
    }

    /**
     * Stops background synchronization
     */
    public stop(): void {
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
            this.syncTimer = undefined;
        }
    }

    /**
     * Sets online/offline state
     *
     * @param online - Whether we're online
     */
    public setOnline(online: boolean): void {
        const wasOffline = !this.isOnline;
        this.isOnline = online;

        if (online && wasOffline) {
            // Coming back online, retry failed messages
            this.queue.retryFailed();
            this.setState('idle');

            // Trigger immediate sync
            this.sync().catch(err => {
                this.events.onSyncError?.(err);
            });
        } else if (!online) {
            this.setState('offline');
        }
    }

    // MARK: - Sync Operations

    /**
     * Performs a full sync
     *
     * - Fetches new messages for all known conversations
     * - Processes the send queue
     */
    public async sync(): Promise<void> {
        if (!this.isOnline) {
            return;
        }

        this.setState('syncing');

        try {
            // Process send queue first
            if (this.config.processQueue) {
                await this.processQueue();
            }

            // Fetch new messages for all conversations
            await this.fetchAllConversations();
        } finally {
            this.setState(this.isOnline ? 'idle' : 'offline');
        }
    }

    /**
     * Syncs a specific conversation
     *
     * @param participant - Address of the participant
     */
    public async syncConversation(participant: string): Promise<Message[]> {
        const conv = this.getOrCreateConversation(participant);
        const afterRound = conv.lastFetchedRound ?? 0;

        const messages = await this.service.fetchMessages(
            this.chatAccount,
            participant,
            afterRound,
            this.config.fetchLimit
        );

        if (messages.length > 0) {
            const added = conv.merge(messages);

            // Update last fetched round
            const maxRound = messages.reduce((max, m) => {
                const round = Number(m.confirmedRound);
                return round > max ? round : max;
            }, 0);
            conv.setLastFetchedRound(maxRound);

            if (added > 0) {
                this.events.onMessagesReceived?.(participant, messages);
            }
        }

        return messages;
    }

    // MARK: - Queue Operations

    /**
     * Queues a message for sending
     *
     * Message will be sent when online.
     *
     * @param options - Message options
     */
    public queueMessage(options: EnqueueOptions): string {
        const pending = this.queue.enqueue(options);

        // If online, trigger immediate processing
        if (this.isOnline && this.state === 'idle') {
            this.processQueue().catch(err => {
                this.events.onSyncError?.(err);
            });
        }

        return pending.id;
    }

    /**
     * Processes all queued messages
     */
    public async processQueue(): Promise<void> {
        while (this.isOnline) {
            const pending = this.queue.dequeue();
            if (!pending) {
                break;
            }

            this.queue.markSending(pending.id);

            try {
                let result: SendResult;

                if (pending.replyContext) {
                    result = await this.service.sendReply(
                        this.chatAccount,
                        pending.recipient,
                        pending.recipientPublicKey,
                        pending.content,
                        pending.replyContext.messageId,
                        pending.replyContext.preview
                    );
                } else {
                    result = await this.service.sendMessage(
                        this.chatAccount,
                        pending.recipient,
                        pending.recipientPublicKey,
                        pending.content
                    );
                }

                this.queue.markSent(pending.id, result.txid);

                // Add to conversation
                const conv = this.getOrCreateConversation(pending.recipient);
                conv.append(result.message);
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                this.queue.markFailed(pending.id, message);
            }
        }
    }

    // MARK: - Conversation Management

    /**
     * Gets or creates a conversation
     *
     * @param participant - Address of the participant
     */
    public getOrCreateConversation(participant: string): Conversation {
        let conv = this.conversations.get(participant);
        if (!conv) {
            conv = new Conversation(participant);
            this.conversations.set(participant, conv);
        }
        return conv;
    }

    /**
     * Gets a conversation if it exists
     *
     * @param participant - Address of the participant
     */
    public getConversation(participant: string): Conversation | undefined {
        return this.conversations.get(participant);
    }

    /**
     * Gets all conversations
     */
    public getConversations(): Conversation[] {
        return Array.from(this.conversations.values());
    }

    /**
     * Adds a conversation
     *
     * @param conversation - Conversation to add
     */
    public addConversation(conversation: Conversation): void {
        this.conversations.set(conversation.participant, conversation);
    }

    // MARK: - Event Handlers

    /**
     * Sets event callbacks
     *
     * @param events - Event callbacks
     */
    public setEvents(events: SyncEvents): void {
        this.events = { ...this.events, ...events };
    }

    /**
     * Sets a single event callback
     */
    public on<K extends keyof SyncEvents>(event: K, callback: SyncEvents[K]): void {
        this.events[event] = callback;
    }

    // MARK: - Properties

    /**
     * Gets the current sync state
     */
    public get currentState(): SyncState {
        return this.state;
    }

    /**
     * Gets whether we're online
     */
    public get online(): boolean {
        return this.isOnline;
    }

    /**
     * Gets the send queue
     */
    public get sendQueue(): SendQueue {
        return this.queue;
    }

    // MARK: - Private Methods

    private setState(state: SyncState): void {
        if (this.state !== state) {
            this.state = state;
            this.events.onStateChange?.(state);
        }
    }

    private async fetchAllConversations(): Promise<void> {
        const participants = Array.from(this.conversations.keys());

        for (const participant of participants) {
            try {
                await this.syncConversation(participant);
            } catch (error) {
                // Log but continue with other conversations
                console.warn(`[SyncManager] Failed to sync ${participant}:`, error);
            }
        }
    }
}
