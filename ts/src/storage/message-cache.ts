/**
 * AlgoChat - Message Cache
 *
 * Interface and implementations for caching messages locally.
 */

import type { Message } from '../models/types.js';

/** Interface for storing and retrieving messages */
export interface MessageCache {
    /** Store messages for a conversation */
    store(messages: Message[], participant: string): Promise<void>;

    /** Retrieve cached messages for a conversation */
    retrieve(participant: string, afterRound?: number): Promise<Message[]>;

    /** Get the last synced round for a conversation */
    getLastSyncRound(participant: string): Promise<number | undefined>;

    /** Set the last synced round for a conversation */
    setLastSyncRound(round: number, participant: string): Promise<void>;

    /** Get all cached conversation participants */
    getCachedConversations(): Promise<string[]>;

    /** Clear all cached data */
    clear(): Promise<void>;

    /** Clear cached data for a specific conversation */
    clearFor(participant: string): Promise<void>;
}

/** In-memory implementation of MessageCache */
export class InMemoryMessageCache implements MessageCache {
    private messages = new Map<string, Message[]>();
    private syncRounds = new Map<string, number>();

    async store(messages: Message[], participant: string): Promise<void> {
        const existing = this.messages.get(participant) ?? [];
        const existingIds = new Set(existing.map((m) => m.id));

        for (const message of messages) {
            if (!existingIds.has(message.id)) {
                existing.push(message);
                existingIds.add(message.id);
            }
        }

        existing.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        this.messages.set(participant, existing);
    }

    async retrieve(participant: string, afterRound?: number): Promise<Message[]> {
        const messages = this.messages.get(participant) ?? [];

        if (afterRound !== undefined) {
            return messages.filter((m) => m.confirmedRound > afterRound);
        }

        return [...messages];
    }

    async getLastSyncRound(participant: string): Promise<number | undefined> {
        return this.syncRounds.get(participant);
    }

    async setLastSyncRound(round: number, participant: string): Promise<void> {
        this.syncRounds.set(participant, round);
    }

    async getCachedConversations(): Promise<string[]> {
        return Array.from(this.messages.keys());
    }

    async clear(): Promise<void> {
        this.messages.clear();
        this.syncRounds.clear();
    }

    async clearFor(participant: string): Promise<void> {
        this.messages.delete(participant);
        this.syncRounds.delete(participant);
    }
}
