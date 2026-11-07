/**
 * Write vectors/pq-conversation-v1.json and vectors/psk-kept-v1.json from the
 * TypeScript Hybrid session and Extra lock code.
 * Run from ts/: bun scripts/emit-conversation-vectors.ts [output directory]
 *
 * Every input is synthetic. Alice's account seed is 0x00..0x1f and Bob's is
 * 0x20..0x3f, the seeds of ts/conformance/vectors/01-key-derivation.json; the
 * kept Extra lock secret is 0x40..0x5f and the wrong one is 0x60..0x7f. No
 * real mnemonic or key material.
 *
 * The library draws its ephemeral keys, ML-KEM coins and nonces from
 * crypto.getRandomValues. This script, and only this script, replaces that
 * function with a SHA-256 counter stream under a fixed label per file, so
 * every run writes the same bytes. The library code is unchanged.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { sha256 } from "@noble/hashes/sha256";
import { deriveEncryptionKeys } from "../src/crypto/keys.js";
import { deriveMLKEMKeyPair } from "../src/pq/kem.js";
import {
    acceptPQSession,
    decryptPQMessage,
    encryptPQMessage,
    initiatePQSession,
    openPQSessionAsSender,
} from "../src/pq/session.js";
import { PQ_MAX_PAYLOAD_SIZE, type PQSession } from "../src/pq/types.js";
import { decryptPSKMessage, encryptPSKMessage } from "../src/psk/encryption.js";
import { decodePSKEnvelope, encodePSKEnvelope } from "../src/psk/envelope.js";
import { derivePSKAtCounter } from "../src/psk/ratchet.js";
import { createPSKState, recordReceive, validateCounter } from "../src/psk/state.js";
import { PSK_PROTOCOL, type PSKState } from "../src/psk/types.js";

type Name = "alice" | "bob";
type Expect = "accepted" | "rejected";

const CONVERSATION_FILE = "pq-conversation-v1.json";
const KEPT_FILE = "psk-kept-v1.json";
const GENERATED_BY = "ts/scripts/emit-conversation-vectors.ts";

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

function withByte(note: Uint8Array, offset: number, change: (byte: number) => number): Uint8Array {
    const copy = note.slice();
    copy[offset] = change(copy[offset]);
    return copy;
}

const flip = (note: Uint8Array, offset: number): Uint8Array => withByte(note, offset, (byte) => byte ^ 0x01);

function extend(note: Uint8Array, length: number): Uint8Array {
    const copy = new Uint8Array(length);
    copy.set(note.subarray(0, Math.min(length, note.length)));
    return copy;
}

function attempt<Value>(run: () => Value): Value | undefined {
    try {
        return run();
    } catch {
        return undefined;
    }
}

function equal(left: Uint8Array, right: Uint8Array): boolean {
    return hex(left) === hex(right);
}

/** A printable ASCII text of exactly `length` bytes. */
function filler(prefix: string, length: number): string {
    let text = prefix;
    for (let index = 0; text.length < length; index++) text += String.fromCharCode(0x21 + (index % 94));
    return text.slice(0, length);
}

function account(seed: Uint8Array) {
    const x25519 = deriveEncryptionKeys(seed);
    const mlkem = deriveMLKEMKeyPair(seed);
    return { seed, x25519, mlkem };
}

const accounts = { alice: account(seq(0x00)), bob: account(seq(0x20)) };

function other(name: Name): Name {
    return name === "alice" ? "bob" : "alice";
}

// ---------------------------------------------------------------------------
// Hybrid conversation (0x04 and 0x05)
// ---------------------------------------------------------------------------

interface Handshake {
    name: string;
    sender: Name;
    recipient: Name;
    note: Uint8Array;
    session: PQSession;
}

function handshakeName(sender: Name): string {
    return `${sender}-to-${other(sender)}`;
}

