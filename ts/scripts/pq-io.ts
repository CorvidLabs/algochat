/**
 * Stdin tool for the LocalNet cross-language check.
 * One JSON object per line. Responses are one JSON object per line.
 * Operations: identity, write, read.
 */
import { decodeEnvelope, encodeEnvelope } from "../src/crypto/envelope.js";
import { decryptMessage, encryptMessage } from "../src/crypto/encryption.js";
import { deriveEncryptionKeys } from "../src/crypto/keys.js";
import {
    deriveGroupMessageKey,
    openGroupMembership,
    openGroupMessage,
    sealGroupMembership,
    sealGroupMessage,
} from "../src/pq/group.js";
import {
    deliveryAuthorized,
    draftAdmin,
    openGroupKeyDelivery,
    reduceAdmin,
    sealGroupKeyDelivery,
    senderMayPost,
    type AcceptedAdmin,
    type RoomState,
} from "../src/pq/group-admin.js";
import { deriveMLKEMKeyPair } from "../src/pq/kem.js";
import {
    acceptPQSession,
    decryptPQMessage,
    encryptPQMessage,
    initiatePQSession,
    openPQSessionAsSender,
} from "../src/pq/session.js";
import type { PQSession } from "../src/pq/types.js";
import { decodePSKEnvelope, encodePSKEnvelope } from "../src/psk/envelope.js";
import { decryptPSKMessage, encryptPSKMessage } from "../src/psk/encryption.js";
import { derivePSKAtCounter } from "../src/psk/ratchet.js";

interface Request {
    id: number;
    op: string;
    seed?: string;
    aliceSeed?: string;
    bobSeed?: string;
    text?: string;
    texts?: string[];
    handshake?: string;
    message?: string;
    note?: string;
    psk?: string;
    counter?: number;
    sessionKey?: string;
    senderPublicKey?: string;
    handshakeId?: string;
    action?: number;
    epoch?: number;
    groupId?: string;
    group_id?: string;
    mailbox?: string;
    groupKey?: string;
    group_key?: string;
    session_key?: string;
    sender_x25519?: string;
    handshake_id?: string;
    nonce?: string;
    senderAddress?: string;
    seen?: Array<{ epoch: number; counter: number }>;
    basis_state?: BasisState | null;
    admin_op?: number;
    subject?: string;
    name_utf8?: string;
    policy?: number;
    sender?: string;
    recipient?: string;
    admin_tx_id?: string;
    events?: AdminWireEvent[];
    parent_events?: AdminWireEvent[];
    parent_room?: BasisState | null;
    accepted?: AcceptedWire[];
    state?: BasisState | null;
}

interface BasisState {
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
}

interface AdminWireEvent {
    note: string;
    sender: string;
    tx_id: string;
    round: number;
    offset: number;
}

interface AcceptedWire {
    tx_id: string;
    sender: string;
    op: number;
    epoch: number;
    subject: string;
    members: string[];
}

function fromHex(hex: string): Uint8Array {
    if (hex.length % 2 !== 0) throw new Error("odd hex");
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return out;
}

function toHex(bytes: Uint8Array): string {
    return Buffer.from(bytes).toString("hex");
}

function reply(body: Record<string, unknown>): void {
    process.stdout.write(`${JSON.stringify(body)}\n`);
}

function identity(seedHex: string): Record<string, unknown> {
    const seed = fromHex(seedHex);
    const keys = deriveEncryptionKeys(seed);
    const kem = deriveMLKEMKeyPair(seed);
    return { x25519: toHex(keys.publicKey), encapsKey: toHex(kem.encapsKey) };
}

function write(aliceHex: string, bobHex: string, text: string): Record<string, unknown> {
    const alice = deriveEncryptionKeys(fromHex(aliceHex));
    const bob = deriveEncryptionKeys(fromHex(bobHex));
    const kem = deriveMLKEMKeyPair(fromHex(bobHex));
    const aliceKem = deriveMLKEMKeyPair(fromHex(aliceHex));
    const { note, session } = initiatePQSession({
        sender: alice,
        senderEncapsKey: aliceKem.encapsKey,
        recipientPublicKey: bob.publicKey,
        recipientEncapsKey: kem.encapsKey,
    });
    const message = encryptPQMessage(text, session);
    return {
        handshake: toHex(note),
        message: toHex(message),
        sessionKey: toHex(session.sessionKey),
    };
}

function pair(aliceHex: string, bobHex: string) {
    return {
        alice: deriveEncryptionKeys(fromHex(aliceHex)),
        bob: deriveEncryptionKeys(fromHex(bobHex)),
    };
}

