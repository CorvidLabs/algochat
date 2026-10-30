/**
 * Public room administration (protocol 0x03) and the 0x06 key delivery that
 * cites one accepted administration record. Legacy 0x06 actions 1–4 stay in
 * group.ts and do not create an owner.
 */

import { chacha20poly1305 } from '@noble/ciphers/chacha';
import { randomBytes } from '@noble/ciphers/webcrypto';
import { uint8ArrayEquals } from '../crypto/keys.js';
import { concatBytes, requireLength } from './bytes.js';
import { PQ_DATA_HEADER_SIZE, PQ_PROTOCOL, PQError, type PQSession } from './types.js';

export const GROUP_ADMIN_PROTOCOL = 0x03;
export const GROUP_DELIVER_ACTION = 5;
export const GROUP_NAME_MAX = 64;
export const GROUP_ADMIN_MAX = 16;
export const GROUP_MEMBER_MAX = 256;
/** Separate key-delivery payments in one pass. Not an atomic transaction group. */
export const GROUP_DELIVER_BATCH = 16;
/** Member count sentinel: the note names one subject and omits the roster. */
export const GROUP_MEMBERS_OMITTED = 0xffff;
export const GROUP_DELIVER_PLAINTEXT_SIZE = 133;

export const JOINING = {
    INVITE: 1,
    ASK: 2,
} as const;

export const ADMIN_OP = {
    CREATE: 1,
    SET_NAME: 2,
    SET_POLICY: 3,
    APPOINT_ADMIN: 4,
    DISMISS_ADMIN: 5,
    TRANSFER_OWNER: 6,
    ADD_MEMBER: 7,
    REQUEST_JOIN: 8,
    ACCEPT_JOIN: 9,
    DECLINE_JOIN: 10,
    REMOVE_MEMBER: 11,
    REKEY: 12,
    /** Owner or admin adds a bot, marked as a bot with its reply mode and rate limit. */
    ADD_BOT: 13,
    /** Owner or admin changes a bot's reply mode and rate limit. */
    SET_BOT: 14,
} as const;

/** How a bot replies in one room. There is no default; the admin picks one. */
export const BOT_MODE = {
    /** Only when it is mentioned or replied to. */
    MENTIONS: 1,
    /** On every message. */
    EVERY_MESSAGE: 2,
    /** Only for its slash commands. */
    COMMANDS: 3,
} as const;

/** Suggested safe preset: 5 replies per 60 seconds. A suggestion, never a default. */
export const BOT_RATE_PRESET = { replies: 5, seconds: 60 } as const;
/** Bytes a bot record adds after the parent group id: mode, replies, seconds. */
export const BOT_SETTINGS_SIZE = 5;

export interface BotSettings {
    mode: number;
    /** Most replies in one window, 1 through 65535. */
    replies: number;
    /** Window length in seconds, 1 through 65535. */
    seconds: number;
}

export interface RoomBot extends BotSettings {
    account: Uint8Array;
}

export interface RoomState {
    groupId: Uint8Array;
    mailbox: Uint8Array;
    /** 32 zero bytes when this room is not a channel. */
    parentGroupId: Uint8Array;
    owner: Uint8Array;
    admins: Uint8Array[];
    members: Uint8Array[];
    pending: Uint8Array[];
    policy: number;
    name: Uint8Array;
    epoch: number;
    headTxId: Uint8Array;
    /** Members marked as bots in this room, sorted by account. Absent means none. */
    bots?: RoomBot[];
}

export interface AdminEvent {
    note: Uint8Array;
    sender: Uint8Array;
    txId: Uint8Array;
    round: number;
    offset: number;
}

export interface AcceptedAdmin {
    txId: Uint8Array;
    sender: Uint8Array;
    op: number;
    epoch: number;
    subject: Uint8Array;
    members: Uint8Array[];
}

export interface ReduceAdminResult {
    state: RoomState | null;
    accepted: AcceptedAdmin[];
    rejected: { txId: Uint8Array; reason: string }[];
}

interface DecodedAdmin {
    parent: Uint8Array;
    groupId: Uint8Array;
    mailbox: Uint8Array;
    epoch: number;
    op: number;
    name: Uint8Array;
    policy: number;
    owner: Uint8Array;
    admins: Uint8Array[];
    members: Uint8Array[];
    subject: Uint8Array;
    /** True when the note uses the 0xFFFF sentinel instead of a member list. */
    membersOmitted?: boolean;
    /** Present on a delta note. Legacy full-list notes leave this as 32 zero bytes. */
    parentGroupId?: Uint8Array;
    /** Present only on an add-bot or set-bot note. */
    bot?: BotSettings;
}

