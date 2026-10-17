/**
 * AlgoChat conformance verifier.
 *
 * Reads every vector file and re-checks each claim against the
 * implementation under test. An independent implementation binds its own
 * primitives to the same checks; the JSON files are the contract.
 *
 * Usage: bun conformance/tools/verify.mjs [vectorDir]
 *   (default: ../vectors/ relative to this file)
 * Exit code 0 = full conformance. 1 = at least one mismatch.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as algochat from '../../src/index';
import { x25519ECDH } from '../../src/crypto/keys';

const hex = (u8) => Buffer.from(u8).toString('hex');
const unhex = (s) => new Uint8Array(Buffer.from(s, 'hex'));
const DIR = process.argv[2] ?? new URL('../vectors/', import.meta.url).pathname;
const read = (name) => JSON.parse(fs.readFileSync(path.join(DIR, name), 'utf8'));

let passed = 0;
let failed = 0;
const check = (label, cond) => {
    if (cond) { passed++; }
    else { failed++; console.error(`FAIL: ${label}`); }
};

// --- 00 protocol constants ---------------------------------------------------
{
    const v = read('00-protocol-constants.json');
    check('00 PROTOCOL.VERSION', algochat.PROTOCOL.VERSION === v.constants.PROTOCOL.VERSION);
    check('00 PROTOCOL.PROTOCOL_ID', algochat.PROTOCOL.PROTOCOL_ID === v.constants.PROTOCOL.PROTOCOL_ID);
    check('00 PROTOCOL.HEADER_SIZE', algochat.PROTOCOL.HEADER_SIZE === v.constants.PROTOCOL.HEADER_SIZE);
    check('00 PSK_PROTOCOL.PROTOCOL_ID', algochat.PSK_PROTOCOL.PROTOCOL_ID === v.constants.PSK_PROTOCOL.PROTOCOL_ID);
    check('00 PSK_PROTOCOL.SESSION_SIZE', algochat.PSK_PROTOCOL.SESSION_SIZE === v.constants.PSK_PROTOCOL.SESSION_SIZE);
    check('00 PSK_PROTOCOL.COUNTER_WINDOW', algochat.PSK_PROTOCOL.COUNTER_WINDOW === v.constants.PSK_PROTOCOL.COUNTER_WINDOW);
    check('00 PSK_PROTOCOL.MAX_PAYLOAD_SIZE', algochat.PSK_PROTOCOL.MAX_PAYLOAD_SIZE === v.constants.PSK_PROTOCOL.MAX_PAYLOAD_SIZE);
}

// --- 01 key derivation -------------------------------------------------------
{
    const v = read('01-key-derivation.json');
    const [a, b] = v.accounts;
    const keysA = algochat.deriveEncryptionKeys(unhex(a.seed));
    const keysB = algochat.deriveEncryptionKeys(unhex(b.seed));
    check('01 A x25519 private', hex(keysA.privateKey) === a.x25519PrivateKey);
    check('01 A x25519 public', hex(keysA.publicKey) === a.x25519PublicKey);
    check('01 B x25519 public', hex(keysB.publicKey) === b.x25519PublicKey);
    check('01 A fingerprint', algochat.fingerprint(keysA.publicKey) === a.fingerprint);

    const account = algochat.createChatAccountFromMnemonic(a.mnemonic);
    check('01 mnemonic -> address', account.address === a.algorandAddress);
    check('01 mnemonic -> x25519', hex(account.encryptionKeys.privateKey) === a.x25519PrivateKey);

    const sAB = x25519ECDH(keysA.privateKey, keysB.publicKey);
    const sBA = x25519ECDH(keysB.privateKey, keysA.publicKey);
    check('01 ECDH matches vector', hex(sAB) === v.ecdh.sharedSecret);
    check('01 ECDH symmetric', hex(sAB) === hex(sBA));

    const sigOk = algochat.verifyEncryptionKey(unhex(v.keyAnnouncement.encryptionPublicKey), unhex(v.keyAnnouncement.verifyingKey), unhex(v.keyAnnouncement.signature));
    const sigBad = algochat.verifyEncryptionKey(unhex(v.keyAnnouncement.encryptionPublicKey), unhex(v.keyAnnouncement.wrongVerifyingKey), unhex(v.keyAnnouncement.signature));
    check('01 signature verifies', sigOk === v.keyAnnouncement.verifies);
    check('01 signature rejected under wrong key', sigBad === v.keyAnnouncement.verifiesUnderWrongKey);
}

// --- 02 standard envelope ----------------------------------------------------
{
    const v = read('02-standard-envelope.json');
    const e = v.encodingVector.envelope;
    const env = {
        version: e.version, protocolId: e.protocolId,
        senderPublicKey: unhex(e.senderPublicKey), ephemeralPublicKey: unhex(e.ephemeralPublicKey),
        nonce: unhex(e.nonce), encryptedSenderKey: unhex(e.encryptedSenderKey), ciphertext: unhex(e.ciphertext),
    };
    const encoded = algochat.encodeEnvelope(env);
    check('02 encoding byte-exact', hex(encoded) === v.encodingVector.encodedBytes);
    const decoded = algochat.decodeEnvelope(unhex(v.encodingVector.encodedBytes));
    check('02 decode round-trip', hex(decoded.ciphertext) === e.ciphertext && hex(decoded.senderPublicKey) === e.senderPublicKey);
    check('02 isChatMessage true', algochat.isChatMessage(encoded) === v.encodingVector.isChatMessage);
    check('02 isPSKMessage false', algochat.isPSKMessage(encoded) === v.encodingVector.isPSKMessage);

    const c = v.capturedEnvelope;
    const cap = {
        version: c.envelope.version, protocolId: c.envelope.protocolId,
        senderPublicKey: unhex(c.envelope.senderPublicKey), ephemeralPublicKey: unhex(c.envelope.ephemeralPublicKey),
        nonce: unhex(c.envelope.nonce), encryptedSenderKey: unhex(c.envelope.encryptedSenderKey), ciphertext: unhex(c.envelope.ciphertext),
    };
    check('02 captured re-encodes byte-exact', hex(algochat.encodeEnvelope(cap)) === c.encodedBytes);
    const dr = algochat.decryptMessage(cap, unhex(c.decrypt.recipientPath.privateKey), unhex(c.decrypt.recipientPath.publicKey));
    const ds = algochat.decryptMessage(cap, unhex(c.decrypt.senderPath.privateKey), unhex(c.decrypt.senderPath.publicKey));
    check('02 recipient path plaintext', dr?.text === c.decrypt.recipientPath.plaintext);
    check('02 sender path plaintext', ds?.text === c.decrypt.senderPath.plaintext);
}

// --- 03 PSK ratchet ----------------------------------------------------------
{
    const v = read('03-psk-ratchet.json');
    const initial = unhex(v.initialPSK);
    for (const dv of v.derivationVectors) {
        check(`03 sessionPSK c=${dv.counter}`, hex(algochat.deriveSessionPSK(initial, dv.sessionIndex)) === dv.sessionPSK);
        check(`03 positionPSK c=${dv.counter}`, hex(algochat.derivePositionPSK(algochat.deriveSessionPSK(initial, dv.sessionIndex), dv.counter % v.constants.sessionSize)) === dv.positionPSK);
        check(`03 pskAtCounter c=${dv.counter}`, hex(algochat.derivePSKAtCounter(initial, dv.counter)) === dv.pskAtCounter);
    }
    const h = v.hybridKeyVector;
    const hk = algochat.deriveHybridSymmetricKey(unhex(h.sharedSecret), unhex(h.psk), unhex(h.ephemeralPublicKey), unhex(h.senderPublicKey), unhex(h.recipientPublicKey));
    check('03 hybrid key', hex(hk) === h.derivedKey);

    // Replay the state transcript op by op.
    let state = algochat.createPSKState();
    let idx = 0;
    for (const op of v.stateTranscript) {
        idx++;
        if (op.op === 'createPSKState') {
            check(`03 transcript[${idx}] fresh state`, state.sendCounter === op.result.sendCounter && state.peerLastCounter === op.result.peerLastCounter);
        } else if (op.op === 'advanceSendCounter') {
            const r = algochat.advanceSendCounter(state);
            state = r.state;
            check(`03 transcript[${idx}] advance -> ${op.counter}`, r.counter === op.counter && state.sendCounter === op.result.sendCounter);
        } else if (op.op === 'validateCounter') {
            const valid = algochat.validateCounter(state, op.counter);
            check(`03 transcript[${idx}] validate(${op.counter}) = ${op.valid}`, valid === op.valid);
            if (valid) {
                state = algochat.recordReceive(state, op.counter);
                check(`03 transcript[${idx}] post-receive state`, state.peerLastCounter === op.stateAfter.peerLastCounter);
            }
        }
    }
}

// --- 04 PSK envelope ---------------------------------------------------------
{
    const v = read('04-psk-envelope.json');
    const e = v.encodingVector.envelope;
    const env = {
        version: e.version, protocolId: e.protocolId, ratchetCounter: e.ratchetCounter,
        senderPublicKey: unhex(e.senderPublicKey), ephemeralPublicKey: unhex(e.ephemeralPublicKey),
        nonce: unhex(e.nonce), encryptedSenderKey: unhex(e.encryptedSenderKey), ciphertext: unhex(e.ciphertext),
    };
    const encoded = algochat.encodePSKEnvelope(env);
    check('04 encoding byte-exact', hex(encoded) === v.encodingVector.encodedBytes);
    const decoded = algochat.decodePSKEnvelope(unhex(v.encodingVector.encodedBytes));
    check('04 decode round-trip + counter', decoded.ratchetCounter === e.ratchetCounter && hex(decoded.ciphertext) === e.ciphertext);
    check('04 isPSKMessage true', algochat.isPSKMessage(encoded) === v.encodingVector.isPSKMessage);
    check('04 isChatMessage false', algochat.isChatMessage(encoded) === v.encodingVector.isChatMessage);

    const c = v.capturedEnvelope;
    const cap = {
        version: c.envelope.version, protocolId: c.envelope.protocolId, ratchetCounter: c.envelope.ratchetCounter,
        senderPublicKey: unhex(c.envelope.senderPublicKey), ephemeralPublicKey: unhex(c.envelope.ephemeralPublicKey),
        nonce: unhex(c.envelope.nonce), encryptedSenderKey: unhex(c.envelope.encryptedSenderKey), ciphertext: unhex(c.envelope.ciphertext),
    };
    check('04 captured re-encodes byte-exact', hex(algochat.encodePSKEnvelope(cap)) === c.encodedBytes);
    const d = algochat.decryptPSKMessage(cap, unhex(c.decrypt.privateKey), unhex(c.decrypt.publicKey), unhex(c.pskAtCounter));
    check('04 PSK decrypt plaintext', d?.text === c.decrypt.plaintext);
}

// --- 05 PSK exchange ---------------------------------------------------------
{
    const v = read('05-psk-exchange.json');
    const uri = algochat.createPSKExchangeURI(v.exchangeVector.address, unhex(v.exchangeVector.psk), v.exchangeVector.label);
    check('05 URI deterministic', uri === v.exchangeVector.uri);
    const parsed = algochat.parsePSKExchangeURI(v.exchangeVector.uri);
    check('05 parse address', parsed.address === v.exchangeVector.parsed.address);
    check('05 parse psk', hex(parsed.psk) === v.exchangeVector.parsed.psk);
    check('05 parse label', parsed.label === v.exchangeVector.parsed.label);
    for (const m of v.malformedUris) {
        let accepted = true;
        try { algochat.parsePSKExchangeURI(m.uri); } catch { accepted = false; }
        check(`05 malformed rejected: ${JSON.stringify(m.uri)}`, accepted === m.accepted);
    }
}

// --- 06 negative cases -------------------------------------------------------
{
    const v = read('06-negative-cases.json');
    const keyOf = (name) => {
        // The vector file records inputs; the verifier re-derives the keys the
        // generator used (fixed public test values).
        const kd = JSON.parse(fs.readFileSync(path.join(DIR, '01-key-derivation.json'), 'utf8'));
        return kd;
    };
    const kd = keyOf();
    const keysA = { priv: kd.accounts[0].x25519PrivateKey, pub: kd.accounts[0].x25519PublicKey };
    const keysB = { priv: kd.accounts[1].x25519PrivateKey, pub: kd.accounts[1].x25519PublicKey };
    const wrong = algochat.deriveEncryptionKeys(new Uint8Array(32).map((_, i) => 0xe0 + i));
    const v04 = read('04-psk-envelope.json');

    const run = (c) => {
        const bytes = unhex(c.input);
        if (c.name.includes('classification')) {
            return { result: 'classified', isChatMessage: algochat.isChatMessage(bytes), isPSKMessage: algochat.isPSKMessage(bytes) };
        }
        if (c.name.includes('truncated') || c.name.includes('unsupported version')) {
            try { algochat.decodeEnvelope(bytes); return { result: 'decoded' }; }
            catch (e) { return { result: 'throw', error: e.constructor.name }; }
        }
        if (c.name.startsWith('PSK envelope')) {
            const psk = c.name.includes('wrong ratchet') ? algochat.derivePSKAtCounter(unhex(v04.capturedEnvelope.initialPSK), 1) : unhex(v04.capturedEnvelope.pskAtCounter);
            try {
                const env = algochat.decodePSKEnvelope(bytes);
                const r = algochat.decryptPSKMessage(env, unhex(keysB.priv), unhex(keysB.pub), psk);
                return r === null ? { result: 'null' } : { result: 'plaintext', text: r.text };
            } catch (e) { return { result: 'throw', error: e.constructor.name }; }
        }
        const useSender = c.name.includes('sender path');
        const useWrong = c.name.includes('wrong private key');
        const priv = useWrong ? wrong.privateKey : unhex(useSender ? keysA.priv : keysB.priv);
        const pub = useWrong ? wrong.publicKey : unhex(useSender ? keysA.pub : keysB.pub);
        try {
            const env = algochat.decodeEnvelope(bytes);
            const r = algochat.decryptMessage(env, priv, pub);
            return r === null ? { result: 'null' } : { result: 'plaintext', text: r.text };
        } catch (e) { return { result: 'throw', error: e.constructor.name }; }
    };

    for (const c of v.cases) {
        const actual = run(c);
        check(`06 ${c.name}`, JSON.stringify(actual) === JSON.stringify(c.expect));
    }
}

console.log(`\n${passed} checks passed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
