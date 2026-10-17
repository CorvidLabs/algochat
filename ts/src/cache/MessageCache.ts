/**
 * AlgoChat Web - Message Cache
 *
 * Protocol and implementation for caching messages locally.
 */

import type { Message } from '../models/types.js';

/**
 * Protocol for message caching
 *
 * Implementations can use in-memory storage, IndexedDB, or other backends.
 */
export interface MessageCache {
    /**
     * Stores a message in the cache
     *
     * @param participant - Address of the conversation participant
     * @param message - Message to store
     */
    store(participant: string, message: Message): void;

    /**
     * Stores multiple messages in the cache
     *
     * @param participant - Address of the conversation participant
     * @param messages - Messages to store
     */
    storeMany(participant: string, messages: Message[]): void;

    /**
     * Retrieves all cached messages for a participant
     *
     * @param participant - Address of the conversation participant
     * @returns Array of messages sorted by timestamp
     */
    retrieve(participant: string): Message[];

    /**
     * Retrieves messages after a specific round
     *
     * @param participant - Address of the conversation participant
     * @param afterRound - Minimum confirmed round (exclusive)
     * @returns Array of messages with confirmedRound > afterRound
     */
    retrieveAfter(participant: string, afterRound: number): Message[];

    /**
     * Gets the last synced round for a participant
     *
     * @param participant - Address of the conversation participant
     * @returns The last synced round, or undefined if never synced
     */
    getLastSyncRound(participant: string): number | undefined;

    /**
     * Sets the last synced round for a participant
     *
     * @param participant - Address of the conversation participant
     * @param round - The round number
     */
    setLastSyncRound(participant: string, round: number): void;

    /**
     * Checks if a message exists in the cache
     *
     * @param messageId - Transaction ID of the message
     */
    has(messageId: string): boolean;

    /**
     * Gets a specific message by ID
     *
     * @param messageId - Transaction ID of the message
     */
    get(messageId: string): Message | undefined;

    /**
     * Removes all messages for a participant
     *
     * @param participant - Address of the conversation participant
     */
    clear(participant: string): void;

    /**
     * Removes all cached messages
     */
    clearAll(): void;

    /**
     * Gets all participants with cached messages
     */
    getParticipants(): string[];
}

/** Stored conversation data */
interface CachedConversation {
    messages: Map<string, Message>;
    lastSyncRound?: number;
}

/**
 * In-memory implementation of MessageCache
 *
 * Stores messages in memory with fast lookups.
 * Data is lost when the application is closed.
 */
export class InMemoryMessageCache implements MessageCache {
    private conversations = new Map<string, CachedConversation>();
    private messageIndex = new Map<string, string>(); // messageId -> participant

    public store(participant: string, message: Message): void {
        const conv = this.getOrCreateConversation(participant);
        conv.messages.set(message.id, message);
        this.messageIndex.set(message.id, participant);
    }

    public storeMany(participant: string, messages: Message[]): void {
        const conv = this.getOrCreateConversation(participant);

        for (const message of messages) {
            conv.messages.set(message.id, message);
            this.messageIndex.set(message.id, participant);
        }
    }

    public retrieve(participant: string): Message[] {
        const conv = this.conversations.get(participant);

        if (!conv) {
            return [];
        }

        return Array.from(conv.messages.values())
            .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    }

    public retrieveAfter(participant: string, afterRound: number): Message[] {
        return this.retrieve(participant)
            .filter(m => m.confirmedRound > afterRound);
    }

    public getLastSyncRound(participant: string): number | undefined {
        return this.conversations.get(participant)?.lastSyncRound;
    }

    public setLastSyncRound(participant: string, round: number): void {
        const conv = this.getOrCreateConversation(participant);
        conv.lastSyncRound = round;
    }

    public has(messageId: string): boolean {
        return this.messageIndex.has(messageId);
    }

    public get(messageId: string): Message | undefined {
        const participant = this.messageIndex.get(messageId);

        if (!participant) {
            return undefined;
        }

        return this.conversations.get(participant)?.messages.get(messageId);
    }

    public clear(participant: string): void {
        const conv = this.conversations.get(participant);

        if (conv) {
            // Remove from message index
            for (const messageId of conv.messages.keys()) {
                this.messageIndex.delete(messageId);
            }

            this.conversations.delete(participant);
        }
    }

    public clearAll(): void {
        this.conversations.clear();
        this.messageIndex.clear();
    }

    public getParticipants(): string[] {
        return Array.from(this.conversations.keys());
    }

    /**
     * Gets total number of cached messages
     */
    public get messageCount(): number {
        return this.messageIndex.size;
    }

    /**
     * Gets number of conversations with cached messages
     */
    public get conversationCount(): number {
        return this.conversations.size;
    }

    private getOrCreateConversation(participant: string): CachedConversation {
        let conv = this.conversations.get(participant);

        if (!conv) {
            conv = { messages: new Map() };
            this.conversations.set(participant, conv);
        }

        return conv;
    }
}