export function encodeAdminRecord(fields: DecodedAdmin): Uint8Array {
    const name = canonicalName(fields.name);
    const admins = canonicalSet(fields.admins, 'admins', GROUP_ADMIN_MAX);
    const membersOmitted = fields.membersOmitted === true;
    const parentGroupId = fields.parentGroupId ?? new Uint8Array(32);
    requireLength('parent', fields.parent, 32);
    requireLength('group id', fields.groupId, 32);
    requireLength('mailbox', fields.mailbox, 32);
    requireLength('owner', fields.owner, 32);
    requireLength('subject', fields.subject, 32);
    requireLength('parent group', parentGroupId, 32);
    requireUint32('epoch', fields.epoch);
    if (!membersOmitted && !isZero(parentGroupId)) {
        throw new PQError('A full member list cannot name a parent room');
    }
    const members = membersOmitted ? [] : canonicalSet(fields.members, 'members', GROUP_MEMBER_MAX);
    if (fields.policy !== JOINING.INVITE && fields.policy !== JOINING.ASK) {
        throw new PQError('Joining rule must be invite-only or ask-to-join');
    }
    if (!Object.values(ADMIN_OP).includes(fields.op as (typeof ADMIN_OP)[keyof typeof ADMIN_OP])) {
        throw new PQError('Unknown room administration operation');
    }
    const botOp = isBotOp(fields.op);
    if (botOp) {
        if (!membersOmitted) throw new PQError('A bot record uses the delta note');
        if (!fields.bot) throw new PQError('A bot needs a reply mode and a rate limit');
        checkBotSettings(fields.bot);
    } else if (fields.bot) {
        throw new PQError('Only a bot record carries bot settings');
    }
    const out: number[] = [PQ_PROTOCOL.VERSION, GROUP_ADMIN_PROTOCOL];
    push(out, fields.parent);
    push(out, fields.groupId);
    push(out, fields.mailbox);
    pushU32(out, fields.epoch);
    out.push(fields.op, name.length);
    push(out, name);
    out.push(fields.policy);
    push(out, fields.owner);
    pushU16(out, admins.length);
    for (const admin of admins) push(out, admin);
    pushU16(out, membersOmitted ? GROUP_MEMBERS_OMITTED : members.length);
    if (!membersOmitted) {
        for (const member of members) push(out, member);
    }
    push(out, fields.subject);
    if (membersOmitted) push(out, parentGroupId);
    if (botOp && fields.bot) {
        out.push(fields.bot.mode);
        pushU16(out, fields.bot.replies);
        pushU16(out, fields.bot.seconds);
    }
    const note = Uint8Array.from(out);
    if (note.length > 4096) {
        throw new PQError(membersOmitted
            ? 'Administration record exceeds 4096 bytes'
            : 'Full member list is too large');
    }
    return note;
}

export function draftAdmin(state: RoomState | null, input: {
    op: number;
    sender: Uint8Array;
    subject?: Uint8Array;
    name?: Uint8Array;
    policy?: number;
    groupId?: Uint8Array;
    mailbox?: Uint8Array;
    /** Required when creating a channel, and for every later note on that channel. */
    parentRoom?: RoomState | null;
    /** Required for add-bot and set-bot. There is no default. */
    bot?: BotSettings;
}): Uint8Array {
    const subject = input.subject ?? new Uint8Array(32);
    if (isBotOp(input.op)) {
        if (!input.bot) throw new PQError('A bot needs a reply mode and a rate limit');
        checkBotSettings(input.bot);
    }
    const parentGroupId = channelParent(state, input);
    const decoded: DecodedAdmin = {
        parent: state?.headTxId ?? new Uint8Array(32),
        groupId: input.groupId ?? state?.groupId ?? new Uint8Array(32),
        mailbox: input.mailbox ?? state?.mailbox ?? new Uint8Array(32),
        epoch: 0,
        op: input.op,
        name: input.name ?? state?.name ?? new Uint8Array(),
        policy: input.policy ?? state?.policy ?? JOINING.INVITE,
        owner: state?.owner ?? input.sender,
        admins: state?.admins.map(copy) ?? [],
        members: state?.members.map(copy) ?? [],
        subject,
        membersOmitted: true,
        parentGroupId,
        bot: input.bot,
    };
    const next = input.op === ADMIN_OP.CREATE
        ? {
            groupId: decoded.groupId,
            mailbox: decoded.mailbox,
            parentGroupId: copy(parentGroupId),
            owner: copy(input.sender),
            admins: [] as Uint8Array[],
            members: [copy(input.sender)],
            pending: [] as Uint8Array[],
            policy: decoded.policy,
            name: decoded.name,
            epoch: 1,
            bots: [] as RoomBot[],
        }
        : expectNext(state, { ...decoded, owner: state?.owner ?? input.sender, epoch: state?.epoch ?? 1 }, input.sender);
    return encodeAdminRecord({
        parent: decoded.parent,
        groupId: next.groupId,
        mailbox: next.mailbox,
        epoch: next.epoch,
        op: input.op,
        name: next.name,
        policy: next.policy,
        owner: next.owner,
        admins: next.admins,
        members: next.members,
        subject,
        membersOmitted: true,
        parentGroupId: next.parentGroupId,
        bot: isBotOp(input.op) ? input.bot : undefined,
    });
}

