/**
 * REQ-protocol-14 (#70c-1): vectors/room-session-v1.json is exactly what the
 * TypeScript room, session and mailbox code writes, and every record,
 * delivery, message and case in it holds.
 */
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ed25519 } from '@noble/curves/ed25519';
import { deriveEncryptionKeys } from '../crypto/keys.js';
import { openGroupMessage } from './group.js';
import {
    deliveryAuthorized,
    openGroupKeyDelivery,
    reduceAdmin,
    senderMayPost,
    type AdminEvent,
} from './group-admin.js';
import { deriveMLKEMKeyPair } from './kem.js';
import { acceptPQSession, openPQSessionAsSender } from './session.js';
import type { PQSession } from './types.js';

const FILE = 'room-session-v1.json';
const VECTOR_URL = new URL(`../../../vectors/${FILE}`, import.meta.url);
const REGENERATE = `cd ts && bun scripts/emit-room-session-vector.ts && cp ../vectors/${FILE} ../rs/vectors/`;

type Name = 'owner' | 'member_a' | 'member_b' | 'outsider';
type Expect = 'accepted' | 'rejected';

interface Vector {
    accounts: Record<Name, { seed: string; address: string; x25519_public: string; encaps_key: string }>;
    room: { group_id: string; mailbox: string; name: string; epoch: number; group_key: string };
    admin: Array<{ name: string; sender: Name; tx_id: string; round: number; offset: number; note: string }>;
    state: { owner: Name; admins: Name[]; members: Name[]; epoch: number; head_tx_id: string };
    handshakes: Array<{ name: string; sender: Name; recipient: Name; note: string; handshake_id: string; session_key: string }>;
    deliveries: Array<{ name: string; recipient: Name; handshake: string; admin_tx_id: string; note: string }>;
    messages: Array<{ index: number; sender: Name; epoch: number; counter: number; plaintext: string; note: string }>;
    outsider_note: string;
    cases: Array<
        | { name: string; op: 'open_delivery'; account: Name; handshake: string; note: string; expect: Expect }
        | { name: string; op: 'authorize'; admin_tx_id: string; sender: Name; recipient: Name; epoch: number; expect: Expect }
        | { name: string; op: 'open_message'; sender: Name; accepted: Array<[number, number]>; note: string; expect: Expect }
    >;
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

const names = Object.keys(vector.accounts) as Name[];

function keysOf(name: Name) {
    const seed = bytes(vector.accounts[name].seed);
    return { address: ed25519.getPublicKey(seed), x25519: deriveEncryptionKeys(seed), mlkem: deriveMLKEMKeyPair(seed) };
}

function address(name: Name): Uint8Array {
    return bytes(vector.accounts[name].address);
}

function nameOf(value: Uint8Array): Name | 'unknown' {
    return names.find((name) => vector.accounts[name].address === hex(value)) ?? 'unknown';
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

function reduced() {
    const events: AdminEvent[] = vector.admin.map((item) => ({
        note: bytes(item.note),
        sender: address(item.sender),
        txId: bytes(item.tx_id),
        round: item.round,
        offset: item.offset,
    }));
    return reduceAdmin(events);
}

function outcome(run: () => unknown): Expect {
    try {
        run();
        return 'accepted';
    } catch {
        return 'rejected';
    }
}

describe('Room joined over a Hybrid session (REQ-protocol-14)', () => {
    test('the committed file is exactly what the regenerate command writes', () => {
        const directory = mkdtempSync(join(tmpdir(), 'room-session-'));
        const run = Bun.spawnSync([process.execPath, 'scripts/emit-room-session-vector.ts', directory], {
            cwd: new URL('../../', import.meta.url).pathname,
        });
        expect(run.exitCode).toBe(0);
        if (readFileSync(join(directory, FILE), 'utf8') !== readVectorText()) {
            throw new Error(`vectors/${FILE} differs from the TypeScript output; regenerate it with: ${REGENERATE}`);
        }
    });

    test('keys come from the seeds and the records reduce to the recorded room', () => {
        expect([...names].sort()).toEqual(['member_a', 'member_b', 'outsider', 'owner']);
        for (const name of names) {
            const keys = keysOf(name);
            expect(hex(keys.address) === vector.accounts[name].address).toBe(true);
            expect(hex(keys.x25519.publicKey) === vector.accounts[name].x25519_public).toBe(true);
            expect(hex(keys.mlkem.encapsKey) === vector.accounts[name].encaps_key).toBe(true);
        }
        const result = reduced();
        expect(result.rejected).toEqual([]);
        const room = result.state;
        if (!room) throw new Error('no room');
        expect(nameOf(room.owner) === vector.state.owner).toBe(true);
        expect(room.admins.map(nameOf)).toEqual(vector.state.admins);
        expect([...room.members.map(nameOf)].sort()).toEqual(vector.state.members);
        expect(room.epoch).toBe(vector.state.epoch);
        expect(hex(room.headTxId)).toBe(vector.state.head_tx_id);
        expect(hex(room.groupId)).toBe(vector.room.group_id);
        expect(hex(room.mailbox)).toBe(vector.room.mailbox);
    });

    test('each member recovers its session, opens its room key and is authorized', () => {
        const { accepted } = reduced();
        for (const handshake of vector.handshakes) {
            expect(bytes(handshake.note).length).toBe(2366);
            for (const name of [handshake.recipient, handshake.sender]) {
                const session = sessionFor(name, handshake.name);
                expect(`${handshake.name}: ${hex(session.sessionKey)}`).toBe(`${handshake.name}: ${handshake.session_key}`);
                expect(hex(session.handshakeId)).toBe(handshake.handshake_id);
            }
        }
        const joined = new Set<string>();
        for (const delivery of vector.deliveries) {
            const note = bytes(delivery.note);
            expect(note.length).toBe(227);
            const opened = openGroupKeyDelivery(note, sessionFor(delivery.recipient, delivery.handshake));
            expect(`${delivery.name}: ${hex(opened.groupKey)}`).toBe(`${delivery.name}: ${vector.room.group_key}`);
            expect(hex(opened.groupId)).toBe(vector.room.group_id);
            expect(hex(opened.mailbox)).toBe(vector.room.mailbox);
            expect(opened.epoch).toBe(vector.room.epoch);
            expect(hex(opened.adminTxId)).toBe(delivery.admin_tx_id);
            expect(deliveryAuthorized(accepted, opened.adminTxId, address('owner'), address(delivery.recipient), opened.epoch)).toBe(true);
            joined.add(delivery.recipient);
        }
        expect([...joined].sort()).toEqual(['member_a', 'member_b']);
    });

    test('every message opens once for every member, and the outsider is ignored', () => {
        const room = reduced().state;
        if (!room) throw new Error('no room');
        const groupKey = bytes(vector.room.group_key);
        const scopes = new Map<Name, Array<{ epoch: number; counter: number }>>();
        vector.messages.forEach((message, position) => {
            expect(message.index).toBe(position);
            const scope = scopes.get(message.sender) ?? [];
            const opened = openGroupMessage(bytes(message.note), groupKey, address(message.sender), scope);
            expect(`message ${position}: ${new TextDecoder().decode(opened.plaintext)}`).toBe(`message ${position}: ${message.plaintext}`);
            expect(opened.epoch).toBe(message.epoch);
            expect(opened.counter).toBe(message.counter);
            expect(senderMayPost(room, address(message.sender), opened.epoch)).toBe(true);
            const repeat = outcome(() => openGroupMessage(bytes(message.note), groupKey, address(message.sender), [{ epoch: opened.epoch, counter: opened.counter }]));
            expect(`message ${position} repeated: ${repeat}`).toBe(`message ${position} repeated: rejected`);
            scope.push({ epoch: opened.epoch, counter: opened.counter });
            scopes.set(message.sender, scope);
        });
        expect([...scopes.keys()].sort()).toEqual(['member_a', 'member_b', 'owner']);
        const outsider = openGroupMessage(bytes(vector.outsider_note), groupKey, address('outsider'), []);
        expect(senderMayPost(room, address('outsider'), outsider.epoch)).toBe(false);
    });

    test('every case holds', () => {
        const { state, accepted } = reduced();
        if (!state) throw new Error('no room');
        const groupKey = bytes(vector.room.group_key);
        const seen = new Set<string>();
        for (const item of vector.cases) {
            let actual: Expect;
            if (item.op === 'open_delivery') {
                actual = outcome(() => openGroupKeyDelivery(bytes(item.note), sessionFor(item.account, item.handshake)));
            } else if (item.op === 'authorize') {
                actual = deliveryAuthorized(accepted, bytes(item.admin_tx_id), address(item.sender), address(item.recipient), item.epoch)
                    ? 'accepted'
                    : 'rejected';
            } else if (item.op === 'open_message') {
                const sender = address(item.sender);
                actual = outcome(() => {
                    const opened = openGroupMessage(bytes(item.note), groupKey, sender, item.accepted.map(([epoch, counter]) => ({ epoch, counter })));
                    if (!senderMayPost(state, sender, opened.epoch)) throw new Error('not a member');
                });
            } else {
                throw new Error(`${(item as { name: string }).name}: unknown op`);
            }
            expect(`${item.name}: ${actual}`).toBe(`${item.name}: ${item.expect}`);
            seen.add(`${item.op} ${item.expect}`);
        }
        for (const op of ['open_delivery', 'authorize', 'open_message']) {
            for (const result of ['accepted', 'rejected']) expect(seen.has(`${op} ${result}`)).toBe(true);
        }
    });
});
