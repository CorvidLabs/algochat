/**
 * Write vectors/group-admin-delta-v1.json from the TypeScript room reducer.
 * Run from ts/: bun scripts/emit-group-admin-vector.ts
 * Do not point this script at vectors/group-admin-v1.json. That file stays the
 * full-list notes other ports already match.
 */
import { writeFileSync } from "node:fs";
import {
    ADMIN_OP,
    JOINING,
    deliveryAuthorized,
    draftAdmin,
    encodeAdminRecord,
    openGroupKeyDelivery,
    reduceAdmin,
    sealGroupKeyDelivery,
    senderMayPost,
    type AdminEvent,
    type RoomState,
} from "../src/pq/group-admin.js";
import type { PQSession } from "../src/pq/types.js";

const owner = addr(1);
const friend = addr(2);
const stranger = addr(3);
const outsider = addr(4);
const mailbox = addr(9);
const groupId = addr(7);
const generalId = addr(8);
const generalMail = addr(6);

function addr(byte: number): Uint8Array {
    return new Uint8Array(32).fill(byte);
}

function hex(value: Uint8Array): string {
    return Buffer.from(value).toString("hex");
}

function event(note: Uint8Array, sender: Uint8Array, tx: number, round = 1, offset = 0): AdminEvent {
    return { note, sender, txId: addr(tx), round, offset };
}

function bytes(text: string): Uint8Array {
    return new TextEncoder().encode(text);
}

function must(label: string, condition: boolean): void {
    if (!condition) throw new Error(label);
}

function reason(error: unknown): string {
    return error instanceof Error ? error.message : "rejected";
}

function expectThrow(label: string, part: string, fn: () => void): string {
    try {
        fn();
    } catch (error) {
        const message = reason(error);
        must(`${label} threw ${message}`, message.toLowerCase().includes(part.toLowerCase()));
        return message;
    }
    throw new Error(`${label} did not throw`);
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
    };
}

function serEvent(item: AdminEvent) {
    return {
        note: hex(item.note),
        sender: hex(item.sender),
        tx_id: hex(item.txId),
        round: item.round,
        offset: item.offset,
    };
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
}

const drafts: Record<string, unknown>[] = [];

function recordDraft(name: string, state: RoomState | null, input: DraftInput, parentRoom?: RoomState | null): Uint8Array {
    const note = draftAdmin(state, { ...input, parentRoom });
    drafts.push({
        name,
        basis_state: snap(state),
        parent_room: snap(parentRoom ?? null),
        op: input.op,
        sender: hex(input.sender),
        subject: hex(input.subject ?? new Uint8Array(32)),
        name_utf8: input.name ? new TextDecoder().decode(input.name) : null,
        policy: input.policy ?? null,
        group_id: input.groupId ? hex(input.groupId) : null,
        mailbox: input.mailbox ? hex(input.mailbox) : null,
        note: hex(note),
    });
    return note;
}

const createInvite = recordDraft("create_invite", null, {
    op: ADMIN_OP.CREATE, sender: owner, name: bytes("team"), policy: JOINING.INVITE, groupId, mailbox,
});
const created = reduceAdmin([event(createInvite, owner, 10)]);
must("create", created.state?.epoch === 1 && created.state.members.length === 1 && created.rejected.length === 0);

const addFriend = recordDraft("add_friend", created.state, { op: ADMIN_OP.ADD_MEMBER, sender: owner, subject: friend });
const withFriend = reduceAdmin([event(createInvite, owner, 10), event(addFriend, owner, 11, 2)]);
must("add keeps epoch", withFriend.state?.epoch === 1 && withFriend.state.members.length === 2);