/** The bot mark, reply mode and rate limit for one account, or null when it is not a bot here. */
export function roomBot(state: RoomState, account: Uint8Array): RoomBot | null {
    requireLength('account', account, 32);
    const found = (state.bots ?? []).find((item) => uint8ArrayEquals(item.account, account));
    return found ? copyBot(found) : null;
}

export function reduceAdmin(events: readonly AdminEvent[], parentEvents?: readonly AdminEvent[]): ReduceAdminResult {
    const parent = parentEvents ? parentTimeline(parentEvents) : null;
    return foldAdmin(events, parent).result;
}

export function senderMayPost(state: RoomState, sender: Uint8Array, epoch: number): boolean {
    requireLength('sender', sender, 32);
    return epoch === state.epoch && contains(state.members, sender);
}

export function deliveryAuthorized(
    accepted: readonly AcceptedAdmin[],
    adminTxId: Uint8Array,
    sender: Uint8Array,
    recipient: Uint8Array,
    epoch: number,
): boolean {
    const record = accepted.find((item) => uint8ArrayEquals(item.txId, adminTxId));
    if (!record || !uint8ArrayEquals(record.sender, sender) || record.epoch !== epoch) return false;
    if (!contains(record.members, recipient)) return false;
    if (record.op === ADMIN_OP.ADD_MEMBER || record.op === ADMIN_OP.ACCEPT_JOIN || record.op === ADMIN_OP.ADD_BOT) {
        return uint8ArrayEquals(record.subject, recipient);
    }
    return record.op === ADMIN_OP.REMOVE_MEMBER || record.op === ADMIN_OP.REKEY || record.op === ADMIN_OP.TRANSFER_OWNER
        ? !uint8ArrayEquals(record.subject, recipient) || record.op === ADMIN_OP.REKEY || record.op === ADMIN_OP.TRANSFER_OWNER
        : false;
}

export function authorizedRecipients(
    accepted: readonly AcceptedAdmin[],
    adminTxId: Uint8Array,
    sender: Uint8Array,
    epoch: number,
): Uint8Array[] {
    const record = accepted.find((item) => uint8ArrayEquals(item.txId, adminTxId));
    if (!record) return [];
    return record.members.filter((member) => deliveryAuthorized(accepted, adminTxId, sender, member, epoch)).map(copy);
}

/** Members of a channel who are no longer members of the parent room. */
export function channelDepartures(channel: RoomState, parent: RoomState): Uint8Array[] {
    if (isZero(channel.parentGroupId) || !uint8ArrayEquals(channel.parentGroupId, parent.groupId)) {
        throw new PQError('Channel does not point at this parent room');
    }
    return channel.members.filter((member) => !contains(parent.members, member)).map(copy);
}

/** Recipients still owed a key. A payment already in `landed` stays there. */
export function pendingKeyDeliveries(recipients: readonly Uint8Array[], landed: readonly Uint8Array[]): Uint8Array[] {
    return recipients.filter((recipient) => !contains(landed, recipient)).map(copy);
}

/** The next separate payments, at most 16. This does not build an atomic group. */
export function nextDeliveryBatch(pending: readonly Uint8Array[], batchSize = GROUP_DELIVER_BATCH): Uint8Array[] {
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > GROUP_DELIVER_BATCH) {
        throw new PQError('A key delivery batch is at most 16 payments');
    }
    return pending.slice(0, batchSize).map(copy);
}

export function sealGroupKeyDelivery(
    session: PQSession,
    epoch: number,
    groupId: Uint8Array,
    mailbox: Uint8Array,
    groupKey: Uint8Array,
    adminTxId: Uint8Array,
    nonce: Uint8Array = randomBytes(12),
): Uint8Array {
    requireLength('session key', session.sessionKey, 32);
    requireLength('sender public key', session.senderPublicKey, 32);
    requireLength('handshake id', session.handshakeId, 32);
    requireLength('nonce', nonce, 12);
    const plaintext = encodeDelivery(epoch, groupId, mailbox, groupKey, adminTxId);
    const header = new Uint8Array(PQ_DATA_HEADER_SIZE);
    header[0] = PQ_PROTOCOL.VERSION;
    header[1] = 0x06;
    header.set(session.senderPublicKey, 2);
    header.set(session.handshakeId, 34);
    header.set(nonce, 66);
    const sealed = chacha20poly1305(session.sessionKey, nonce, header).encrypt(plaintext);
    return concatBytes(header, sealed);
}

