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

    /** Decode indexer JSON the same way `Indexer.searchForTransactions().do()` does. */
    function sdkTransactions(items: NoteTransaction[]): algosdk.indexerModels.Transaction[] {
        const payload = {
            'current-round': 1,
            transactions: items.map((item) => ({
                id: item.txid,
                sender: item.sender,
                'tx-type': 'pay',
                fee: 1000,
                'first-valid': 1,
                'last-valid': 1000,
                note: toBase64(item.note),
                'round-time': item.roundTime,
                'confirmed-round': item.confirmedRound,
                'intra-round-offset': item.intraRoundOffset,
                'payment-transaction': { receiver: item.receiver, amount: 1000 },
            })),
        };
        return algosdk.decodeJSON(
            JSON.stringify(payload),
            algosdk.indexerModels.TransactionsResponse,
        ).transactions;
    }

    const rows = sdkTransactions([
        tx('next', 'bob', 11, 0),
        tx('later-sent', 'alice', 10, 1),
        tx('earlier-received', 'bob', 10, 0),
    ]);

    function fakeIndexer(source: algosdk.indexerModels.Transaction[] = rows): algosdk.Indexer {
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
                        const selected = source
                            .filter((row) => {
                                const round = Number(row.confirmedRound);
                                if (query.min !== undefined && round < query.min) return false;
                                if (query.max !== undefined && round > query.max) return false;
                                return true;
                            })
                            .sort((a, b) => {
                                const roundDiff = Number(b.confirmedRound ?? 0) - Number(a.confirmedRound ?? 0);
                                if (roundDiff !== 0) return roundDiff;
                                return Number(b.intraRoundOffset ?? 0) - Number(a.intraRoundOffset ?? 0);
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
        expect(rows[1]).toBeInstanceOf(algosdk.indexerModels.Transaction);
        expect(rows[1].intraRoundOffset).toBe(1);
        expect(Object.prototype.hasOwnProperty.call(rows[1], 'intra-round-offset')).toBe(false);

        const indexer = new MessageIndexer(config, undefined, fakeIndexer());
        const messages = await indexer.fetchMessages(account, 'BOB', { limit: 50 });
        expect(messages.map((message) => message.id)).toEqual([
            'earlier-received',
            'later-sent',
            'next',
        ]);
        expect(messages.map((message) => message.intraRoundOffset)).toEqual([0, 1, 0]);
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

    test('forward sync keeps both rounds of a full two-row page', async () => {
        const forwardRows = sdkTransactions([
            tx('round-12', 'bob', 12, 0),
            tx('round-11', 'alice', 11, 0),
        ]);
        const indexer = new MessageIndexer(config, undefined, fakeIndexer(forwardRows));
        const page = await indexer.fetchNewerMessages(account, 'BOB', 10, 2);
        expect(page.map((message) => message.id)).toEqual(['round-11', 'round-12']);
        expect(page.map((message) => message.confirmedRound)).toEqual([11, 12]);
        const cursor = page[page.length - 1].confirmedRound;
        expect(cursor).toBe(12);
        const next = await indexer.fetchNewerMessages(account, 'BOB', cursor, 2);
        expect(next).toEqual([]);
    });
});