const createAsk = recordDraft("create_ask", null, {
    op: ADMIN_OP.CREATE, sender: owner, name: bytes("general"), policy: JOINING.ASK, groupId, mailbox,
});
const asked = reduceAdmin([event(createAsk, owner, 10)]);
const requestFriend = recordDraft("request_friend", asked.state, { op: ADMIN_OP.REQUEST_JOIN, sender: friend, subject: friend });
const requestStranger = recordDraft("request_stranger", asked.state, { op: ADMIN_OP.REQUEST_JOIN, sender: stranger, subject: stranger });
const asking = reduceAdmin([
    event(createAsk, owner, 10),
    event(requestFriend, friend, 11, 2),
    event(requestStranger, stranger, 12, 3),
]);
must("both requests pending", asking.state?.pending.length === 2 && asking.state.headTxId[0] === 10);
const acceptFriend = recordDraft("accept_friend", asking.state, { op: ADMIN_OP.ACCEPT_JOIN, sender: owner, subject: friend });
const acceptedJoin = reduceAdmin([
    event(createAsk, owner, 10),
    event(requestFriend, friend, 11, 2),
    event(requestStranger, stranger, 12, 3),
    event(acceptFriend, owner, 13, 4),
]);
const declineStranger = recordDraft("decline_stranger", acceptedJoin.state, { op: ADMIN_OP.DECLINE_JOIN, sender: owner, subject: stranger });

const rename = recordDraft("rename", created.state, { op: ADMIN_OP.SET_NAME, sender: owner, name: bytes("later") });
const appoint = recordDraft("appoint_friend", withFriend.state, { op: ADMIN_OP.APPOINT_ADMIN, sender: owner, subject: friend });
const appointed = reduceAdmin([
    event(createInvite, owner, 10),
    event(addFriend, owner, 11, 2),
    event(appoint, owner, 14, 3),
]);
must("friend is admin", appointed.state?.admins.length === 1 && appointed.state.epoch === 1);
const transfer = recordDraft("transfer_friend", appointed.state, { op: ADMIN_OP.TRANSFER_OWNER, sender: owner, subject: friend });
const dismiss = recordDraft("dismiss_friend", appointed.state, { op: ADMIN_OP.DISMISS_ADMIN, sender: owner, subject: friend });
const adminRename = recordDraft("admin_rename", appointed.state, { op: ADMIN_OP.SET_NAME, sender: friend, name: bytes("renamed") });
const renamed = reduceAdmin([
    event(createInvite, owner, 10),
    event(addFriend, owner, 11, 2),
    event(appoint, owner, 14, 3),
    event(adminRename, friend, 15, 4),
]);
const adminPolicy = recordDraft("admin_policy", renamed.state, { op: ADMIN_OP.SET_POLICY, sender: friend, policy: JOINING.ASK });
const policied = reduceAdmin([
    event(createInvite, owner, 10),
    event(addFriend, owner, 11, 2),
    event(appoint, owner, 14, 3),
    event(adminRename, friend, 15, 4),
    event(adminPolicy, friend, 16, 5),
]);
const adminAdd = recordDraft("admin_add", policied.state, { op: ADMIN_OP.ADD_MEMBER, sender: friend, subject: outsider });
const addedByAdmin = reduceAdmin([
    event(createInvite, owner, 10),
    event(addFriend, owner, 11, 2),
    event(appoint, owner, 14, 3),
    event(adminRename, friend, 15, 4),
    event(adminPolicy, friend, 16, 5),
    event(adminAdd, friend, 17, 6),
]);
must("add did not rotate", addedByAdmin.state?.epoch === 1 && addedByAdmin.state.members.length === 3);
const adminRekey = recordDraft("admin_rekey", addedByAdmin.state, { op: ADMIN_OP.REKEY, sender: friend });
const rekeyed = reduceAdmin([
    event(createInvite, owner, 10),
    event(addFriend, owner, 11, 2),
    event(appoint, owner, 14, 3),
    event(adminRename, friend, 15, 4),
    event(adminPolicy, friend, 16, 5),
    event(adminAdd, friend, 17, 6),
    event(adminRekey, friend, 18, 7),
]);
must("rekey rotates", rekeyed.state?.epoch === 2);
const adminRemove = recordDraft("admin_remove", rekeyed.state, { op: ADMIN_OP.REMOVE_MEMBER, sender: friend, subject: outsider });
const removeFriend = recordDraft("remove_friend", withFriend.state, { op: ADMIN_OP.REMOVE_MEMBER, sender: owner, subject: friend });

const createGeneral = recordDraft("create_general", null, {
    op: ADMIN_OP.CREATE, sender: owner, name: bytes("general"), policy: JOINING.ASK, groupId: generalId, mailbox: generalMail,
});