export function openGroupKeyDelivery(note: Uint8Array, session: PQSession): {
    epoch: number;
    groupId: Uint8Array;
    mailbox: Uint8Array;
    groupKey: Uint8Array;
    adminTxId: Uint8Array;
} {
    if (
        note.length !== PQ_DATA_HEADER_SIZE + GROUP_DELIVER_PLAINTEXT_SIZE + PQ_PROTOCOL.TAG_SIZE
        || note[0] !== PQ_PROTOCOL.VERSION
        || note[1] !== 0x06
    ) {
        throw new PQError('Not a group key delivery');
    }
    const sender = note.slice(2, 34);
    const handshakeId = note.slice(34, 66);
    const nonce = note.slice(66, 78);
    if (!uint8ArrayEquals(sender, session.senderPublicKey)) {
        throw new PQError('Key delivery sender does not match the session');
    }
    if (!uint8ArrayEquals(handshakeId, session.handshakeId)) {
        throw new PQError('Key delivery is for a different handshake');
    }
    let plain: Uint8Array;
    try {
        plain = chacha20poly1305(session.sessionKey, nonce, note.slice(0, PQ_DATA_HEADER_SIZE)).decrypt(
            note.slice(PQ_DATA_HEADER_SIZE),
        );
    } catch {
        throw new PQError('Group key delivery authentication failed');
    }
    if (plain.length !== GROUP_DELIVER_PLAINTEXT_SIZE || plain[0] !== GROUP_DELIVER_ACTION) {
        throw new PQError('Group key delivery plaintext is not action 5');
    }
    const epoch = readU32(plain, 1);
    if (epoch < 1) throw new PQError('Group epoch must be from 1 through 4294967295');
    return {
        epoch,
        groupId: plain.slice(5, 37),
        mailbox: plain.slice(37, 69),
        groupKey: plain.slice(69, 101),
        adminTxId: plain.slice(101, 133),
    };
}

interface ParentStep {
    event: AdminEvent;
    state: RoomState | null;
}

function parentTimeline(events: readonly AdminEvent[]): ParentStep[] {
    return foldAdmin(events, null).steps;
}

function foldAdmin(events: readonly AdminEvent[], parent: readonly ParentStep[] | null): {
    result: ReduceAdminResult;
    steps: ParentStep[];
} {
    const ordered = [...events].sort(compareEvents);
    let state: RoomState | null = null;
    const accepted: AcceptedAdmin[] = [];
    const rejected: { txId: Uint8Array; reason: string }[] = [];
    const seen = new Set<string>();
    // 32 zero bytes are create's parent. They are not an accepted administration id.
    const known = new Set<string>();
    const steps: ParentStep[] = [];
    for (const event of ordered) {
        const key = hex(event.txId);
        if (seen.has(key)) {
            rejected.push({ txId: copy(event.txId), reason: 'replay' });
            steps.push({ event, state });
            continue;
        }
        try {
            const parentState = parent ? parentBefore(parent, event) : undefined;
            const next = applyAdmin(state, event, known, parentState);
            seen.add(key);
            if (next.advance) known.add(hex(event.txId));
            state = next.state;
            accepted.push(next.accepted);
        } catch (error) {
            rejected.push({
                txId: copy(event.txId),
                reason: error instanceof Error ? error.message : 'rejected',
            });
        }
        steps.push({ event, state });
    }
    return { result: { state, accepted, rejected }, steps };
}

function parentBefore(steps: readonly ParentStep[], event: AdminEvent): RoomState | null {
    let state: RoomState | null = null;
    for (const step of steps) {
        if (compareEvents(step.event, event) < 0) state = step.state;
        else break;
    }
    return state;
}

function channelParent(state: RoomState | null, input: {
    op: number;
    sender: Uint8Array;
    subject?: Uint8Array;
    groupId?: Uint8Array;
    mailbox?: Uint8Array;
    parentRoom?: RoomState | null;
}): Uint8Array {
    const subject = input.subject ?? new Uint8Array(32);
    if (input.op === ADMIN_OP.CREATE) {
        if (!input.parentRoom) return new Uint8Array(32);
        if (!uint8ArrayEquals(input.sender, input.parentRoom.owner)) {
            throw new PQError('Only the group owner creates a channel');
        }
        const groupId = input.groupId ?? new Uint8Array(32);
        const mailbox = input.mailbox ?? new Uint8Array(32);
        if (uint8ArrayEquals(groupId, input.parentRoom.groupId) || uint8ArrayEquals(mailbox, input.parentRoom.mailbox)) {
            throw new PQError('A channel has its own mailbox and group id');
        }
        return copy(input.parentRoom.groupId);
    }
    const current = state?.parentGroupId ?? new Uint8Array(32);
    if (isZero(current)) return copy(current);
    if (!input.parentRoom || !uint8ArrayEquals(input.parentRoom.groupId, current)) {
        throw new PQError('Channel does not point at this parent room');
    }
    if (input.op === ADMIN_OP.TRANSFER_OWNER) throw new PQError('The group owner keeps the channel');
    checkChannelJoin(input.op, subject, input.parentRoom);
    return copy(current);
}

