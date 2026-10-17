/**
 * AlgoChat - MessageIndexer Tests
 */

import { describe, test, expect } from 'bun:test';
import { MessageIndexer, PublicKeyNotFoundError } from './message-indexer.js';
import { encodeEnvelope } from '../crypto/envelope.js';
import { PROTOCOL } from '../models/types.js';
import type { IndexerClient } from './interfaces.js';
import type { NoteTransaction, PaginatedTransactions } from './types.js';
import type { ChatEnvelope, X25519KeyPair } from '../models/types.js';

/** Build a minimal valid envelope note (passes isChatMessage + decodeEnvelope) */
function makeChatNote(senderPublicKey: Uint8Array): Uint8Array {
    const envelope: ChatEnvelope = {
        version: PROTOCOL.VERSION,
        protocolId: PROTOCOL.PROTOCOL_ID,
        senderPublicKey,
        ephemeralPublicKey: new Uint8Array(32).fill(0xBB),
        nonce: new Uint8Array(12).fill(0xCC),
        encryptedSenderKey: new Uint8Array(48).fill(0xDD),
        ciphertext: new Uint8Array(32).fill(0xEE),
    };
    return encodeEnvelope(envelope);
}

/** Build a mock IndexerClient */
function mockIndexer(
    transactions: NoteTransaction[] = [],
    betweenTransactions: NoteTransaction[] = []
): IndexerClient {
    return {
        searchTransactions: async () => transactions,
        searchTransactionsBetween: async () => betweenTransactions,
        getTransaction: async () => transactions[0],
        waitForIndexer: async () => transactions[0],
    };
}

/** Build a mock chat account */
function mockChatAccount(address: string): { address: string; encryptionKeys: X25519KeyPair } {
    return {
        address,
        encryptionKeys: {
            publicKey: new Uint8Array(32).fill(0x11),
            privateKey: new Uint8Array(32).fill(0x22),
        },
    };
}

const SENDER_ADDRESS = 'SENDER_ADDR';
const TARGET_ADDRESS = 'TARGET_ADDR';

describe('MessageIndexer.findPublicKey', () => {
    test('returns isVerified: false for key extracted from chat envelope', async () => {
        const senderKey = new Uint8Array(32).fill(0xAA);
        const note = makeChatNote(senderKey);

        const indexer = mockIndexer([
            {
                txid: 'tx1',
                sender: TARGET_ADDRESS,
                receiver: SENDER_ADDRESS,
                note,
                confirmedRound: 100,
                roundTime: 1700000000,
            },
        ]);

        const account = mockChatAccount(SENDER_ADDRESS);
        const mi = new MessageIndexer(indexer, account);

        const result = await mi.findPublicKey(TARGET_ADDRESS);

        expect(result).toBeDefined();
        expect(result.isVerified).toBe(false);
        expect(result.publicKey.length).toBe(32);
        expect(result.publicKey).toEqual(senderKey);
    });

    test('throws PublicKeyNotFoundError when no chat messages exist', async () => {
        const indexer = mockIndexer([]);
        const account = mockChatAccount(SENDER_ADDRESS);
        const mi = new MessageIndexer(indexer, account);

        await expect(mi.findPublicKey(TARGET_ADDRESS)).rejects.toThrow(PublicKeyNotFoundError);
    });

    test('skips transactions not sent by the target address', async () => {
        const note = makeChatNote(new Uint8Array(32).fill(0xAA));

        const indexer = mockIndexer([
            {
                txid: 'tx1',
                sender: 'OTHER_ADDR',
                receiver: TARGET_ADDRESS,
                note,
                confirmedRound: 100,
                roundTime: 1700000000,
            },
        ]);

        const account = mockChatAccount(SENDER_ADDRESS);
        const mi = new MessageIndexer(indexer, account);

        await expect(mi.findPublicKey(TARGET_ADDRESS)).rejects.toThrow(PublicKeyNotFoundError);
    });

    test('skips transactions with notes too short for a chat message', async () => {
        const indexer = mockIndexer([
            {
                txid: 'tx1',
                sender: TARGET_ADDRESS,
                receiver: SENDER_ADDRESS,
                note: new Uint8Array(1),
                confirmedRound: 100,
                roundTime: 1700000000,
            },
        ]);

        const account = mockChatAccount(SENDER_ADDRESS);
        const mi = new MessageIndexer(indexer, account);

        await expect(mi.findPublicKey(TARGET_ADDRESS)).rejects.toThrow(PublicKeyNotFoundError);
    });

    test('skips non-chat messages and finds the first valid one', async () => {
        const senderKey = new Uint8Array(32).fill(0xAA);
        const chatNote = makeChatNote(senderKey);

        const indexer = mockIndexer([
            {
                txid: 'tx1',
                sender: TARGET_ADDRESS,
                receiver: SENDER_ADDRESS,
                note: new Uint8Array([0xFF, 0xFF, 0x00]), // non-chat
                confirmedRound: 99,
                roundTime: 1699999999,
            },
            {
                txid: 'tx2',
                sender: TARGET_ADDRESS,
                receiver: SENDER_ADDRESS,
                note: chatNote,
                confirmedRound: 100,
                roundTime: 1700000000,
            },
        ]);

        const account = mockChatAccount(SENDER_ADDRESS);
        const mi = new MessageIndexer(indexer, account);

        const result = await mi.findPublicKey(TARGET_ADDRESS);
        expect(result.isVerified).toBe(false);
        expect(result.publicKey).toEqual(senderKey);
    });
});

