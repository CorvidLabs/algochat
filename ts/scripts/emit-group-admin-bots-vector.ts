/**
 * Write vectors/group-admin-bots-v1.json from the TypeScript room reducer.
 * Run from ts/: bun scripts/emit-group-admin-bots-vector.ts
 * This file covers ops 13 (add bot) and 14 (set bot). It does not touch
 * vectors/group-admin-v1.json or vectors/group-admin-delta-v1.json.
 */
import { writeFileSync } from "node:fs";
import { encodeEnvelope } from "../src/crypto/envelope.js";
import {
    ADMIN_OP,
    BOT_MODE,
    BOT_RATE_PRESET,
    BOT_SETTINGS_SIZE,
    JOINING,
    channelDepartures,
    deliveryAuthorized,
    draftAdmin,
    encodeAdminRecord,
    reduceAdmin,
    roomBot,
    type AdminEvent,
    type BotSettings,
    type RoomState,
} from "../src/pq/group-admin.js";

const owner = addr(1);
const friend = addr(2);
const stranger = addr(3);
const bot = addr(5);
const mailbox = addr(9);
const groupId = addr(7);
const channelId = addr(0x21);
const channelMail = addr(0x22);
const zero = new Uint8Array(32);

const preset: BotSettings = { mode: BOT_MODE.MENTIONS, ...BOT_RATE_PRESET };
const quieter: BotSettings = { mode: BOT_MODE.COMMANDS, replies: 2, seconds: 300 };

function addr(byte: number): Uint8Array {
    return new Uint8Array(32).fill(byte);
}

function hex(value: Uint8Array): string {
    return Buffer.from(value).toString("hex");
}

function bytes(text: string): Uint8Array {
    return new TextEncoder().encode(text);
}

function event(note: Uint8Array, sender: Uint8Array, tx: number, round: number, offset = 0): AdminEvent {
    return { note, sender, txId: addr(tx), round, offset };
}

interface WireEvent { note: string; sender: string; tx_id: string; round: number; offset: number }

function unwire(e: WireEvent): AdminEvent {
    return { note: Buffer.from(e.note, "hex"), sender: Buffer.from(e.sender, "hex"), txId: Buffer.from(e.tx_id, "hex"), round: e.round, offset: e.offset };
}

function must(label: string, condition: boolean): void {
    if (!condition) throw new Error(label);
}

function serBot(settings: BotSettings | null | undefined) {
    return settings ? { mode: settings.mode, replies: settings.replies, seconds: settings.seconds } : null;
}

function snap(state: RoomState | null) {
    if (!state) return null;
    return {
        group_id: hex(state.groupId),
        mailbox: hex(state.mailbox),
        owner: hex(state.owner),
        admins: state.admins.map(hex),
        members: state.members.map(hex),
        pending: state.pending.map(hex),
        policy: state.policy,
        name_hex: hex(state.name),
        epoch: state.epoch,
        head_tx_id: hex(state.headTxId),
        parent_group_id: hex(state.parentGroupId),
        bots: (state.bots ?? []).map((item) => ({ account: hex(item.account), ...serBot(item)! })),
    };
}

function serEvent(item: AdminEvent) {
    return { note: hex(item.note), sender: hex(item.sender), tx_id: hex(item.txId), round: item.round, offset: item.offset };
}

function serResult(events: AdminEvent[], parentEvents?: AdminEvent[]) {
    const reduced = reduceAdmin(events, parentEvents);
    return {
        parent_events: parentEvents?.map(serEvent),
        events: events.map(serEvent),
        accepted: reduced.accepted.map((item) => ({
            tx_id: hex(item.txId),
            sender: hex(item.sender),
            op: item.op,
            epoch: item.epoch,
            subject: hex(item.subject),
            members: item.members.map(hex),
        })),
        rejected: reduced.rejected.map((item) => ({ tx_id: hex(item.txId), reason: item.reason })),
        state: snap(reduced.state),
    };
}

interface DraftInput {
    op: number;
    sender: Uint8Array;
    subject?: Uint8Array;
    name?: Uint8Array;
    policy?: number;
    groupId?: Uint8Array;
    mailbox?: Uint8Array;
    bot?: BotSettings;
}