function applyAdmin(
    state: RoomState | null,
    event: AdminEvent,
    known: Set<string>,
    parentState: RoomState | null | undefined,
): { state: RoomState; accepted: AcceptedAdmin; advance: boolean } {
    requireLength('sender', event.sender, 32);
    requireLength('transaction id', event.txId, 32);
    const decoded = decodeAdmin(event.note);
    if (uint8ArrayEquals(decoded.mailbox, event.sender)) {
        throw new PQError('Mailbox key does not own the room');
    }
    bindChannel(decoded, event.sender, parentState);
    const parent = state?.headTxId ?? new Uint8Array(32);
    const request = decoded.op === ADMIN_OP.REQUEST_JOIN;
    if (request) {
        if (!state || isZero(decoded.parent) || !known.has(hex(decoded.parent))) {
            throw new PQError('Join request does not cite this room');
        }
    } else if (!uint8ArrayEquals(decoded.parent, parent)) {
        throw new PQError('Stale administration parent');
    }
    const next = expectNext(state, decoded, event.sender);
    if (!sameState(decoded, next)) throw new PQError('Administration record does not match the authorized next state');
    const room: RoomState = {
        ...next,
        headTxId: request ? copy(state!.headTxId) : copy(event.txId),
        pending: next.pending,
    };
    return {
        advance: !request,
        state: room,
        accepted: {
            txId: copy(event.txId),
            sender: copy(event.sender),
            op: decoded.op,
            epoch: room.epoch,
            subject: copy(decoded.subject),
            members: room.members.map(copy),
        },
    };
}

function bindChannel(decoded: DecodedAdmin, sender: Uint8Array, parentState: RoomState | null | undefined): void {
    const parentGroupId = decoded.parentGroupId ?? new Uint8Array(32);
    if (isZero(parentGroupId)) return;
    // undefined means the caller did not supply the parent room. null means it was supplied and did not yet exist.
    if (parentState === undefined || !parentState || !uint8ArrayEquals(parentState.groupId, parentGroupId)) {
        throw new PQError('Channel does not point at this parent room');
    }
    if (decoded.op === ADMIN_OP.CREATE) {
        if (!uint8ArrayEquals(sender, parentState.owner)) throw new PQError('Only the group owner creates a channel');
        if (uint8ArrayEquals(decoded.groupId, parentState.groupId) || uint8ArrayEquals(decoded.mailbox, parentState.mailbox)) {
            throw new PQError('A channel has its own mailbox and group id');
        }
    }
    if (decoded.op === ADMIN_OP.TRANSFER_OWNER) throw new PQError('The group owner keeps the channel');
    checkChannelJoin(decoded.op, decoded.subject, parentState);
}

/** A channel takes people from its parent room. A bot there joins a channel only as a bot. */
function checkChannelJoin(op: number, subject: Uint8Array, parentRoom: RoomState): void {
    const joining = op === ADMIN_OP.ADD_MEMBER || op === ADMIN_OP.ACCEPT_JOIN || op === ADMIN_OP.REQUEST_JOIN;
    if (!joining && op !== ADMIN_OP.ADD_BOT) return;
    if (!contains(parentRoom.members, subject)) throw new PQError('That person is not in the parent room');
    const parentBot = (parentRoom.bots ?? []).some((item) => uint8ArrayEquals(item.account, subject));
    if (op === ADMIN_OP.ADD_BOT && !parentBot) throw new PQError('That account is not a bot in the parent room');
    if (joining && parentBot) throw new PQError('A bot joins a channel only when added as a bot');
}