describe('PublicKeyNotFoundError', () => {
    test('includes the address in the error message', () => {
        const error = new PublicKeyNotFoundError('SOME_ADDRESS');
        expect(error.message).toContain('SOME_ADDRESS');
        expect(error.name).toBe('PublicKeyNotFoundError');
        expect(error.address).toBe('SOME_ADDRESS');
    });
});

/** Build a paginated mock IndexerClient */
function mockPaginatedIndexer(
    pages: NoteTransaction[][],
    betweenTransactions: NoteTransaction[] = []
): { indexer: IndexerClient; getCallCount: () => number } {
    let callCount = 0;
    const indexer: IndexerClient = {
        searchTransactions: async () => pages.flat(),
        searchTransactionsBetween: async () => betweenTransactions,
        getTransaction: async () => pages[0]?.[0],
        waitForIndexer: async () => pages[0]?.[0],
        searchTransactionsPaginated: async (
            _address: string,
            options?: { afterRound?: number; limit?: number; nextToken?: string }
        ): Promise<PaginatedTransactions> => {
            const pageIndex = options?.nextToken ? parseInt(options.nextToken, 10) : 0;
            const page = pages[pageIndex] ?? [];
            callCount++;
            const hasMore = pageIndex + 1 < pages.length;
            return {
                transactions: page,
                nextToken: hasMore ? String(pageIndex + 1) : undefined,
            };
        },
    };
    return { indexer, getCallCount: () => callCount };
}

describe('MessageIndexer.findPublicKey (paginated)', () => {
    test('finds key on a later page when using paginated indexer', async () => {
        const senderKey = new Uint8Array(32).fill(0xAA);
        const chatNote = makeChatNote(senderKey);

        // Page 1: irrelevant tx (wrong sender)
        const page1: NoteTransaction[] = [
            {
                txid: 'tx1',
                sender: 'OTHER_ADDR',
                receiver: TARGET_ADDRESS,
                note: chatNote,
                confirmedRound: 100,
                roundTime: 1700000000,
            },
        ];

        // Page 2: valid tx from target
        const page2: NoteTransaction[] = [
            {
                txid: 'tx2',
                sender: TARGET_ADDRESS,
                receiver: SENDER_ADDRESS,
                note: chatNote,
                confirmedRound: 101,
                roundTime: 1700000001,
            },
        ];

        const { indexer, getCallCount } = mockPaginatedIndexer([page1, page2]);
        const account = mockChatAccount(SENDER_ADDRESS);
        const mi = new MessageIndexer(indexer, account);

        const result = await mi.findPublicKey(TARGET_ADDRESS);
        expect(result.publicKey).toEqual(senderKey);
        expect(getCallCount()).toBe(2);
    });

    test('throws when all pages exhausted without match', async () => {
        const page1: NoteTransaction[] = [
            {
                txid: 'tx1',
                sender: 'OTHER_ADDR',
                receiver: TARGET_ADDRESS,
                note: new Uint8Array(1),
                confirmedRound: 100,
                roundTime: 1700000000,
            },
        ];

        const { indexer } = mockPaginatedIndexer([page1]);
        const account = mockChatAccount(SENDER_ADDRESS);
        const mi = new MessageIndexer(indexer, account);

        await expect(mi.findPublicKey(TARGET_ADDRESS)).rejects.toThrow(PublicKeyNotFoundError);
    });

    test('respects searchDepth limit in paginated mode', async () => {
        const senderKey = new Uint8Array(32).fill(0xAA);
        const chatNote = makeChatNote(senderKey);

        // 3 pages; key is on page 3 but searchDepth will limit to 2 pages
        const pages: NoteTransaction[][] = [
            [{ txid: 'tx1', sender: 'OTHER', receiver: TARGET_ADDRESS, note: new Uint8Array(1), confirmedRound: 100, roundTime: 1700000000 }],
            [{ txid: 'tx2', sender: 'OTHER', receiver: TARGET_ADDRESS, note: new Uint8Array(1), confirmedRound: 101, roundTime: 1700000001 }],
            [{ txid: 'tx3', sender: TARGET_ADDRESS, receiver: SENDER_ADDRESS, note: chatNote, confirmedRound: 102, roundTime: 1700000002 }],
        ];

        const { indexer, getCallCount } = mockPaginatedIndexer(pages);
        const account = mockChatAccount(SENDER_ADDRESS);
        const mi = new MessageIndexer(indexer, account);

        // searchDepth=2 should stop before page 3
        await expect(mi.findPublicKey(TARGET_ADDRESS, 2)).rejects.toThrow(PublicKeyNotFoundError);
        expect(getCallCount()).toBe(2);
    });

    test('exhaustive search with no searchDepth searches all pages', async () => {
        const senderKey = new Uint8Array(32).fill(0xAA);
        const chatNote = makeChatNote(senderKey);

        const pages: NoteTransaction[][] = [
            [{ txid: 'tx1', sender: 'OTHER', receiver: TARGET_ADDRESS, note: new Uint8Array(1), confirmedRound: 100, roundTime: 1700000000 }],
            [{ txid: 'tx2', sender: 'OTHER', receiver: TARGET_ADDRESS, note: new Uint8Array(1), confirmedRound: 101, roundTime: 1700000001 }],
            [{ txid: 'tx3', sender: TARGET_ADDRESS, receiver: SENDER_ADDRESS, note: chatNote, confirmedRound: 102, roundTime: 1700000002 }],
        ];

        const { indexer, getCallCount } = mockPaginatedIndexer(pages);
        const account = mockChatAccount(SENDER_ADDRESS);
        const mi = new MessageIndexer(indexer, account);

        // No searchDepth = exhaustive
        const result = await mi.findPublicKey(TARGET_ADDRESS);
        expect(result.publicKey).toEqual(senderKey);
        expect(getCallCount()).toBe(3);
    });
});