function draftFields(name: string, state: RoomState | null, input: DraftInput, parentRoom?: RoomState | null) {
    return {
        name,
        basis_state: snap(state),
        parent_room: snap(parentRoom ?? null),
        op: input.op,
        sender: hex(input.sender),
        subject: hex(input.subject ?? zero),
        name_utf8: input.name ? new TextDecoder().decode(input.name) : null,
        policy: input.policy ?? null,
        group_id: input.groupId ? hex(input.groupId) : null,
        mailbox: input.mailbox ? hex(input.mailbox) : null,
        bot: input.bot ? { mode: input.bot.mode, replies: input.bot.replies, seconds: input.bot.seconds } : null,
    };
}

const drafts: Record<string, unknown>[] = [];
const draftErrors: Record<string, unknown>[] = [];

function recordDraft(name: string, state: RoomState | null, input: DraftInput, parentRoom?: RoomState | null): Uint8Array {
    const note = draftAdmin(state, { ...input, parentRoom });
    drafts.push({ ...draftFields(name, state, input, parentRoom), note: hex(note) });
    return note;
}

function recordDraftError(
    name: string,
    state: RoomState | null,
    input: DraftInput,
    part: string,
    parentRoom?: RoomState | null,
    wideInteger = false,
): void {
    try {
        draftAdmin(state, { ...input, parentRoom });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        must(`${name} threw ${message}`, message.toLowerCase().includes(part.toLowerCase()));
        // wide_integer: a replies or seconds value a 16-bit settings type cannot hold. Only the
        // libraries whose API takes a wider integer (TypeScript, Go, Python, Kotlin) draft it;
        // Rust and Swift take u16 / UInt16 and check that the value does not fit.
        draftErrors.push({ ...draftFields(name, state, input, parentRoom), error_includes: part, ...(wideInteger ? { wide_integer: true } : {}) });
        return;
    }
    throw new Error(`${name} did not throw`);
}

// Room: owner creates, adds friend, appoints friend admin.
const create = draftAdmin(null, { op: ADMIN_OP.CREATE, sender: owner, name: bytes("team"), policy: JOINING.INVITE, groupId, mailbox });
const s1 = reduceAdmin([event(create, owner, 0x40, 1)]).state!;
const addFriend = draftAdmin(s1, { op: ADMIN_OP.ADD_MEMBER, sender: owner, subject: friend });
const s2 = reduceAdmin([event(create, owner, 0x40, 1), event(addFriend, owner, 0x41, 2)]).state!;
const appoint = draftAdmin(s2, { op: ADMIN_OP.APPOINT_ADMIN, sender: owner, subject: friend });
const base = [event(create, owner, 0x40, 1), event(addFriend, owner, 0x41, 2), event(appoint, owner, 0x42, 3)];
const s3 = reduceAdmin(base).state!;
must("friend is admin", s3.admins.length === 1);

const addBot = recordDraft("owner_add_bot", s3, { op: ADMIN_OP.ADD_BOT, sender: owner, subject: bot, bot: preset });
const adminAddBot = recordDraft("admin_add_bot", s3, { op: ADMIN_OP.ADD_BOT, sender: friend, subject: bot, bot: preset });
const withBot = [...base, event(addBot, owner, 0x43, 4)];
const s4 = reduceAdmin(withBot).state!;
must("bot is a member at once", s4.members.some((m) => m.every((b, i) => b === bot[i])) && s4.epoch === 1);
const setBot = recordDraft("admin_set_bot", s4, { op: ADMIN_OP.SET_BOT, sender: friend, subject: bot, bot: quieter });
const s5 = reduceAdmin([...withBot, event(setBot, friend, 0x44, 5)]).state!;
must("set bot", roomBot(s5, bot)?.mode === BOT_MODE.COMMANDS && roomBot(s5, bot)?.seconds === 300);
const removeBot = recordDraft("remove_bot", s5, { op: ADMIN_OP.REMOVE_MEMBER, sender: owner, subject: bot });