function expectNext(state: RoomState | null, decoded: DecodedAdmin, sender: Uint8Array): Omit<RoomState, 'headTxId'> {
    if (decoded.op === ADMIN_OP.CREATE) {
        if (state) throw new PQError('Create requires an empty parent');
        if (!isZero(decoded.parent) || !isZero(decoded.subject)) throw new PQError('Create parent and subject must be zero');
        if (!uint8ArrayEquals(decoded.owner, sender)) throw new PQError('Create sender is not the owner');
        if (decoded.epoch !== 1 || decoded.admins.length !== 0) throw new PQError('Create starts at epoch 1 with no admins');
        if (decoded.membersOmitted) {
            if (decoded.members.length !== 0) throw new PQError('Create membership is the owner alone');
        } else if (decoded.members.length !== 1 || !uint8ArrayEquals(decoded.members[0]!, sender)) {
            throw new PQError('Create membership is the owner alone');
        }
        const members = [copy(sender)];
        rejectMailboxOverlap(decoded.mailbox, members, decoded.admins, decoded.owner);
        return body(decoded, [], members);
    }
    if (!state) throw new PQError('Administration parent is missing');
    if (!uint8ArrayEquals(decoded.groupId, state.groupId) || !uint8ArrayEquals(decoded.mailbox, state.mailbox)) {
        throw new PQError('Administration record is for a different room');
    }
    const privileged = uint8ArrayEquals(sender, state.owner) || contains(state.admins, sender);
    let members = state.members.map(copy);
    let admins = state.admins.map(copy);
    let pending = state.pending.map(copy);
    let owner = copy(state.owner);
    let epoch = state.epoch;
    let name = copy(state.name);
    let policy = state.policy;
    let bots = (state.bots ?? []).map(copyBot);
    const subject = decoded.subject;
    const isBot = (account: Uint8Array) => bots.some((item) => uint8ArrayEquals(item.account, account));
    if (decoded.op === ADMIN_OP.SET_NAME) {
        if (!privileged || !isZero(subject)) throw new PQError('Sender cannot rename the room');
        name = copy(decoded.name);
    } else if (decoded.op === ADMIN_OP.SET_POLICY) {
        if (!privileged || !isZero(subject)) throw new PQError('Sender cannot change the joining rule');
        policy = decoded.policy;
    } else if (decoded.op === ADMIN_OP.APPOINT_ADMIN) {
        if (!uint8ArrayEquals(sender, state.owner)) throw new PQError('Only the owner appoints an admin');
        if (!contains(members, subject) || uint8ArrayEquals(subject, owner) || contains(admins, subject)) {
            throw new PQError('That person cannot be appointed');
        }
        if (isBot(subject)) throw new PQError('A bot cannot be an admin');
        admins = canonicalSet([...admins, subject], 'admins', GROUP_ADMIN_MAX);
    } else if (decoded.op === ADMIN_OP.DISMISS_ADMIN) {
        if (!uint8ArrayEquals(sender, state.owner) || !contains(admins, subject)) {
            throw new PQError('Only the owner dismisses an admin');
        }
        admins = admins.filter((item) => !uint8ArrayEquals(item, subject));
    } else if (decoded.op === ADMIN_OP.TRANSFER_OWNER) {
        if (!uint8ArrayEquals(sender, state.owner) || !contains(members, subject) || uint8ArrayEquals(subject, owner)) {
            throw new PQError('Ownership can move only from the owner to another member');
        }
        if (isBot(subject)) throw new PQError('A bot cannot own the room');
        owner = copy(subject);
        admins = admins.filter((item) => !uint8ArrayEquals(item, subject));
        epoch = bump(epoch);
    } else if (decoded.op === ADMIN_OP.ADD_MEMBER) {
        if (!privileged || contains(members, subject) || uint8ArrayEquals(subject, state.mailbox)) {
            throw new PQError('Sender cannot add that member');
        }
        members = canonicalSet([...members, subject], 'members', GROUP_MEMBER_MAX);
        pending = pending.filter((item) => !uint8ArrayEquals(item, subject));
    } else if (decoded.op === ADMIN_OP.REQUEST_JOIN) {
        if (state.policy !== JOINING.ASK || !uint8ArrayEquals(sender, subject) || contains(members, subject) || contains(pending, subject)) {
            throw new PQError('That join request is not allowed');
        }
        pending = canonicalSet([...pending, subject], 'pending', GROUP_MEMBER_MAX);
    } else if (decoded.op === ADMIN_OP.ACCEPT_JOIN) {
        if (!privileged || !contains(pending, subject)) throw new PQError('No join request to accept');
        members = canonicalSet([...members, subject], 'members', GROUP_MEMBER_MAX);
        pending = pending.filter((item) => !uint8ArrayEquals(item, subject));
    } else if (decoded.op === ADMIN_OP.DECLINE_JOIN) {
        if (!privileged || !contains(pending, subject)) throw new PQError('No join request to decline');
        pending = pending.filter((item) => !uint8ArrayEquals(item, subject));
    } else if (decoded.op === ADMIN_OP.REMOVE_MEMBER) {
        if (!privileged || !contains(members, subject) || uint8ArrayEquals(subject, owner)) {
            throw new PQError('Sender cannot remove that member');
        }
        members = members.filter((item) => !uint8ArrayEquals(item, subject));
        admins = admins.filter((item) => !uint8ArrayEquals(item, subject));
        pending = pending.filter((item) => !uint8ArrayEquals(item, subject));
        bots = bots.filter((item) => !uint8ArrayEquals(item.account, subject));
        epoch = bump(epoch);
    } else if (decoded.op === ADMIN_OP.REKEY) {
        if (!privileged || !isZero(subject)) throw new PQError('Sender cannot rotate the room key');
        epoch = bump(epoch);
    } else if (decoded.op === ADMIN_OP.ADD_BOT) {
        if (!privileged || contains(members, subject) || uint8ArrayEquals(subject, state.mailbox) || isZero(subject)) {
            throw new PQError('Sender cannot add that bot');
        }
        const settings = requireBot(decoded);
        members = canonicalSet([...members, subject], 'members', GROUP_MEMBER_MAX);
        pending = pending.filter((item) => !uint8ArrayEquals(item, subject));
        bots = sortBots([...bots, { account: copy(subject), ...settings }]);
    } else if (decoded.op === ADMIN_OP.SET_BOT) {
        if (!privileged || !isBot(subject)) throw new PQError('Sender cannot change that bot');
        const settings = requireBot(decoded);
        bots = bots.map((item) => (uint8ArrayEquals(item.account, subject) ? { account: copy(subject), ...settings } : item));
    } else {
        throw new PQError('Unknown room administration operation');
    }
    rejectMailboxOverlap(state.mailbox, members, admins, owner);
    if (!contains(members, owner)) throw new PQError('The owner must remain a member');
    return {
        groupId: copy(state.groupId),
        mailbox: copy(state.mailbox),
        parentGroupId: copy(state.parentGroupId),
        owner,
        admins,
        members,
        pending,
        policy,
        name,
        epoch,
        bots,
    };
}

function isBotOp(op: number): boolean {
    return op === ADMIN_OP.ADD_BOT || op === ADMIN_OP.SET_BOT;
}

