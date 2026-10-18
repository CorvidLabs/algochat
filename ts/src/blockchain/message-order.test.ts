/**
 * Chain order regressions for the abstract and exported message indexers.
 * Equal timestamps inserted newest-first must not stay in insertion order.
 */

import { describe, expect, test } from 'bun:test';
import algosdk from 'algosdk';
import { MessageIndexer as AbstractMessageIndexer } from './message-indexer.js';
import type { IndexerClient } from './interfaces.js';
import type { NoteTransaction } from './types.js';
import { MessageIndexer } from '../services/MessageIndexer.js';
import type { ChatAccount } from '../services/algorand.service.js';
import { encryptMessage, encodeEnvelope } from '../crypto/index.js';
import { deriveEncryptionKeys } from '../crypto/keys.js';

const aliceKeys = deriveEncryptionKeys(new Uint8Array(32).fill(0x41));
const bobKeys = deriveEncryptionKeys(new Uint8Array(32).fill(0x42));
const SAME_TIME = 1_700_000_000;

function noteFrom(sender: 'alice' | 'bob', text: string): Uint8Array {
    const senderKeys = sender === 'alice' ? aliceKeys : bobKeys;
    const recipientKeys = sender === 'alice' ? bobKeys : aliceKeys;
    return encodeEnvelope(encryptMessage(text, senderKeys.publicKey, recipientKeys.publicKey));
}

function tx(id: string, sender: 'alice' | 'bob', round: number, offset: number | undefined): NoteTransaction {
    const fromAlice = sender === 'alice';
    return {
        txid: id,
        sender: fromAlice ? 'ALICE' : 'BOB',
        receiver: fromAlice ? 'BOB' : 'ALICE',
        note: noteFrom(sender, id),
        confirmedRound: round,
        roundTime: SAME_TIME,
        intraRoundOffset: offset,
    };
}

describe('abstract MessageIndexer chain order', () => {
    const newestFirst = [
        tx('next', 'bob', 11, 0),
        tx('later-sent', 'alice', 10, 1),
        tx('earlier-received', 'bob', 10, 0),
    ];

    function client(): IndexerClient {
        return {
            searchTransactions: async () => newestFirst,
            searchTransactionsBetween: async (_a, _b, afterRound) =>
                newestFirst.filter((item) => afterRound === undefined || item.confirmedRound > afterRound),
            getTransaction: async () => newestFirst[0],
            waitForIndexer: async () => newestFirst[0],
        };
    }

    const account = { address: 'ALICE', encryptionKeys: aliceKeys };

    test('equal timestamps do not keep newest-first insertion', async () => {
        const indexer = new AbstractMessageIndexer(client(), account);
        const messages = await indexer.fetchMessages('BOB', undefined, 50);
        expect(messages.map((message) => message.id)).toEqual([
            'earlier-received',
            'later-sent',
            'next',
        ]);
    });

    test('pagination keeps the boundary round intact', async () => {
        const indexer = new AbstractMessageIndexer(client(), account);
        const first = await indexer.fetchMessages('BOB', undefined, 1);
        expect(first.map((message) => message.id)).toEqual(['earlier-received', 'later-sent']);
        const boundary = first[first.length - 1].confirmedRound;
        const second = await indexer.fetchMessages('BOB', boundary, 50);
        expect(second.map((message) => message.id)).toEqual(['next']);
        const ids = [...first, ...second].map((message) => message.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids).toEqual(['earlier-received', 'later-sent', 'next']);
    });
});

describe('exported MessageIndexer chain order', () => {
    function toBase64(bytes: Uint8Array): string {
        let binary = '';
        for (const byte of bytes) binary += String.fromCharCode(byte);
        return btoa(binary);
    }

    const rows = [
        tx('next', 'bob', 11, 0),
        tx('later-sent', 'alice', 10, 1),
        tx('earlier-received', 'bob', 10, 0),
    ].map((item) => ({
        id: item.txid,
        sender: item.sender,
        txType: 'pay',
        note: toBase64(item.note),
        roundTime: item.roundTime,
        confirmedRound: item.confirmedRound,
        'intra-round-offset': item.intraRoundOffset,
        paymentTransaction: { receiver: item.receiver, amount: 1000 },
    }));

    function fakeIndexer(): algosdk.Indexer {
        return {
            searchForTransactions() {
                const query = {
                    min: undefined as number | undefined,
                    max: undefined as number | undefined,
                    lim: 50,
                    address() { return query; },
                    limit(n: number) { query.lim = n; return query; },
                    minRound(n: number) { query.min = n; return query; },
                    maxRound(n: number) { query.max = n; return query; },
                    async do() {
                        const selected = rows
                            .filter((row) => {
                                const round = Number(row.confirmedRound);
                                if (query.min !== undefined && round < query.min) return false;
                                if (query.max !== undefined && round > query.max) return false;
                                return true;
                            })
                            .sort((a, b) => {
                                const roundDiff = Number(b.confirmedRound) - Number(a.confirmedRound);
                                if (roundDiff !== 0) return roundDiff;
                                return Number(b['intra-round-offset'] ?? 0) - Number(a['intra-round-offset'] ?? 0);
                            });
                        return { transactions: selected.slice(0, query.lim) };
                    },
                };
                return query;
            },
        } as unknown as algosdk.Indexer;
    }

    const account = { address: 'ALICE', encryptionKeys: aliceKeys } as ChatAccount;
    const config = {
        indexerToken: '',
        indexerServer: 'https://example.invalid',
    };

    test('equal timestamps do not keep newest-first insertion', async () => {
        const indexer = new MessageIndexer(config, undefined, fakeIndexer());
        const messages = await indexer.fetchMessages(account, 'BOB', { limit: 50 });
        expect(messages.map((message) => message.id)).toEqual([
            'earlier-received',
            'later-sent',
            'next',
        ]);
    });

    test('a full newest-first page does not skip or duplicate the boundary round', async () => {
        const indexer = new MessageIndexer(config, undefined, fakeIndexer());
        const newer = await indexer.fetchMessages(account, 'BOB', { limit: 2 });
        expect(newer.map((message) => message.id)).toEqual(['next']);
        const older = await indexer.fetchOlderMessages(account, 'BOB', newer[0].confirmedRound, 20);
        expect(older.map((message) => message.id)).toEqual(['earlier-received', 'later-sent']);
        const ids = [...newer, ...older].map((message) => message.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids).toEqual(['next', 'earlier-received', 'later-sent']);
    });
});
