/**
 * Write vectors/pq-announcement-v1.json from the TypeScript ACPQ announcement code.
 * Run from ts/: bun scripts/emit-pq-announcement-vector.ts [output path]
 *
 * Every input is synthetic: the account seed is 32 bytes of 0x22 and the other
 * signer's seed is 32 bytes of 0x11. No real mnemonic or key material.
 * The ML-KEM-768 key comes from the seed, and the Ed25519 signer is the same
 * seed, the way an account announces its own key. Ed25519 signatures are
 * deterministic, so every byte here is reproducible.
 */
import { writeFileSync } from "node:fs";
import { ed25519 } from "@noble/curves/ed25519";
import {
    encodePQKeyAnnouncement,
    isPQKeyAnnouncement,
    parsePQKeyAnnouncement,
    pqAnnouncementSigningInput,
} from "../src/pq/announce.js";
import { deriveMLKEMKeyPair } from "../src/pq/kem.js";
import { PQ_ANNOUNCE_VERSION, PQ_PROTOCOL } from "../src/pq/types.js";

/** One parse case: the note, the key it is checked with, and what parsing gives. */
interface PQAnnouncementCase {
    name: string;
    note: string;
    verifying_key: string | null;
    is_announcement: boolean;
    expect: "unverified" | "verified" | "rejected";
}

const PQ_ANNOUNCEMENT_VECTOR = "vectors/pq-announcement-v1.json";

const BAD_ENCAPS_KEY_LENGTHS = [0, PQ_PROTOCOL.MLKEM_EK_SIZE - 1, PQ_PROTOCOL.MLKEM_EK_SIZE + 1];

function hex(value: Uint8Array): string {
    return Buffer.from(value).toString("hex");
}

function fill(byte: number, length = 32): Uint8Array {
    return new Uint8Array(length).fill(byte);
}

function flip(note: Uint8Array, offset: number): Uint8Array {
    const copy = note.slice();
    copy[offset] ^= 0x01;
    return copy;
}

function withByte(note: Uint8Array, offset: number, value: number): Uint8Array {
    const copy = note.slice();
    copy[offset] = value;
    return copy;
}

function resize(note: Uint8Array, length: number): Uint8Array {
    const copy = new Uint8Array(length);
    copy.set(note.subarray(0, Math.min(length, note.length)));
    return copy;
}

function outcome(note: Uint8Array, key: Uint8Array | undefined): PQAnnouncementCase["expect"] {
    const parsed = parsePQKeyAnnouncement(note, key);
    if (!parsed) return "rejected";
    return parsed.isVerified ? "verified" : "unverified";
}

/** Builds the vector from the TypeScript code. Throws if TypeScript disagrees with an intended result. */
function buildPQAnnouncementVector(): Record<string, unknown> {
    const seed = fill(0x22);
    const otherSeed = fill(0x11);
    const encapsKey = deriveMLKEMKeyPair(seed).encapsKey;
    const publicKey = ed25519.getPublicKey(seed);
    const otherPublicKey = ed25519.getPublicKey(otherSeed);
    const unsigned = encodePQKeyAnnouncement(encapsKey);
    const signed = encodePQKeyAnnouncement(encapsKey, seed);
    const keyOffset = 5;

    const intended: Array<[string, Uint8Array, Uint8Array | undefined, PQAnnouncementCase["expect"]]> = [
        ["unsigned note without a key", unsigned, undefined, "unverified"],
        ["unsigned note with the signer's key stays unverified", unsigned, publicKey, "unverified"],
        ["signed note with the signer's key", signed, publicKey, "verified"],
        ["signed note without a key", signed, undefined, "rejected"],
        ["signed note with another signer's key", signed, otherPublicKey, "rejected"],
        ["signed note with a changed encapsulation key byte", flip(signed, keyOffset), publicKey, "rejected"],
        ["signed note with a changed signature byte", flip(signed, signed.length - 1), publicKey, "rejected"],
        ["unsigned note with a zero signature appended", resize(unsigned, signed.length), publicKey, "rejected"],
        ["signed note with version 0x02", withByte(signed, 4, 0x02), publicKey, "rejected"],
        ["unsigned note with version 0x02", withByte(unsigned, 4, 0x02), undefined, "rejected"],
        ["note with magic ACPR", withByte(unsigned, 3, 0x52), undefined, "rejected"],
        ["unsigned note one byte short", resize(unsigned, unsigned.length - 1), publicKey, "rejected"],
        ["unsigned note one byte long", resize(unsigned, unsigned.length + 1), publicKey, "rejected"],
        ["signed note one byte short", resize(signed, signed.length - 1), publicKey, "rejected"],
        ["signed note one byte long", resize(signed, signed.length + 1), publicKey, "rejected"],
        ["magic only", unsigned.slice(0, 4), publicKey, "rejected"],
        ["empty note", new Uint8Array(0), undefined, "rejected"],
    ];

    const cases: PQAnnouncementCase[] = intended.map(([name, note, key, expect]) => {
        const actual = outcome(note, key);
        if (actual !== expect) throw new Error(`${name}: TypeScript gives ${actual}, intended ${expect}`);
        return { name, note: hex(note), verifying_key: key ? hex(key) : null, is_announcement: isPQKeyAnnouncement(note), expect };
    });

    for (const length of BAD_ENCAPS_KEY_LENGTHS) {
        const key = fill(0x07, length);
        for (const attempt of [() => encodePQKeyAnnouncement(key), () => encodePQKeyAnnouncement(key, seed), () => pqAnnouncementSigningInput(key)]) {
            let threw = false;
            try {
                attempt();
            } catch {
                threw = true;
            }
            if (!threw) throw new Error(`a ${length}-byte encapsulation key was accepted`);
        }
    }

    return {
        description:
            "ACPQ Hybrid key announcement (PROTOCOL.md section 5.7), from the TypeScript reference. Synthetic inputs only. The ML-KEM-768 key is derived from account_seed and the Ed25519 signer is the same seed. signing_input is SHA-256 of signature_label, the version byte and the key. Each parse case gives unverified, verified or rejected; an accepted case returns encaps_key. Encoding and the signing input reject every length in bad_encaps_key_lengths.",
        generated_by: "ts/scripts/emit-pq-announcement-vector.ts",
        announcement_version: PQ_ANNOUNCE_VERSION,
        signature_label: "AlgoChat-pq-ek-v1",
        unsigned_size: unsigned.length,
        signed_size: signed.length,
        account_seed: hex(seed),
        encaps_key: hex(encapsKey),
        ed25519_public_key: hex(publicKey),
        other_signer_seed: hex(otherSeed),
        other_signer_public_key: hex(otherPublicKey),
        signing_input: hex(pqAnnouncementSigningInput(encapsKey)),
        unsigned_note: hex(unsigned),
        signed_note: hex(signed),
        parse_cases: cases,
        bad_encaps_key_lengths: BAD_ENCAPS_KEY_LENGTHS,
    };
}

/** The exact file text: two-space JSON and a final newline. */
function pqAnnouncementVectorText(): string {
    return JSON.stringify(buildPQAnnouncementVector(), null, 2) + "\n";
}

const output = process.argv[2] ?? new URL(`../../${PQ_ANNOUNCEMENT_VECTOR}`, import.meta.url).pathname;
writeFileSync(output, pqAnnouncementVectorText());
console.log(`wrote ${output}`);
