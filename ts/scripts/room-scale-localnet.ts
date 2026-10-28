/**
 * LocalNet proof for delta room notes.
 *
 * Grows one invite-only room past 100 members (256 unless ROOM_SCALE_MEMBERS
 * says otherwise), removes one member, and resumes a key delivery that was
 * not sent in the first batch. A channel of that room has its own mailbox.
 * Payments are separate. A payment that confirms is left in place.
 *
 * Does not wipe or restart the node at 127.0.0.1:4001.
 * Run from ts/: bun scripts/room-scale-localnet.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import algosdk from "algosdk";
import { deriveEncryptionKeys } from "../src/crypto/keys.js";
import { deriveMLKEMKeyPair } from "../src/pq/kem.js";
import {
    ADMIN_OP,
    GROUP_DELIVER_BATCH,
    GROUP_MEMBERS_OMITTED,
    JOINING,
    authorizedRecipients,
    channelDepartures,
    deliveryAuthorized,
    draftAdmin,
    nextDeliveryBatch,
    openGroupKeyDelivery,
    pendingKeyDeliveries,
    reduceAdmin,
    sealGroupKeyDelivery,
    senderMayPost,
    type AdminEvent,
    type RoomState,
} from "../src/pq/group-admin.js";
import { openGroupMessage, sealGroupMessage } from "../src/pq/group.js";
import { acceptPQSession, initiatePQSession, openPQSessionAsSender } from "../src/pq/session.js";
import type { PQSession } from "../src/pq/types.js";

const TOKEN = "a".repeat(64);
const EVIDENCE = process.env.ROOM_SCALE_EVIDENCE ?? "/tmp/algochat-room-scale-evidence";
const TARGET = Number(process.env.ROOM_SCALE_MEMBERS ?? 256);
const FUNDED = 18;

interface Receipt {
    kind: string;
    txid: string;
    round: number;
    noteBytes: number;
    grouped: boolean;
}

class Room {
    readonly events: AdminEvent[] = [];

    constructor(
        readonly groupId: Uint8Array,
        readonly mailboxAccount: algosdk.Account,
        private parentEvents: AdminEvent[] = [],
    ) {}

    get mailbox(): Uint8Array {
        return pub(this.mailboxAccount);
    }

    bindParent(events: AdminEvent[]): void {
        this.parentEvents = events;
    }

    state(): RoomState {
        const reduced = reduceAdmin(this.events, this.parentEvents.length > 0 ? this.parentEvents : undefined);
        if (reduced.rejected.length > 0 || !reduced.state) {
            throw new Error(reduced.rejected.map((item) => item.reason).join("; ") || "room missing");
        }
        return reduced.state;
    }
}

function hex(bytes: Uint8Array): string {
    return Buffer.from(bytes).toString("hex");
}

function pub(account: algosdk.Account): Uint8Array {
    return new Uint8Array(algosdk.decodeAddress(account.addr.toString()).publicKey);
}

function seedOf(account: algosdk.Account): Uint8Array {
    if (account.sk.length === 64) return account.sk.slice(0, 32);
    if (account.sk.length === 32) return account.sk;
    throw new Error(`unexpected key length ${account.sk.length}`);
}

function memberSentinel(note: Uint8Array): number {
    const nameLen = note[103] ?? 0;
    const admins = ((note[137 + nameLen] ?? 0) << 8) | (note[138 + nameLen] ?? 0);
    const at = 139 + nameLen + (32 * admins);
    return ((note[at] ?? 0) << 8) | (note[at + 1] ?? 0);
}

async function dispenser(): Promise<algosdk.Account> {
    const kmd = new algosdk.Kmd(TOKEN, "http://127.0.0.1", 4002);
    const listed = await kmd.listWallets();
    const wallets = listed.wallets as Array<{ name: string; id: string }>;
    const wallet = wallets.find((item) => item.name === "unencrypted-default-wallet");
    if (!wallet) throw new Error("dispenser wallet missing");
    const handle = await kmd.initWalletHandle(wallet.id, "");
    const token = handle.wallet_handle_token as string;
    const keys = await kmd.listKeys(token);
    const address = (keys.addresses as string[])[0];
    if (!address) throw new Error("dispenser address missing");
    const exported = await kmd.exportKey(token, "", address);
    return { addr: algosdk.Address.fromString(address), sk: exported.private_key as Uint8Array };
}

async function submit(
    algod: algosdk.Algodv2,
    from: algosdk.Account,
    to: string,
    amount: number,
    note: Uint8Array | undefined,
    kind: string,
): Promise<{ receipt: Receipt; rawId: Uint8Array }> {
    const params = await algod.getTransactionParams().do();
    const minFee = Number(params.minFee ?? 1000);
    const over = Math.max(0, (note?.length ?? 0) - 1024);
    const extra = over === 0 ? 0 : Math.floor((over * minFee + 9999) / 10000);
    const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: from.addr.toString(),
        receiver: to,
        amount,
        note,
        suggestedParams: { ...params, fee: minFee + extra, flatFee: true },
    });
    if (txn.group) throw new Error(`${kind} was placed in an atomic group`);
    const rawId = txn.rawTxID();
    const txid = txn.txID();
    await algod.sendRawTransaction(txn.signTxn(from.sk)).do();
    const confirmed = await algosdk.waitForConfirmation(algod, txid, 40);
    const info = await algod.pendingTransactionInformation(txid).do();
    const group = info.txn?.txn?.grp ?? info.txn?.txn?.group;
    if (group) throw new Error(`${kind} confirmed inside an atomic group`);
    return {
        rawId,
        receipt: {
            kind,
            txid,
            round: Number(confirmed.confirmedRound ?? confirmed["confirmed-round"]),
            noteBytes: note?.length ?? 0,
            grouped: false,
        },
    };
}

async function stillConfirmed(algod: algosdk.Algodv2, txid: string, round: number): Promise<boolean> {
    try {
        const info = await algod.pendingTransactionInformation(txid).do();
        const seen = Number(info.confirmedRound ?? info["confirmed-round"] ?? 0);
        if (seen === round) return true;
    } catch {
        // The pool may have dropped it. The block is the record.
    }
    const block = await algod.block(round).do();
    const text = JSON.stringify(block, (_key, value) => (typeof value === "bigint" ? value.toString() : value));
    return text.includes(txid);
}

function acceptPostedHandshake(memberSeed: Uint8Array, note: Uint8Array): PQSession {
    const recipient = deriveEncryptionKeys(memberSeed);
    const kem = deriveMLKEMKeyPair(memberSeed);
    return acceptPQSession(note, recipient, kem.encapsKey, kem.decapsKey);
}

async function main(): Promise<void> {
    if (!Number.isInteger(TARGET) || TARGET < 101 || TARGET > 256) {
        throw new Error("ROOM_SCALE_MEMBERS must be from 101 through 256");
    }
    const health = await fetch("http://127.0.0.1:4001/health", { signal: AbortSignal.timeout(1500) }).catch(() => null);
    if (!health?.ok && health?.status !== 200) {
        const status = await fetch("http://127.0.0.1:4001/v2/status", {
            headers: { "X-Algo-API-Token": TOKEN },
            signal: AbortSignal.timeout(1500),
        }).catch(() => null);
        if (!status?.ok) throw new Error("LocalNet algod is not reachable at 127.0.0.1:4001");
    }
    const algod = new algosdk.Algodv2(TOKEN, "http://127.0.0.1", 4001);
    const before = await algod.status().do();
    const funder = await dispenser();
    const owner = algosdk.generateAccount();
    const funded = Array.from({ length: FUNDED }, () => algosdk.generateAccount());
    const offline = Array.from({ length: TARGET - 1 - FUNDED }, () => algosdk.generateAccount());
    const everyone = [...funded, ...offline];
    const receipts: Receipt[] = [];
    const sessions = new Map<string, PQSession>();

    const fund = async (to: string, amount: number, kind: string) => {
        const paid = await submit(algod, funder, to, amount, undefined, kind);
        receipts.push(paid.receipt);
    };
    console.error(`funding owner and ${FUNDED} delivery accounts`);
    await fund(owner.addr.toString(), 20_000_000, "fund-owner");
    for (const member of funded) await fund(member.addr.toString(), 100_000, "fund-member");

    const room = new Room(randomBytes(32), algosdk.generateAccount());
    const roomKey = randomBytes(32);
    const fundMailbox = await submit(algod, owner, room.mailboxAccount.addr.toString(), 100_000, undefined, "fund-mailbox");
    receipts.push(fundMailbox.receipt);

    const ownerKeys = deriveEncryptionKeys(seedOf(owner));
    const ownerKem = deriveMLKEMKeyPair(seedOf(owner));
    console.error("opening sessions with funded members");
    for (const member of funded) {
        const sender = ownerKeys;
        const recipient = deriveEncryptionKeys(seedOf(member));
        const recipientKem = deriveMLKEMKeyPair(seedOf(member));
        const opened = initiatePQSession({
            sender,
            senderEncapsKey: ownerKem.encapsKey,
            recipientPublicKey: recipient.publicKey,
            recipientEncapsKey: recipientKem.encapsKey,
        });
        const paid = await submit(algod, owner, member.addr.toString(), 0, opened.note, "handshake");
        receipts.push(paid.receipt);
        const info = await algod.pendingTransactionInformation(paid.receipt.txid).do();
        const raw = info.txn?.txn?.note;
        const confirmedNote = raw instanceof Uint8Array ? raw : typeof raw === "string" ? Buffer.from(raw, "base64") : opened.note;
        const recipientSession = acceptPostedHandshake(seedOf(member), confirmedNote);
        const senderSession = openPQSessionAsSender(confirmedNote, ownerKeys, ownerKem.decapsKey);
        if (!Buffer.from(recipientSession.sessionKey).equals(Buffer.from(senderSession.sessionKey))) {
            throw new Error("recipient did not derive the posted handshake");
        }
        sessions.set(member.addr.toString(), recipientSession);
    }

    const postAdmin = async (
        target: Room,
        input: { op: number; subject?: Uint8Array; name?: string; policy?: number; parent?: Room | null },
        kind: string,
    ) => {
        const prior = target.events.length === 0 ? null : target.state();
        const note = draftAdmin(prior, {
            op: input.op,
            sender: pub(owner),
            subject: input.subject,
            name: input.name === undefined ? undefined : new TextEncoder().encode(input.name),
            policy: input.policy,
            groupId: target.groupId,
            mailbox: target.mailbox,
            parentRoom: input.parent ? input.parent.state() : undefined,
        });
        if (memberSentinel(note) !== GROUP_MEMBERS_OMITTED) throw new Error(`${kind} repeated the member list`);
        if (note.length > 4096) throw new Error(`${kind} exceeds 4096`);
        const paid = await submit(algod, owner, target.mailboxAccount.addr.toString(), 0, note, kind);
        receipts.push(paid.receipt);
        target.events.push({
            note,
            sender: pub(owner),
            txId: paid.rawId,
            round: paid.receipt.round,
            offset: 0,
        });
        return paid;
    };

    console.error("creating the room");
    const created = await postAdmin(room, { op: ADMIN_OP.CREATE, name: "hall", policy: JOINING.INVITE }, "create");
    console.error(`adding members through ${TARGET}`);
    for (const [index, member] of everyone.entries()) {
        await postAdmin(room, { op: ADMIN_OP.ADD_MEMBER, subject: pub(member) }, "add");
        if ((index + 1) % 50 === 0) console.error(`added ${index + 1}`);
    }
    const membersBeforeRemoval = room.state().members.length;
    if (membersBeforeRemoval !== TARGET) {
        throw new Error(`room has ${membersBeforeRemoval} members, not ${TARGET}`);
    }
    if (membersBeforeRemoval <= 100) throw new Error("room did not grow past 100");

    const channel = new Room(randomBytes(32), algosdk.generateAccount());
    const channelKey = randomBytes(32);
    const fundChannel = await submit(algod, owner, channel.mailboxAccount.addr.toString(), 100_000, undefined, "fund-channel-mailbox");
    receipts.push(fundChannel.receipt);
    channel.bindParent(room.events);
    console.error("creating a channel");
    const channelCreated = await postAdmin(channel, {
        op: ADMIN_OP.CREATE,
        name: "ops",
        policy: JOINING.INVITE,
        parent: room,
    }, "channel-create");
    if (!Buffer.from(channel.state().parentGroupId).equals(Buffer.from(room.groupId))) {
        throw new Error("channel does not point at the parent room");
    }
    if (channel.state().members.length !== 1) throw new Error("parent membership was copied into the channel");
    const [alice, bob, cara, dana] = funded;
    if (!alice || !bob || !cara || !dana) throw new Error("funded members missing");
    for (const member of [alice, bob, cara]) {
        await postAdmin(channel, { op: ADMIN_OP.ADD_MEMBER, subject: pub(member), parent: room }, "channel-add");
    }
    if (channel.state().members.some((item) => Buffer.from(item).equals(Buffer.from(pub(dana))))) {
        throw new Error("a parent member was added to the channel without an add note");
    }
    const channelMembersBefore = channel.state().members.length;
    if (channelMembersBefore !== 4) throw new Error(`channel roster ${channelMembersBefore}`);

    const parentMessage = sealGroupMessage(
        new TextEncoder().encode("hall line"),
        roomKey,
        room.groupId,
        1,
        0,
        pub(owner),
        randomBytes(12),
    );
    const parentPosted = await submit(algod, owner, room.mailboxAccount.addr.toString(), 0, parentMessage, "message");
    receipts.push(parentPosted.receipt);
    const channelMessage = sealGroupMessage(
        new TextEncoder().encode("ops line"),
        channelKey,
        channel.groupId,
        1,
        0,
        pub(owner),
        randomBytes(12),
    );
    const channelPosted = await submit(algod, owner, channel.mailboxAccount.addr.toString(), 0, channelMessage, "channel-message");
    receipts.push(channelPosted.receipt);
    if (new TextDecoder().decode(openGroupMessage(parentMessage, roomKey, pub(owner), []).plaintext) !== "hall line") {
        throw new Error("parent message did not open");
    }

    console.error("removing one member and resuming a missed key delivery");
    const removed = await postAdmin(room, { op: ADMIN_OP.REMOVE_MEMBER, subject: pub(alice) }, "remove");
    const rotated = randomBytes(32);
    if (room.state().epoch !== 2) throw new Error("removal did not rotate the epoch");
    if (senderMayPost(room.state(), pub(alice), 2)) throw new Error("removed member can still post");
    const accepted = reduceAdmin(room.events).accepted;
    const recipients = authorizedRecipients(accepted, removed.rawId, pub(owner), 2)
        .filter((item) => funded.some((member) => Buffer.from(pub(member)).equals(Buffer.from(item))));
    if (recipients.some((item) => Buffer.from(item).equals(Buffer.from(pub(alice))))) {
        throw new Error("removed member is still a delivery recipient");
    }
    if (!deliveryAuthorized(accepted, removed.rawId, pub(owner), pub(bob), 2)) {
        throw new Error("a remaining member was not authorized");
    }
    const first = nextDeliveryBatch(recipients);
    if (first.length !== GROUP_DELIVER_BATCH) throw new Error(`first batch ${first.length}`);
    const missed = first[first.length - 1]!;
    const kept: Receipt[] = [];
    for (const recipient of first.slice(0, -1)) {
        const member = funded.find((item) => Buffer.from(pub(item)).equals(Buffer.from(recipient)));
        if (!member) throw new Error("batch recipient was not funded");
        const session = sessions.get(member.addr.toString());
        if (!session) throw new Error("missing session");
        const note = sealGroupKeyDelivery(session, 2, room.groupId, room.mailbox, rotated, removed.rawId, randomBytes(12));
        const paid = await submit(algod, owner, member.addr.toString(), 0, note, "deliver");
        receipts.push(paid.receipt);
        kept.push(paid.receipt);
    }
    const pending = pendingKeyDeliveries(recipients, first.slice(0, -1));
    if (!pending.some((item) => Buffer.from(item).equals(Buffer.from(missed)))) {
        throw new Error("missed recipient was dropped");
    }
    const resumed = nextDeliveryBatch(pending);
    if (!Buffer.from(resumed[0]!).equals(Buffer.from(missed))) throw new Error("resume did not start with the missed recipient");
    const resumedReceipts: Receipt[] = [];
    for (const recipient of resumed) {
        const member = funded.find((item) => Buffer.from(pub(item)).equals(Buffer.from(recipient)));
        if (!member) throw new Error("resumed recipient was not funded");
        const session = sessions.get(member.addr.toString());
        if (!session) throw new Error("missing resumed session");
        const note = sealGroupKeyDelivery(session, 2, room.groupId, room.mailbox, rotated, removed.rawId, randomBytes(12));
        const paid = await submit(algod, owner, member.addr.toString(), 0, note, "deliver-resume");
        receipts.push(paid.receipt);
        resumedReceipts.push(paid.receipt);
        if (Buffer.from(recipient).equals(Buffer.from(missed))) {
            const opened = openGroupKeyDelivery(note, session);
            if (!Buffer.from(opened.groupKey).equals(Buffer.from(rotated))) throw new Error("resumed delivery did not open");
        }
    }
    const keptFirst = kept[0];
    if (!keptFirst) throw new Error("no delivery landed");
    if (!await stillConfirmed(algod, keptFirst.txid, keptFirst.round)) {
        throw new Error("a delivery that had landed was not kept");
    }
    if (keptFirst.round >= resumedReceipts[0]!.round) {
        throw new Error("resumed delivery did not confirm after the kept ones");
    }
    const oldOpened = openGroupMessage(parentMessage, roomKey, pub(owner), []);
    if (new TextDecoder().decode(oldOpened.plaintext) !== "hall line") throw new Error("old message was lost");
    const fresh = sealGroupMessage(new TextEncoder().encode("after"), rotated, room.groupId, 2, 0, pub(owner), randomBytes(12));
    let oldKeyFailed = false;
    try {
        openGroupMessage(fresh, roomKey, pub(owner), []);
    } catch {
        oldKeyFailed = true;
    }
    if (!oldKeyFailed) throw new Error("old key opened the new epoch");

    channel.bindParent(room.events);
    const departures = channelDepartures(channel.state(), room.state());
    if (!departures.some((item) => Buffer.from(item).equals(Buffer.from(pub(alice))))) {
        throw new Error("leaving the parent did not mark the channel departure");
    }
    const channelRemoved = await postAdmin(channel, {
        op: ADMIN_OP.REMOVE_MEMBER,
        subject: pub(alice),
        parent: room,
    }, "channel-remove");
    if (channel.state().members.some((item) => Buffer.from(item).equals(Buffer.from(pub(alice))))) {
        throw new Error("alice stayed in the channel");
    }
    const channelKey2 = randomBytes(32);
    const channelAccepted = reduceAdmin(channel.events, room.events).accepted;
    const channelRecipients = authorizedRecipients(channelAccepted, channelRemoved.rawId, pub(owner), 2);
    if (channelRecipients.some((item) => Buffer.from(item).equals(Buffer.from(pub(alice))))) {
        throw new Error("channel delivery included the removed member");
    }
    const channelMissedAccount = bob;
    const channelTargets = channelRecipients.filter((item) => !Buffer.from(item).equals(Buffer.from(pub(owner))));
    const channelSent: Uint8Array[] = [];
    const channelLanded: Receipt[] = [];
    for (const recipient of channelTargets) {
        if (Buffer.from(recipient).equals(Buffer.from(pub(channelMissedAccount)))) continue;
        const member = funded.find((item) => Buffer.from(pub(item)).equals(Buffer.from(recipient)));
        if (!member) throw new Error("channel recipient was not funded");
        const session = sessions.get(member.addr.toString());
        if (!session) throw new Error("missing channel session");
        const note = sealGroupKeyDelivery(session, 2, channel.groupId, channel.mailbox, channelKey2, channelRemoved.rawId, randomBytes(12));
        const paid = await submit(algod, owner, member.addr.toString(), 0, note, "channel-deliver");
        receipts.push(paid.receipt);
        channelLanded.push(paid.receipt);
        channelSent.push(recipient);
    }
    const channelPending = pendingKeyDeliveries(channelTargets, channelSent);
    if (!channelPending.some((item) => Buffer.from(item).equals(Buffer.from(pub(channelMissedAccount))))) {
        throw new Error("channel resume lost the missed member");
    }
    const bobSession = sessions.get(channelMissedAccount.addr.toString());
    if (!bobSession) throw new Error("missing bob session");
    const bobNote = sealGroupKeyDelivery(bobSession, 2, channel.groupId, channel.mailbox, channelKey2, channelRemoved.rawId, randomBytes(12));
    const bobPaid = await submit(algod, owner, channelMissedAccount.addr.toString(), 0, bobNote, "channel-deliver-resume");
    receipts.push(bobPaid.receipt);
    if (!Buffer.from(openGroupKeyDelivery(bobNote, bobSession).groupKey).equals(Buffer.from(channelKey2))) {
        throw new Error("channel resume did not open");
    }
    if (channelLanded[0] && !await stillConfirmed(algod, channelLanded[0].txid, channelLanded[0].round)) {
        throw new Error("a channel delivery that had landed was not kept");
    }

    const after = await algod.status().do();
    const evidence = {
        command: "bun scripts/room-scale-localnet.ts",
        algod: "http://127.0.0.1:4001",
        round_before: Number(before.lastRound ?? before["last-round"]),
        round_after: Number(after.lastRound ?? after["last-round"]),
        members_before_removal: membersBeforeRemoval,
        members_after_removal: room.state().members.length,
        past_100: membersBeforeRemoval > 100,
        note_form: "delta",
        members_omitted: GROUP_MEMBERS_OMITTED,
        create_note_bytes: created.receipt.noteBytes,
        max_admin_note_bytes: Math.max(...receipts.filter((item) => (
            item.kind === "create" || item.kind === "add" || item.kind === "remove"
            || item.kind === "channel-create" || item.kind === "channel-add" || item.kind === "channel-remove"
        )).map((item) => item.noteBytes)),
        channel: {
            members_before_parent_removal: channelMembersBefore,
            members_after_removal: channel.state().members.length,
            parent_is_room: hex(channel.state().parentGroupId) === hex(room.groupId),
            own_mailbox: channel.mailboxAccount.addr.toString() !== room.mailboxAccount.addr.toString(),
            parent_member_not_copied: dana.addr.toString(),
            create_round: channelCreated.receipt.round,
            message_round: channelPosted.receipt.round,
            remove_round: channelRemoved.receipt.round,
            resumed_round: bobPaid.receipt.round,
            kept_round: channelLanded[0]?.round ?? null,
        },
        message: {
            parent_round: parentPosted.receipt.round,
            parent_note_bytes: parentPosted.receipt.noteBytes,
            payments: 1,
        },
        removal: {
            removed: alice.addr.toString(),
            round: removed.receipt.round,
            epoch: room.state().epoch,
            first_batch: kept.map((item) => ({ txid: item.txid, round: item.round, grouped: item.grouped })),
            missed_then_resumed: resumedReceipts.map((item) => ({ txid: item.txid, round: item.round, grouped: item.grouped })),
            kept_txid_still_confirmed: keptFirst.txid,
            old_message_still_opens: true,
            new_epoch_rejects_old_key: true,
        },
        delivery_batch: GROUP_DELIVER_BATCH,
        atomic_group: false,
    };
    mkdirSync(EVIDENCE, { recursive: true });
    writeFileSync(`${EVIDENCE}/localnet.json`, `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(JSON.stringify(evidence, null, 2));
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exit(1);
});