recordDraftError("add_bot_without_settings", s3, { op: ADMIN_OP.ADD_BOT, sender: owner, subject: bot }, "needs a reply mode");
recordDraftError("add_bot_no_mode", s3, { op: ADMIN_OP.ADD_BOT, sender: owner, subject: bot, bot: { mode: 0, replies: 5, seconds: 60 } }, "reply mode must");
recordDraftError("add_bot_zero_rate", s3, { op: ADMIN_OP.ADD_BOT, sender: owner, subject: bot, bot: { mode: 1, replies: 0, seconds: 60 } }, "rate limit must");
recordDraftError("add_bot_zero_window", s3, { op: ADMIN_OP.ADD_BOT, sender: owner, subject: bot, bot: { mode: 1, replies: 5, seconds: 0 } }, "rate limit must");
recordDraftError("non_admin_add_bot", s3, { op: ADMIN_OP.ADD_BOT, sender: stranger, subject: bot, bot: preset }, "cannot add that bot");
recordDraftError("mark_existing_member", s3, { op: ADMIN_OP.ADD_BOT, sender: owner, subject: friend, bot: preset }, "cannot add that bot");
recordDraftError("appoint_bot", s4, { op: ADMIN_OP.APPOINT_ADMIN, sender: owner, subject: bot }, "cannot be an admin");
recordDraftError("transfer_to_bot", s4, { op: ADMIN_OP.TRANSFER_OWNER, sender: owner, subject: bot }, "cannot own the room");
recordDraftError("set_bot_on_person", s4, { op: ADMIN_OP.SET_BOT, sender: owner, subject: friend, bot: quieter }, "cannot change that bot");
recordDraftError("bot_sets_itself", s4, { op: ADMIN_OP.SET_BOT, sender: bot, subject: bot, bot: quieter }, "cannot change that bot");

// Setting bounds. Mode 2 (every message) is accepted; 0 and 4 are not; replies and seconds are
// 1 through 65535. Each case is pinned so a library that drifts fails on these bytes.
const everyMessage: BotSettings = { mode: BOT_MODE.EVERY_MESSAGE, ...BOT_RATE_PRESET };
const addBotEvery = recordDraft("admin_add_bot_every_message", s3, { op: ADMIN_OP.ADD_BOT, sender: friend, subject: bot, bot: everyMessage });
const withEvery = [...base, event(addBotEvery, friend, 0x46, 4)];
const sEvery = reduceAdmin(withEvery).state!;
must("every message accepted", roomBot(sEvery, bot)?.mode === BOT_MODE.EVERY_MESSAGE);
const setEvery = recordDraft("admin_set_bot_every_message", s4, { op: ADMIN_OP.SET_BOT, sender: owner, subject: bot, bot: everyMessage });
recordDraftError("add_bot_mode_four", s3, { op: ADMIN_OP.ADD_BOT, sender: owner, subject: bot, bot: { mode: 4, replies: 5, seconds: 60 } }, "reply mode must");
recordDraftError("set_bot_mode_zero", s4, { op: ADMIN_OP.SET_BOT, sender: owner, subject: bot, bot: { mode: 0, replies: 5, seconds: 60 } }, "reply mode must");
recordDraftError("set_bot_mode_four", s4, { op: ADMIN_OP.SET_BOT, sender: owner, subject: bot, bot: { mode: 4, replies: 5, seconds: 60 } }, "reply mode must");
recordDraftError("set_bot_zero_rate", s4, { op: ADMIN_OP.SET_BOT, sender: owner, subject: bot, bot: { mode: 1, replies: 0, seconds: 60 } }, "rate limit must");
recordDraftError("set_bot_zero_window", s4, { op: ADMIN_OP.SET_BOT, sender: owner, subject: bot, bot: { mode: 1, replies: 5, seconds: 0 } }, "rate limit must");
recordDraftError("add_bot_replies_above_65535", s3, { op: ADMIN_OP.ADD_BOT, sender: owner, subject: bot, bot: { mode: 1, replies: 65536, seconds: 60 } }, "rate limit must", null, true);
recordDraftError("add_bot_seconds_above_65535", s3, { op: ADMIN_OP.ADD_BOT, sender: owner, subject: bot, bot: { mode: 1, replies: 5, seconds: 65536 } }, "rate limit must", null, true);
recordDraftError("set_bot_replies_above_65535", s4, { op: ADMIN_OP.SET_BOT, sender: owner, subject: bot, bot: { mode: 1, replies: 65536, seconds: 60 } }, "rate limit must", null, true);
recordDraftError("set_bot_seconds_above_65535", s4, { op: ADMIN_OP.SET_BOT, sender: owner, subject: bot, bot: { mode: 1, replies: 5, seconds: 65536 } }, "rate limit must", null, true);