function checkBotSettings(bot: BotSettings): void {
    if (bot.mode !== BOT_MODE.MENTIONS && bot.mode !== BOT_MODE.EVERY_MESSAGE && bot.mode !== BOT_MODE.COMMANDS) {
        throw new PQError('Bot reply mode must be mentions, every message, or commands');
    }
    for (const value of [bot.replies, bot.seconds]) {
        if (!Number.isInteger(value) || value < 1 || value > 0xffff) {
            throw new PQError('Bot rate limit must be from 1 through 65535');
        }
    }
}

function requireBot(decoded: DecodedAdmin): BotSettings {
    if (!decoded.bot) throw new PQError('A bot needs a reply mode and a rate limit');
    checkBotSettings(decoded.bot);
    return { mode: decoded.bot.mode, replies: decoded.bot.replies, seconds: decoded.bot.seconds };
}

function sortBots(bots: RoomBot[]): RoomBot[] {
    return bots.map(copyBot).sort((a, b) => compareBytes(a.account, b.account));
}

function copyBot(bot: RoomBot): RoomBot {
    return { account: copy(bot.account), mode: bot.mode, replies: bot.replies, seconds: bot.seconds };
}

function body(decoded: DecodedAdmin, pending: Uint8Array[], members: Uint8Array[]): Omit<RoomState, 'headTxId'> {
    return {
        groupId: copy(decoded.groupId),
        mailbox: copy(decoded.mailbox),
        parentGroupId: copy(decoded.parentGroupId ?? new Uint8Array(32)),
        owner: copy(decoded.owner),
        admins: decoded.admins.map(copy),
        members: members.map(copy),
        pending,
        policy: decoded.policy,
        name: copy(decoded.name),
        epoch: decoded.epoch,
        bots: [],
    };
}

function sameState(decoded: DecodedAdmin, next: Omit<RoomState, 'headTxId'>): boolean {
    return uint8ArrayEquals(decoded.owner, next.owner)
        && decoded.epoch === next.epoch
        && decoded.policy === next.policy
        && uint8ArrayEquals(decoded.name, next.name)
        && uint8ArrayEquals(decoded.parentGroupId ?? new Uint8Array(32), next.parentGroupId)
        && sameSet(decoded.admins, next.admins)
        && (decoded.membersOmitted || sameSet(decoded.members, next.members));
}

function decodeAdmin(note: Uint8Array): DecodedAdmin {
    if (note.length < 141 || note[0] !== PQ_PROTOCOL.VERSION || note[1] !== GROUP_ADMIN_PROTOCOL) {
        throw new PQError('Not a room administration record');
    }
    let cursor = 2;
    const parent = take(note, cursor, 32); cursor += 32;
    const groupId = take(note, cursor, 32); cursor += 32;
    const mailbox = take(note, cursor, 32); cursor += 32;
    const epoch = readU32(note, cursor); cursor += 4;
    const op = note[cursor]; cursor += 1;
    const nameLen = note[cursor]; cursor += 1;
    if (nameLen > GROUP_NAME_MAX) throw new PQError('Room name is longer than 64 bytes');
    const name = take(note, cursor, nameLen); cursor += nameLen;
    canonicalName(name);
    const policy = note[cursor]; cursor += 1;
    const owner = take(note, cursor, 32); cursor += 32;
    const adminCount = readU16(note, cursor); cursor += 2;
    const admins: Uint8Array[] = [];
    for (let i = 0; i < adminCount; i += 1) {
        admins.push(take(note, cursor, 32));
        cursor += 32;
    }
    const memberCount = readU16(note, cursor); cursor += 2;
    const membersOmitted = memberCount === GROUP_MEMBERS_OMITTED;
    const members: Uint8Array[] = [];
    if (!membersOmitted) {
        for (let i = 0; i < memberCount; i += 1) {
            members.push(take(note, cursor, 32));
            cursor += 32;
        }
    }
    const subject = take(note, cursor, 32); cursor += 32;
    const parentGroupId = membersOmitted ? take(note, cursor, 32) : new Uint8Array(32);
    if (membersOmitted) cursor += 32;
    let bot: BotSettings | undefined;
    if (isBotOp(op)) {
        if (!membersOmitted) throw new PQError('A bot record uses the delta note');
        const settings = take(note, cursor, BOT_SETTINGS_SIZE);
        cursor += BOT_SETTINGS_SIZE;
        bot = { mode: settings[0], replies: readU16(settings, 1), seconds: readU16(settings, 3) };
        checkBotSettings(bot);
    }
    if (cursor !== note.length) throw new PQError('Administration record has trailing bytes');
    if (note.length > 4096) {
        throw new PQError(membersOmitted
            ? 'Administration record exceeds 4096 bytes'
            : 'Full member list is too large');
    }
    canonicalSet(admins, 'admins', GROUP_ADMIN_MAX);
    if (!membersOmitted) canonicalSet(members, 'members', GROUP_MEMBER_MAX);
    if (!strictlyIncreasing(admins) || !strictlyIncreasing(members)) {
        throw new PQError('Administration sets must be strictly sorted');
    }
    if (policy !== JOINING.INVITE && policy !== JOINING.ASK) {
        throw new PQError('Joining rule must be invite-only or ask-to-join');
    }
    return {
        parent,
        groupId,
        mailbox,
        epoch,
        op,
        name,
        policy,
        owner,
        admins,
        members,
        subject,
        membersOmitted,
        parentGroupId,
        bot,
    };
}