const inviteRequest = encodeAdminRecord({
    parent: created.state!.headTxId,
    groupId,
    mailbox,
    epoch: 1,
    op: ADMIN_OP.REQUEST_JOIN,
    name: bytes("team"),
    policy: JOINING.INVITE,
    owner,
    admins: [],
    members: [owner],
    subject: stranger,
});
const forgedAppoint = encodeAdminRecord({
    parent: appointed.state!.headTxId,
    groupId,
    mailbox,
    epoch: 1,
    op: ADMIN_OP.APPOINT_ADMIN,
    name: bytes("team"),
    policy: JOINING.INVITE,
    owner,
    admins: [friend, stranger],
    members: [owner, friend],
    subject: stranger,
});
const forgedTransfer = encodeAdminRecord({
    parent: appointed.state!.headTxId,
    groupId,
    mailbox,
    epoch: 2,
    op: ADMIN_OP.TRANSFER_OWNER,
    name: bytes("team"),
    policy: JOINING.INVITE,
    owner: stranger,
    admins: [friend],
    members: [owner, friend],
    subject: stranger,
});

const reductions = {
    create_invite: serResult([event(createInvite, owner, 10)]),
    non_admin_and_mailbox: serResult([
        event(createInvite, owner, 10),
        event(addFriend, stranger, 11, 2, 0),
        event(addFriend, mailbox, 12, 2, 1),
    ]),
    invite_add: serResult([event(createInvite, owner, 10), event(addFriend, owner, 11, 2)]),
    invite_request_rejected: serResult([
        event(createInvite, owner, 10),
        event(inviteRequest, stranger, 12, 2),
    ]),
    ask_accept_decline: serResult([
        event(createAsk, owner, 10),
        event(requestFriend, friend, 11, 2),
        event(requestStranger, stranger, 12, 3),
        event(acceptFriend, owner, 13, 4),
        event(declineStranger, owner, 14, 5),
    ]),
    conflict_and_replay: serResult([
        event(createInvite, owner, 10, 1, 0),
        event(rename, owner, 12, 2, 1),
        event(addFriend, owner, 11, 2, 0),
        event(addFriend, owner, 11, 2, 0),
    ]),
    removal: serResult([
        event(createInvite, owner, 10),
        event(addFriend, owner, 11, 2),
        event(removeFriend, owner, 13, 3),
    ]),
    ownership_transfer: serResult([
        event(createInvite, owner, 10),
        event(addFriend, owner, 11, 2),
        event(appoint, owner, 14, 3),
        event(forgedAppoint, friend, 15, 4),
        event(transfer, owner, 16, 5),
    ]),
    transfer_non_member: serResult([
        event(createInvite, owner, 10),
        event(addFriend, owner, 11, 2),
        event(appoint, owner, 14, 3),
        event(forgedTransfer, owner, 17, 4),
    ]),
    admin_changes: serResult([
        event(createInvite, owner, 10),
        event(addFriend, owner, 11, 2),
        event(appoint, owner, 14, 3),
        event(adminRename, friend, 15, 4),
        event(adminPolicy, friend, 16, 5),
        event(adminAdd, friend, 17, 6),
        event(adminRekey, friend, 18, 7),
        event(adminRemove, friend, 19, 8),
    ]),
    dismiss_admin: serResult([
        event(createInvite, owner, 10),
        event(addFriend, owner, 11, 2),
        event(appoint, owner, 14, 3),
        event(dismiss, owner, 15, 4),
    ]),
    create_general: serResult([event(createGeneral, owner, 20)]),
};