// Forged notes: the bytes a draft refuses to write.
function forged(op: number, state: RoomState, subject: Uint8Array, extra: Partial<Parameters<typeof encodeAdminRecord>[0]> = {}): Uint8Array {
    return encodeAdminRecord({
        parent: state.headTxId,
        groupId: state.groupId,
        mailbox: state.mailbox,
        epoch: state.epoch,
        op,
        name: state.name,
        policy: state.policy,
        owner: state.owner,
        admins: state.admins,
        members: [],
        subject,
        membersOmitted: true,
        parentGroupId: state.parentGroupId,
        ...extra,
    });
}
const markFriend = forged(ADMIN_OP.ADD_BOT, s3, friend, { bot: preset });
const appointBot = forged(ADMIN_OP.APPOINT_ADMIN, s4, bot, { admins: [bot, friend].sort((a, b) => a[0] - b[0]) });
const transferBot = forged(ADMIN_OP.TRANSFER_OWNER, s4, bot, { owner: bot, epoch: 2 });
const botSetsItself = forged(ADMIN_OP.SET_BOT, s4, bot, { bot: quieter });
const zeroMode = Uint8Array.from(addBot);
zeroMode[zeroMode.length - BOT_SETTINGS_SIZE] = 0;
const zeroRate = Uint8Array.from(addBot);
zeroRate[zeroRate.length - 4] = 0;
zeroRate[zeroRate.length - 3] = 0;
const shortSettings = addBot.slice(0, addBot.length - 1);
const settingsOnAdd = Uint8Array.from([...addFriend, 1, 0, 5, 0, 60]);
// A full-list note (real member count) cannot carry op 13. Swap the 0xFFFF sentinel for a count of 0.
const fullListBot = Uint8Array.from(addBot);
{
    const nameLen = fullListBot[103];
    const admins = (fullListBot[137 + nameLen] << 8) | fullListBot[138 + nameLen];
    const at = 139 + nameLen + 32 * admins;
    fullListBot[at] = 0;
    fullListBot[at + 1] = 0;
}

// Notes with mode 4 and a zero window, forged past the draft check.
const modeFour = Uint8Array.from(addBot);
modeFour[modeFour.length - BOT_SETTINGS_SIZE] = 4;
const zeroWindow = Uint8Array.from(addBot);
zeroWindow[zeroWindow.length - 2] = 0;
zeroWindow[zeroWindow.length - 1] = 0;
const setModeZero = Uint8Array.from(setEvery);
setModeZero[setModeZero.length - BOT_SETTINGS_SIZE] = 0;
const setModeFour = Uint8Array.from(setEvery);
setModeFour[setModeFour.length - BOT_SETTINGS_SIZE] = 4;

// Ask-to-join room for the self-flag case: the bot account asks and is accepted like anyone.
const askCreate = draftAdmin(null, { op: ADMIN_OP.CREATE, sender: owner, name: bytes("lobby"), policy: JOINING.ASK, groupId, mailbox });
const a1 = reduceAdmin([event(askCreate, owner, 0x50, 1)]).state!;
const selfRequest = draftAdmin(a1, { op: ADMIN_OP.REQUEST_JOIN, sender: bot, subject: bot });
const a2 = reduceAdmin([event(askCreate, owner, 0x50, 1), event(selfRequest, bot, 0x51, 2)]).state!;
const acceptSelf = draftAdmin(a2, { op: ADMIN_OP.ACCEPT_JOIN, sender: owner, subject: bot });
const a3 = reduceAdmin([event(askCreate, owner, 0x50, 1), event(selfRequest, bot, 0x51, 2), event(acceptSelf, owner, 0x52, 3)]).state!;
const lateMark = forged(ADMIN_OP.ADD_BOT, a3, bot, { bot: preset });

// AGENT-7.b: nothing an account posts about itself marks it as a bot. In an ask-to-join room the
// account posts a key announcement (32-byte key and 64-byte signature), an ordinary chat note, a
// plain-text note claiming to be a bot, a join request, and an op 13 naming itself. The owner then
// accepts the request. The account is an ordinary member, and the room has no bots.
const keyAnnouncement = Uint8Array.from([...new Uint8Array(32).fill(0x55), ...new Uint8Array(64).fill(0x66)]);
const chatNote = encodeEnvelope({
    version: 1,
    protocolId: 1,
    senderPublicKey: new Uint8Array(32).fill(0x55),
    ephemeralPublicKey: new Uint8Array(32).fill(0x77),
    nonce: new Uint8Array(12).fill(0x88),
    encryptedSenderKey: new Uint8Array(48).fill(0x99),
    ciphertext: new Uint8Array(20).fill(0xaa),
});
const flagNote = bytes("bot: true");
const selfMark = forged(ADMIN_OP.ADD_BOT, a2, bot, { bot: preset });
const selfPosts = [
    event(askCreate, owner, 0x50, 1),
    event(keyAnnouncement, bot, 0x54, 2, 0),
    event(chatNote, bot, 0x55, 2, 1),
    event(flagNote, bot, 0x56, 2, 2),
    event(selfRequest, bot, 0x51, 3),
    event(selfMark, bot, 0x57, 4),
    event(acceptSelf, owner, 0x52, 5),
];

