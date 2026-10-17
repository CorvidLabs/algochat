/**
 * AlgoChat Web - Conversation Class
 *
 * Provides a rich interface for managing conversations with helper methods.
 */

import type { Message, MessageDirection } from './types.js';

/**
 * Represents a conversation with another user
 *
 * Provides helper methods for accessing messages, merging updates,
 * and tracking conversation state.
 */
export class Conversation {
    private _messages: Message[] = [];

    /**
     * Creates a new Conversation
     *
     * @param participant - Algorand address of the other party
     * @param participantPublicKey - X25519 encryption public key (if known)
     * @param messages - Initial messages
     * @param lastFetchedRound - Last blockchain round that was fetched
     */
    constructor(
        public readonly participant: string,
        public participantPublicKey?: Uint8Array,
        messages: Message[] = [],
        public lastFetchedRound?: number
    ) {
        if (messages.length > 0) {
            this._messages = [...messages].sort(
                (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
            );
        }
    }

    // MARK: - Message Access

    /**
     * Gets all messages in chronological order
     */
    public get messages(): Message[] {
        return [...this._messages];
    }

    /**
     * Gets the most recent message
     */
    public get lastMessage(): Message | undefined {
        return this._messages.at(-1);
    }

    /**
     * Gets the most recent received message
     */
    public get lastReceived(): Message | undefined {
        for (let i = this._messages.length - 1; i >= 0; i--) {
            if (this._messages[i].direction === 'received') {
                return this._messages[i];
            }
        }
        return undefined;
    }

    /**
     * Gets the most recent sent message
     */
    public get lastSent(): Message | undefined {
        for (let i = this._messages.length - 1; i >= 0; i--) {
            if (this._messages[i].direction === 'sent') {
                return this._messages[i];
            }
        }
        return undefined;
    }

    /**
     * Gets the first message in the conversation
     */
    public get firstMessage(): Message | undefined {
        return this._messages[0];
    }

    // MARK: - Counts and Predicates

    /**
     * Gets the total number of messages
     */
    public get messageCount(): number {
        return this._messages.length;
    }

    /**
     * Checks if the conversation has no messages
     */
    public get isEmpty(): boolean {
        return this._messages.length === 0;
    }

    /**
     * Gets the number of received messages
     */
    public get receivedCount(): number {
        return this._messages.filter(m => m.direction === 'received').length;
    }

    /**
     * Gets the number of sent messages
     */
    public get sentCount(): number {
        return this._messages.filter(m => m.direction === 'sent').length;
    }

    /**
     * Gets the highest confirmed round across all messages
     */
    public get highestRound(): number {
        return this._messages.reduce(
            (max, m) => { const r = Number(m.confirmedRound); return r > max ? r : max; },
            0
        );
    }

    // MARK: - Message Manipulation

    /**
     * Appends a message to the conversation
     *
     * If the message already exists (by ID), it is ignored.
     * Messages are kept sorted by timestamp.
     *
     * @param message - Message to append
     * @returns true if message was added, false if it already existed
     */
    public append(message: Message): boolean {
        // Check for duplicate
        if (this._messages.some(m => m.id === message.id)) {
            return false;
        }

        this._messages.push(message);
        this._messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        return true;
    }

    /**
     * Merges multiple messages into the conversation
     *
     * Duplicates are ignored. Messages are sorted after merge.
     *
     * @param messages - Messages to merge
     * @returns Number of new messages added
     */
    public merge(messages: Message[]): number {
        const existingIds = new Set(this._messages.map(m => m.id));
        let added = 0;

        for (const message of messages) {
            if (!existingIds.has(message.id)) {
                this._messages.push(message);
                existingIds.add(message.id);
                added++;
            }
        }

        if (added > 0) {
            this._messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        }

        return added;
    }

    /**
     * Updates the participant's public key
     *
     * @param publicKey - The new public key
     */
    public setParticipantPublicKey(publicKey: Uint8Array): void {
        this.participantPublicKey = publicKey;
    }

    /**
     * Updates the last fetched round
     *
     * @param round - The round number
     */
    public setLastFetchedRound(round: number): void {
        this.lastFetchedRound = round;
    }

    // MARK: - Queries

    /**
     * Gets a message by ID
     *
     * @param id - Transaction ID of the message
     */
    public getMessage(id: string): Message | undefined {
        return this._messages.find(m => m.id === id);
    }

    /**
     * Checks if a message exists
     *
     * @param id - Transaction ID to check
     */
    public hasMessage(id: string): boolean {
        return this._messages.some(m => m.id === id);
    }

    /**
     * Gets messages after a specific round
     *
     * @param round - Minimum round (exclusive)
     */
    public messagesAfterRound(round: number): Message[] {
        return this._messages.filter(m => m.confirmedRound > round);
    }

    /**
     * Gets messages in a direction
     *
     * @param direction - 'sent' or 'received'
     */
    public messagesInDirection(direction: MessageDirection): Message[] {
        return this._messages.filter(m => m.direction === direction);
    }

    /**
     * Searches messages by content
     *
     * @param query - Search string (case-insensitive)
     */
    public searchMessages(query: string): Message[] {
        const lowerQuery = query.toLowerCase();
        return this._messages.filter(m =>
            m.content.toLowerCase().includes(lowerQuery)
        );
    }

    // MARK: - Serialization

    /**
     * Converts to a plain object for serialization
     */
    public toJSON(): {
        participant: string;
        participantPublicKey?: string;
        messages: Message[];
        lastFetchedRound?: number;
    } {
        return {
            participant: this.participant,
            participantPublicKey: this.participantPublicKey
                ? bytesToBase64(this.participantPublicKey)
                : undefined,
            messages: this._messages,
            lastFetchedRound: this.lastFetchedRound,
        };
    }

    /**
     * Creates a Conversation from a plain object
     */
    public static fromJSON(data: {
        participant: string;
        participantPublicKey?: string;
        messages: Array<Message | { timestamp: string; [key: string]: unknown }>;
        lastFetchedRound?: number;
    }): Conversation {
        const messages = data.messages.map(m => ({
            ...m,
            timestamp: typeof m.timestamp === 'string' ? new Date(m.timestamp) : m.timestamp,
        })) as Message[];

        return new Conversation(
            data.participant,
            data.participantPublicKey ? base64ToBytes(data.participantPublicKey) : undefined,
            messages,
            data.lastFetchedRound
        );
    }

    /**
     * Creates a shallow copy of the conversation
     */
    public clone(): Conversation {
        return new Conversation(
            this.participant,
            this.participantPublicKey ? new Uint8Array(this.participantPublicKey) : undefined,
            [...this._messages],
            this.lastFetchedRound
        );
    }
}

// MARK: - Helpers

function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}