must("mailbox rejected", reductions.non_admin_and_mailbox.rejected.some((item) => item.reason.includes("Mailbox")));
must("stranger rejected", reductions.non_admin_and_mailbox.rejected.some((item) => item.reason.includes("cannot add")));
must("invite request rejected", reductions.invite_request_rejected.rejected[0]?.reason.includes("not allowed") === true);
must("ask members", reductions.ask_accept_decline.state?.members.length === 2 && reductions.ask_accept_decline.state.pending.length === 0);
must("conflict keeps add", reductions.conflict_and_replay.state?.members.length === 2 && reductions.conflict_and_replay.state.name_hex === hex(bytes("team")));
must("stale", reductions.conflict_and_replay.rejected.some((item) => item.reason.includes("Stale")));
must("replay", reductions.conflict_and_replay.rejected.some((item) => item.reason === "replay"));
must("removal epoch", reductions.removal.state?.epoch === 2 && reductions.removal.state.members.length === 1);
must("transfer owner", reductions.ownership_transfer.state?.owner === hex(friend) && reductions.ownership_transfer.state.epoch === 2);
must("forged appoint rejected", reductions.ownership_transfer.rejected.some((item) => item.reason.includes("owner")));
must("non-member transfer rejected", reductions.transfer_non_member.rejected.some((item) => item.reason.includes("member")));
must("admin removed outsider", reductions.admin_changes.state?.epoch === 3 && reductions.admin_changes.state.members.length === 2 && reductions.admin_changes.state.policy === JOINING.ASK);
must("dismissed", reductions.dismiss_admin.state?.admins.length === 0 && reductions.dismiss_admin.state.epoch === 1);
must("rooms differ", reductions.create_general.state?.group_id !== reductions.create_invite.state?.group_id);

const channelId = addr(0x21);
const channelMail = addr(0x22);
const channelCreate = recordDraft("create_channel", null, {
    op: ADMIN_OP.CREATE, sender: owner, name: bytes("ops"), policy: JOINING.INVITE, groupId: channelId, mailbox: channelMail,
}, created.state);
const channelOpened = reduceAdmin(
    [event(channelCreate, owner, 30, 3)],
    [event(createInvite, owner, 10, 1)],
);
must("channel starts with the owner", channelOpened.rejected.length === 0 && channelOpened.state?.members.length === 1);
const channelAdd = recordDraft("channel_add_friend", channelOpened.state, {
    op: ADMIN_OP.ADD_MEMBER, sender: owner, subject: friend,
}, withFriend.state);
const channelParentEvents = [event(createInvite, owner, 10, 1), event(addFriend, owner, 11, 2)];
const channelEvents = [event(channelCreate, owner, 30, 3), event(channelAdd, owner, 31, 4)];
reductions.channel = serResult(channelEvents, channelParentEvents);
must("channel add is explicit", reductions.channel.state?.members.length === 2 && reductions.channel.rejected.length === 0);
must("channel points at the parent", reductions.channel.state?.parent_group_id === hex(groupId));

const session: PQSession = {
    sessionKey: addr(0x42),
    senderPublicKey: addr(0x11),
    recipientPublicKey: new Uint8Array(32),
    handshakeId: addr(0x43),
};
const deliveryNote = sealGroupKeyDelivery(session, 2, groupId, mailbox, addr(0x99), addr(13), addr(0x55).slice(0, 12));
const openedDelivery = openGroupKeyDelivery(deliveryNote, session);
must("delivery tx", openedDelivery.adminTxId.every((byte, index) => byte === addr(13)[index]));

const removalAccepted = reduceAdmin([
    event(createInvite, owner, 10),
    event(addFriend, owner, 11, 2),
    event(removeFriend, owner, 13, 3),
]);
const checks = {
    delivery_authorized: [
        { reduction: "invite_add", admin_tx_id: hex(addr(11)), sender: hex(owner), recipient: hex(friend), epoch: 1, allowed: true },
        { reduction: "invite_add", admin_tx_id: hex(addr(11)), sender: hex(owner), recipient: hex(stranger), epoch: 1, allowed: false },
        { reduction: "removal", admin_tx_id: hex(addr(13)), sender: hex(owner), recipient: hex(friend), epoch: 2, allowed: false },
        { reduction: "removal", admin_tx_id: hex(addr(13)), sender: hex(owner), recipient: hex(owner), epoch: 2, allowed: true },
        { reduction: "ownership_transfer", admin_tx_id: hex(addr(16)), sender: hex(owner), recipient: hex(friend), epoch: 2, allowed: true },
        { reduction: "ownership_transfer", admin_tx_id: hex(addr(16)), sender: hex(owner), recipient: hex(owner), epoch: 2, allowed: true },
    ],
    may_post: [
        { reduction: "removal", sender: hex(friend), epoch: 2, allowed: senderMayPost(removalAccepted.state!, friend, 2) === false ? false : true },
        { reduction: "removal", sender: hex(owner), epoch: 2, allowed: true },
        { reduction: "removal", sender: hex(owner), epoch: 1, allowed: false },
        { reduction: "invite_add", sender: hex(friend), epoch: 1, allowed: true },
    ],
};
must("removed cannot post", checks.may_post[0].allowed === false);
must("deliver add", deliveryAuthorized(removalAccepted.accepted, addr(11), owner, friend, 1));
must("withhold new key", deliveryAuthorized(removalAccepted.accepted, addr(13), owner, friend, 2) === false);

