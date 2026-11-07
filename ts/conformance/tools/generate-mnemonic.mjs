/**
 * AlgoChat 25-word account vector generator (#73).
 *
 * Writes only 07-mnemonic-accounts.json. The other vector files come from
 * generate.mjs and stay frozen; this script never touches them.
 *
 * Every phrase here comes from fixed, published TEST entropy. These are not
 * wallets: never fund them and never reuse them. The script prints file
 * names and sizes only, never a phrase.
 *
 * Usage: bun conformance/tools/generate-mnemonic.mjs [outDir]
 *   (default: ../vectors/ relative to this file)
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import algosdk from 'algosdk';
import * as algochat from '../../src/index';
import { deriveMLKEMKeyPair } from '../../src/pq/kem';
import { readEnglishWordlist } from './wordlist.mjs';

const hex = (u8) => Buffer.from(u8).toString('hex');
const OUT = process.argv[2] ?? new URL('../vectors/', import.meta.url).pathname;
const FILE = '07-mnemonic-accounts.json';

const invariant = (cond, msg) => {
    if (!cond) {
        console.error(`INVARIANT VIOLATION: ${msg}`);
        process.exit(1);
    }
};

const words = readEnglishWordlist();
invariant(words.length === 2048, 'wordlist must have 2048 words');

// Fixed TEST entropy. 'counter-00' is the 01-key-derivation account A seed.
const ENTROPY = [
    ['zero', new Uint8Array(32)],
    ['ones', new Uint8Array(32).fill(0xff)],
    ['counter-00', new Uint8Array(32).map((_, i) => i)],
    ['stride-37', new Uint8Array(32).map((_, i) => (i * 37 + 11) & 0xff)],
];

const accounts = ENTROPY.map(([name, entropy]) => {
    const mnemonic = algosdk.mnemonicFromSeed(entropy);
    invariant(hex(algosdk.seedFromMnemonic(mnemonic)) === hex(entropy), `${name}: phrase round trip`);
    const account = algochat.createChatAccountFromMnemonic(mnemonic);
    invariant(account.scheme === 'ed25519', `${name}: restore defaults to ed25519`);
    const sk = algosdk.mnemonicToSecretKey(mnemonic);
    invariant(sk.addr.toString() === account.address, `${name}: algosdk address`);
    const kem = deriveMLKEMKeyPair(entropy);
    const falcon = algochat.createChatAccountFromMnemonic(mnemonic, { scheme: 'falcon-1024' });
    invariant(falcon.address !== account.address, `${name}: falcon address differs`);
    invariant(hex(falcon.encryptionKeys.publicKey) === hex(account.encryptionKeys.publicKey), `${name}: same encryption keys`);
    return {
        name,
        mnemonic,
        entropy: hex(entropy),
        ed25519PublicKey: hex(sk.sk.slice(32)),
        algorandAddress: account.address,
        x25519PublicKey: hex(account.encryptionKeys.publicKey),
        mlkem768EncapsulationKey: hex(kem.encapsKey),
        falcon1024AddressInfoOnly: falcon.address,
    };
});

// Negative cases are all derived from the counter-00 phrase.
const base = accounts.find((a) => a.name === 'counter-00').mnemonic.split(' ');
const swapWord = (list, i, offset) => {
    const out = [...list];
    out[i] = words[(words.indexOf(out[i]) + offset) % 2048];
    return out;
};
const NEGATIVE = [
    ['24-words', base.slice(0, 24).join(' ')],
    ['26-words-ending-in-checksum', [...base.slice(0, 24), 'zoo', base[24]].join(' ')],
    ['30-words-ending-in-checksum', [...base.slice(0, 24), 'zoo', 'zoo', 'zoo', 'zoo', 'zoo', base[24]].join(' ')],
    ['bad-checksum-word', swapWord(base, 24, 1).join(' ')],
    ['nonzero-padding-bits', swapWord(base, 23, 1).join(' ')],
    ['unknown-word', [...base.slice(0, 3), 'notaword', ...base.slice(4)].join(' ')],
    ['uppercase', base.join(' ').toUpperCase()],
    ['leading-space', ' ' + base.join(' ')],
    ['trailing-space', base.join(' ') + ' '],
    ['double-space', base.slice(0, 5).join(' ') + '  ' + base.slice(5).join(' ')],
    ['tab-separator', base.join('\t')],
    ['newline-separator', base.join('\n')],
    ['four-letter-prefixes', base.map((w) => w.slice(0, 4)).join(' ')],
    ['empty', ''],
];
// The padding case only exercises padding if word 24 really changed its low bits.
invariant(swapWord(base, 23, 1)[23] !== base[23], 'padding case changes word 24');

const doc = {
    tool: '@corvidlabs/ts-algochat 25-word account generator',
    libraryVersion: '0.12.0',
    algosdkVersion: '3.7.0',
    generatedBy: 'reference implementation (TypeScript + algosdk)',
    note: 'TEST ONLY: every phrase comes from fixed published entropy. Never fund these accounts. Byte strings are lowercase hex.',
    file: '07-mnemonic-accounts',
    description: 'Algorand 25-word phrases: entropy, Ed25519 account, X25519 and ML-KEM-768 keys, and phrases every implementation must reject.',
    wordlist: { count: words.length, sha256OfNewlineJoined: createHash('sha256').update(words.join('\n')).digest('hex') },
    accounts,
    negative: NEGATIVE.map(([name, mnemonic]) => ({ name, mnemonic, expect: 'reject' })),
};

fs.mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, FILE);
fs.writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
console.log(`wrote ${FILE} (${fs.statSync(file).size} bytes)`);
