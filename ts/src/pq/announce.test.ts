/**
 * REQ-protocol-12 (#68): vectors/pq-announcement-v1.json is exactly what the
 * TypeScript announcement code writes, and every case in it holds.
 */
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ed25519 } from '@noble/curves/ed25519';
import {
    encodePQKeyAnnouncement,
    isPQKeyAnnouncement,
    parsePQKeyAnnouncement,
    pqAnnouncementSigningInput,
} from './announce.js';
import { deriveMLKEMKeyPair } from './kem.js';

const VECTOR_URL = new URL('../../../vectors/pq-announcement-v1.json', import.meta.url);
const REGENERATE = 'cd ts && bun scripts/emit-pq-announcement-vector.ts && cp ../vectors/pq-announcement-v1.json ../rs/vectors/';

interface Case {
    name: string;
    note: string;
    verifying_key: string | null;
    is_announcement: boolean;
    expect: 'unverified' | 'verified' | 'rejected';
}

interface Vector {
    account_seed: string;
    encaps_key: string;
    ed25519_public_key: string;
    other_signer_seed: string;
    other_signer_public_key: string;
    signing_input: string;
    unsigned_size: number;
    signed_size: number;
    unsigned_note: string;
    signed_note: string;
    parse_cases: Case[];
    bad_encaps_key_lengths: number[];
}

function readVectorText(): string {
    try {
        return readFileSync(VECTOR_URL, 'utf8');
    } catch (error) {
        throw new Error(`vectors/pq-announcement-v1.json is missing (${String(error)}); write it with: ${REGENERATE}`);
    }
}

const vector = JSON.parse(readVectorText()) as Vector;

function bytes(hex: string): Uint8Array {
    return new Uint8Array(Buffer.from(hex, 'hex'));
}

function hex(value: Uint8Array): string {
    return Buffer.from(value).toString('hex');
}

describe('ACPQ announcement vector (REQ-protocol-12)', () => {
    test('the committed file is exactly what the regenerate command writes', () => {
        const output = join(mkdtempSync(join(tmpdir(), 'pq-announcement-')), 'pq-announcement-v1.json');
        const run = Bun.spawnSync([process.execPath, 'scripts/emit-pq-announcement-vector.ts', output], {
            cwd: new URL('../../', import.meta.url).pathname,
        });
        expect(run.exitCode).toBe(0);
        if (readFileSync(output, 'utf8') !== readVectorText()) {
            throw new Error(`vectors/pq-announcement-v1.json differs from the TypeScript output; regenerate it with: ${REGENERATE}`);
        }
    });

    test('notes and signing input come from the account seed', () => {
        const seed = bytes(vector.account_seed);
        const encapsKey = deriveMLKEMKeyPair(seed).encapsKey;
        expect(hex(encapsKey)).toBe(vector.encaps_key);
        expect(hex(ed25519.getPublicKey(seed))).toBe(vector.ed25519_public_key);
        expect(hex(ed25519.getPublicKey(bytes(vector.other_signer_seed)))).toBe(vector.other_signer_public_key);
        expect(hex(pqAnnouncementSigningInput(encapsKey))).toBe(vector.signing_input);
        const unsigned = encodePQKeyAnnouncement(encapsKey);
        const signed = encodePQKeyAnnouncement(encapsKey, seed);
        expect(hex(unsigned)).toBe(vector.unsigned_note);
        expect(hex(signed)).toBe(vector.signed_note);
        expect(unsigned.length).toBe(1189);
        expect(signed.length).toBe(1253);
        expect(vector.unsigned_size).toBe(1189);
        expect(vector.signed_size).toBe(1253);
    });

    test('every parse case holds', () => {
        const results = new Set<string>();
        for (const item of vector.parse_cases) {
            const note = bytes(item.note);
            expect(isPQKeyAnnouncement(note)).toBe(item.is_announcement);
            const parsed = parsePQKeyAnnouncement(note, item.verifying_key === null ? undefined : bytes(item.verifying_key));
            results.add(item.expect);
            if (item.expect === 'rejected') {
                expect(parsed).toBeUndefined();
                continue;
            }
            expect(parsed).toBeDefined();
            expect(parsed?.isVerified).toBe(item.expect === 'verified');
            expect(hex(parsed?.encapsKey ?? new Uint8Array())).toBe(vector.encaps_key);
        }
        expect([...results].sort()).toEqual(['rejected', 'unverified', 'verified']);
    });

    test('every bad key length is refused', () => {
        const seed = bytes(vector.account_seed);
        for (const length of vector.bad_encaps_key_lengths) {
            const key = new Uint8Array(length).fill(0x07);
            expect(() => encodePQKeyAnnouncement(key)).toThrow();
            expect(() => encodePQKeyAnnouncement(key, seed)).toThrow();
            expect(() => pqAnnouncementSigningInput(key)).toThrow();
        }
    });
});
