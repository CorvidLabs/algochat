import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
    ADMIN_OP,
    BOT_MODE,
    BOT_RATE_PRESET,
    BOT_SETTINGS_SIZE,
    deliveryAuthorized,
    draftAdmin,
    encodeAdminRecord,
    reduceAdmin,
    roomBot,
    type AdminEvent,
    type BotSettings,
    type RoomState,
} from './group-admin.js';

interface WireEvent { note: string; sender: string; tx_id: string; round: number; offset: number }
interface WireBot { mode: number; replies: number; seconds: number }
interface WireState {
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
    parent_group_id: string;
    bots: (WireBot & { account: string })[];
}
interface WireDraft {
    name: string;
    basis_state: WireState | null;
    parent_room: WireState | null;
    op: number;
    sender: string;
    subject: string;
    name_utf8: string | null;
    policy: number | null;
    group_id: string | null;
    mailbox: string | null;
    bot: WireBot | null;
    note?: string;
    error_includes?: string;
}
interface BotsVector {
    constants: Record<string, number>;
    drafts: WireDraft[];
    draft_errors: WireDraft[];
    reductions: Record<string, {
        parent_events?: WireEvent[];
        events: WireEvent[];
        accepted: { op: number; tx_id: string; epoch: number; subject: string }[];
        rejected: { tx_id: string; reason: string }[];
        state: WireState | null;
    }>;
    checks: {
        delivery_authorized: { reduction: string; admin_tx_id: string; sender: string; recipient: string; epoch: number; allowed: boolean }[];
        room_bot: { reduction: string; account: string; bot: WireBot | null }[];
    };
}

const vector = JSON.parse(
    readFileSync(new URL('../../../vectors/group-admin-bots-v1.json', import.meta.url), 'utf8'),
) as BotsVector;

describe('room bots (ops 13 and 14)', () => {
    test('constants match the shared vector', () => {
        expect(vector.constants.op_add_bot).toBe(ADMIN_OP.ADD_BOT);
        expect(vector.constants.op_set_bot).toBe(ADMIN_OP.SET_BOT);
        expect(vector.constants.mode_mentions).toBe(BOT_MODE.MENTIONS);
        expect(vector.constants.mode_every_message).toBe(BOT_MODE.EVERY_MESSAGE);
        expect(vector.constants.mode_commands).toBe(BOT_MODE.COMMANDS);
        expect(vector.constants.settings_size).toBe(BOT_SETTINGS_SIZE);
        expect(vector.constants.preset_replies).toBe(BOT_RATE_PRESET.replies);
        expect(vector.constants.preset_seconds).toBe(BOT_RATE_PRESET.seconds);
    });

    test('drafts write the shared bytes', () => {
        for (const draft of vector.drafts) {
            expect(toHex(draftFrom(draft)), draft.name).toBe(draft.note!);
        }
    });

    test('drafts refuse every should-reject case', () => {
        for (const item of vector.draft_errors) {
            expect(() => draftFrom(item), item.name).toThrow(new RegExp(item.error_includes!, 'i'));
        }
    });

    test('reductions fold to the shared state with the same rejects', () => {
        for (const [name, reduction] of Object.entries(vector.reductions)) {
            const result = reduceAdmin(reduction.events.map(wireEvent), reduction.parent_events?.map(wireEvent));
            expect(result.rejected.map((item) => item.reason), name).toEqual(reduction.rejected.map((item) => item.reason));
            expect(result.rejected.map((item) => toHex(item.txId)), name).toEqual(reduction.rejected.map((item) => item.tx_id));
            expect(result.accepted.map((item) => item.op), name).toEqual(reduction.accepted.map((item) => item.op));
            expect(snap(result.state), name).toEqual(reduction.state);
        }
    });

    test('delivery and bot lookups match the shared checks', () => {
        for (const item of vector.checks.delivery_authorized) {
            const reduction = vector.reductions[item.reduction]!;
            const result = reduceAdmin(reduction.events.map(wireEvent), reduction.parent_events?.map(wireEvent));
            expect(deliveryAuthorized(result.accepted, hex(item.admin_tx_id), hex(item.sender), hex(item.recipient), item.epoch))
                .toBe(item.allowed);
        }
        for (const item of vector.checks.room_bot) {
            const reduction = vector.reductions[item.reduction]!;
            const state = reduceAdmin(reduction.events.map(wireEvent), reduction.parent_events?.map(wireEvent)).state!;
            const found = roomBot(state, hex(item.account));
            expect(found ? { mode: found.mode, replies: found.replies, seconds: found.seconds } : null).toEqual(item.bot);
        }
    });

    test('bot settings appear only on ops 13 and 14', () => {
        const base = {
            parent: new Uint8Array(32), groupId: new Uint8Array(32).fill(7), mailbox: new Uint8Array(32).fill(9), epoch: 1,
            name: new Uint8Array(), policy: 1, owner: new Uint8Array(32).fill(1), admins: [], members: [],
            subject: new Uint8Array(32).fill(5), membersOmitted: true,
        };
        const preset: BotSettings = { mode: BOT_MODE.MENTIONS, ...BOT_RATE_PRESET };
        expect(() => encodeAdminRecord({ ...base, op: ADMIN_OP.ADD_MEMBER, bot: preset })).toThrow(/Only a bot record/);
        expect(() => encodeAdminRecord({ ...base, op: ADMIN_OP.ADD_BOT })).toThrow(/needs a reply mode/);
        expect(() => encodeAdminRecord({ ...base, op: ADMIN_OP.ADD_BOT, bot: preset, membersOmitted: false })).toThrow(/delta note/);
        const note = encodeAdminRecord({ ...base, op: ADMIN_OP.ADD_BOT, bot: preset });
        expect(note.length).toBe(205 + BOT_SETTINGS_SIZE);
        expect(Array.from(note.slice(-BOT_SETTINGS_SIZE))).toEqual([1, 0, 5, 0, 60]);
    });
});

