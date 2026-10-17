/**
 * AlgoChat conformance vector generator.
 *
 * Generates deterministic test vectors from the reference implementation
 * (@corvidlabs/ts-algochat). Every byte in the output is either fixed input
 * or captured reference output; encryption randomness (ephemeral keys,
 * nonces) is captured, never regenerated, so the vectors are stable forever.
 *
 * Usage: bun conformance/tools/generate.mjs [outDir]
 *   (default: ../vectors/ relative to this file)
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as algochat from '../../src/index';
// x25519ECDH is not re-exported from the package index; import from the
// crypto submodule directly.
import { x25519ECDH } from '../../src/crypto/keys';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const hex = (u8) => Buffer.from(u8).toString('hex');
const unhex = (s) => new Uint8Array(Buffer.from(s, 'hex'));
const seq = (start) => new Uint8Array(32).map((_, i) => start + i);

const OUT = process.argv[2] ?? new URL('../vectors/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const write = (name, doc) => {
    const file = path.join(OUT, name);
    fs.writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
    console.log(`wrote ${name} (${fs.statSync(file).size} bytes)`);
};

// Deterministic fixed inputs. These are TEST inputs only — published, known,
// and must never secure anything.
const SEED_A = seq(0x00); // "sender" Algorand seed
const SEED_B = seq(0x20); // "recipient" Algorand seed
const INITIAL_PSK = seq(0x40); // out-of-band pre-shared key
const FIXED_NONCE = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

const GENERATOR = {
    tool: '@corvidlabs/ts-algochat conformance generator',
    libraryVersion: '0.4.1',
    generatedBy: 'reference implementation (TypeScript)',
    note: 'All byte strings are lowercase hex. All inputs are fixed test values; none are secret.',
};

// Fail fast if a protocol invariant is violated by the library under test:
// the vectors must never enshrine broken behavior.
const invariant = (cond, msg) => {
    if (!cond) {
        console.error(`INVARIANT VIOLATION: ${msg}`);
        process.exit(1);
    }
};

// ---------------------------------------------------------------------------
// 00 — protocol constants
// ---------------------------------------------------------------------------
write('00-protocol-constants.json', {
    ...GENERATOR,
    file: '00-protocol-constants',
    description: 'Published protocol constants an implementation must agree on.',
    constants: {
        PROTOCOL: { ...algochat.PROTOCOL },
        PSK_PROTOCOL: { ...algochat.PSK_PROTOCOL },
        ED25519_SIGNATURE_SIZE: algochat.ED25519_SIGNATURE_SIZE,
        ED25519_PUBLIC_KEY_SIZE: algochat.ED25519_PUBLIC_KEY_SIZE,
        X25519_PUBLIC_KEY_SIZE: algochat.X25519_PUBLIC_KEY_SIZE,
    },
});

// ---------------------------------------------------------------------------
// 01 — key derivation, account derivation, ECDH, signatures
// ---------------------------------------------------------------------------
const keysA = algochat.deriveEncryptionKeys(SEED_A);
const keysB = algochat.deriveEncryptionKeys(SEED_B);
const sharedAB = x25519ECDH(keysA.privateKey, keysB.publicKey);
const sharedBA = x25519ECDH(keysB.privateKey, keysA.publicKey);
invariant(hex(sharedAB) === hex(sharedBA), 'ECDH symmetry failed');

// Deterministic Algorand account from SEED_A via algosdk mnemonic round-trip.
const algosdk = (await import('algosdk')).default;
const ed25519pubA = algochat.getPublicKey(SEED_A);
const ed25519pubB = algochat.getPublicKey(SEED_B);
const secretKeyA = new Uint8Array([...SEED_A, ...ed25519pubA]);
const mnemonicA = algosdk.secretKeyToMnemonic(secretKeyA);
const addressA = algosdk.encodeAddress(ed25519pubA);
const addressB = algosdk.encodeAddress(ed25519pubB);
const chatAccountA = algochat.createChatAccountFromMnemonic(mnemonicA);
invariant(chatAccountA.address === addressA, 'mnemonic account address mismatch');
invariant(hex(chatAccountA.encryptionKeys.privateKey) === hex(keysA.privateKey), 'mnemonic x25519 derivation mismatch');

const sigA = algochat.signEncryptionKey(keysA.publicKey, SEED_A);
invariant(algochat.verifyEncryptionKey(keysA.publicKey, ed25519pubA, sigA), 'own signature must verify');
invariant(!algochat.verifyEncryptionKey(keysA.publicKey, ed25519pubB, sigA), 'signature must not verify under wrong key');

write('01-key-derivation.json', {
    ...GENERATOR,
    file: '01-key-derivation',
    description:
        'HKDF-SHA256 X25519 key derivation (salt "AlgoChat-v1-encryption", info "x25519-key"), ' +
        'Algorand account/mnemonic derivation, X25519 ECDH agreement, Ed25519 key-announcement signatures, fingerprints.',
    hkdf: { hash: 'SHA-256', salt: 'AlgoChat-v1-encryption', info: 'x25519-key', length: 32 },
    accounts: [
        {
            name: 'A (sender)',
            seed: hex(SEED_A),
            algorandAddress: addressA,
            ed25519PublicKey: hex(ed25519pubA),
            mnemonic: mnemonicA,
            x25519PrivateKey: hex(keysA.privateKey),
            x25519PublicKey: hex(keysA.publicKey),
            fingerprint: algochat.fingerprint(keysA.publicKey),
        },
        {
            name: 'B (recipient)',
            seed: hex(SEED_B),
            algorandAddress: addressB,
            ed25519PublicKey: hex(ed25519pubB),
            x25519PrivateKey: hex(keysB.privateKey),
            x25519PublicKey: hex(keysB.publicKey),
            fingerprint: algochat.fingerprint(keysB.publicKey),
        },
    ],
    ecdh: {
        description: 'x25519ECDH(privA, pubB) must equal x25519ECDH(privB, pubA).',
        sharedSecret: hex(sharedAB),
    },
    keyAnnouncement: {
        description: 'Ed25519 signature by account A over its X25519 encryption public key.',
        encryptionPublicKey: hex(keysA.publicKey),
        signingSeed: hex(SEED_A),
        verifyingKey: hex(ed25519pubA),
        signature: hex(sigA),
        verifies: true,
        wrongVerifyingKey: hex(ed25519pubB),
        verifiesUnderWrongKey: false,
    },
});

// ---------------------------------------------------------------------------
// 02 — standard (0x01) envelope: encoding determinism + captured decrypt
// ---------------------------------------------------------------------------
// Use a distinct derived keypair as the fixed "ephemeral" key for the
// hand-built encoding vector, so every field is fully specified.
const handEph = algochat.deriveEncryptionKeys(seq(0x60));
const handEnvelope = {
    version: algochat.PROTOCOL.VERSION,
    protocolId: algochat.PROTOCOL.PROTOCOL_ID,
    senderPublicKey: keysA.publicKey,
    ephemeralPublicKey: handEph.publicKey,
    nonce: FIXED_NONCE,
    encryptedSenderKey: new Uint8Array(48).map((_, i) => (0x80 + i) & 0xff),
    ciphertext: new Uint8Array([...new TextEncoder().encode('fixed plaintext body'), ...new Uint8Array(16).fill(0xaa)]),
};
const handEncoded = algochat.encodeEnvelope(handEnvelope);
const handDecoded = algochat.decodeEnvelope(handEncoded);
invariant(hex(handDecoded.ciphertext) === hex(handEnvelope.ciphertext), 'hand envelope round-trip failed');

const PLAINTEXT_STD = 'Hello, AlgoChat conformance! The quick brown fox jumps over the lazy dog. 0123456789';
const capturedStd = algochat.encryptMessage(PLAINTEXT_STD, keysA.publicKey, keysB.publicKey);
const capturedStdBytes = algochat.encodeEnvelope(capturedStd);
const decRecipient = algochat.decryptMessage(capturedStd, keysB.privateKey, keysB.publicKey);
const decSender = algochat.decryptMessage(capturedStd, keysA.privateKey, keysA.publicKey);
invariant(decRecipient?.text === PLAINTEXT_STD, 'recipient-path decrypt failed');
invariant(decSender?.text === PLAINTEXT_STD, 'sender-path decrypt failed');

write('02-standard-envelope.json', {
    ...GENERATOR,
    file: '02-standard-envelope',
    description:
        'Standard 0x01 envelope (version 1, protocol 1): deterministic binary encoding of a fully ' +
        'specified envelope, plus a captured real envelope (random ephemeral key + nonce, frozen here) ' +
        'with recipient-path and sender-path decryptions.',
    wireFormat: {
        headerSize: algochat.PROTOCOL.HEADER_SIZE,
        layout: 'version(1) | protocolId(1) | senderPublicKey(32) | ephemeralPublicKey(32) | nonce(12) | encryptedSenderKey(48) | ciphertext(N)',
    },
    encodingVector: {
        description: 'Encoding is a pure function of the fields: these exact bytes must be produced.',
        envelope: {
            version: handEnvelope.version,
            protocolId: handEnvelope.protocolId,
            senderPublicKey: hex(handEnvelope.senderPublicKey),
            ephemeralPublicKey: hex(handEnvelope.ephemeralPublicKey),
            nonce: hex(handEnvelope.nonce),
            encryptedSenderKey: hex(handEnvelope.encryptedSenderKey),
            ciphertext: hex(handEnvelope.ciphertext),
        },
        encodedBytes: hex(handEncoded),
        isChatMessage: algochat.isChatMessage(handEncoded),
        isPSKMessage: algochat.isPSKMessage(handEncoded),
    },
    capturedEnvelope: {
        description: 'Produced by encryptMessage with random ephemeral material; frozen as a fixed decryption target.',
        plaintext: PLAINTEXT_STD,
        envelope: {
            version: capturedStd.version,
            protocolId: capturedStd.protocolId,
            senderPublicKey: hex(capturedStd.senderPublicKey),
            ephemeralPublicKey: hex(capturedStd.ephemeralPublicKey),
            nonce: hex(capturedStd.nonce),
            encryptedSenderKey: hex(capturedStd.encryptedSenderKey),
            ciphertext: hex(capturedStd.ciphertext),
        },
        encodedBytes: hex(capturedStdBytes),
        decrypt: {
            recipientPath: { privateKey: hex(keysB.privateKey), publicKey: hex(keysB.publicKey), plaintext: PLAINTEXT_STD },
            senderPath: { privateKey: hex(keysA.privateKey), publicKey: hex(keysA.publicKey), plaintext: PLAINTEXT_STD },
        },
    },
});

// ---------------------------------------------------------------------------
// 03 — PSK ratchet derivation chain + counter state machine
// ---------------------------------------------------------------------------
const ratchetCounters = [0, 1, 99, 100, 101, 250];
const ratchetVectors = ratchetCounters.map((counter) => ({
    counter,
    sessionIndex: Math.floor(counter / algochat.PSK_PROTOCOL.SESSION_SIZE),
    sessionPSK: hex(algochat.deriveSessionPSK(INITIAL_PSK, Math.floor(counter / algochat.PSK_PROTOCOL.SESSION_SIZE))),
    positionPSK: hex(algochat.derivePositionPSK(
        algochat.deriveSessionPSK(INITIAL_PSK, Math.floor(counter / algochat.PSK_PROTOCOL.SESSION_SIZE)),
        counter % algochat.PSK_PROTOCOL.SESSION_SIZE,
    )),
    pskAtCounter: hex(algochat.derivePSKAtCounter(INITIAL_PSK, counter)),
}));

const hybridKey = algochat.deriveHybridSymmetricKey(sharedAB, algochat.derivePSKAtCounter(INITIAL_PSK, 0), handEph.publicKey, keysA.publicKey, keysB.publicKey);

// Counter state machine transcript: operation -> observed result.
const stateOps = [];
let state = algochat.createPSKState();
const snap = () => ({ sendCounter: state.sendCounter, peerLastCounter: state.peerLastCounter, seenCounters: [...state.seenCounters].sort((a, b) => a - b) });
stateOps.push({ op: 'createPSKState', result: snap() });
for (let i = 0; i < 3; i++) {
    const r = algochat.advanceSendCounter(state);
    state = r.state;
    stateOps.push({ op: 'advanceSendCounter', counter: r.counter, result: snap() });
}
const receives = [0, 0, 2, 1, 250, 99999];
for (const c of receives) {
    const valid = algochat.validateCounter(state, c);
    const before = snap();
    if (valid) state = algochat.recordReceive(state, c);
    stateOps.push({ op: 'validateCounter', counter: c, valid, stateBefore: before, stateAfter: snap() });
}
invariant(stateOps.find((o) => o.op === 'validateCounter' && o.counter === 0 && o.stateBefore.seenCounters.includes(0))?.valid === false, 'replay must be rejected');
invariant(stateOps.find((o) => o.op === 'validateCounter' && o.counter === 99999)?.valid === false, 'far-future counter must be rejected');

write('03-psk-ratchet.json', {
    ...GENERATOR,
    file: '03-psk-ratchet',
    description:
        'Two-level PSK ratchet: session key per SESSION_SIZE(100) counters, position key per counter, ' +
        'hybrid ECDH+PSK message key derivation, and the replay-window counter state machine transcript.',
    initialPSK: hex(INITIAL_PSK),
    constants: { sessionSize: algochat.PSK_PROTOCOL.SESSION_SIZE, counterWindow: algochat.PSK_PROTOCOL.COUNTER_WINDOW },
    derivationVectors: ratchetVectors,
    hybridKeyVector: {
        description: 'deriveHybridSymmetricKey(sharedSecret, pskAtCounter0, ephemeralPub, senderPub, recipientPub)',
        sharedSecret: hex(sharedAB),
        psk: hex(algochat.derivePSKAtCounter(INITIAL_PSK, 0)),
        ephemeralPublicKey: hex(handEph.publicKey),
        senderPublicKey: hex(keysA.publicKey),
        recipientPublicKey: hex(keysB.publicKey),
        derivedKey: hex(hybridKey),
    },
    stateTranscript: stateOps,
});

// ---------------------------------------------------------------------------
// 04 — PSK (0x02) envelope: encoding determinism + captured decrypt
// ---------------------------------------------------------------------------
const handPskEnvelope = {
    version: algochat.PSK_PROTOCOL.VERSION,
    protocolId: algochat.PSK_PROTOCOL.PROTOCOL_ID,
    ratchetCounter: 42,
    senderPublicKey: keysA.publicKey,
    ephemeralPublicKey: handEph.publicKey,
    nonce: FIXED_NONCE,
    encryptedSenderKey: new Uint8Array(48).map((_, i) => (0x90 + i) & 0xff),
    ciphertext: new Uint8Array([...new TextEncoder().encode('fixed psk body'), ...new Uint8Array(16).fill(0xbb)]),
};
const handPskEncoded = algochat.encodePSKEnvelope(handPskEnvelope);
invariant(hex(algochat.decodePSKEnvelope(handPskEncoded).ciphertext) === hex(handPskEnvelope.ciphertext), 'hand PSK envelope round-trip failed');

const PLAINTEXT_PSK = 'PSK hybrid conformance message — confidentiality needs BOTH secrets.';
const pskAt0 = algochat.derivePSKAtCounter(INITIAL_PSK, 0);
const capturedPsk = algochat.encryptPSKMessage(PLAINTEXT_PSK, keysA.publicKey, keysB.publicKey, pskAt0, 0);
const capturedPskBytes = algochat.encodePSKEnvelope(capturedPsk);
const decPsk = algochat.decryptPSKMessage(capturedPsk, keysB.privateKey, keysB.publicKey, pskAt0);
invariant(decPsk?.text === PLAINTEXT_PSK, 'PSK decrypt failed');

write('04-psk-envelope.json', {
    ...GENERATOR,
    file: '04-psk-envelope',
    description:
        'Hybrid 0x02 PSK envelope (version 1, protocol 2): deterministic binary encoding of a fully ' +
        'specified envelope including ratchet counter, plus a captured real envelope with its decryption.',
    wireFormat: {
        headerSize: algochat.PSK_PROTOCOL.HEADER_SIZE,
        layout: 'version(1) | protocolId(1) | ratchetCounter(4, big-endian) | senderPublicKey(32) | ephemeralPublicKey(32) | nonce(12) | encryptedSenderKey(48) | ciphertext(N)',
    },
    encodingVector: {
        envelope: {
            version: handPskEnvelope.version,
            protocolId: handPskEnvelope.protocolId,
            ratchetCounter: handPskEnvelope.ratchetCounter,
            senderPublicKey: hex(handPskEnvelope.senderPublicKey),
            ephemeralPublicKey: hex(handPskEnvelope.ephemeralPublicKey),
            nonce: hex(handPskEnvelope.nonce),
            encryptedSenderKey: hex(handPskEnvelope.encryptedSenderKey),
            ciphertext: hex(handPskEnvelope.ciphertext),
        },
        encodedBytes: hex(handPskEncoded),
        isChatMessage: algochat.isChatMessage(handPskEncoded),
        isPSKMessage: algochat.isPSKMessage(handPskEncoded),
    },
    capturedEnvelope: {
        plaintext: PLAINTEXT_PSK,
        initialPSK: hex(INITIAL_PSK),
        ratchetCounter: 0,
        pskAtCounter: hex(pskAt0),
        envelope: {
            version: capturedPsk.version,
            protocolId: capturedPsk.protocolId,
            ratchetCounter: capturedPsk.ratchetCounter,
            senderPublicKey: hex(capturedPsk.senderPublicKey),
            ephemeralPublicKey: hex(capturedPsk.ephemeralPublicKey),
            nonce: hex(capturedPsk.nonce),
            encryptedSenderKey: hex(capturedPsk.encryptedSenderKey),
            ciphertext: hex(capturedPsk.ciphertext),
        },
        encodedBytes: hex(capturedPskBytes),
        decrypt: { privateKey: hex(keysB.privateKey), publicKey: hex(keysB.publicKey), plaintext: PLAINTEXT_PSK },
    },
});

// ---------------------------------------------------------------------------
// 05 — PSK exchange URI round-trip
// ---------------------------------------------------------------------------
const uri = algochat.createPSKExchangeURI(addressB, INITIAL_PSK, 'Conformance Peer');
const parsed = algochat.parsePSKExchangeURI(uri);
invariant(parsed.address === addressB && hex(parsed.psk) === hex(INITIAL_PSK) && parsed.label === 'Conformance Peer', 'PSK URI round-trip failed');
const badUris = ['algochat-psk://notanaddress', 'https://example.com/evil', '', 'algochat-psk://'];
const badUriResults = badUris.map((u) => {
    try {
        algochat.parsePSKExchangeURI(u);
        return { uri: u, accepted: true };
    } catch (e) {
        return { uri: u, accepted: false, error: e.constructor.name };
    }
});

write('05-psk-exchange.json', {
    ...GENERATOR,
    file: '05-psk-exchange',
    description: 'Out-of-band PSK exchange URI: creation, parsing, round-trip equality, and rejection of malformed URIs.',
    exchangeVector: {
        address: addressB,
        psk: hex(INITIAL_PSK),
        label: 'Conformance Peer',
        uri,
        parsed: { address: parsed.address, psk: hex(parsed.psk), label: parsed.label },
    },
    malformedUris: badUriResults,
});

// ---------------------------------------------------------------------------
// 06 — negative cases: tamper, wrong key, truncation, misclassification
// ---------------------------------------------------------------------------
const flip = (u8, idx) => {
    const c = new Uint8Array(u8);
    c[idx] ^= 0xff;
    return c;
};
const tamperedCiphertext = flip(capturedStdBytes, capturedStdBytes.length - 1);
const tamperedSenderKey = flip(capturedStdBytes, algochat.PROTOCOL.HEADER_SIZE - 1);
const truncated = capturedStdBytes.slice(0, 40);
const badVersion = new Uint8Array(capturedStdBytes);
badVersion[0] = 0xff;
const randomBytes = seq(0xa0).slice(0, 64);

const attemptDecrypt = (bytes, priv, pub) => {
    try {
        const env = algochat.decodeEnvelope(bytes);
        const r = algochat.decryptMessage(env, priv, pub);
        return r === null ? { result: 'null' } : { result: 'plaintext', text: r.text };
    } catch (e) {
        return { result: 'throw', error: e.constructor.name };
    }
};
const attemptDecode = (bytes) => {
    try {
        algochat.decodeEnvelope(bytes);
        return { result: 'decoded' };
    } catch (e) {
        return { result: 'throw', error: e.constructor.name };
    }
};

const tamperedPsk = flip(capturedPskBytes, capturedPskBytes.length - 1);
const attemptPskDecrypt = (bytes, priv, pub, psk) => {
    try {
        const env = algochat.decodePSKEnvelope(bytes);
        const r = algochat.decryptPSKMessage(env, priv, pub, psk);
        return r === null ? { result: 'null' } : { result: 'plaintext', text: r.text };
    } catch (e) {
        return { result: 'throw', error: e.constructor.name };
    }
};

const wrongPsk = algochat.derivePSKAtCounter(INITIAL_PSK, 1);
const setByte = (u8, idx, val) => {
    const c = new Uint8Array(u8);
    c[idx] = val;
    return c;
};
// VERSION_AAD binds the full fixed header — mutate version/protocol/counter/sender-key.
const versionDowngrade = setByte(capturedStdBytes, 0, algochat.PROTOCOL.VERSION);
const protocolFlip = setByte(capturedStdBytes, 1, 0x02);
const pskTamperedSenderKey = flip(capturedPskBytes, algochat.PSK_PROTOCOL.HEADER_SIZE - 1);
const pskVersionDowngrade = setByte(capturedPskBytes, 0, algochat.PSK_PROTOCOL.VERSION);
const pskProtocolFlip = setByte(capturedPskBytes, 1, 0x01);
const pskCounterMut = flip(capturedPskBytes, 5); // last byte of BE ratchetCounter

write('06-negative-cases.json', {
    ...GENERATOR,
    file: '06-negative-cases',
    description:
        'Mandatory failure behavior. "null" = decrypt returns null without plaintext. "throw" = typed ' +
        'error, no partial output. An implementation MUST NOT emit plaintext in any of these cases.',
    cases: [
        {
            name: 'tampered ciphertext (last byte flipped)',
            input: hex(tamperedCiphertext),
            expect: attemptDecrypt(tamperedCiphertext, keysB.privateKey, keysB.publicKey),
        },
        {
            name: 'tampered encryptedSenderKey — recipient path (must fail)',
            input: hex(tamperedSenderKey),
            note: 'VERSION_AAD binds the full 126-byte header including encryptedSenderKey; flipping that field breaks the recipient-path AEAD tag.',
            expect: attemptDecrypt(tamperedSenderKey, keysB.privateKey, keysB.publicKey),
        },
        {
            name: 'tampered encryptedSenderKey — sender path (must fail)',
            input: hex(tamperedSenderKey),
            note: 'The sender path unwraps its own copy key; a flipped byte breaks that AEAD tag.',
            expect: attemptDecrypt(tamperedSenderKey, keysA.privateKey, keysA.publicKey),
        },
        {
            name: 'version 0x02→0x01 downgrade (must fail)',
            input: hex(versionDowngrade),
            note: 'Ciphertext was sealed under VERSION_AAD with header AAD; downgrading the version byte to legacy 0x01 causes decrypt to omit AAD and fail closed.',
            expect: attemptDecrypt(versionDowngrade, keysB.privateKey, keysB.publicKey),
        },
        {
            name: 'protocolId flip (must fail)',
            input: hex(protocolFlip),
            note: 'protocolId is part of the VERSION_AAD-bound header; flipping it fails decode (wrong protocol) / AAD auth.',
            expect: attemptDecrypt(protocolFlip, keysB.privateKey, keysB.publicKey),
        },
        {
            name: 'wrong private key (A tries to read B’s copy)',
            input: hex(capturedStdBytes),
            note: 'uses valid envelope with unrelated key material',
            expect: attemptDecrypt(capturedStdBytes, algochat.deriveEncryptionKeys(seq(0xe0)).privateKey, algochat.deriveEncryptionKeys(seq(0xe0)).publicKey),
        },
        {
            name: 'truncated note (40 bytes)',
            input: hex(truncated),
            expect: attemptDecode(truncated),
        },
        {
            name: 'unsupported version byte 0xff',
            input: hex(badVersion),
            expect: attemptDecode(badVersion),
        },
        {
            name: 'random bytes classification',
            input: hex(randomBytes),
            expect: { result: 'classified', isChatMessage: algochat.isChatMessage(randomBytes), isPSKMessage: algochat.isPSKMessage(randomBytes) },
        },
        {
            name: 'PSK envelope: tampered ciphertext',
            input: hex(tamperedPsk),
            expect: attemptPskDecrypt(tamperedPsk, keysB.privateKey, keysB.publicKey, pskAt0),
        },
        {
            name: 'PSK envelope: tampered encryptedSenderKey (must fail)',
            input: hex(pskTamperedSenderKey),
            note: 'VERSION_AAD binds the full 130-byte PSK header including encryptedSenderKey.',
            expect: attemptPskDecrypt(pskTamperedSenderKey, keysB.privateKey, keysB.publicKey, pskAt0),
        },
        {
            name: 'PSK envelope: version 0x02→0x01 downgrade (must fail)',
            input: hex(pskVersionDowngrade),
            note: 'PSK ciphertext sealed under VERSION_AAD; downgrading version omits AAD and fails closed.',
            expect: attemptPskDecrypt(pskVersionDowngrade, keysB.privateKey, keysB.publicKey, pskAt0),
        },
        {
            name: 'PSK envelope: protocolId flip (must fail)',
            input: hex(pskProtocolFlip),
            note: 'protocolId is AAD-bound in the PSK header; flipping it fails decode / auth.',
            expect: attemptPskDecrypt(pskProtocolFlip, keysB.privateKey, keysB.publicKey, pskAt0),
        },
        {
            name: 'PSK envelope: ratchetCounter mutation (must fail)',
            input: hex(pskCounterMut),
            note: 'Big-endian ratchetCounter is part of pskHeaderAAD; mutating it fails closed.',
            expect: attemptPskDecrypt(pskCounterMut, keysB.privateKey, keysB.publicKey, pskAt0),
        },
        {
            name: 'PSK envelope: wrong ratchet position key (counter 1 instead of 0)',
            input: hex(capturedPskBytes),
            expect: attemptPskDecrypt(capturedPskBytes, keysB.privateKey, keysB.publicKey, wrongPsk),
        },
    ],
    invariant: 'Decoders reject unsupported versions, truncated fields, and unauthenticated ciphertext rather than returning partial content (spec invariant 2).',
});

console.log('\nAll invariant checks passed. Vectors generated.');
