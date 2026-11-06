/**
 * REQ-protocol-13 (#70b): vectors/psk-kept-v1.json is exactly what the
 * TypeScript Extra lock code writes, and every kept note, case and receive
 * step in it holds, also from a state rebuilt at the restart.
 */
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deriveEncryptionKeys } from '../crypto/keys.js';
import { decryptPSKMessage } from './encryption.js';
import { decodePSKEnvelope } from './envelope.js';
import { derivePSKAtCounter } from './ratchet.js';
import { createPSKState, recordReceive, validateCounter } from './state.js';
import type { PSKState } from './types.js';

const FILE = 'psk-kept-v1.json';
const VECTOR_URL = new URL(`../../../vectors/${FILE}`, import.meta.url);
const REGENERATE = `cd ts && bun scripts/emit-conversation-vectors.ts && cp ../vectors/${FILE} ../rs/vectors/`;

type Name = 'alice' | 'bob';
type Expect = 'accepted' | 'rejected';

interface Snapshot {
    send_counter: number;
    peer_last_counter: number;
    seen_counters: number[];
}

interface Vector {
    kept_psk: string;
    accounts: Record<Name, { seed: string; x25519_public: string }>;
    notes: Array<{ name: string; from: Name; to: Name; counter: number; plaintext: string; note: string }>;
    cases: Array<{ name: string; account: Name; psk: string; note: string; expect: Expect }>;
    receive: {
        account: Name;
        peer: Name;
        steps: Array<{ counter: number; expect: Expect }>;
        restart_after: number;
        state_at_restart: Snapshot;
        final_state: Snapshot;
    };
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

function read(name: Name, note: Uint8Array, psk: Uint8Array): string | undefined {
    try {
        const envelope = decodePSKEnvelope(note);
        const keys = deriveEncryptionKeys(bytes(vector.accounts[name].seed));
        return decryptPSKMessage(envelope, keys.privateKey, keys.publicKey, derivePSKAtCounter(psk, envelope.ratchetCounter))?.text;
    } catch {
        return undefined;
    }
}

function snapshot(state: PSKState): Snapshot {
    return {
        send_counter: state.sendCounter,
        peer_last_counter: state.peerLastCounter,
        seen_counters: [...state.seenCounters].sort((left, right) => left - right),
    };
}

function restore(saved: Snapshot): PSKState {
    return {
        sendCounter: saved.send_counter,
        peerLastCounter: saved.peer_last_counter,
        seenCounters: new Set(saved.seen_counters),
        sendExhausted: false,
    };
}

describe('Kept Extra lock vector (REQ-protocol-13)', () => {
    test('the committed file is exactly what the regenerate command writes', () => {
        const directory = mkdtempSync(join(tmpdir(), 'psk-kept-'));
        const run = Bun.spawnSync([process.execPath, 'scripts/emit-conversation-vectors.ts', directory], {
            cwd: new URL('../../', import.meta.url).pathname,
        });
        expect(run.exitCode).toBe(0);
        if (readFileSync(join(directory, FILE), 'utf8') !== readVectorText()) {
            throw new Error(`vectors/${FILE} differs from the TypeScript output; regenerate it with: ${REGENERATE}`);
        }
    });

    test('recipient and sender read every kept note', () => {
        const psk = bytes(vector.kept_psk);
        const counters = new Set<number>();
        let longest = 0;
        for (const item of vector.notes) {
            const note = bytes(item.note);
            const envelope = decodePSKEnvelope(note);
            expect(envelope.version).toBe(0x02);
            expect(envelope.ratchetCounter).toBe(item.counter);
            for (const name of [item.to, item.from]) expect(`${item.name}: ${read(name, note, psk)}`).toBe(`${item.name}: ${item.plaintext}`);
            counters.add(item.counter);
            longest = Math.max(longest, note.length);
        }
        for (const required of [0, 99, 100, 199, 200, 4294967295]) expect(counters.has(required)).toBe(true);
        expect(longest).toBe(4096);
    });

    test('every case holds', () => {
        const results = new Set<Expect>();
        for (const item of vector.cases) {
            const actual: Expect = read(item.account, bytes(item.note), bytes(item.psk)) === undefined ? 'rejected' : 'accepted';
            expect(`${item.name}: ${actual}`).toBe(`${item.name}: ${item.expect}`);
            results.add(item.expect);
        }
        expect([...results].sort()).toEqual(['accepted', 'rejected']);
    });

    test('the counter window holds across a restart', () => {
        const { steps, restart_after: restartAfter } = vector.receive;
        expect(restartAfter).toBeGreaterThan(0);
        expect(restartAfter).toBeLessThan(steps.length);
        let state = createPSKState();
        steps.forEach((step, index) => {
            if (index === restartAfter) {
                expect(snapshot(state)).toEqual(vector.receive.state_at_restart);
                state = restore(vector.receive.state_at_restart);
            }
            const valid = validateCounter(state, step.counter);
            expect(`step ${index} (${step.counter}): ${valid ? 'accepted' : 'rejected'}`).toBe(`step ${index} (${step.counter}): ${step.expect}`);
            if (valid) state = recordReceive(state, step.counter);
        });
        expect(snapshot(state)).toEqual(vector.receive.final_state);
    });
});