/** The session `name` gets from a handshake: recovered as its sender, or accepted as its recipient. */
function sessionFor(name: Name, handshake: Handshake): PQSession {
    const keys = accounts[name];
    return name === handshake.sender
        ? openPQSessionAsSender(handshake.note, keys.x25519, keys.mlkem.decapsKey)
        : acceptPQSession(handshake.note, keys.x25519, keys.mlkem.encapsKey, keys.mlkem.decapsKey);
}

const ALICE_TEXTS = [
    "",
    "a",
    "Hi Bob, it's Alice on Raven web.",
    "héllo 👋 — مرحبا — 你好",
    "line one\nline two\n",
    filler("Alice, 280 bytes: ", 280),
];

const BOB_TEXTS = [
    "Hi Alice, Bob here on Raven Desktop.",
    "",
    "b",
    "ça va? 🦀 — שלום — こんにちは",
    "\ttabbed\r\nwindows line\r\n",
    filler("Bob, 280 bytes: ", 280),
];

const MESSAGES_EACH_WAY = 32;

function textAt(name: Name, index: number): string {
    const texts = name === "alice" ? ALICE_TEXTS : BOB_TEXTS;
    if (index < texts.length) return texts[index];
    if (index === MESSAGES_EACH_WAY - 1) return filler(`${name} at the limit: `, PQ_MAX_PAYLOAD_SIZE);
    return `${name} message ${index + 1} of ${MESSAGES_EACH_WAY}`;
}