function textOf(content: { text: string } | null, who: string): string {
    if (!content) throw new Error(`${who} saw a key publish`);
    return content.text;
}

function write01(aliceHex: string, bobHex: string, text: string): Record<string, unknown> {
    const { alice, bob } = pair(aliceHex, bobHex);
    const envelope = encryptMessage(text, alice.publicKey, bob.publicKey);
    return { note: toHex(encodeEnvelope(envelope)) };
}

function read01(aliceHex: string, bobHex: string, noteHex: string, text: string): Record<string, unknown> {
    const { alice, bob } = pair(aliceHex, bobHex);
    const envelope = decodeEnvelope(fromHex(noteHex));
    const recipient = textOf(decryptMessage(envelope, bob.privateKey, bob.publicKey), "bob");
    const sender = textOf(decryptMessage(envelope, alice.privateKey, alice.publicKey), "alice");
    if (recipient !== text || sender !== text) throw new Error(`plaintext ${recipient} / ${sender}`);
    return { recipient, sender };
}

function write02(aliceHex: string, bobHex: string, text: string, pskHex: string, counter: number): Record<string, unknown> {
    const { alice, bob } = pair(aliceHex, bobHex);
    const current = derivePSKAtCounter(fromHex(pskHex), counter);
    const envelope = encryptPSKMessage(text, alice.publicKey, bob.publicKey, current, counter);
    return { note: toHex(encodePSKEnvelope(envelope)) };
}

function read02(
    aliceHex: string,
    bobHex: string,
    noteHex: string,
    text: string,
    pskHex: string,
    counter: number
): Record<string, unknown> {
    const { alice, bob } = pair(aliceHex, bobHex);
    const current = derivePSKAtCounter(fromHex(pskHex), counter);
    const envelope = decodePSKEnvelope(fromHex(noteHex));
    const recipient = textOf(decryptPSKMessage(envelope, bob.privateKey, bob.publicKey, current), "bob");
    const sender = textOf(decryptPSKMessage(envelope, alice.privateKey, alice.publicKey, current), "alice");
    if (recipient !== text || sender !== text) throw new Error(`plaintext ${recipient} / ${sender}`);
    return { recipient, sender };
}

function write05s(aliceHex: string, bobHex: string, texts: string[]): Record<string, unknown> {
    const { alice, bob } = pair(aliceHex, bobHex);
    const kem = deriveMLKEMKeyPair(fromHex(bobHex));
    const aliceKem = deriveMLKEMKeyPair(fromHex(aliceHex));
    const { note, session } = initiatePQSession({
        sender: alice,
        senderEncapsKey: aliceKem.encapsKey,
        recipientPublicKey: bob.publicKey,
        recipientEncapsKey: kem.encapsKey,
    });
    return {
        handshake: toHex(note),
        messages: texts.map((text) => toHex(encryptPQMessage(text, session))),
        sessionKey: toHex(session.sessionKey),
    };
}

function read(aliceHex: string, bobHex: string, handshakeHex: string, messageHex: string, text: string): Record<string, unknown> {
    const alice = deriveEncryptionKeys(fromHex(aliceHex));
    const bob = deriveEncryptionKeys(fromHex(bobHex));
    const kem = deriveMLKEMKeyPair(fromHex(bobHex));
    const handshake = fromHex(handshakeHex);
    const message = fromHex(messageHex);
    const session = acceptPQSession(handshake, bob, kem.encapsKey, kem.decapsKey);
    const opened = decryptPQMessage(message, session);
    const aliceKem = deriveMLKEMKeyPair(fromHex(aliceHex));
    const sender = openPQSessionAsSender(handshake, alice, aliceKem.decapsKey);
    const senderPlain = decryptPQMessage(message, sender);
    if (opened !== text || senderPlain !== text) {
        throw new Error(`plaintext ${opened} / ${senderPlain}`);
    }
    if (!Buffer.from(session.sessionKey).equals(Buffer.from(sender.sessionKey))) {
        throw new Error("sender and recipient session keys differ");
    }
    return { sessionKey: toHex(session.sessionKey), recipient: opened, sender: senderPlain };
}

function groupSession(req: Request): PQSession {
    return {
        sessionKey: fromHex(req.sessionKey ?? ""),
        senderPublicKey: fromHex(req.senderPublicKey ?? ""),
        recipientPublicKey: new Uint8Array(32),
        handshakeId: fromHex(req.handshakeId ?? ""),
    };
}

function groupSeal(req: Request): Record<string, unknown> {
    const note = sealGroupMembership(
        groupSession(req),
        {
            action: Number(req.action ?? 0),
            epoch: Number(req.epoch ?? 0),
            groupId: fromHex(req.groupId ?? ""),
            mailbox: fromHex(req.mailbox ?? ""),
            groupKey: fromHex(req.groupKey ?? ""),
        },
        req.nonce ? fromHex(req.nonce) : undefined
    );
    return { note: toHex(note) };
}