// Channel: the bot is a bot in the parent room; each channel add is its own record.
const parentEvents = [...base, event(addBot, owner, 0x43, 4)];
const parentState = reduceAdmin(parentEvents).state!;
const channelCreate = draftAdmin(null, {
    op: ADMIN_OP.CREATE, sender: owner, name: bytes("ops"), policy: JOINING.INVITE, groupId: channelId, mailbox: channelMail, parentRoom: parentState,
});
const c1 = reduceAdmin([event(channelCreate, owner, 0x60, 10)], parentEvents).state!;
const channelAddBot = recordDraft("channel_add_bot", c1, { op: ADMIN_OP.ADD_BOT, sender: owner, subject: bot, bot: quieter }, parentState);
recordDraftError("channel_plain_add_of_bot", c1, { op: ADMIN_OP.ADD_MEMBER, sender: owner, subject: bot }, "only when added as a bot", parentState);
recordDraftError("channel_marks_person", c1, { op: ADMIN_OP.ADD_BOT, sender: owner, subject: friend, bot: preset }, "not a bot in the parent room", parentState);
const channelPlainBot = forged(ADMIN_OP.ADD_MEMBER, c1, bot);
const channelMarkFriend = forged(ADMIN_OP.ADD_BOT, c1, friend, { bot: preset });
// Without the parent add, the channel add has nobody to take.
const parentNoBot = base;
const channelNoParentBot = reduceAdmin([event(channelCreate, owner, 0x60, 10)], parentNoBot).state!;
must("channel before bot", channelNoParentBot.members.length === 1);

// AGENT-7.c: removing a bot is ordinary op 11. The room gets a new key (epoch 2), and the bot is
// dropped from that room's channels the same way as any departing member: channelDepartures names
// it, and the owner posts op 11 on each channel, which rotates the channel key.
const parentLate = [...withBot, event(setBot, friend, 0x44, 5), event(removeBot, owner, 0x45, 15)];
const parentAfter = reduceAdmin(parentLate).state!;
must("parent drops bot", roomBot(parentAfter, bot) === null && parentAfter.epoch === 2);
const channelWithBot = [event(channelCreate, owner, 0x60, 10), event(channelAddBot, owner, 0x63, 12)];
const c2 = reduceAdmin(channelWithBot, parentLate).state!;
const channelRemoveBot = recordDraft("channel_remove_bot", c2, { op: ADMIN_OP.REMOVE_MEMBER, sender: owner, subject: bot }, parentAfter);