const draftErrors = [
    {
        name: "invite_request",
        basis_state: snap(created.state),
        op: ADMIN_OP.REQUEST_JOIN,
        sender: hex(stranger),
        subject: hex(stranger),
        name_utf8: null,
        policy: null,
        error_includes: "not allowed",
    },
    {
        name: "admin_appoints",
        basis_state: snap(appointed.state),
        op: ADMIN_OP.APPOINT_ADMIN,
        sender: hex(friend),
        subject: hex(outsider),
        name_utf8: null,
        policy: null,
        error_includes: "owner",
    },
    {
        name: "transfer_non_member",
        basis_state: snap(appointed.state),
        op: ADMIN_OP.TRANSFER_OWNER,
        sender: hex(owner),
        subject: hex(stranger),
        name_utf8: null,
        policy: null,
        error_includes: "member",
    },
    {
        name: "admin_removes_owner",
        basis_state: snap(appointed.state),
        op: ADMIN_OP.REMOVE_MEMBER,
        sender: hex(friend),
        subject: hex(owner),
        name_utf8: null,
        policy: null,
        error_includes: "cannot remove",
    },
];

for (const item of draftErrors) {
    expectThrow(item.name, item.error_includes, () => draftAdmin(item.name === "invite_request" ? created.state : appointed.state, {
        op: item.op,
        sender: item.name === "transfer_non_member" || item.name === "invite_request" ? (item.name === "invite_request" ? stranger : owner) : friend,
        subject: item.name === "admin_appoints" ? outsider : item.name === "admin_removes_owner" ? owner : item.name === "invite_request" ? stranger : stranger,
    }));
}

const vector = {
    description: "Delta room administration. A new 0x03 note omits the member list (member count 65535) and records one subject. The last 32 bytes are the parent group id, or 32 zero bytes when the room is not a channel. Full-list notes stay in vectors/group-admin-v1.json. Legacy 0x06 actions 1-4 stay in vectors/group-v1.json. Fill-byte addresses are test ids, not Algorand checksums. A transaction id is 32 bytes of one fill value.",
    constants: {
        protocol: 3,
        deliver_action: 5,
        deliver_plaintext_size: 133,
        name_max: 64,
        admin_max: 16,
        member_max: 256,
        members_omitted: 65535,
        deliver_batch: 16,
        joining_invite: 1,
        joining_ask: 2,
    },
    fills: {
        owner: 1,
        friend: 2,
        stranger: 3,
        outsider: 4,
        group_id: 7,
        general_id: 8,
        mailbox: 9,
        general_mailbox: 6,
    },
    drafts,
    draft_errors: draftErrors,
    forged_notes: {
        invite_request: hex(inviteRequest),
        forged_appoint: hex(forgedAppoint),
        forged_transfer: hex(forgedTransfer),
    },
    reductions,
    checks,
    delivery: {
        session_key: hex(session.sessionKey),
        sender_x25519: hex(session.senderPublicKey),
        handshake_id: hex(session.handshakeId),
        nonce: "55".repeat(12),
        epoch: 2,
        group_id: hex(groupId),
        mailbox: hex(mailbox),
        group_key: hex(addr(0x99)),
        admin_tx_id: hex(addr(13)),
        note: hex(deliveryNote),
    },
};

const target = new URL("../../vectors/group-admin-delta-v1.json", import.meta.url);
writeFileSync(target, `${JSON.stringify(vector, null, 2)}\n`);
console.log(`wrote ${target.pathname} drafts=${drafts.length} reductions=${Object.keys(reductions).length} delivery=${deliveryNote.length}`);