function buildConversation(): Record<string, unknown> {
    useStream("AlgoChat test vector pq-conversation-v1");
    const handshakes: Handshake[] = [];
    const start = (sender: Name): Handshake => {
        const recipient = other(sender);
        const { note, session } = initiatePQSession({
            sender: accounts[sender].x25519,
            senderEncapsKey: accounts[sender].mlkem.encapsKey,
            recipientPublicKey: accounts[recipient].x25519.publicKey,
            recipientEncapsKey: accounts[recipient].mlkem.encapsKey,
        });
        const handshake = { name: handshakeName(sender), sender, recipient, note, session };
        handshakes.push(handshake);
        return handshake;
    };

    // Alice opens the conversation; Bob accepts it, then starts his own handshake to reply.
    const aliceToBob = start("alice");
    const messages: Array<{ index: number; handshake: string; plaintext: string; note: Uint8Array }> = [];
    const send = (handshake: Handshake, plaintext: string): Uint8Array => {
        const note = encryptPQMessage(plaintext, handshake.session);
        messages.push({ index: messages.length, handshake: handshake.name, plaintext, note });
        return note;
    };
    send(aliceToBob, textAt("alice", 0));
    const bobToAlice = start("bob");
    send(bobToAlice, textAt("bob", 0));
    for (let index = 1; index < MESSAGES_EACH_WAY; index++) {
        send(aliceToBob, textAt("alice", index));
        send(bobToAlice, textAt("bob", index));
    }

    for (const handshake of handshakes) {
        for (const name of [handshake.sender, handshake.recipient]) {
            const session = sessionFor(name, handshake);
            if (!equal(session.sessionKey, handshake.session.sessionKey)) throw new Error(`${name} recovers a different ${handshake.name} key`);
        }
    }
    for (const message of messages) {
        const handshake = handshakes.find((item) => item.name === message.handshake);
        if (!handshake) throw new Error(`unknown handshake ${message.handshake}`);
        for (const name of [handshake.sender, handshake.recipient]) {
            if (decryptPQMessage(message.note, sessionFor(name, handshake)) !== message.plaintext) {
                throw new Error(`${name} cannot read message ${message.index}`);
            }
        }
    }

    const longest = messages[messages.length - 2].note;
    if (longest.length !== 4096) throw new Error(`the longest Alice note is ${longest.length} bytes`);
    const firstAlice = messages[0].note;
    const shortAlice = messages[2].note;
    const bobKey = accounts.bob.x25519.publicKey;

    type Case = [string, "accept" | "open_as_sender" | "decrypt", Name, Handshake, Uint8Array, Expect];
    const intended: Case[] = [
        ["Alice cannot accept her own handshake to Bob", "accept", "alice", aliceToBob, aliceToBob.note, "rejected"],
        ["Bob rejects a changed encapsulation-key hash", "accept", "bob", aliceToBob, flip(aliceToBob.note, 1186), "rejected"],
        ["Bob still accepts when only the sender wrap changed", "accept", "bob", aliceToBob, flip(aliceToBob.note, 2318), "accepted"],
        ["Bob rejects a handshake one byte short", "accept", "bob", aliceToBob, aliceToBob.note.slice(0, 2365), "rejected"],
        ["Bob rejects a message offered as a handshake", "accept", "bob", aliceToBob, firstAlice, "rejected"],
        ["Bob cannot recover Alice's handshake as its sender", "open_as_sender", "bob", aliceToBob, aliceToBob.note, "rejected"],
        ["Alice rejects a changed sender wrap", "open_as_sender", "alice", aliceToBob, flip(aliceToBob.note, 2318), "rejected"],
        ["Alice rejects a changed handshake nonce", "open_as_sender", "alice", aliceToBob, flip(aliceToBob.note, 2306), "rejected"],
        ["Alice rejects a changed recipient ML-KEM ciphertext", "open_as_sender", "alice", aliceToBob, flip(aliceToBob.note, 98), "rejected"],
        ["Alice's message does not open under Bob's handshake", "decrypt", "alice", bobToAlice, shortAlice, "rejected"],
        ["Bob rejects a changed tag", "decrypt", "bob", aliceToBob, flip(shortAlice, shortAlice.length - 1), "rejected"],
        ["Bob rejects a changed message nonce", "decrypt", "bob", aliceToBob, flip(shortAlice, 66), "rejected"],
        ["Bob rejects a changed handshake id", "decrypt", "bob", aliceToBob, flip(shortAlice, 34), "rejected"],
        ["Bob rejects Alice's message relabelled with his own key", "decrypt", "bob", aliceToBob, (() => { const note = shortAlice.slice(); note.set(bobKey, 2); return note; })(), "rejected"],
        ["Bob rejects version 0x01", "decrypt", "bob", aliceToBob, withByte(shortAlice, 0, () => 0x01), "rejected"],
        ["Bob rejects a note shorter than header and tag", "decrypt", "bob", aliceToBob, firstAlice.slice(0, 93), "rejected"],
        ["Bob rejects a 4097-byte note", "decrypt", "bob", aliceToBob, extend(longest, 4097), "rejected"],
    ];

    const cases = intended.map(([name, op, who, handshake, note, expect]) => {
        const keys = accounts[who];
        const result = attempt(() => {
            if (op === "accept") return acceptPQSession(note, keys.x25519, keys.mlkem.encapsKey, keys.mlkem.decapsKey).sessionKey;
            if (op === "open_as_sender") return openPQSessionAsSender(note, keys.x25519, keys.mlkem.decapsKey).sessionKey;
            return new TextEncoder().encode(decryptPQMessage(note, sessionFor(who, handshake)));
        });
        const actual: Expect = result === undefined ? "rejected" : "accepted";
        if (actual !== expect) throw new Error(`${name}: TypeScript gives ${actual}, intended ${expect}`);
        if (op === "accept" && result && !equal(result, handshake.session.sessionKey)) throw new Error(`${name}: different session key`);
        return { name, op, account: who, handshake: handshake.name, note: hex(note), expect };
    });

    return {
        description:
            "Long two-way Hybrid conversation (PROTOCOL.md section 5.7), from the TypeScript reference. Synthetic inputs only; keys come from each account seed. Alice starts a 0x04 handshake to Bob, Bob starts his own to reply, and each side sends 32 0x05 messages under its own handshake. Both the recipient (accept) and the sender (recovery from the note) derive session_key from every handshake, and both read every message. Each case is accepted or rejected; an accepted accept case gives the handshake's session_key.",
        generated_by: GENERATED_BY,
        handshake_size: 2366,
        message_header_size: 78,
        max_plaintext: 4002,
        accounts: Object.fromEntries(
            (["alice", "bob"] as Name[]).map((name) => [
                name,
                {
                    seed: hex(accounts[name].seed),
                    x25519_public: hex(accounts[name].x25519.publicKey),
                    encaps_key: hex(accounts[name].mlkem.encapsKey),
                },
            ]),
        ),
        handshakes: handshakes.map((item) => ({
            name: item.name,
            sender: item.sender,
            recipient: item.recipient,
            note: hex(item.note),
            handshake_id: hex(item.session.handshakeId),
            session_key: hex(item.session.sessionKey),
        })),
        messages: messages.map((item) => ({ index: item.index, handshake: item.handshake, plaintext: item.plaintext, note: hex(item.note) })),
        cases,
    };
}