const reductions = {
    bot_added: serResult(withBot),
    bot_settings_changed: serResult([...withBot, event(setBot, friend, 0x44, 5)]),
    bot_removed: serResult([...withBot, event(setBot, friend, 0x44, 5), event(removeBot, owner, 0x45, 6)]),
    bot_should_reject: serResult([
        ...base,
        event(addBot, stranger, 0x70, 4, 0),
        event(markFriend, owner, 0x71, 4, 1),
        event(addBot, owner, 0x43, 5),
        event(appointBot, owner, 0x72, 6, 0),
        event(transferBot, owner, 0x73, 6, 1),
        event(botSetsItself, bot, 0x74, 6, 2),
    ]),
    malformed_bot_notes: serResult([
        ...base,
        event(zeroMode, owner, 0x75, 4, 0),
        event(zeroRate, owner, 0x76, 4, 1),
        event(shortSettings, owner, 0x77, 4, 2),
        event(settingsOnAdd, owner, 0x78, 4, 3),
        event(fullListBot, owner, 0x79, 4, 4),
    ]),
    self_request_is_not_a_bot: serResult([
        event(askCreate, owner, 0x50, 1),
        event(selfRequest, bot, 0x51, 2),
        event(acceptSelf, owner, 0x52, 3),
        event(lateMark, owner, 0x53, 4),
    ]),
    bot_every_message: serResult(withEvery),
    bot_every_message_set: serResult([...withBot, event(setEvery, owner, 0x47, 5)]),
    bad_bot_settings: serResult([
        ...base,
        event(modeFour, owner, 0x7a, 4, 0),
        event(zeroWindow, owner, 0x7b, 4, 1),
        event(addBot, owner, 0x43, 5),
        event(setModeZero, owner, 0x7c, 6, 0),
        event(setModeFour, owner, 0x7d, 6, 1),
    ]),
    self_posts_are_not_a_bot: serResult(selfPosts),
    parent_bot_removed: serResult(parentLate),
    channel_bot_removed: serResult([...channelWithBot, event(channelRemoveBot, owner, 0x64, 16)], parentLate),
    channel_bot: serResult([
        event(channelCreate, owner, 0x60, 10),
        event(channelPlainBot, owner, 0x61, 11, 0),
        event(channelMarkFriend, owner, 0x62, 11, 1),
        event(channelAddBot, owner, 0x63, 12),
    ], parentEvents),
    channel_bot_not_in_parent: serResult([
        event(channelCreate, owner, 0x60, 10),
        event(channelAddBot, owner, 0x63, 12),
    ], parentNoBot),
};

must("bot added", reductions.bot_added.state!.bots.length === 1 && reductions.bot_added.rejected.length === 0);
must("bot changed", reductions.bot_settings_changed.state!.bots[0]!.mode === BOT_MODE.COMMANDS);
must("bot removed", reductions.bot_removed.state!.bots.length === 0 && reductions.bot_removed.state!.epoch === 2);
must("five rejects", reductions.bot_should_reject.rejected.length === 5 && reductions.bot_should_reject.state!.bots.length === 1);
must("malformed all rejected", reductions.malformed_bot_notes.rejected.length === 5 && reductions.malformed_bot_notes.state!.bots.length === 0);
must("self request not a bot", reductions.self_request_is_not_a_bot.state!.members.length === 2 && reductions.self_request_is_not_a_bot.state!.bots.length === 0 && reductions.self_request_is_not_a_bot.rejected.length === 1);
must("every message added", reductions.bot_every_message.state!.bots[0]!.mode === BOT_MODE.EVERY_MESSAGE && reductions.bot_every_message.rejected.length === 0);
must("every message set", reductions.bot_every_message_set.state!.bots[0]!.mode === BOT_MODE.EVERY_MESSAGE && reductions.bot_every_message_set.rejected.length === 0);
must("bad settings rejected", reductions.bad_bot_settings.rejected.length === 4 && reductions.bad_bot_settings.state!.bots.length === 1 && reductions.bad_bot_settings.state!.bots[0]!.mode === BOT_MODE.MENTIONS);
must("self posts not a bot", reductions.self_posts_are_not_a_bot.state!.bots.length === 0 && reductions.self_posts_are_not_a_bot.state!.members.length === 2 && reductions.self_posts_are_not_a_bot.rejected.length === 4);
must("channel drops bot", reductions.channel_bot_removed.state!.bots.length === 0 && reductions.channel_bot_removed.state!.epoch === 2 && reductions.channel_bot_removed.rejected.length === 0);
must("channel bot", reductions.channel_bot.state!.bots.length === 1 && reductions.channel_bot.rejected.length === 2);
must("channel needs parent bot", reductions.channel_bot_not_in_parent.rejected.length === 1);

