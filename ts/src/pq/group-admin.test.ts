import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { chacha20poly1305 } from '@noble/ciphers/chacha';
import { PQ_DATA_HEADER_SIZE, PQ_PROTOCOL, type PQSession } from './types.js';
import { openGroupMembership, openGroupMessage, sealGroupMessage } from './group.js';
import {
    ADMIN_OP,
    GROUP_ADMIN_MAX,
    GROUP_ADMIN_PROTOCOL,
    GROUP_DELIVER_BATCH,
    GROUP_MEMBER_MAX,
    GROUP_MEMBERS_OMITTED,
    GROUP_NAME_MAX,
    JOINING,
    authorizedRecipients,
    channelDepartures,
    deliveryAuthorized,
    draftAdmin,
    encodeAdminRecord,
    nextDeliveryBatch,
    openGroupKeyDelivery,
    pendingKeyDeliveries,
    reduceAdmin,
    sealGroupKeyDelivery,
    senderMayPost,
    type AdminEvent,
    type RoomState,
} from './group-admin.js';

const owner = addr(1);
const friend = addr(2);
const stranger = addr(3);
const mailbox = addr(9);
const groupId = addr(7);
function addr(byte: number): Uint8Array {
    return new Uint8Array(32).fill(byte);
}

function person(id: number): Uint8Array {
    const out = new Uint8Array(32);
    out[0] = (id >>> 24) & 0xff;
    out[1] = (id >>> 16) & 0xff;
    out[2] = (id >>> 8) & 0xff;
    out[3] = id & 0xff;
    return out;
}

function marked(note: Uint8Array, sender: Uint8Array, n: number): AdminEvent {
    return { note, sender, txId: person(10_000 + n), round: n, offset: 0 };
}