function draftFrom(draft: WireDraft): Uint8Array {
    return draftAdmin(revive(draft.basis_state), {
        op: draft.op,
        sender: hex(draft.sender),
        subject: hex(draft.subject),
        name: draft.name_utf8 === null ? undefined : new TextEncoder().encode(draft.name_utf8),
        policy: draft.policy ?? undefined,
        groupId: draft.group_id ? hex(draft.group_id) : undefined,
        mailbox: draft.mailbox ? hex(draft.mailbox) : undefined,
        parentRoom: revive(draft.parent_room),
        bot: draft.bot ?? undefined,
    });
}

function wireEvent(item: WireEvent): AdminEvent {
    return { note: hex(item.note), sender: hex(item.sender), txId: hex(item.tx_id), round: item.round, offset: item.offset };
}

function revive(state: WireState | null): RoomState | null {
    if (!state) return null;
    return {
        groupId: hex(state.group_id),
        mailbox: hex(state.mailbox),
        parentGroupId: hex(state.parent_group_id),
        owner: hex(state.owner),
        admins: state.admins.map(hex),
        members: state.members.map(hex),
        pending: state.pending.map(hex),
        policy: state.policy,
        name: hex(state.name_hex),
        epoch: state.epoch,
        headTxId: hex(state.head_tx_id),
        bots: state.bots.map((item) => ({ account: hex(item.account), mode: item.mode, replies: item.replies, seconds: item.seconds })),
    };
}

function snap(state: RoomState | null): WireState | null {
    if (!state) return null;
    return {
        group_id: toHex(state.groupId),
        mailbox: toHex(state.mailbox),
        owner: toHex(state.owner),
        admins: state.admins.map(toHex),
        members: state.members.map(toHex),
        pending: state.pending.map(toHex),
        policy: state.policy,
        name_hex: toHex(state.name),
        epoch: state.epoch,
        head_tx_id: toHex(state.headTxId),
        parent_group_id: toHex(state.parentGroupId),
        bots: (state.bots ?? []).map((item) => ({ account: toHex(item.account), mode: item.mode, replies: item.replies, seconds: item.seconds })),
    };
}

function toHex(value: Uint8Array): string {
    return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hex(value: string): Uint8Array {
    const out = new Uint8Array(value.length / 2);
    for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
    return out;
}