function encodeDelivery(epoch: number, groupId: Uint8Array, mailbox: Uint8Array, groupKey: Uint8Array, adminTxId: Uint8Array): Uint8Array {
    requireUint32('epoch', epoch);
    if (epoch < 1) throw new PQError('Group epoch must be from 1 through 4294967295');
    requireLength('group id', groupId, 32);
    requireLength('mailbox', mailbox, 32);
    requireLength('group key', groupKey, 32);
    requireLength('administration id', adminTxId, 32);
    const out = new Uint8Array(GROUP_DELIVER_PLAINTEXT_SIZE);
    out[0] = GROUP_DELIVER_ACTION;
    writeU32(out, 1, epoch);
    out.set(groupId, 5);
    out.set(mailbox, 37);
    out.set(groupKey, 69);
    out.set(adminTxId, 101);
    return out;
}

function rejectMailboxOverlap(mailbox: Uint8Array, members: Uint8Array[], admins: Uint8Array[], owner: Uint8Array): void {
    if (uint8ArrayEquals(mailbox, owner) || contains(members, mailbox) || contains(admins, mailbox)) {
        throw new PQError('Mailbox key does not own the room');
    }
}

function canonicalName(name: Uint8Array): Uint8Array {
    if (name.length > GROUP_NAME_MAX) throw new PQError('Room name is longer than 64 bytes');
    try {
        new TextDecoder('utf-8', { fatal: true }).decode(name);
    } catch {
        throw new PQError('Room name is not UTF-8');
    }
    return name;
}

function canonicalSet(values: Uint8Array[], label: string, max: number): Uint8Array[] {
    const sorted = values.map(copy).sort(compareBytes);
    for (let i = 1; i < sorted.length; i += 1) {
        if (uint8ArrayEquals(sorted[i], sorted[i - 1])) throw new PQError(`Duplicate ${label}`);
    }
    if (sorted.length > max) throw new PQError(`Too many ${label}`);
    for (const value of sorted) requireLength(label, value, 32);
    return sorted;
}

function strictlyIncreasing(values: readonly Uint8Array[]): boolean {
    for (let i = 1; i < values.length; i += 1) {
        if (compareBytes(values[i - 1], values[i]) >= 0) return false;
    }
    return true;
}

function contains(values: readonly Uint8Array[], target: Uint8Array): boolean {
    return values.some((item) => uint8ArrayEquals(item, target));
}

function sameSet(left: readonly Uint8Array[], right: readonly Uint8Array[]): boolean {
    return left.length === right.length && left.every((item, index) => uint8ArrayEquals(item, right[index]));
}

function compareEvents(a: AdminEvent, b: AdminEvent): number {
    if (a.round !== b.round) return a.round - b.round;
    if (a.offset !== b.offset) return a.offset - b.offset;
    return compareBytes(a.txId, b.txId);
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
    const length = Math.min(a.length, b.length);
    for (let i = 0; i < length; i += 1) {
        if (a[i] !== b[i]) return a[i] - b[i];
    }
    return a.length - b.length;
}

function bump(epoch: number): number {
    if (epoch >= 0xffffffff) throw new PQError('Group epoch is exhausted');
    return epoch + 1;
}

function isZero(value: Uint8Array): boolean {
    return value.every((byte) => byte === 0);
}

function copy(value: Uint8Array): Uint8Array {
    return value.slice();
}

function hex(value: Uint8Array): string {
    return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function push(out: number[], value: Uint8Array): void {
    for (const byte of value) out.push(byte);
}

function pushU32(out: number[], value: number): void {
    out.push((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
}

function pushU16(out: number[], value: number): void {
    out.push((value >>> 8) & 0xff, value & 0xff);
}

function readU32(source: Uint8Array, offset: number): number {
    return ((source[offset] << 24) | (source[offset + 1] << 16) | (source[offset + 2] << 8) | source[offset + 3]) >>> 0;
}

function readU16(source: Uint8Array, offset: number): number {
    return (source[offset] << 8) | source[offset + 1];
}

function writeU32(target: Uint8Array, offset: number, value: number): void {
    target[offset] = (value >>> 24) & 0xff;
    target[offset + 1] = (value >>> 16) & 0xff;
    target[offset + 2] = (value >>> 8) & 0xff;
    target[offset + 3] = value & 0xff;
}

function take(source: Uint8Array, offset: number, length: number): Uint8Array {
    if (offset + length > source.length) throw new PQError('Administration record is truncated');
    return source.slice(offset, offset + length);
}

function requireUint32(name: string, value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
        throw new PQError(`${name} must be from 0 through 4294967295`);
    }
}
