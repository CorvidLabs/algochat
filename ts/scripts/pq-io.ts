/**
 * Stdin tool for the LocalNet cross-language check.
 * One JSON object per line. Responses are one JSON object per line.
 * Operations: identity, write, read.
 */
import { deriveEncryptionKeys } from "../src/crypto/keys.js";
import { deriveMLKEMKeyPair } from "../src/pq/kem.js";
import {
    acceptPQSession,
    decryptPQMessage,
    encryptPQMessage,
    initiatePQSession,
    openPQSessionAsSender,
} from "../src/pq/session.js";

interface Request {
    id: number;
    op: string;
    seed?: string;
    aliceSeed?: string;
    bobSeed?: string;
    text?: string;
    handshake?: string;
    message?: string;
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
    const { note, session } = initiatePQSession({
        sender: alice,
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

function read(aliceHex: string, bobHex: string, handshakeHex: string, messageHex: string, text: string): Record<string, unknown> {
    const alice = deriveEncryptionKeys(fromHex(aliceHex));
    const bob = deriveEncryptionKeys(fromHex(bobHex));
    const kem = deriveMLKEMKeyPair(fromHex(bobHex));
    const handshake = fromHex(handshakeHex);
    const message = fromHex(messageHex);
    const session = acceptPQSession(handshake, bob, kem.encapsKey, kem.decapsKey);
    const opened = decryptPQMessage(message, session);
    const sender = openPQSessionAsSender(handshake, alice);
    const senderPlain = decryptPQMessage(message, sender);
    if (opened !== text || senderPlain !== text) {
        throw new Error(`plaintext ${opened} / ${senderPlain}`);
    }
    if (!Buffer.from(session.sessionKey).equals(Buffer.from(sender.sessionKey))) {
        throw new Error("sender and recipient session keys differ");
    }
    return { sessionKey: toHex(session.sessionKey), recipient: opened, sender: senderPlain };
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
        } else throw new Error(`unknown op ${req.op}`);
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
