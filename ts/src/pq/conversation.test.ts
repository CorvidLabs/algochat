/**
 * REQ-protocol-13 (#70b): vectors/pq-conversation-v1.json is exactly what the
 * TypeScript Hybrid session code writes, and every handshake, message and case
 * in it holds.
 */
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deriveEncryptionKeys } from '../crypto/keys.js';
import { deriveMLKEMKeyPair } from './kem.js';
import { acceptPQSession, decryptPQMessage, openPQSessionAsSender } from './session.js';
import { sha256Bytes } from './bytes.js';
import type { PQSession } from './types.js';

const FILE = 'pq-conversation-v1.json';
const VECTOR_URL = new URL(`../../../vectors/${FILE}`, import.meta.url);
const REGENERATE = `cd ts && bun scripts/emit-conversation-vectors.ts && cp ../vectors/${FILE} ../rs/vectors/`;

type Name = 'alice' | 'bob';

interface Vector {
    accounts: Record<Name, { seed: string; x25519_public: string; encaps_key: string }>;
    handshakes: Array<{ name: string; sender: Name; recipient: Name; note: string; handshake_id: string; session_key: string }>;
    messages: Array<{ index: number; handshake: string; plaintext: string; note: string }>;
    cases: Array<{ name: string; op: 'accept' | 'open_as_sender' | 'decrypt'; account: Name; handshake: string; note: string; expect: 'accepted' | 'rejected' }>;
}

function readVectorText(): string {
    try {
        return readFileSync(VECTOR_URL, 'utf8');
    } catch (error) {
        throw new Error(`vectors/${FILE} is missing (${String(error)}); write it with: ${REGENERATE}`);
    }
}

const vector = JSON.parse(readVectorText()) as Vector;

function bytes(hex: string): Uint8Array {
    return new Uint8Array(Buffer.from(hex, 'hex'));
}

function hex(value: Uint8Array): string {
    return Buffer.from(value).toString('hex');
}

function keysOf(name: Name) {
    const seed = bytes(vector.accounts[name].seed);
    return { x25519: deriveEncryptionKeys(seed), mlkem: deriveMLKEMKeyPair(seed) };
}

function handshakeNamed(name: string) {
    const handshake = vector.handshakes.find((item) => item.name === name);
    if (!handshake) throw new Error(`unknown handshake ${name}`);
    return handshake;
}

/** The session `name` gets from a handshake: recovered as its sender, or accepted as its recipient. */
function sessionFor(name: Name, handshakeName: string): PQSession {
    const handshake = handshakeNamed(handshakeName);
    const keys = keysOf(name);
    const note = bytes(handshake.note);
    return name === handshake.sender
        ? openPQSessionAsSender(note, keys.x25519, keys.mlkem.decapsKey)
        : acceptPQSession(note, keys.x25519, keys.mlkem.encapsKey, keys.mlkem.decapsKey);
}

function outcome(run: () => unknown): 'accepted' | 'rejected' {
    try {
        run();
        return 'accepted';
    } catch {
        return 'rejected';
    }
}

describe('Hybrid conversation vector (REQ-protocol-13)', () => {
    test('the committed file is exactly what the regenerate command writes', () => {
        const directory = mkdtempSync(join(tmpdir(), 'pq-conversation-'));
        const run = Bun.spawnSync([process.execPath, 'scripts/emit-conversation-vectors.ts', directory], {
            cwd: new URL('../../', import.meta.url).pathname,
        });
        expect(run.exitCode).toBe(0);
        if (readFileSync(join(directory, FILE), 'utf8') !== readVectorText()) {
            throw new Error(`vectors/${FILE} differs from the TypeScript output; regenerate it with: ${REGENERATE}`);
        }
    });

    test('keys come from the seeds and both sides derive every session', () => {
        for (const name of ['alice', 'bob'] as Name[]) {
            const keys = keysOf(name);
            expect(hex(keys.x25519.publicKey)).toBe(vector.accounts[name].x25519_public);
            expect(hex(keys.mlkem.encapsKey)).toBe(vector.accounts[name].encaps_key);
        }
        expect(vector.handshakes.map((item) => `${item.sender}>${item.recipient}`).sort()).toEqual(['alice>bob', 'bob>alice']);
        for (const handshake of vector.handshakes) {
            const note = bytes(handshake.note);
            expect(note.length).toBe(2366);
            expect(hex(sha256Bytes(note))).toBe(handshake.handshake_id);
            for (const name of [handshake.recipient, handshake.sender]) {
                const session = sessionFor(name, handshake.name);
                expect(hex(session.sessionKey)).toBe(handshake.session_key);
                expect(hex(session.handshakeId)).toBe(handshake.handshake_id);
            }
        }
    });

    test('both sides read every message', () => {
        const counts = new Map<string, number>();
        let longest = 0;
        vector.messages.forEach((message, position) => {
            expect(message.index).toBe(position);
            const handshake = handshakeNamed(message.handshake);
            const note = bytes(message.note);
            longest = Math.max(longest, note.length);
            for (const name of [handshake.recipient, handshake.sender]) {
                expect(decryptPQMessage(note, sessionFor(name, handshake.name))).toBe(message.plaintext);
            }
            counts.set(message.handshake, (counts.get(message.handshake) ?? 0) + 1);
        });
        expect(counts.size).toBe(2);
        for (const count of counts.values()) expect(count).toBeGreaterThanOrEqual(32);
        expect(longest).toBe(4096);
    });

    test('every case holds', () => {
        const seen = new Set<string>();
        for (const item of vector.cases) {
            const keys = keysOf(item.account);
            const note = bytes(item.note);
            const actual = outcome(() => {
                if (item.op === 'accept') {
                    const session = acceptPQSession(note, keys.x25519, keys.mlkem.encapsKey, keys.mlkem.decapsKey);
                    expect(hex(session.sessionKey)).toBe(handshakeNamed(item.handshake).session_key);
                } else if (item.op === 'open_as_sender') {
                    openPQSessionAsSender(note, keys.x25519, keys.mlkem.decapsKey);
                } else if (item.op === 'decrypt') {
                    decryptPQMessage(note, sessionFor(item.account, item.handshake));
                } else {
                    throw new Error(`${item.name}: unknown op`);
                }
            });
            expect(`${item.name}: ${actual}`).toBe(`${item.name}: ${item.expect}`);
            seen.add(`${item.op} ${item.expect}`);
        }
        for (const op of ['accept', 'open_as_sender', 'decrypt']) expect(seen.has(`${op} rejected`)).toBe(true);
    });
});