function groupOpen(req: Request): Record<string, unknown> {
    const opened = openGroupMembership(fromHex(req.note ?? ""), groupSession(req));
    return {
        action: opened.action,
        epoch: opened.epoch,
        groupId: toHex(opened.groupId),
        mailbox: toHex(opened.mailbox),
        groupKey: toHex(opened.groupKey),
    };
}

function groupWrite(req: Request): Record<string, unknown> {
    const note = sealGroupMessage(
        new TextEncoder().encode(req.text ?? ""),
        fromHex(req.groupKey ?? ""),
        fromHex(req.groupId ?? ""),
        Number(req.epoch ?? 0),
        Number(req.counter ?? 0),
        fromHex(req.senderAddress ?? ""),
        req.nonce ? fromHex(req.nonce) : undefined
    );
    return {
        note: toHex(note),
        messageKey: toHex(
            deriveGroupMessageKey(
                fromHex(req.groupKey ?? ""),
                Number(req.epoch ?? 0),
                Number(req.counter ?? 0),
                fromHex(req.groupId ?? ""),
                fromHex(req.senderAddress ?? "")
            )
        ),
    };
}

function reviveRoom(state: BasisState | null | undefined): RoomState | null {
    if (!state) return null;
    return {
        groupId: fromHex(state.group_id),
        mailbox: fromHex(state.mailbox),
        parentGroupId: state.parent_group_id ? fromHex(state.parent_group_id) : new Uint8Array(32),
        owner: fromHex(state.owner),
        admins: state.admins.map(fromHex),
        members: state.members.map(fromHex),
        pending: state.pending.map(fromHex),
        policy: state.policy,
        name: fromHex(state.name_hex),
        epoch: state.epoch,
        headTxId: fromHex(state.head_tx_id),
    };
}

function snapRoom(state: RoomState | null): BasisState | null {
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
    };
}

function snapAccepted(item: AcceptedAdmin): AcceptedWire {
    return {
        tx_id: toHex(item.txId),
        sender: toHex(item.sender),
        op: item.op,
        epoch: item.epoch,
        subject: toHex(item.subject),
        members: item.members.map(toHex),
    };
}

function adminDraft(req: Request): Record<string, unknown> {
    const note = draftAdmin(reviveRoom(req.basis_state), {
        op: Number(req.admin_op ?? 0),
        sender: fromHex(req.sender ?? ""),
        subject: req.subject ? fromHex(req.subject) : undefined,
        name: req.name_utf8 === undefined ? undefined : new TextEncoder().encode(req.name_utf8),
        policy: req.policy,
        groupId: req.group_id ? fromHex(req.group_id) : undefined,
        mailbox: req.mailbox ? fromHex(req.mailbox) : undefined,
        parentRoom: req.parent_room ? reviveRoom(req.parent_room) ?? undefined : undefined,
    });
    return { note: toHex(note) };
}

function wireEvent(item: { note: string; sender: string; tx_id: string; round: number; offset: number }) {
    return {
        note: fromHex(item.note),
        sender: fromHex(item.sender),
        txId: fromHex(item.tx_id),
        round: item.round,
        offset: item.offset,
    };
}

function adminReduce(req: Request): Record<string, unknown> {
    const events = (req.events ?? []).map(wireEvent);
    const parent = req.parent_events?.map(wireEvent);
    const reduced = reduceAdmin(events, parent);
    return {
        state: snapRoom(reduced.state),
        accepted: reduced.accepted.map(snapAccepted),
        rejected: reduced.rejected.map((item) => ({ tx_id: toHex(item.txId), reason: item.reason })),
    };
}

function deliverSession(req: Request): PQSession {
    return {
        sessionKey: fromHex(req.session_key ?? req.sessionKey ?? ""),
        senderPublicKey: fromHex(req.sender_x25519 ?? req.senderPublicKey ?? ""),
        recipientPublicKey: new Uint8Array(32),
        handshakeId: fromHex(req.handshake_id ?? req.handshakeId ?? ""),
    };
}

function deliverSeal(req: Request): Record<string, unknown> {
    const note = sealGroupKeyDelivery(
        deliverSession(req),
        Number(req.epoch ?? 0),
        fromHex(req.group_id ?? req.groupId ?? ""),
        fromHex(req.mailbox ?? ""),
        fromHex(req.group_key ?? req.groupKey ?? ""),
        fromHex(req.admin_tx_id ?? ""),
        req.nonce ? fromHex(req.nonce) : undefined,
    );
    return { note: toHex(note) };
}