const checks = {
    delivery_authorized: [
        { reduction: "bot_added", admin_tx_id: hex(addr(0x43)), sender: hex(owner), recipient: hex(bot), epoch: 1, allowed: true },
        { reduction: "bot_added", admin_tx_id: hex(addr(0x43)), sender: hex(owner), recipient: hex(friend), epoch: 1, allowed: false },
        { reduction: "bot_settings_changed", admin_tx_id: hex(addr(0x44)), sender: hex(friend), recipient: hex(bot), epoch: 1, allowed: false },
        { reduction: "bot_removed", admin_tx_id: hex(addr(0x45)), sender: hex(owner), recipient: hex(bot), epoch: 2, allowed: false },
        { reduction: "bot_removed", admin_tx_id: hex(addr(0x45)), sender: hex(owner), recipient: hex(friend), epoch: 2, allowed: true },
        { reduction: "channel_bot_removed", admin_tx_id: hex(addr(0x64)), sender: hex(owner), recipient: hex(bot), epoch: 2, allowed: false },
        { reduction: "channel_bot_removed", admin_tx_id: hex(addr(0x64)), sender: hex(owner), recipient: hex(owner), epoch: 2, allowed: true },
    ],
    // Members of the channel (from `channel`) who are no longer in the parent room (from `parent`).
    channel_departures: [
        { channel: "channel_bot", parent: "parent_bot_removed", departures: [hex(bot)] },
        { channel: "channel_bot", parent: "bot_settings_changed", departures: [] as string[] },
    ],
    room_bot: [
        { reduction: "bot_added", account: hex(bot), bot: serBot(preset) },
        { reduction: "bot_added", account: hex(friend), bot: null },
        { reduction: "bot_settings_changed", account: hex(bot), bot: serBot(quieter) },
        { reduction: "bot_removed", account: hex(bot), bot: null },
        { reduction: "self_request_is_not_a_bot", account: hex(bot), bot: null },
        { reduction: "channel_bot", account: hex(bot), bot: serBot(quieter) },
        { reduction: "bot_every_message", account: hex(bot), bot: serBot(everyMessage) },
        { reduction: "bot_every_message_set", account: hex(bot), bot: serBot(everyMessage) },
        { reduction: "bad_bot_settings", account: hex(bot), bot: serBot(preset) },
        { reduction: "self_posts_are_not_a_bot", account: hex(bot), bot: null },
        { reduction: "parent_bot_removed", account: hex(bot), bot: null },
        { reduction: "channel_bot_removed", account: hex(bot), bot: null },
    ],
};
for (const item of checks.channel_departures) {
    const channel = reduceAdmin(
        reductions.channel_bot.events.map(unwire),
        reductions.channel_bot.parent_events!.map(unwire),
    ).state!;
    const parentState = reduceAdmin((reductions as unknown as Record<string, { events: WireEvent[] }>)[item.parent]!.events.map(unwire)).state!;
    must(`departures ${item.parent}`, JSON.stringify(channelDepartures(channel, parentState).map(hex)) === JSON.stringify(item.departures));
}
for (const item of checks.delivery_authorized) {
    const wired = (reductions as unknown as Record<string, { events: WireEvent[]; parent_events?: WireEvent[] }>)[item.reduction]!;
    const accepted = reduceAdmin(wired.events.map(unwire), wired.parent_events?.map(unwire)).accepted;
    must(`delivery ${item.reduction} ${item.recipient}`, deliveryAuthorized(
        accepted, Buffer.from(item.admin_tx_id, "hex"), Buffer.from(item.sender, "hex"), Buffer.from(item.recipient, "hex"), item.epoch,
    ) === item.allowed);
}

const vector = {
    description: "Room bots. Op 13 adds a bot: an owner or admin marks it as a bot at that moment, with a reply mode and a rate limit, and it is a member at once. Op 14 changes a bot's mode and limit. Both are delta notes with 5 more bytes after the parent group id: mode (1), replies (2, big-endian), window seconds (2, big-endian). A bot is never an admin or the owner. Generated by ts/scripts/emit-group-admin-bots-vector.ts.",
    constants: {
        op_add_bot: ADMIN_OP.ADD_BOT,
        op_set_bot: ADMIN_OP.SET_BOT,
        mode_mentions: BOT_MODE.MENTIONS,
        mode_every_message: BOT_MODE.EVERY_MESSAGE,
        mode_commands: BOT_MODE.COMMANDS,
        settings_size: BOT_SETTINGS_SIZE,
        preset_replies: BOT_RATE_PRESET.replies,
        preset_seconds: BOT_RATE_PRESET.seconds,
    },
    fills: { owner: 1, friend: 2, stranger: 3, bot: 5, group_id: 7, mailbox: 9, channel_id: 0x21, channel_mailbox: 0x22 },
    drafts,
    draft_errors: draftErrors,
    reductions,
    checks,
};
writeFileSync(new URL("../../vectors/group-admin-bots-v1.json", import.meta.url), `${JSON.stringify(vector, null, 2)}\n`);
console.log(`drafts ${drafts.length}, draft_errors ${draftErrors.length}, reductions ${Object.keys(reductions).length}`);