// ---------------------------------------------------------------------------
// Kept Extra lock notes (0x02), read only
// ---------------------------------------------------------------------------

const KEPT_PSK = seq(0x40);
const WRONG_PSK = seq(0x60);

function readKept(name: Name, note: Uint8Array, psk: Uint8Array): string | undefined {
    return attempt(() => {
        const envelope = decodePSKEnvelope(note);
        const keys = accounts[name].x25519;
        const content = decryptPSKMessage(envelope, keys.privateKey, keys.publicKey, derivePSKAtCounter(psk, envelope.ratchetCounter));
        if (!content) throw new Error("key-publish payload");
        return content.text;
    });
}

function snapshot(state: PSKState) {
    return {
        send_counter: state.sendCounter,
        peer_last_counter: state.peerLastCounter,
        seen_counters: [...state.seenCounters].sort((left, right) => left - right),
    };
}

function buildKept(): Record<string, unknown> {
    useStream("AlgoChat test vector psk-kept-v1");
    const plan: Array<[Name, number, string]> = [
        ["alice", 0, "Alice's first Extra lock note"],
        ["bob", 0, "Bob's first Extra lock note"],
        ["alice", 1, ""],
        ["alice", 41, "héllo 👋 at counter 41"],
        ["bob", 7, "Bob at counter 7"],
        ["alice", 99, "last counter of session 0"],
        ["alice", 100, "first counter of session 1"],
        ["alice", 101, "second counter of session 1"],
        ["bob", 150, "Bob at counter 150"],
        ["alice", 199, "Alice at counter 199"],
        ["alice", 200, "Alice at counter 200"],
        ["bob", 300, "Bob at counter 300"],
        ["alice", 4294967295, "Alice at the last counter"],
        ["bob", 301, filler("Bob at the limit: ", PSK_PROTOCOL.MAX_PAYLOAD_SIZE)],
    ];
    const notes = plan.map(([from, counter, plaintext]) => {
        const to = other(from);
        const envelope = encryptPSKMessage(
            plaintext,
            accounts[from].x25519.publicKey,
            accounts[to].x25519.publicKey,
            derivePSKAtCounter(KEPT_PSK, counter),
            counter,
        );
        const note = encodePSKEnvelope(envelope);
        for (const reader of [to, from]) {
            if (readKept(reader, note, KEPT_PSK) !== plaintext) throw new Error(`${reader} cannot read ${from} at ${counter}`);
        }
        return { name: `${from} at counter ${counter}`, from, to, counter, plaintext, note };
    });
    const longest = notes[notes.length - 1].note;
    if (longest.length !== 4096) throw new Error(`the longest kept note is ${longest.length} bytes`);
    const at41 = notes[3].note;

    const intended: Array<[string, Name, Uint8Array, Uint8Array, Expect]> = [
        ["Bob reads with the kept secret", "bob", at41, KEPT_PSK, "accepted"],
        ["Bob cannot read with a different secret", "bob", at41, WRONG_PSK, "rejected"],
        ["Alice cannot read her own note with a different secret", "alice", at41, WRONG_PSK, "rejected"],
        ["Bob rejects version 0x02 changed to 0x01", "bob", withByte(at41, 0, () => 0x01), KEPT_PSK, "rejected"],
        ["Bob rejects a changed counter field", "bob", withByte(at41, 5, (byte) => byte + 1), KEPT_PSK, "rejected"],
        ["Bob rejects a changed tag", "bob", flip(at41, at41.length - 1), KEPT_PSK, "rejected"],
        ["Bob rejects a changed encrypted sender key", "bob", flip(at41, 82), KEPT_PSK, "rejected"],
        ["Alice rejects a changed encrypted sender key", "alice", flip(at41, 82), KEPT_PSK, "rejected"],
        ["Bob rejects a 4097-byte note", "bob", extend(longest, 4097), KEPT_PSK, "rejected"],
        ["Bob rejects a note shorter than the header", "bob", at41.slice(0, 129), KEPT_PSK, "rejected"],
    ];
    const cases = intended.map(([name, who, note, psk, expect]) => {
        const actual: Expect = readKept(who, note, psk) === undefined ? "rejected" : "accepted";
        if (actual !== expect) throw new Error(`${name}: TypeScript gives ${actual}, intended ${expect}`);
        return { name, account: who, psk: hex(psk), note: hex(note), expect };
    });

    // Bob's receive window for Alice's counters, with a restart in the middle.
    const counters = [201, 200, 0, 200, 5, 401, 400, 199, 200, 300, 300, 250, 600, 399, 400, 4294967295, 800];
    const restartAfter = 10;
    let state = createPSKState();
    let atRestart: ReturnType<typeof snapshot> | null = null;
    const steps = counters.map((counter, index) => {
        if (index === restartAfter) atRestart = snapshot(state);
        const expect: Expect = validateCounter(state, counter) ? "accepted" : "rejected";
        if (expect === "accepted") state = recordReceive(state, counter);
        return { counter, expect };
    });
    const intendedSteps = "rejected accepted accepted rejected accepted rejected accepted rejected rejected accepted rejected accepted accepted rejected rejected rejected accepted";
    if (steps.map((step) => step.expect).join(" ") !== intendedSteps) throw new Error(`receive steps differ: ${steps.map((step) => step.expect).join(" ")}`);

    return {
        description:
            "Kept Extra lock (0x02) notes, read only (PROTOCOL.md sections 5.5 and 8), from the TypeScript reference. Synthetic inputs only. Each note is version 0x02 under kept_psk at its counter; the recipient and the sender both read it. Each case is accepted or rejected. receive is Bob's counter window for Alice's notes: a step is accepted when the counter is valid and is then recorded; state_at_restart is the state before step restart_after, which a reader saves and restores before continuing.",
        generated_by: GENERATED_BY,
        header_size: PSK_PROTOCOL.HEADER_SIZE,
        session_size: PSK_PROTOCOL.SESSION_SIZE,
        counter_window: PSK_PROTOCOL.COUNTER_WINDOW,
        kept_psk: hex(KEPT_PSK),
        accounts: Object.fromEntries(
            (["alice", "bob"] as Name[]).map((name) => [name, { seed: hex(accounts[name].seed), x25519_public: hex(accounts[name].x25519.publicKey) }]),
        ),
        notes: notes.map((item) => ({ ...item, note: hex(item.note) })),
        cases,
        receive: {
            account: "bob",
            peer: "alice",
            steps,
            restart_after: restartAfter,
            state_at_restart: atRestart,
            final_state: snapshot(state),
        },
    };
}

const outputDirectory = process.argv[2] ?? new URL("../../vectors/", import.meta.url).pathname;
for (const [file, build] of [[CONVERSATION_FILE, buildConversation], [KEPT_FILE, buildKept]] as const) {
    const path = join(outputDirectory, file);
    writeFileSync(path, JSON.stringify(build(), null, 2) + "\n");
    console.log(`wrote ${path}`);
}
