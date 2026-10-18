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
    mailbox?: string;
    groupKey?: string;
    nonce?: string;
    senderAddress?: string;
    seen?: Array<{ epoch: number; counter: number }>;
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
