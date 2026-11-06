/**
 * Write vectors/room-session-v1.json: one administered room joined over real
 * Hybrid sessions, from the TypeScript room, session and mailbox code.
 * Run from ts/: bun scripts/emit-room-session-vector.ts [output directory]
 *
 * Every input is synthetic. The owner's account seed is 0x80..0x9f, the two
 * members' are 0xa0..0xbf and 0xc0..0xdf, and the outsider's is 0xe0..0xff.
 * An account's address is its Ed25519 public key, as on Algorand. Transaction
 * ids are fill bytes; this file does not prove blockchain authentication.
 *
 * The library draws ephemeral keys, ML-KEM coins, nonces and the room key from
 * crypto.getRandomValues. This script, and only this script, replaces that
 * function with a SHA-256 counter stream under a fixed label (the same stream
 * as ts/scripts/emit-conversation-vectors.ts), so every run writes the same
 * bytes. The library code is unchanged.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ed25519 } from "@noble/curves/ed25519";
import { sha256 } from "@noble/hashes/sha256";
import { deriveEncryptionKeys } from "../src/crypto/keys.js";
import { openGroupMessage, sealGroupMessage } from "../src/pq/group.js";
import {
    ADMIN_OP,
    JOINING,
    deliveryAuthorized,
    draftAdmin,
    openGroupKeyDelivery,
    reduceAdmin,
    sealGroupKeyDelivery,
    senderMayPost,
    type AdminEvent,
    type RoomState,
} from "../src/pq/group-admin.js";
import { deriveMLKEMKeyPair } from "../src/pq/kem.js";
import { acceptPQSession, initiatePQSession, openPQSessionAsSender } from "../src/pq/session.js";
import type { PQSession } from "../src/pq/types.js";

type Name = "owner" | "member_a" | "member_b" | "outsider";
type Expect = "accepted" | "rejected";

const FILE = "room-session-v1.json";
const GENERATED_BY = "ts/scripts/emit-room-session-vector.ts";

// ---------------------------------------------------------------------------
// Deterministic random stream (this script only)
// ---------------------------------------------------------------------------

let streamLabel: string | null = null;
let streamCounter = 0;

function useStream(label: string): void {
    streamLabel = label;
    streamCounter = 0;
}

function fillFromStream(target: Uint8Array): void {
    if (streamLabel === null) throw new Error("random draw outside a vector stream");
    for (let offset = 0; offset < target.length; offset += 32) {
        const block = sha256(new TextEncoder().encode(`${streamLabel}:${streamCounter++}`));
        target.set(block.subarray(0, Math.min(32, target.length - offset)), offset);
    }
}

const webCrypto = globalThis.crypto as { getRandomValues: <T extends ArrayBufferView>(array: T) => T };
webCrypto.getRandomValues = <T extends ArrayBufferView>(array: T): T => {
    fillFromStream(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
    return array;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hex(value: Uint8Array): string {
    return Buffer.from(value).toString("hex");
}

function seq(start: number): Uint8Array {
    return new Uint8Array(32).map((_, index) => start + index);
}

function fill(byte: number, length = 32): Uint8Array {
    return new Uint8Array(length).fill(byte);
}

function text(value: string): Uint8Array {
    return new TextEncoder().encode(value);
}

function flip(note: Uint8Array, offset: number): Uint8Array {
    const copy = note.slice();
    copy[offset] ^= 0x01;
    return copy;
}

function must(label: string, condition: boolean): void {
    if (!condition) throw new Error(`self-check failed: ${label}`);
}

function outcome(run: () => unknown): Expect {
    try {
        run();
        return "accepted";
    } catch {
        return "rejected";
    }
}

function account(seed: Uint8Array) {
    return {
        seed,
        address: ed25519.getPublicKey(seed),
        x25519: deriveEncryptionKeys(seed),
        mlkem: deriveMLKEMKeyPair(seed),
    };
}

const accounts: Record<Name, ReturnType<typeof account>> = {
    owner: account(seq(0x80)),
    member_a: account(seq(0xa0)),
    member_b: account(seq(0xc0)),
    outsider: account(seq(0xe0)),
};

function nameOf(address: Uint8Array): Name {
    const found = (Object.keys(accounts) as Name[]).find((name) => hex(accounts[name].address) === hex(address));
    if (!found) throw new Error("unknown address");
    return found;
}

// ---------------------------------------------------------------------------
// The room
// ---------------------------------------------------------------------------

function build(): Record<string, unknown> {
    useStream("AlgoChat test vector room-session-v1");
    const groupId = fill(0x77);
    const mailbox = fill(0x88);
    const name = text("team");

    // Administration: the owner creates an invite-only room and adds both members.
    const events: AdminEvent[] = [];
    const admin: Array<{ name: string; sender: Name; tx_id: string; round: number; offset: number; note: string }> = [];
    let state: RoomState | null = null;
    const post = (label: string, op: number, subject: Name | null, txByte: number, round: number) => {
        const note = draftAdmin(state, {
            op,
            sender: accounts.owner.address,
            subject: subject ? accounts[subject].address : undefined,
            name,
            policy: JOINING.INVITE,
            groupId,
            mailbox,
        });
        const event: AdminEvent = { note, sender: accounts.owner.address, txId: fill(txByte), round, offset: 0 };
        events.push(event);
        const reduced = reduceAdmin(events);
        must(`${label} accepted`, reduced.rejected.length === 0 && reduced.state !== null);
        state = reduced.state;
        admin.push({ name: label, sender: "owner", tx_id: hex(event.txId), round, offset: 0, note: hex(note) });
        return event.txId;
    };
    post("create", ADMIN_OP.CREATE, null, 0x01, 100);
    const addA = post("add member_a", ADMIN_OP.ADD_MEMBER, "member_a", 0x02, 101);
    const addB = post("add member_b", ADMIN_OP.ADD_MEMBER, "member_b", 0x03, 102);
    const reduced = reduceAdmin(events);
    const room = reduced.state;
    if (!room) throw new Error("no room");
    must("epoch 1", room.epoch === 1);
    must("three members", room.members.length === 3);

    // The owner generates the room key locally (the reducer never does).
    const groupKey = new Uint8Array(32);
    crypto.getRandomValues(groupKey);

    // A Hybrid handshake from the owner to each member, and that member's action-5 delivery under it.
    const handshakes: Array<{ name: string; sender: Name; recipient: Name; note: Uint8Array; session: PQSession }> = [];
    const deliveries: Array<{ name: string; recipient: Name; handshake: string; admin_tx_id: Uint8Array; note: Uint8Array }> = [];
    for (const [recipient, txId] of [["member_a", addA], ["member_b", addB]] as Array<[Name, Uint8Array]>) {
        const { note, session } = initiatePQSession({
            sender: accounts.owner.x25519,
            senderEncapsKey: accounts.owner.mlkem.encapsKey,
            recipientPublicKey: accounts[recipient].x25519.publicKey,
            recipientEncapsKey: accounts[recipient].mlkem.encapsKey,
        });
        const handshake = `owner-to-${recipient}`;
        handshakes.push({ name: handshake, sender: "owner", recipient, note, session });
        const delivery = sealGroupKeyDelivery(session, room.epoch, groupId, mailbox, groupKey, txId);
        must(`${recipient} delivery is 227 bytes`, delivery.length === 227);
        deliveries.push({ name: `key for ${recipient}`, recipient, handshake, admin_tx_id: txId, note: delivery });
    }

    // Self-check: each member recovers its session from the note alone and opens its key;
    // the owner recovers its own copy of each session from the note.
    const recipientSession = (recipient: Name, note: Uint8Array): PQSession =>
        acceptPQSession(note, accounts[recipient].x25519, accounts[recipient].mlkem.encapsKey, accounts[recipient].mlkem.decapsKey);
    for (const handshake of handshakes) {
        const mine = recipientSession(handshake.recipient, handshake.note);
        must(`${handshake.name} recipient key`, hex(mine.sessionKey) === hex(handshake.session.sessionKey));
        const own = openPQSessionAsSender(handshake.note, accounts.owner.x25519, accounts.owner.mlkem.decapsKey);
        must(`${handshake.name} sender key`, hex(own.sessionKey) === hex(handshake.session.sessionKey));
    }
    for (const delivery of deliveries) {
        const handshake = handshakes.find((item) => item.name === delivery.handshake);
        if (!handshake) throw new Error("no handshake");
        const opened = openGroupKeyDelivery(delivery.note, recipientSession(delivery.recipient, handshake.note));
        must(`${delivery.name} key`, hex(opened.groupKey) === hex(groupKey));
        must(
            `${delivery.name} authorized`,
            deliveryAuthorized(reduced.accepted, opened.adminTxId, accounts.owner.address, accounts[delivery.recipient].address, opened.epoch),
        );
    }

    // Mailbox messages from all three members, each sender counting from 0.
    const counters: Record<Name, number> = { owner: 0, member_a: 0, member_b: 0, outsider: 0 };
    const messages: Array<{ index: number; sender: Name; epoch: number; counter: number; plaintext: string; note: Uint8Array }> = [];
    const say = (sender: Name, plaintext: string) => {
        const counter = counters[sender]++;
        const note = sealGroupMessage(text(plaintext), groupKey, groupId, room.epoch, counter, accounts[sender].address);
        messages.push({ index: messages.length, sender, epoch: room.epoch, counter, plaintext, note });
    };
    say("owner", "Welcome to the team room.");
    say("member_a", "Thanks! Glad to be here.");
    say("member_b", "Hello, everyone.");
    say("owner", "");
    say("member_a", "Grüße aus Köln 👋");
    say("member_b", "line one\nline two");
    say("owner", "x".repeat(280));
    say("member_b", "Last one from me.");

    // Self-check: every message opens for every member under the delivered key, once.
    for (const message of messages) {
        const accepted = messages
            .filter((item) => item.sender === message.sender && item.index < message.index)
            .map((item) => ({ epoch: item.epoch, counter: item.counter }));
        const opened = openGroupMessage(message.note, groupKey, accounts[message.sender].address, accepted);
        must(`message ${message.index}`, new TextDecoder().decode(opened.plaintext) === message.plaintext);
        must(`message ${message.index} sender may post`, senderMayPost(room, accounts[message.sender].address, message.epoch));
    }

    // The outsider holds the key (for example from a leaked device) and posts: the note opens,
    // but the outsider is not a member, so a client ignores it.
    const outsiderNote = sealGroupMessage(text("not a member"), groupKey, groupId, room.epoch, 0, accounts.outsider.address);
    must("outsider may not post", !senderMayPost(room, accounts.outsider.address, room.epoch));

    // Cases.
    const cases: Array<Record<string, unknown>> = [];
    const handshakeA = handshakes[0];
    const handshakeB = handshakes[1];
    const deliveryA = deliveries[0];
    const deliveryB = deliveries[1];
    const openDelivery = (caseName: string, accountName: Name, handshake: typeof handshakeA, note: Uint8Array) => {
        const expect = outcome(() => openGroupKeyDelivery(note, recipientSession(accountName, handshake.note)));
        cases.push({ name: caseName, op: "open_delivery", account: accountName, handshake: handshake.name, note: hex(note), expect });
        return expect;
    };
    must("a member opens its own key", openDelivery("member_a opens its key", "member_a", handshakeA, deliveryA.note) === "accepted");
    openDelivery("member_b cannot open member_a's key under its own session", "member_b", handshakeB, deliveryA.note);
    openDelivery("member_a rejects a changed tag", "member_a", handshakeA, flip(deliveryA.note, 226));
    openDelivery("member_a rejects a changed handshake id", "member_a", handshakeA, flip(deliveryA.note, 40));
    openDelivery("member_a rejects a 226-byte delivery", "member_a", handshakeA, deliveryA.note.slice(0, 226));

    const authorize = (caseName: string, txId: Uint8Array, sender: Name, recipient: Name, epoch: number) => {
        const expect: Expect = deliveryAuthorized(reduced.accepted, txId, accounts[sender].address, accounts[recipient].address, epoch)
            ? "accepted"
            : "rejected";
        cases.push({ name: caseName, op: "authorize", admin_tx_id: hex(txId), sender, recipient, epoch, expect });
        return expect;
    };
    authorize("the add of member_a authorizes member_a", addA, "owner", "member_a", 1);
    authorize("the add of member_b authorizes member_b", addB, "owner", "member_b", 1);
    authorize("the add of member_a does not authorize member_b", addA, "owner", "member_b", 1);
    authorize("the create authorizes no delivery", fill(0x01), "owner", "member_a", 1);
    authorize("a delivery from member_b is not authorized", addA, "member_b", "member_a", 1);
    authorize("a delivery at epoch 2 is not authorized", addA, "owner", "member_a", 2);
    authorize("an unknown record authorizes nothing", fill(0x09), "owner", "member_a", 1);
    authorize("the outsider is never authorized", addA, "owner", "outsider", 1);

    const openMessage = (caseName: string, sender: Name, note: Uint8Array, accepted: Array<[number, number]>) => {
        const opened = outcome(() =>
            openGroupMessage(note, groupKey, accounts[sender].address, accepted.map(([epoch, counter]) => ({ epoch, counter }))),
        );
        const expect: Expect = opened === "accepted" && senderMayPost(room, accounts[sender].address, 1) ? "accepted" : "rejected";
        cases.push({ name: caseName, op: "open_message", sender, accepted, note: hex(note), expect });
        return expect;
    };
    openMessage("the owner's message 0 a second time is a repeat", "owner", messages[0].note, [[1, 0]]);
    openMessage("member_a's counter 0 opens: replay state is per sender", "member_a", messages[1].note, []);
    openMessage("member_a's message relabelled as member_b's", "member_b", messages[1].note, []);
    openMessage("a changed tag", "owner", flip(messages[0].note, messages[0].note.length - 1), []);
    openMessage("a changed counter field", "owner", flip(messages[0].note, 41), []);
    openMessage("a changed epoch field", "owner", flip(messages[0].note, 37), []);
    must("outsider ignored", openMessage("the outsider's note opens but is ignored", "outsider", outsiderNote, []) === "rejected");

    return {
        description:
            "One administered room joined over real Hybrid sessions (PROTOCOL.md sections 5.7 and 5.8), from the TypeScript reference. "
            + "Synthetic inputs only; keys come from each account seed and an address is the account's Ed25519 public key. "
            + "The owner creates an invite-only room (delta 0x03 records), adds two members, sends each a 0x04 handshake and "
            + "under it a 227-byte 0x06 action-5 delivery of the room key, and all three post 0x07 messages with per-sender counters. "
            + "A member recovers its session from the note and its own seed, opens its delivery, checks it against the accepted records, "
            + "and reads every message. The outsider's note opens under the key but is ignored. Each case is accepted or rejected; "
            + "an open_message case is accepted only when the note opens with no repeated (epoch, counter) for that sender and the sender may post.",
        generated_by: GENERATED_BY,
        accounts: Object.fromEntries((Object.keys(accounts) as Name[]).map((key) => [key, {
            seed: hex(accounts[key].seed),
            address: hex(accounts[key].address),
            x25519_public: hex(accounts[key].x25519.publicKey),
            encaps_key: hex(accounts[key].mlkem.encapsKey),
        }])),
        room: { group_id: hex(groupId), mailbox: hex(mailbox), name: "team", epoch: room.epoch, group_key: hex(groupKey) },
        admin,
        state: {
            owner: nameOf(room.owner),
            admins: room.admins.map(nameOf),
            members: room.members.map(nameOf).sort(),
            epoch: room.epoch,
            head_tx_id: hex(room.headTxId),
        },
        handshakes: handshakes.map((item) => ({
            name: item.name,
            sender: item.sender,
            recipient: item.recipient,
            note: hex(item.note),
            handshake_id: hex(item.session.handshakeId),
            session_key: hex(item.session.sessionKey),
        })),
        deliveries: deliveries.map((item) => ({
            name: item.name,
            recipient: item.recipient,
            handshake: item.handshake,
            admin_tx_id: hex(item.admin_tx_id),
            note: hex(item.note),
        })),
        messages: messages.map((item) => ({
            index: item.index,
            sender: item.sender,
            epoch: item.epoch,
            counter: item.counter,
            plaintext: item.plaintext,
            note: hex(item.note),
        })),
        outsider_note: hex(outsiderNote),
        cases,
    };
}

const outputDirectory = process.argv[2] ?? new URL("../../vectors/", import.meta.url).pathname;
const path = join(outputDirectory, FILE);
writeFileSync(path, JSON.stringify(build(), null, 2) + "\n");
console.log(`wrote ${path}`);