function deliverOpen(req: Request): Record<string, unknown> {
    const opened = openGroupKeyDelivery(fromHex(req.note ?? ""), deliverSession(req));
    return {
        epoch: opened.epoch,
        group_id: toHex(opened.groupId),
        mailbox: toHex(opened.mailbox),
        group_key: toHex(opened.groupKey),
        admin_tx_id: toHex(opened.adminTxId),
    };
}

function mayPost(req: Request): Record<string, unknown> {
    const state = reviveRoom(req.state);
    if (!state) throw new Error("missing room");
    return { allowed: senderMayPost(state, fromHex(req.sender ?? ""), Number(req.epoch ?? 0)) };
}

function deliveryOk(req: Request): Record<string, unknown> {
    const accepted: AcceptedAdmin[] = (req.accepted ?? []).map((item) => ({
        txId: fromHex(item.tx_id),
        sender: fromHex(item.sender),
        op: item.op,
        epoch: item.epoch,
        subject: fromHex(item.subject),
        members: item.members.map(fromHex),
    }));
    return {
        allowed: deliveryAuthorized(
            accepted,
            fromHex(req.admin_tx_id ?? ""),
            fromHex(req.sender ?? ""),
            fromHex(req.recipient ?? ""),
            Number(req.epoch ?? 0),
        ),
    };
}

function groupRead(req: Request): Record<string, unknown> {
    const opened = openGroupMessage(
        fromHex(req.note ?? ""),
        fromHex(req.groupKey ?? ""),
        fromHex(req.senderAddress ?? ""),
        req.seen ?? []
    );
    const text = new TextDecoder().decode(opened.plaintext);
    if ((req.text ?? "") !== "" && text !== req.text) throw new Error(`plaintext ${text}`);
    return { text, epoch: opened.epoch, counter: opened.counter, groupId: toHex(opened.groupId) };
}

function handle(line: string): void {
    let req: Request;
    try {
        req = JSON.parse(line) as Request;
    } catch (error) {
        reply({ id: 0, ok: false, error: error instanceof Error ? error.message : "bad json" });
        return;
    }
    try {
        let body: Record<string, unknown>;
        if (req.op === "identity") body = identity(req.seed ?? "");
        else if (req.op === "write") body = write(req.aliceSeed ?? "", req.bobSeed ?? "", req.text ?? "");
        else if (req.op === "read") {
            body = read(req.aliceSeed ?? "", req.bobSeed ?? "", req.handshake ?? "", req.message ?? "", req.text ?? "");
        } else if (req.op === "write01") body = write01(req.aliceSeed ?? "", req.bobSeed ?? "", req.text ?? "");
        else if (req.op === "read01") body = read01(req.aliceSeed ?? "", req.bobSeed ?? "", req.note ?? "", req.text ?? "");
        else if (req.op === "write02") {
            body = write02(req.aliceSeed ?? "", req.bobSeed ?? "", req.text ?? "", req.psk ?? "", Number(req.counter ?? 0));
        } else if (req.op === "read02") {
            body = read02(
                req.aliceSeed ?? "",
                req.bobSeed ?? "",
                req.note ?? "",
                req.text ?? "",
                req.psk ?? "",
                Number(req.counter ?? 0)
            );
        } else if (req.op === "write05s") body = write05s(req.aliceSeed ?? "", req.bobSeed ?? "", req.texts ?? []);
        else if (req.op === "groupSeal") body = groupSeal(req);
        else if (req.op === "groupOpen") body = groupOpen(req);
        else if (req.op === "groupWrite") body = groupWrite(req);
        else if (req.op === "groupRead") body = groupRead(req);
        else if (req.op === "adminDraft") body = adminDraft(req);
        else if (req.op === "adminReduce") body = adminReduce(req);
        else if (req.op === "deliverSeal") body = deliverSeal(req);
        else if (req.op === "deliverOpen") body = deliverOpen(req);
        else if (req.op === "senderMayPost") body = mayPost(req);
        else if (req.op === "deliveryAuthorized") body = deliveryOk(req);
        else throw new Error(`unknown op ${req.op}`);
        reply({ id: req.id, ok: true, ...body });
    } catch (error) {
        reply({ id: req.id, ok: false, error: error instanceof Error ? error.message : "failed" });
    }
}

let pending = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk: string) => {
    pending += chunk;
    while (true) {
        const nl = pending.indexOf("\n");
        if (nl < 0) break;
        const line = pending.slice(0, nl).trim();
        pending = pending.slice(nl + 1);
        if (line) handle(line);
    }
});