function same(left: Uint8Array, right: Uint8Array): boolean {
    return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

function event(note: Uint8Array, sender: Uint8Array, tx: number, round = 1, offset = 0): AdminEvent {
    return { note, sender, txId: addr(tx), round, offset };
}

function create(policy: number = JOINING.INVITE, name = 'team'): { state: RoomState; txId: Uint8Array } {
    const note = draftAdmin(null, { op: ADMIN_OP.CREATE, sender: owner, name: bytes(name), policy, groupId, mailbox });
    const reduced = reduceAdmin([event(note, owner, 10)]);
    if (!reduced.state) throw new Error(reduced.rejected[0]?.reason ?? 'create failed');
    return { state: reduced.state, txId: addr(10) };
}

function bytes(text: string): Uint8Array {
    return new TextEncoder().encode(text);
}

function withPolicy(note: Uint8Array, policy: number): Uint8Array {
    const out = note.slice();
    const nameLen = out[103] ?? 0;
    out[104 + nameLen] = policy;
    return out;
}

function sealRaw(session: PQSession, plaintext: Uint8Array, version: number, nonce: Uint8Array): Uint8Array {
    const header = new Uint8Array(PQ_DATA_HEADER_SIZE);
    header[0] = version;
    header[1] = 0x06;
    header.set(session.senderPublicKey, 2);
    header.set(session.handshakeId, 34);
    header.set(nonce, 66);
    const sealed = chacha20poly1305(session.sessionKey, nonce, header).encrypt(plaintext);
    const out = new Uint8Array(header.length + sealed.length);
    out.set(header);
    out.set(sealed, header.length);
    return out;
}

describe('room administration', () => {
    test('create makes the sender the only owner and mints nothing', () => {
        const note = draftAdmin(null, { op: ADMIN_OP.CREATE, sender: owner, name: bytes('team'), policy: JOINING.INVITE, groupId, mailbox });
        expect(note[1]).toBe(GROUP_ADMIN_PROTOCOL);
        expect(note.includes(0x4e)).toBe(false);
        const reduced = reduceAdmin([event(note, owner, 10)]);
        expect(reduced.rejected).toHaveLength(0);
        expect(reduced.state?.epoch).toBe(1);
        expect(reduced.state?.members).toHaveLength(1);
        expect(reduced.state?.policy).toBe(JOINING.INVITE);
    });

    test('a signature or the mailbox key does not grant administration', () => {
        const { state } = create();
        const forged = draftAdmin(state, { op: ADMIN_OP.ADD_MEMBER, sender: owner, subject: friend });
        const reduced = reduceAdmin([
            event(draftAdmin(null, { op: ADMIN_OP.CREATE, sender: owner, name: bytes('team'), policy: JOINING.INVITE, groupId, mailbox }), owner, 10),
            event(forged, stranger, 11, 2, 0),
            event(forged, mailbox, 12, 2, 1),
        ]);
        expect(reduced.state?.members).toHaveLength(1);
        expect(reduced.rejected.map((item) => item.reason).join(' ')).toContain('cannot add');
    });

    test('invite-only add does not rotate, and a stranger cannot request', () => {
        const created = create(JOINING.INVITE);
        const add = draftAdmin(created.state, { op: ADMIN_OP.ADD_MEMBER, sender: owner, subject: friend });
        expect(() => draftAdmin(created.state, { op: ADMIN_OP.REQUEST_JOIN, sender: stranger, subject: stranger })).toThrow(/not allowed/);
        const reduced = reduceAdmin([
            event(draftAdmin(null, { op: ADMIN_OP.CREATE, sender: owner, name: bytes('team'), policy: JOINING.INVITE, groupId, mailbox }), owner, 10),
            event(add, owner, 11, 2),
        ]);
        expect(reduced.state?.epoch).toBe(1);
        expect(reduced.state?.members).toHaveLength(2);
        expect(reduced.rejected).toHaveLength(0);
        expect(deliveryAuthorized(reduced.accepted, addr(11), owner, friend, 1)).toBe(true);
        expect(deliveryAuthorized(reduced.accepted, addr(11), owner, stranger, 1)).toBe(false);
    });

    test('ask-to-join accepts one person and can decline another', () => {
        const created = create(JOINING.ASK, 'general');
        const base = [event(draftAdmin(null, {
            op: ADMIN_OP.CREATE, sender: owner, name: bytes('general'), policy: JOINING.ASK, groupId, mailbox,
        }), owner, 10)];
        const asking = reduceAdmin([
            ...base,
            event(draftAdmin(created.state, { op: ADMIN_OP.REQUEST_JOIN, sender: friend, subject: friend }), friend, 11, 2),
            event(draftAdmin(created.state, { op: ADMIN_OP.REQUEST_JOIN, sender: stranger, subject: stranger }), stranger, 12, 3),
        ]);
        const acceptedJoin = reduceAdmin([
            ...base,
            event(draftAdmin(created.state, { op: ADMIN_OP.REQUEST_JOIN, sender: friend, subject: friend }), friend, 11, 2),
            event(draftAdmin(created.state, { op: ADMIN_OP.REQUEST_JOIN, sender: stranger, subject: stranger }), stranger, 12, 3),
            event(draftAdmin(asking.state, { op: ADMIN_OP.ACCEPT_JOIN, sender: owner, subject: friend }), owner, 13, 4),
        ]);
        const accepted = reduceAdmin([
            ...base,
            event(draftAdmin(created.state, { op: ADMIN_OP.REQUEST_JOIN, sender: friend, subject: friend }), friend, 11, 2),
            event(draftAdmin(created.state, { op: ADMIN_OP.REQUEST_JOIN, sender: stranger, subject: stranger }), stranger, 12, 3),
            event(draftAdmin(asking.state, { op: ADMIN_OP.ACCEPT_JOIN, sender: owner, subject: friend }), owner, 13, 4),
            event(draftAdmin(acceptedJoin.state, { op: ADMIN_OP.DECLINE_JOIN, sender: owner, subject: stranger }), owner, 14, 5),
        ]);
        expect(accepted.state?.members.map((item) => item[0]).sort()).toEqual([1, 2]);
        expect(accepted.state?.pending).toHaveLength(0);
        expect(accepted.state?.epoch).toBe(1);
    });

    test('the earlier conflicting update wins and a copy is rejected', () => {
        const created = create();
        const first = draftAdmin(created.state, { op: ADMIN_OP.ADD_MEMBER, sender: owner, subject: friend });
        const second = draftAdmin(created.state, { op: ADMIN_OP.SET_NAME, sender: owner, name: bytes('later') });
        const createNote = draftAdmin(null, { op: ADMIN_OP.CREATE, sender: owner, name: bytes('team'), policy: JOINING.INVITE, groupId, mailbox });
        const forward = reduceAdmin([
            event(createNote, owner, 10, 1, 0),
            event(second, owner, 12, 2, 1),
            event(first, owner, 11, 2, 0),
        ]);
        const backward = reduceAdmin([
            event(first, owner, 11, 2, 0),
            event(createNote, owner, 10, 1, 0),
            event(second, owner, 12, 2, 1),
            event(first, owner, 11, 2, 0),
        ]);
        expect(forward.state?.members).toHaveLength(2);
        expect(forward.state?.name).toEqual(bytes('team'));
        expect(forward.rejected.some((item) => item.reason.toLowerCase().includes('stale'))).toBe(true);
        expect(backward.state?.members).toHaveLength(2);
        expect(backward.rejected.some((item) => item.reason === 'replay')).toBe(true);
    });

    test('removal rotates, withholds the new key, and leaves the old message readable', () => {
        const created = create();
        const createNote = draftAdmin(null, { op: ADMIN_OP.CREATE, sender: owner, name: bytes('team'), policy: JOINING.INVITE, groupId, mailbox });
        const add = draftAdmin(created.state, { op: ADMIN_OP.ADD_MEMBER, sender: owner, subject: friend });
        const added = reduceAdmin([
            event(createNote, owner, 10),
            event(add, owner, 11, 2),
        ]);
        const oldKey = addr(4);
        const oldMessage = sealGroupMessage(bytes('before'), oldKey, groupId, 1, 0, friend, addr(8).slice(0, 12));
        const removed = reduceAdmin([
            ...added.accepted.map((item) => event(
                item.op === ADMIN_OP.CREATE ? createNote : add,
                item.sender,
                item.txId[0],
                item.op === ADMIN_OP.CREATE ? 1 : 2,
            )),
            event(draftAdmin(added.state, { op: ADMIN_OP.REMOVE_MEMBER, sender: owner, subject: friend }), owner, 13, 3),
        ]);
        expect(removed.state?.epoch).toBe(2);
        expect(senderMayPost(added.state!, friend, 1)).toBe(true);
        expect(senderMayPost(removed.state!, friend, 2)).toBe(false);
        expect(senderMayPost(removed.state!, owner, 1)).toBe(false);
        expect(senderMayPost(removed.state!, owner, 2)).toBe(true);
        expect(deliveryAuthorized(removed.accepted, addr(13), owner, friend, 2)).toBe(false);
        expect(deliveryAuthorized(removed.accepted, addr(13), owner, owner, 2)).toBe(true);
        const opened = openGroupMessage(oldMessage, oldKey, friend, []);
        expect(new TextDecoder().decode(opened.plaintext)).toBe('before');
    });

    test('ownership transfer rotates and an admin cannot appoint', () => {
        const created = create();
        const createNote = draftAdmin(null, { op: ADMIN_OP.CREATE, sender: owner, name: bytes('team'), policy: JOINING.INVITE, groupId, mailbox });
        const add = draftAdmin(created.state, { op: ADMIN_OP.ADD_MEMBER, sender: owner, subject: friend });
        const withFriend = reduceAdmin([event(createNote, owner, 10), event(add, owner, 11, 2)]);
        const appoint = draftAdmin(withFriend.state, { op: ADMIN_OP.APPOINT_ADMIN, sender: owner, subject: friend });
        const appointed = reduceAdmin([
            event(createNote, owner, 10),
            event(add, owner, 11, 2),
            event(appoint, owner, 14, 3),
        ]);
        expect(() => draftAdmin(appointed.state, { op: ADMIN_OP.APPOINT_ADMIN, sender: friend, subject: stranger })).toThrow(/owner/);
        expect(() => draftAdmin(appointed.state, { op: ADMIN_OP.TRANSFER_OWNER, sender: owner, subject: stranger })).toThrow(/member/);
        const forgedAppoint = encodeAdminRecord({
            parent: appointed.state!.headTxId,
            groupId,
            mailbox,
            epoch: 1,
            op: ADMIN_OP.APPOINT_ADMIN,
            name: bytes('team'),
            policy: JOINING.INVITE,
            owner,
            admins: [friend, stranger],
            members: [owner, friend],
            subject: stranger,
        });
        const transferred = reduceAdmin([
            event(createNote, owner, 10),
            event(add, owner, 11, 2),
            event(appoint, owner, 14, 3),
            event(forgedAppoint, friend, 15, 4),
            event(draftAdmin(appointed.state, { op: ADMIN_OP.TRANSFER_OWNER, sender: owner, subject: friend }), owner, 16, 5),
        ]);
        expect(transferred.rejected.some((item) => item.txId[0] === 15)).toBe(true);
        expect(transferred.state?.owner).toEqual(friend);
        expect(transferred.state?.epoch).toBe(2);
        expect(transferred.state?.members.map((item) => item[0]).sort()).toEqual([1, 2]);
    });

    test('two rooms do not share a message', () => {
        const team = create(JOINING.INVITE, 'team');
        const generalId = addr(8);
        const generalMail = addr(6);
        const general = reduceAdmin([event(draftAdmin(null, {
            op: ADMIN_OP.CREATE, sender: owner, name: bytes('general'), policy: JOINING.ASK, groupId: generalId, mailbox: generalMail,
        }), owner, 20)]);
        expect(team.state.groupId).not.toEqual(general.state?.groupId);
        const note = sealGroupMessage(bytes('secret'), addr(4), team.state.groupId, 1, 0, owner, addr(8).slice(0, 12));
        expect(() => openGroupMessage(note, addr(4), owner, [])).not.toThrow();
        expect(senderMayPost(general.state!, owner, 1)).toBe(true);
        expect(general.state?.groupId).toEqual(generalId);
    });

    test('legacy group-v1 notes still open and do not create an owner', () => {
        const vector = JSON.parse(readFileSync(new URL('../../../vectors/group-v1.json', import.meta.url), 'utf8')) as {
            membership_note: string;
            message_note: string;
            session_key: string;
            sender_x25519: string;
            handshake_id: string;
            group_key: string;
            sender_address: string;
            plaintext_utf8: string;
        };
        const session: PQSession = {
            sessionKey: hex(vector.session_key),
            senderPublicKey: hex(vector.sender_x25519),
            recipientPublicKey: new Uint8Array(32),
            handshakeId: hex(vector.handshake_id),
        };
        const membership = openGroupMembership(hex(vector.membership_note), session);
        expect(membership.action).toBe(1);
        const opened = openGroupMessage(hex(vector.message_note), hex(vector.group_key), hex(vector.sender_address), []);
        expect(new TextDecoder().decode(opened.plaintext)).toBe(vector.plaintext_utf8);
        const delivered = sealGroupKeyDelivery(session, 1, groupId, mailbox, addr(4), addr(10), new Uint8Array(12));
        expect(delivered[1]).toBe(0x06);
        expect(delivered.length).not.toBe(hex(vector.membership_note).length);
        expect(openGroupKeyDelivery(delivered, session).adminTxId).toEqual(addr(10));
        expect(PQ_PROTOCOL.VERSION).toBe(0x02);
    });

    test('group-admin-v1 vector matches this reducer', () => {
        const vector = JSON.parse(readFileSync(new URL('../../../vectors/group-admin-v1.json', import.meta.url), 'utf8')) as {
            drafts: {
                basis_state: Parameters<typeof revive>[0];
                op: number;
                sender: string;
                subject: string;
                name_utf8: string | null;
                policy: number | null;
                group_id: string | null;
                mailbox: string | null;
                note: string;
            }[];
            draft_errors: {
                basis_state: Parameters<typeof revive>[0];
                op: number;
                sender: string;
                subject: string;
                error_includes: string;
            }[];
            reductions: Record<string, {
                events: { note: string; sender: string; tx_id: string; round: number; offset: number }[];
                accepted: { op: number }[];
                rejected: { reason: string }[];
                state: ReturnType<typeof snap>;
            }>;
            checks: {
                delivery_authorized: { reduction: string; admin_tx_id: string; sender: string; recipient: string; epoch: number; allowed: boolean }[];
                may_post: { reduction: string; sender: string; epoch: number; allowed: boolean }[];
            };
            delivery: {
                session_key: string;
                sender_x25519: string;
                handshake_id: string;
                nonce: string;
                epoch: number;
                group_id: string;
                mailbox: string;
                group_key: string;
                admin_tx_id: string;
                note: string;
            };
        };
        for (const draft of vector.drafts) {
            const stored = hex(draft.note);
            expect(stored[0]).toBe(0x02);
            expect(stored[1]).toBe(GROUP_ADMIN_PROTOCOL);
            const nameLen = stored[103] ?? 0;
            const adminCount = ((stored[137 + nameLen] ?? 0) << 8) | (stored[138 + nameLen] ?? 0);
            const memberAt = 139 + nameLen + (32 * adminCount);
            const memberCount = ((stored[memberAt] ?? 0) << 8) | (stored[memberAt + 1] ?? 0);
            expect(memberCount).not.toBe(GROUP_MEMBERS_OMITTED);
            expect(memberCount).toBeLessThanOrEqual(100);
            const delta = draftAdmin(revive(draft.basis_state), {
                op: draft.op,
                sender: hex(draft.sender),
                subject: hex(draft.subject),
                name: draft.name_utf8 === null ? undefined : bytes(draft.name_utf8),
                policy: draft.policy ?? undefined,
                groupId: draft.group_id ? hex(draft.group_id) : undefined,
                mailbox: draft.mailbox ? hex(draft.mailbox) : undefined,
            });
            expect(delta.length).toBeLessThanOrEqual(4096);
            const deltaName = delta[103] ?? 0;
            const deltaAdmins = ((delta[137 + deltaName] ?? 0) << 8) | (delta[138 + deltaName] ?? 0);
            const deltaAt = 139 + deltaName + (32 * deltaAdmins);
            expect(((delta[deltaAt] ?? 0) << 8) | (delta[deltaAt + 1] ?? 0)).toBe(GROUP_MEMBERS_OMITTED);
        }
        for (const item of vector.draft_errors) {
            expect(() => draftAdmin(revive(item.basis_state), {
                op: item.op,
                sender: hex(item.sender),
                subject: hex(item.subject),
            })).toThrow(new RegExp(item.error_includes, 'i'));
        }
        const reduced = new Map<string, ReturnType<typeof reduceAdmin>>();
        for (const [name, reduction] of Object.entries(vector.reductions)) {
            const result = reduceAdmin(reduction.events.map((item) => ({
                note: hex(item.note),
                sender: hex(item.sender),
                txId: hex(item.tx_id),
                round: item.round,
                offset: item.offset,
            })));
            reduced.set(name, result);
            expect(result.rejected.map((item) => item.reason)).toEqual(reduction.rejected.map((item) => item.reason));
            expect(result.accepted.map((item) => item.op)).toEqual(reduction.accepted.map((item) => item.op));
            expect(snap(result.state)).toEqual(reduction.state);
        }
        for (const check of vector.checks.delivery_authorized) {
            const result = reduced.get(check.reduction);
            expect(deliveryAuthorized(result!.accepted, hex(check.admin_tx_id), hex(check.sender), hex(check.recipient), check.epoch)).toBe(check.allowed);
        }
        for (const check of vector.checks.may_post) {
            expect(senderMayPost(reduced.get(check.reduction)!.state!, hex(check.sender), check.epoch)).toBe(check.allowed);
        }
        const session: PQSession = {
            sessionKey: hex(vector.delivery.session_key),
            senderPublicKey: hex(vector.delivery.sender_x25519),
            recipientPublicKey: new Uint8Array(32),
            handshakeId: hex(vector.delivery.handshake_id),
        };
        const sealed = sealGroupKeyDelivery(
            session,
            vector.delivery.epoch,
            hex(vector.delivery.group_id),
            hex(vector.delivery.mailbox),
            hex(vector.delivery.group_key),
            hex(vector.delivery.admin_tx_id),
            hex(vector.delivery.nonce),
        );
        expect(toHex(sealed)).toBe(vector.delivery.note);
        expect(toHex(openGroupKeyDelivery(sealed, session).groupKey)).toBe(vector.delivery.group_key);
    });

    test('action 5 binds version 0x02, the supplied session, and a positive epoch', () => {
        const session: PQSession = {
            sessionKey: addr(0x42),
            senderPublicKey: addr(0x11),
            recipientPublicKey: new Uint8Array(32),
            handshakeId: addr(0x43),
        };
        const nonce = new Uint8Array(12).fill(0x55);
        const note = sealGroupKeyDelivery(session, 1, groupId, mailbox, addr(4), addr(10), nonce);
        expect(openGroupKeyDelivery(note, session).adminTxId).toEqual(addr(10));
        expect(() => openGroupKeyDelivery(note, { ...session, senderPublicKey: addr(0x22) })).toThrow(/sender/);
        expect(() => openGroupKeyDelivery(note, { ...session, handshakeId: addr(0x44) })).toThrow(/handshake/);
        const flipped = note.slice();
        flipped[flipped.length - 1] ^= 1;
        expect(() => openGroupKeyDelivery(flipped, session)).toThrow(/authentication/);
        const plain = new Uint8Array(133);
        plain[0] = 5;
        plain.set(groupId, 5);
        plain.set(mailbox, 37);
        plain.set(addr(4), 69);
        plain.set(addr(10), 101);
        for (const version of [0, 1, 3, 255]) {
            expect(() => openGroupKeyDelivery(sealRaw(session, plain, version, nonce), session)).toThrow(/Not a group key delivery/);
        }
        expect(() => openGroupKeyDelivery(sealRaw(session, plain, PQ_PROTOCOL.VERSION, nonce), session)).toThrow(/epoch/);
    });

    test('undefined joining policies are rejected and leave the room unchanged', () => {
        const createNote = draftAdmin(null, {
            op: ADMIN_OP.CREATE, sender: owner, name: bytes('team'), policy: JOINING.INVITE, groupId, mailbox,
        });
        for (const policy of [0, 3, 255]) {
            const reduced = reduceAdmin([event(withPolicy(createNote, policy), owner, 10)]);
            expect(reduced.state).toBeNull();
            expect(reduced.accepted).toHaveLength(0);
            expect(reduced.rejected[0]?.reason).toMatch(/invite-only or ask-to-join/);
        }
        const created = reduceAdmin([event(createNote, owner, 10)]);
        const setPolicy = draftAdmin(created.state, { op: ADMIN_OP.SET_POLICY, sender: owner, policy: JOINING.ASK });
        for (const policy of [0, 3, 255]) {
            const reduced = reduceAdmin([
                event(createNote, owner, 10),
                event(withPolicy(setPolicy, policy), owner, 11, 2),
            ]);
            expect(reduced.state?.policy).toBe(JOINING.INVITE);
            expect(reduced.state?.headTxId).toEqual(addr(10));
            expect(reduced.rejected).toHaveLength(1);
            expect(reduced.rejected[0]?.reason).toMatch(/invite-only or ask-to-join/);
        }
    });

    test('a join request must cite an accepted administration transaction, not the zero parent', () => {
        const createNote = draftAdmin(null, {
            op: ADMIN_OP.CREATE, sender: owner, name: bytes('general'), policy: JOINING.ASK, groupId, mailbox,
        });
        const created = reduceAdmin([event(createNote, owner, 10)]);
        const real = draftAdmin(created.state, { op: ADMIN_OP.REQUEST_JOIN, sender: friend, subject: friend });
        const zero = real.slice();
        zero.set(new Uint8Array(32), 2);
        const unknown = real.slice();
        unknown.set(addr(0x99), 2);
        const base = [event(createNote, owner, 10)];
        const zeroed = reduceAdmin([...base, event(zero, friend, 11, 2)]);
        expect(zeroed.state?.epoch).toBe(1);
        expect(zeroed.state?.pending).toHaveLength(0);
        expect(zeroed.state?.headTxId).toEqual(addr(10));
        expect(zeroed.rejected[0]?.reason).toMatch(/cite/);
        const missed = reduceAdmin([...base, event(unknown, friend, 11, 2)]);
        expect(missed.state?.pending).toHaveLength(0);
        expect(missed.state?.policy).toBe(JOINING.ASK);
        expect(missed.rejected[0]?.reason).toMatch(/cite/);
        const accepted = reduceAdmin([...base, event(real, friend, 11, 2)]);
        expect(accepted.rejected).toHaveLength(0);
        expect(accepted.state?.pending).toEqual([friend]);
        expect(accepted.state?.headTxId).toEqual(addr(10));
    });

    test('a full-list note of 256 members is too large, and a delta note folds through 256', () => {
        const roster = Array.from({ length: 256 }, (_, index) => person(index + 1));
        const admins = Array.from({ length: GROUP_ADMIN_MAX }, (_, index) => person(1000 + index));
        expect(GROUP_MEMBER_MAX).toBe(256);
        expect(GROUP_NAME_MAX).toBe(64);
        expect(GROUP_ADMIN_MAX).toBe(16);
        expect(() => encodeAdminRecord({
            parent: new Uint8Array(32),
            groupId,
            mailbox,
            epoch: 1,
            op: ADMIN_OP.CREATE,
            name: new Uint8Array(GROUP_NAME_MAX),
            policy: JOINING.INVITE,
            owner: roster[0]!,
            admins,
            members: roster,
            subject: new Uint8Array(32),
            membersOmitted: false,
        })).toThrow(/too large/);

        const legacy = encodeAdminRecord({
            parent: new Uint8Array(32),
            groupId,
            mailbox,
            epoch: 1,
            op: ADMIN_OP.CREATE,
            name: bytes('team'),
            policy: JOINING.INVITE,
            owner,
            admins: [],
            members: [owner],
            subject: new Uint8Array(32),
            membersOmitted: false,
        });
        const legacyRoom = reduceAdmin([event(legacy, owner, 10)]);
        expect(legacyRoom.rejected).toHaveLength(0);
        expect(legacyRoom.state?.members).toHaveLength(1);
        const legacyAdd = draftAdmin(legacyRoom.state, { op: ADMIN_OP.ADD_MEMBER, sender: owner, subject: friend });
        const legacyGrown = reduceAdmin([event(legacy, owner, 10), event(legacyAdd, owner, 11, 2)]);
        expect(legacyGrown.rejected).toHaveLength(0);
        expect(legacyGrown.state?.members).toHaveLength(2);

        const hallId = person(900);
        const hallMail = person(901);
        const hallOwner = person(1);
        const events: AdminEvent[] = [];
        const createdNote = draftAdmin(null, {
            op: ADMIN_OP.CREATE,
            sender: hallOwner,
            name: bytes('hall'),
            policy: JOINING.INVITE,
            groupId: hallId,
            mailbox: hallMail,
        });
        events.push(marked(createdNote, hallOwner, 1));
        let reduced = reduceAdmin(events);
        expect(reduced.rejected).toHaveLength(0);
        expect(reduced.state?.members).toHaveLength(1);
        for (let count = 2; count <= 256; count += 1) {
            const note = draftAdmin(reduced.state, {
                op: ADMIN_OP.ADD_MEMBER,
                sender: hallOwner,
                subject: person(count),
            });
            expect(note.length).toBeLessThanOrEqual(4096);
            const nameLen = note[103] ?? 0;
            const adminCount = ((note[137 + nameLen] ?? 0) << 8) | (note[138 + nameLen] ?? 0);
            const at = 139 + nameLen + (32 * adminCount);
            expect(((note[at] ?? 0) << 8) | (note[at + 1] ?? 0)).toBe(GROUP_MEMBERS_OMITTED);
            events.push(marked(note, hallOwner, count));
            reduced = reduceAdmin(events);
            expect(reduced.rejected).toHaveLength(0);
            if (count === 101) expect(reduced.state?.members).toHaveLength(101);
        }
        expect(reduced.state?.members).toHaveLength(256);
        expect(reduced.state?.epoch).toBe(1);
    });

    test('a channel keeps its own roster, and a missed key payment can resume', () => {
        const parentId = person(700);
        const parentMail = person(701);
        const channelId = person(702);
        const channelMail = person(703);
        const alice = person(2);
        const bob = person(3);
        const cara = person(4);
        const extra = Array.from({ length: 16 }, (_, index) => person(20 + index));
        const parentCreate = draftAdmin(null, {
            op: ADMIN_OP.CREATE, sender: owner, name: bytes('hall'), policy: JOINING.INVITE, groupId: parentId, mailbox: parentMail,
        });
        let parentEvents = [event(parentCreate, owner, 10)];
        let parent = reduceAdmin(parentEvents);
        for (const [index, member] of [alice, bob, cara, ...extra].entries()) {
            const note = draftAdmin(parent.state, { op: ADMIN_OP.ADD_MEMBER, sender: owner, subject: member });
            parentEvents.push(event(note, owner, 11 + index, index + 2));
            parent = reduceAdmin(parentEvents);
        }
        expect(parent.rejected).toHaveLength(0);
        expect(parent.state?.members.length).toBe(1 + 3 + extra.length);

        expect(() => draftAdmin(null, {
            op: ADMIN_OP.CREATE, sender: alice, name: bytes('ops'), policy: JOINING.INVITE,
            groupId: channelId, mailbox: channelMail, parentRoom: parent.state,
        })).toThrow(/group owner/);

        const channelCreate = draftAdmin(null, {
            op: ADMIN_OP.CREATE, sender: owner, name: bytes('ops'), policy: JOINING.INVITE,
            groupId: channelId, mailbox: channelMail, parentRoom: parent.state,
        });
        let channelEvents = [event(channelCreate, owner, 80, 30)];
        let channel = reduceAdmin(channelEvents, parentEvents);
        expect(channel.rejected).toHaveLength(0);
        expect(channel.state?.members).toHaveLength(1);
        expect(channel.state?.parentGroupId).toEqual(parentId);
        expect(channel.state?.groupId).toEqual(channelId);
        expect(channel.state?.mailbox).toEqual(channelMail);
        expect(channel.state?.groupId).not.toEqual(parent.state?.groupId);

        for (const [index, member] of [alice, bob, ...extra].entries()) {
            const note = draftAdmin(channel.state, {
                op: ADMIN_OP.ADD_MEMBER, sender: owner, subject: member, parentRoom: parent.state,
            });
            channelEvents.push(event(note, owner, 81 + index, 31 + index));
            channel = reduceAdmin(channelEvents, parentEvents);
        }
        expect(channel.rejected).toHaveLength(0);
        expect(channel.state?.members.some((item) => same(item, cara))).toBe(false);
        expect(channel.state?.members.some((item) => same(item, alice))).toBe(true);
        expect(() => draftAdmin(channel.state, {
            op: ADMIN_OP.ADD_MEMBER, sender: owner, subject: person(500), parentRoom: parent.state,
        })).toThrow(/parent room/);
        expect(() => draftAdmin(channel.state, {
            op: ADMIN_OP.TRANSFER_OWNER, sender: owner, subject: bob, parentRoom: parent.state,
        })).toThrow(/group owner keeps/);

        const parentRemove = draftAdmin(parent.state, { op: ADMIN_OP.REMOVE_MEMBER, sender: owner, subject: alice });
        parentEvents = [...parentEvents, event(parentRemove, owner, 60, 80)];
        parent = reduceAdmin(parentEvents);
        expect(parent.state?.epoch).toBe(2);
        expect(senderMayPost(parent.state!, alice, 2)).toBe(false);
        const stale = reduceAdmin(channelEvents, parentEvents);
        expect(stale.state?.members.some((item) => same(item, alice))).toBe(true);
        expect(channelDepartures(stale.state!, parent.state!).map((item) => item[3])).toEqual([alice[3]]);

        const channelRemove = draftAdmin(stale.state, {
            op: ADMIN_OP.REMOVE_MEMBER, sender: owner, subject: alice, parentRoom: parent.state,
        });
        channelEvents = [...channelEvents, event(channelRemove, owner, 120, 90)];
        channel = reduceAdmin(channelEvents, parentEvents);
        expect(channel.rejected).toHaveLength(0);
        expect(channel.state?.epoch).toBe(2);
        expect(channel.state?.members.some((item) => same(item, alice))).toBe(false);
        const removeTx = channel.accepted[channel.accepted.length - 1]!;
        expect(deliveryAuthorized(channel.accepted, removeTx.txId, owner, alice, 2)).toBe(false);
        expect(deliveryAuthorized(channel.accepted, removeTx.txId, bob, bob, 2)).toBe(false);
        const recipients = authorizedRecipients(channel.accepted, removeTx.txId, owner, 2);
        expect(recipients.some((item) => same(item, alice))).toBe(false);
        expect(recipients.some((item) => same(item, bob))).toBe(true);
        expect(recipients.length).toBeGreaterThan(GROUP_DELIVER_BATCH);
        const batch = nextDeliveryBatch(recipients);
        expect(batch).toHaveLength(GROUP_DELIVER_BATCH);
        const missed = batch[batch.length - 1]!;
        const landed = batch.slice(0, -1);
        const pending = pendingKeyDeliveries(recipients, landed);
        expect(pending.some((item) => same(item, missed))).toBe(true);
        expect(nextDeliveryBatch(pending)[0]).toEqual(missed);
        const resumed = [...landed, missed];
        expect(pendingKeyDeliveries(recipients, resumed).some((item) => same(item, missed))).toBe(false);
        expect(pendingKeyDeliveries(recipients, resumed).length).toBe(recipients.length - resumed.length);
    });

    test('group-admin-delta-v1 vector matches the frozen delta bytes', () => {
        const vector = JSON.parse(readFileSync(new URL('../../../vectors/group-admin-delta-v1.json', import.meta.url), 'utf8')) as {
            constants: { member_max: number; members_omitted: number; deliver_batch: number };
            drafts: {
                basis_state: Parameters<typeof revive>[0];
                parent_room: Parameters<typeof revive>[0];
                op: number;
                sender: string;
                subject: string;
                name_utf8: string | null;
                policy: number | null;
                group_id: string | null;
                mailbox: string | null;
                note: string;
            }[];
            reductions: Record<string, {
                parent_events?: { note: string; sender: string; tx_id: string; round: number; offset: number }[];
                events: { note: string; sender: string; tx_id: string; round: number; offset: number }[];
                accepted: { op: number }[];
                rejected: { reason: string }[];
                state: ReturnType<typeof snapParent>;
            }>;
        };
        expect(vector.constants.member_max).toBe(GROUP_MEMBER_MAX);
        expect(vector.constants.members_omitted).toBe(GROUP_MEMBERS_OMITTED);
        expect(vector.constants.deliver_batch).toBe(GROUP_DELIVER_BATCH);
        for (const draft of vector.drafts) {
            const note = draftAdmin(revive(draft.basis_state), {
                op: draft.op,
                sender: hex(draft.sender),
                subject: hex(draft.subject),
                name: draft.name_utf8 === null ? undefined : bytes(draft.name_utf8),
                policy: draft.policy ?? undefined,
                groupId: draft.group_id ? hex(draft.group_id) : undefined,
                mailbox: draft.mailbox ? hex(draft.mailbox) : undefined,
                parentRoom: revive(draft.parent_room),
            });
            expect(toHex(note)).toBe(draft.note);
        }
        for (const reduction of Object.values(vector.reductions)) {
            const result = reduceAdmin(
                reduction.events.map(wireEvent),
                reduction.parent_events?.map(wireEvent),
            );
            expect(result.rejected.map((item) => item.reason)).toEqual(reduction.rejected.map((item) => item.reason));
            expect(result.accepted.map((item) => item.op)).toEqual(reduction.accepted.map((item) => item.op));
            expect(snapParent(result.state)).toEqual(reduction.state);
        }
    });
});

function wireEvent(item: { note: string; sender: string; tx_id: string; round: number; offset: number }): AdminEvent {
    return { note: hex(item.note), sender: hex(item.sender), txId: hex(item.tx_id), round: item.round, offset: item.offset };
}

function revive(state: {
    group_id: string;
    mailbox: string;
    owner: string;
    admins: string[];
    members: string[];
    pending: string[];
    policy: number;
    name_hex: string;
    epoch: number;
    head_tx_id: string;
    parent_group_id?: string;
} | null): RoomState | null {
    if (!state) return null;
    return {
        groupId: hex(state.group_id),
        mailbox: hex(state.mailbox),
        parentGroupId: state.parent_group_id ? hex(state.parent_group_id) : new Uint8Array(32),
        owner: hex(state.owner),
        admins: state.admins.map((item) => hex(item)),
        members: state.members.map((item) => hex(item)),
        pending: state.pending.map((item) => hex(item)),
        policy: state.policy,
        name: hex(state.name_hex),
        epoch: state.epoch,
        headTxId: hex(state.head_tx_id),
    };
}

function snap(state: RoomState | null) {
    if (!state) return null;
    return {
        group_id: toHex(state.groupId),
        mailbox: toHex(state.mailbox),
        owner: toHex(state.owner),
        admins: state.admins.map((item) => toHex(item)),
        members: state.members.map((item) => toHex(item)),
        pending: state.pending.map((item) => toHex(item)),
        policy: state.policy,
        name_hex: toHex(state.name),
        epoch: state.epoch,
        head_tx_id: toHex(state.headTxId),
    };
}

function snapParent(state: RoomState | null) {
    if (!state) return null;
    return { ...snap(state), parent_group_id: toHex(state.parentGroupId) };
}

function toHex(value: Uint8Array): string {
    return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hex(value: string): Uint8Array {
    const out = new Uint8Array(value.length / 2);
    for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
    return out;
}
