/**
 * REQ-protocol-15 (#70c-2): vectors/room-rekey-v1.json is exactly what the
 * TypeScript room, session and mailbox code writes, and every record,
 * delivery, handout, message and case in it holds.
 */
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ed25519 } from '@noble/curves/ed25519';
import { deriveEncryptionKeys } from '../crypto/keys.js';
import { openGroupMessage } from './group.js';
import {
    GROUP_DELIVER_BATCH,
    authorizedRecipients,
    channelDepartures,
    deliveryAuthorized,
    nextDeliveryBatch,
    openGroupKeyDelivery,
    pendingKeyDeliveries,
    reduceAdmin,
    senderMayPost,
    type AdminEvent,
    type RoomState,
} from './group-admin.js';
import { deriveMLKEMKeyPair } from './kem.js';
import { acceptPQSession } from './session.js';

const FILE = 'room-rekey-v1.json';
const VECTOR_URL = new URL(`../../../vectors/${FILE}`, import.meta.url);
const REGENERATE = `cd ts && bun scripts/emit-room-rekey-vector.ts && cp ../vectors/${FILE} ../rs/vectors/`;

type Where = 'room' | 'channel';
type Expect = 'accepted' | 'rejected';
interface Snapshot { owner: string; admins: string[]; members: string[]; epoch: number; head_tx_id: string; parent_group_id: string }
interface Handout { admin_tx_id: string; recipients: string[]; first: string[]; landed: string[]; pending: string[]; resumed: string[] }

