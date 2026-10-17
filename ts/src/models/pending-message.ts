/**
 * AlgoChat - Pending Message Types
 *
 * Types for managing messages queued for sending (offline support).
 */

import type { ReplyContext } from './types.js';

/** Status of a pending message in the send queue */
export type PendingStatus = 'pending' | 'sending' | 'failed' | 'sent';

/** A message queued for sending (for offline support) */
export interface PendingMessage {
    /** Unique identifier */
    id: string;
    /** Recipient's Algorand address */
    recipient: string;
    /** Message content */
    content: string;
    /** Reply context if replying */
    replyContext?: ReplyContext;
    /** When the message was created */
    createdAt: Date;
    /** Number of retry attempts */
    retryCount: number;
    /** Last attempt time */
    lastAttempt?: Date;
    /** Current status */
    status: PendingStatus;
    /** Last error message */
    lastError?: string;
}

/** Creates a new pending message */
export function createPendingMessage(
    recipient: string,
    content: string,
    replyContext?: ReplyContext
): PendingMessage {
    return {
        id: crypto.randomUUID(),
        recipient,
        content,
        replyContext,
        createdAt: new Date(),
        retryCount: 0,
        lastAttempt: undefined,
        status: 'pending',
        lastError: undefined,
    };
}

/** Mark a pending message as currently sending */
export function markSending(message: PendingMessage): PendingMessage {
    return {
        ...message,
        status: 'sending',
        lastAttempt: new Date(),
    };
}

/** Mark a pending message as failed with an error */
export function markFailed(message: PendingMessage, error: string): PendingMessage {
    return {
        ...message,
        status: 'failed',
        retryCount: message.retryCount + 1,
        lastError: error,
    };
}

/** Mark a pending message as successfully sent */
export function markSent(message: PendingMessage): PendingMessage {
    return {
        ...message,
        status: 'sent',
    };
}

/** Check if a message can be retried */
export function canRetry(message: PendingMessage, maxRetries: number): boolean {
    return message.retryCount < maxRetries && message.status === 'failed';
}
