import { describe, expect, test } from 'bun:test';
import { Conversation } from './Conversation.js';
import type { Message } from './types.js';

function makeMessage(overrides: Partial<Message> & { id: string }): Message {
    return {
        sender: 'ALICE',
        recipient: 'BOB',
        content: 'hello',
        timestamp: new Date('2026-01-01T00:00:00Z'),
        confirmedRound: 100,
        direction: 'sent',
        ...overrides,
    };
}

const msg1 = makeMessage({ id: 'tx1', timestamp: new Date('2026-01-01T00:00:00Z'), confirmedRound: 100 });
const msg2 = makeMessage({ id: 'tx2', timestamp: new Date('2026-01-01T01:00:00Z'), confirmedRound: 101, direction: 'received', content: 'hi back' });
const msg3 = makeMessage({ id: 'tx3', timestamp: new Date('2026-01-01T02:00:00Z'), confirmedRound: 102, content: 'goodbye' });

describe('Conversation', () => {
    describe('constructor', () => {
        test('creates empty conversation', () => {
            const conv = new Conversation('BOB');
            expect(conv.participant).toBe('BOB');
            expect(conv.isEmpty).toBe(true);
            expect(conv.messageCount).toBe(0);
            expect(conv.participantPublicKey).toBeUndefined();
            expect(conv.lastFetchedRound).toBeUndefined();
        });

        test('creates with initial messages sorted by timestamp', () => {
            const conv = new Conversation('BOB', undefined, [msg3, msg1, msg2]);
            expect(conv.messageCount).toBe(3);
            expect(conv.messages[0].id).toBe('tx1');
            expect(conv.messages[1].id).toBe('tx2');
            expect(conv.messages[2].id).toBe('tx3');
        });

        test('stores participant public key and last fetched round', () => {
            const key = new Uint8Array(32).fill(0xab);
            const conv = new Conversation('BOB', key, [], 500);
            expect(conv.participantPublicKey).toEqual(key);
            expect(conv.lastFetchedRound).toBe(500);
        });
    });

    describe('message access', () => {
        test('messages returns a copy', () => {
            const conv = new Conversation('BOB', undefined, [msg1]);
            const msgs = conv.messages;
            msgs.push(msg2);
            expect(conv.messageCount).toBe(1);
        });

        test('lastMessage returns the most recent', () => {
            const conv = new Conversation('BOB', undefined, [msg1, msg2, msg3]);
            expect(conv.lastMessage?.id).toBe('tx3');
        });

        test('lastMessage returns undefined when empty', () => {
            const conv = new Conversation('BOB');
            expect(conv.lastMessage).toBeUndefined();
        });

        test('firstMessage returns earliest', () => {
            const conv = new Conversation('BOB', undefined, [msg1, msg2]);
            expect(conv.firstMessage?.id).toBe('tx1');
        });

        test('lastReceived returns last received message', () => {
            const conv = new Conversation('BOB', undefined, [msg1, msg2, msg3]);
            expect(conv.lastReceived?.id).toBe('tx2');
        });

        test('lastReceived returns undefined when no received messages', () => {
            const conv = new Conversation('BOB', undefined, [msg1, msg3]);
            expect(conv.lastReceived).toBeUndefined();
        });

        test('lastSent returns last sent message', () => {
            const conv = new Conversation('BOB', undefined, [msg1, msg2, msg3]);
            expect(conv.lastSent?.id).toBe('tx3');
        });

        test('lastSent returns undefined when no sent messages', () => {
            const received = makeMessage({ id: 'rx1', direction: 'received' });
            const conv = new Conversation('BOB', undefined, [received]);
            expect(conv.lastSent).toBeUndefined();
        });
    });

    describe('counts and predicates', () => {
        test('receivedCount and sentCount', () => {
            const conv = new Conversation('BOB', undefined, [msg1, msg2, msg3]);
            expect(conv.sentCount).toBe(2);
            expect(conv.receivedCount).toBe(1);
        });

        test('isEmpty returns true for empty, false otherwise', () => {
            expect(new Conversation('BOB').isEmpty).toBe(true);
            expect(new Conversation('BOB', undefined, [msg1]).isEmpty).toBe(false);
        });

        test('highestRound returns max confirmed round', () => {
            const conv = new Conversation('BOB', undefined, [msg1, msg2, msg3]);
            expect(conv.highestRound).toBe(102);
        });

        test('highestRound returns 0 for empty conversation', () => {
            expect(new Conversation('BOB').highestRound).toBe(0);
        });
    });

    describe('append', () => {
        test('adds new message and maintains sort order', () => {
            const conv = new Conversation('BOB', undefined, [msg1, msg3]);
            const added = conv.append(msg2);
            expect(added).toBe(true);
            expect(conv.messageCount).toBe(3);
            expect(conv.messages[1].id).toBe('tx2');
        });

        test('rejects duplicate message by id', () => {
            const conv = new Conversation('BOB', undefined, [msg1]);
            const added = conv.append(msg1);
            expect(added).toBe(false);
            expect(conv.messageCount).toBe(1);
        });
    });

    describe('merge', () => {
        test('merges new messages and returns count', () => {
            const conv = new Conversation('BOB', undefined, [msg1]);
            const added = conv.merge([msg2, msg3]);
            expect(added).toBe(2);
            expect(conv.messageCount).toBe(3);
        });

        test('skips duplicates during merge', () => {
            const conv = new Conversation('BOB', undefined, [msg1, msg2]);
            const added = conv.merge([msg1, msg2, msg3]);
            expect(added).toBe(1);
            expect(conv.messageCount).toBe(3);
        });

        test('returns 0 when all messages are duplicates', () => {
            const conv = new Conversation('BOB', undefined, [msg1]);
            expect(conv.merge([msg1])).toBe(0);
        });

        test('handles empty merge array', () => {
            const conv = new Conversation('BOB', undefined, [msg1]);
            expect(conv.merge([])).toBe(0);
            expect(conv.messageCount).toBe(1);
        });
    });

    describe('queries', () => {
        test('getMessage finds by id', () => {
            const conv = new Conversation('BOB', undefined, [msg1, msg2]);
            expect(conv.getMessage('tx1')?.content).toBe('hello');
            expect(conv.getMessage('nonexistent')).toBeUndefined();
        });

        test('hasMessage checks existence', () => {
            const conv = new Conversation('BOB', undefined, [msg1]);
            expect(conv.hasMessage('tx1')).toBe(true);
            expect(conv.hasMessage('tx999')).toBe(false);
        });

        test('messagesAfterRound filters correctly', () => {
            const conv = new Conversation('BOB', undefined, [msg1, msg2, msg3]);
            const after = conv.messagesAfterRound(100);
            expect(after.length).toBe(2);
            expect(after[0].id).toBe('tx2');
        });

        test('messagesInDirection filters by direction', () => {
            const conv = new Conversation('BOB', undefined, [msg1, msg2, msg3]);
            expect(conv.messagesInDirection('sent').length).toBe(2);
            expect(conv.messagesInDirection('received').length).toBe(1);
        });

        test('searchMessages is case-insensitive', () => {
            const conv = new Conversation('BOB', undefined, [msg1, msg2, msg3]);
            const results = conv.searchMessages('HELLO');
            expect(results.length).toBe(1);
            expect(results[0].id).toBe('tx1');
        });

        test('searchMessages returns empty for no match', () => {
            const conv = new Conversation('BOB', undefined, [msg1]);
            expect(conv.searchMessages('xyz').length).toBe(0);
        });
    });

    describe('setters', () => {
        test('setParticipantPublicKey updates key', () => {
            const conv = new Conversation('BOB');
            const key = new Uint8Array(32).fill(0xff);
            conv.setParticipantPublicKey(key);
            expect(conv.participantPublicKey).toEqual(key);
        });

        test('setLastFetchedRound updates round', () => {
            const conv = new Conversation('BOB');
            conv.setLastFetchedRound(999);
            expect(conv.lastFetchedRound).toBe(999);
        });
    });

    describe('serialization', () => {
        test('toJSON and fromJSON round-trip', () => {
            const key = new Uint8Array(32).fill(0x42);
            const conv = new Conversation('BOB', key, [msg1, msg2], 500);
            const json = conv.toJSON();
            const restored = Conversation.fromJSON(json);

            expect(restored.participant).toBe('BOB');
            expect(restored.participantPublicKey).toEqual(key);
            expect(restored.messageCount).toBe(2);
            expect(restored.lastFetchedRound).toBe(500);
            expect(restored.messages[0].id).toBe('tx1');
        });

        test('fromJSON handles string timestamps', () => {
            const json = {
                participant: 'BOB',
                messages: [{
                    id: 'tx1',
                    sender: 'ALICE',
                    recipient: 'BOB',
                    content: 'hello',
                    timestamp: '2026-01-01T00:00:00.000Z',
                    confirmedRound: 100,
                    direction: 'sent' as const,
                }],
            };
            const conv = Conversation.fromJSON(json);
            expect(conv.messages[0].timestamp).toBeInstanceOf(Date);
        });

        test('toJSON without public key omits it', () => {
            const conv = new Conversation('BOB');
            const json = conv.toJSON();
            expect(json.participantPublicKey).toBeUndefined();
        });
    });

    describe('clone', () => {
        test('creates independent copy', () => {
            const key = new Uint8Array(32).fill(0x01);
            const conv = new Conversation('BOB', key, [msg1], 200);
            const cloned = conv.clone();

            expect(cloned.participant).toBe('BOB');
            expect(cloned.messageCount).toBe(1);
            expect(cloned.lastFetchedRound).toBe(200);

            // Mutations don't affect original
            cloned.append(msg2);
            expect(conv.messageCount).toBe(1);
            expect(cloned.messageCount).toBe(2);
        });

        test('clone without public key', () => {
            const conv = new Conversation('BOB');
            const cloned = conv.clone();
            expect(cloned.participantPublicKey).toBeUndefined();
        });
    });
});