interface Vector {
    batch_size: number;
    accounts: Record<string, { seed: string; address: string; x25519_public: string; encaps_key: string }>;
    rooms: Record<Where, { group_id: string; mailbox: string; name: string; keys: Record<string, string> }>;
    admin: Array<{ name: string; room: Where; sender: string; tx_id: string; round: number; offset: number; note: string }>;
    states: { room_before_removal: Snapshot; room: Snapshot; channel_before_removal: Snapshot; channel: Snapshot };
    handshakes: Array<{ name: string; recipient: string; note: string; handshake_id: string; session_key: string }>;
    deliveries: Array<{ name: string; room: Where; recipient: string; handshake: string; epoch: number; admin_tx_id: string; note: string }>;
    handouts: Record<Where, Handout>;
    channel_departures: string[];
    messages: Array<{ index: number; room: Where; sender: string; epoch: number; counter: number; plaintext: string; note: string }>;
    cases: Array<
        | { name: string; op: 'read'; room: Where; key_epoch: number; message: number; expect: Expect }
        | { name: string; op: 'authorize'; room: Where; admin_tx_id: string; sender: string; recipient: string; epoch: number; expect: Expect }
        | { name: string; op: 'may_post'; room: Where; sender: string; epoch: number; expect: Expect }
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
const names = Object.keys(vector.accounts);

function bytes(hex: string): Uint8Array {
    return new Uint8Array(Buffer.from(hex, 'hex'));
}

function hex(value: Uint8Array): string {
    return Buffer.from(value).toString('hex');
}

function address(name: string): Uint8Array {
    return bytes(vector.accounts[name].address);
}

function nameOf(value: Uint8Array): string {
    return names.find((name) => vector.accounts[name].address === hex(value)) ?? 'unknown';
}

function events(where: Where, until?: string): AdminEvent[] {
    const list = vector.admin.filter((item) => item.room === where);
    const stop = until === undefined ? list.length : list.findIndex((item) => item.name === until);
    return list.slice(0, stop < 0 ? list.length : stop).map((item) => ({
        note: bytes(item.note),
        sender: address(item.sender),
        txId: bytes(item.tx_id),
        round: item.round,
        offset: item.offset,
    }));
}

function room(until?: string) {
    const reduced = reduceAdmin(events('room', until));
    expect(reduced.rejected).toEqual([]);
    if (!reduced.state) throw new Error('no room');
    return { state: reduced.state, accepted: reduced.accepted };
}

function channel(until?: string, parentUntil?: string) {
    const reduced = reduceAdmin(events('channel', until), events('room', parentUntil));
    expect(reduced.rejected).toEqual([]);
    if (!reduced.state) throw new Error('no channel');
    return { state: reduced.state, accepted: reduced.accepted };
}

function accepted(where: Where) {
    return where === 'room' ? room().accepted : channel().accepted;
}

function snapshot(state: RoomState): Snapshot {
    return {
        owner: nameOf(state.owner),
        admins: state.admins.map(nameOf),
        members: state.members.map(nameOf).sort(),
        epoch: state.epoch,
        head_tx_id: hex(state.headTxId),
        parent_group_id: hex(state.parentGroupId),
    };
}

function session(recipient: string) {
    const handshake = vector.handshakes.find((item) => item.name === `owner-to-${recipient}`);
    if (!handshake) throw new Error('a delivery names a member without a handshake');
    const seed = bytes(vector.accounts[recipient].seed);
    const mlkem = deriveMLKEMKeyPair(seed);
    return acceptPQSession(bytes(handshake.note), deriveEncryptionKeys(seed), mlkem.encapsKey, mlkem.decapsKey);
}

function key(where: Where, epoch: number): Uint8Array {
    return bytes(vector.rooms[where].keys[String(epoch)]);
}

function outcome(run: () => unknown): Expect {
    try {
        run();
        return 'accepted';
    } catch {
        return 'rejected';
    }
}

describe('Room key rotation and interrupted handout (REQ-protocol-15)', () => {
    test('the committed file is exactly what the regenerate command writes', () => {
        const directory = mkdtempSync(join(tmpdir(), 'room-rekey-'));
        const run = Bun.spawnSync([process.execPath, 'scripts/emit-room-rekey-vector.ts', directory], {
            cwd: new URL('../../', import.meta.url).pathname,
        });
        expect(run.exitCode).toBe(0);
        if (readFileSync(join(directory, FILE), 'utf8') !== readVectorText()) {
            throw new Error(`vectors/${FILE} differs from the TypeScript output; regenerate it with: ${REGENERATE}`);
        }
    });

    test('keys come from the seeds and the room and channel reduce to the recorded states', () => {
        expect(vector.batch_size).toBe(GROUP_DELIVER_BATCH);
        expect(names.length).toBe(19);
        for (const name of names) {
            const seed = bytes(vector.accounts[name].seed);
            expect(hex(ed25519.getPublicKey(seed)) === vector.accounts[name].address).toBe(true);
            expect(hex(deriveEncryptionKeys(seed).publicKey) === vector.accounts[name].x25519_public).toBe(true);
            expect(hex(deriveMLKEMKeyPair(seed).encapsKey) === vector.accounts[name].encaps_key).toBe(true);
        }
        expect(snapshot(room('remove member_b').state)).toEqual(vector.states.room_before_removal);
        expect(snapshot(room().state)).toEqual(vector.states.room);
        const before = channel('channel remove member_b', 'remove member_b').state;
        expect(snapshot(before)).toEqual(vector.states.channel_before_removal);
        expect(snapshot(channel().state)).toEqual(vector.states.channel);
        expect(channelDepartures(before, room().state).map(nameOf)).toEqual(vector.channel_departures);
    });

    test('every delivery opens for its member and is authorized; the removed member gets no new key', () => {
        const owner = address('owner');
        const seen = new Set<string>();
        for (const [index, item] of vector.deliveries.entries()) {
            const note = bytes(item.note);
            expect(note.length).toBe(227);
            const opened = openGroupKeyDelivery(note, session(item.recipient));
            expect(`delivery ${index}: ${hex(opened.groupKey)}`).toBe(`delivery ${index}: ${hex(key(item.room, item.epoch))}`);
            expect(hex(opened.groupId)).toBe(vector.rooms[item.room].group_id);
            expect(opened.epoch).toBe(item.epoch);
            expect(deliveryAuthorized(accepted(item.room), opened.adminTxId, owner, address(item.recipient), item.epoch)).toBe(true);
            const slot = `${item.room}/${item.epoch}/${item.recipient}`;
            expect(seen.has(slot)).toBe(false);
            seen.add(slot);
        }
        expect(seen.has('room/2/member_b') || seen.has('channel/2/member_b')).toBe(false);
    });

    test('an interrupted handout resumes only the missed, at most 16 at a time', () => {
        const owner = address('owner');
        for (const where of ['room', 'channel'] as Where[]) {
            const handout = vector.handouts[where];
            const recipients = authorizedRecipients(accepted(where), bytes(handout.admin_tx_id), owner, 2)
                .filter((item) => hex(item) !== hex(owner));
            expect(recipients.map(nameOf)).toEqual(handout.recipients);
            const first = nextDeliveryBatch(recipients);
            expect(first.length).toBeLessThanOrEqual(GROUP_DELIVER_BATCH);
            expect(first.map(nameOf)).toEqual(handout.first);
            expect(handout.landed).toEqual(handout.first.slice(0, -1));
            const pending = pendingKeyDeliveries(recipients, handout.landed.map(address));
            expect(pending.map(nameOf)).toEqual(handout.pending);
            expect(handout.pending[0]).toBe(handout.first[handout.first.length - 1]);
            expect(nextDeliveryBatch(pending).map(nameOf)).toEqual(handout.resumed);
            const sent = vector.deliveries.filter((item) => item.room === where && item.epoch === 2).map((item) => item.recipient);
            expect(sent).toEqual([...handout.landed, ...handout.resumed]);
        }
        expect(vector.handouts.room.recipients.length).toBe(17);
    });

    test('each message opens once, only under the key for its epoch', () => {
        const scopes = new Map<string, Array<{ epoch: number; counter: number }>>();
        const stateAt = (where: Where, epoch: number) => where === 'room'
            ? room(epoch === 1 ? 'remove member_b' : undefined).state
            : (epoch === 1 ? channel('channel remove member_b', 'remove member_b') : channel()).state;
        vector.messages.forEach((message, position) => {
            expect(message.index).toBe(position);
            const scopeKey = `${message.room}/${message.sender}`;
            const scope = scopes.get(scopeKey) ?? [];
            const opened = openGroupMessage(bytes(message.note), key(message.room, message.epoch), address(message.sender), scope);
            expect(`message ${position}: ${new TextDecoder().decode(opened.plaintext)}`).toBe(`message ${position}: ${message.plaintext}`);
            expect(senderMayPost(stateAt(message.room, message.epoch), address(message.sender), message.epoch)).toBe(true);
            const otherEpoch = message.epoch === 1 ? 2 : 1;
            expect(outcome(() => openGroupMessage(bytes(message.note), key(message.room, otherEpoch), address(message.sender), []))).toBe('rejected');
            scope.push({ epoch: opened.epoch, counter: opened.counter });
            scopes.set(scopeKey, scope);
        });
    });

    test('every case holds', () => {
        const owner = address('owner');
        const seen = new Set<string>();
        for (const item of vector.cases) {
            let actual: Expect;
            if (item.op === 'read') {
                const message = vector.messages[item.message];
                actual = outcome(() => openGroupMessage(bytes(message.note), key(item.room, item.key_epoch), address(message.sender), []));
            } else if (item.op === 'authorize') {
                expect(item.sender).toBe('owner');
                actual = deliveryAuthorized(accepted(item.room), bytes(item.admin_tx_id), owner, address(item.recipient), item.epoch) ? 'accepted' : 'rejected';
            } else if (item.op === 'may_post') {
                const state = item.room === 'room' ? room().state : channel().state;
                actual = senderMayPost(state, address(item.sender), item.epoch) ? 'accepted' : 'rejected';
            } else {
                throw new Error(`${(item as { name: string }).name}: unknown op`);
            }
            expect(`${item.name}: ${actual}`).toBe(`${item.name}: ${item.expect}`);
            seen.add(`${item.op} ${item.expect}`);
        }
        for (const op of ['read', 'authorize', 'may_post']) {
            for (const result of ['accepted', 'rejected']) expect(seen.has(`${op} ${result}`)).toBe(true);
        }
    });
});
