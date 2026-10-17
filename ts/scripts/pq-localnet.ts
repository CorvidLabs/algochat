/**
 * Send a 0x04 handshake and a 0x05 message on LocalNet, then decrypt the
 * notes algod confirmed. Writes /tmp/pq-live.json for the other languages.
 */
import { writeFileSync } from "node:fs";
import algosdk from "algosdk";
import { deriveEncryptionKeys } from "../src/crypto/keys.js";
import { deriveMLKEMKeyPair } from "../src/pq/kem.js";
import {
    acceptPQSession,
    decryptPQMessage,
    encryptPQMessage,
    initiatePQSession,
    openPQSessionAsSender,
} from "../src/pq/session.js";
import { PQ_HANDSHAKE_SIZE } from "../src/pq/types.js";

const TOKEN = "a".repeat(64);
const TEXT = "localnet pq parity";

function seedOf(account: algosdk.Account): Uint8Array {
    if (account.sk.length === 64) return account.sk.slice(0, 32);
    if (account.sk.length === 32) return account.sk;
    throw new Error(`unexpected key length ${account.sk.length}`);
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
    const exported = await kmd.exportKey(token, "", address);
    return { addr: algosdk.Address.fromString(address), sk: exported.private_key as Uint8Array };
}

async function pay(
    algod: algosdk.Algodv2,
    from: algosdk.Account,
    to: string,
    amount: number,
    note?: Uint8Array
): Promise<{ txid: string; round: number; note: Uint8Array | null }> {
    const params = await algod.getTransactionParams().do();
    const minFee = Number(params.minFee ?? 1000);
    const over = Math.max(0, (note?.length ?? 0) - 1024);
    const extra = over === 0 ? 0 : Math.floor((over * minFee + 9999) / 10000);
    const suggested = { ...params, fee: minFee + extra, flatFee: true };
    const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: from.addr.toString(),
        receiver: to,
        amount,
        note,
        suggestedParams: suggested,
    });
    const sent = await algod.sendRawTransaction(txn.signTxn(from.sk)).do();
    const txid = sent.txid as string;
    const confirmed = await algosdk.waitForConfirmation(algod, txid, 20);
    const pending = await algod.pendingTransactionInformation(txid).do();
    const raw = pending.txn?.txn?.note ?? pending.txn?.note;
    let confirmedNote: Uint8Array | null = null;
    if (raw instanceof Uint8Array) confirmedNote = raw;
    else if (typeof raw === "string") confirmedNote = Buffer.from(raw, "base64");
    return { txid, round: Number(confirmed.confirmedRound ?? confirmed["confirmed-round"]), note: confirmedNote };
}

const algod = new algosdk.Algodv2(TOKEN, "http://127.0.0.1", 4001);
const funder = await dispenser();
const alice = algosdk.generateAccount();
const bob = algosdk.generateAccount();
await pay(algod, funder, alice.addr.toString(), 2_000_000);
await pay(algod, funder, bob.addr.toString(), 2_000_000);

const aliceKeys = deriveEncryptionKeys(seedOf(alice));
const bobKeys = deriveEncryptionKeys(seedOf(bob));
const bobKem = deriveMLKEMKeyPair(seedOf(bob));
const { note: handshake, session } = initiatePQSession({
    sender: aliceKeys,
    recipientPublicKey: bobKeys.publicKey,
    recipientEncapsKey: bobKem.encapsKey,
});
if (handshake.length !== PQ_HANDSHAKE_SIZE) throw new Error(`handshake ${handshake.length}`);
const handshakeTx = await pay(algod, alice, bob.addr.toString(), 1000, handshake);
if (!handshakeTx.note || !Buffer.from(handshakeTx.note).equals(Buffer.from(handshake))) {
    throw new Error("chain handshake bytes differ");
}
const message = encryptPQMessage(TEXT, session);
const messageTx = await pay(algod, alice, bob.addr.toString(), 1000, message);
if (!messageTx.note) throw new Error("message note missing");
const bobSession = acceptPQSession(handshakeTx.note, bobKeys, bobKem.encapsKey, bobKem.decapsKey);
const opened = decryptPQMessage(messageTx.note, bobSession);
const senderCopy = decryptPQMessage(messageTx.note, openPQSessionAsSender(handshakeTx.note, aliceKeys));
if (opened !== TEXT || senderCopy !== TEXT) throw new Error(`decrypt ${opened} ${senderCopy}`);
const flipped = new Uint8Array(messageTx.note);
flipped[flipped.length - 1] ^= 1;
let tamperFailed = false;
try {
    decryptPQMessage(flipped, bobSession);
} catch {
    tamperFailed = true;
}
if (!tamperFailed) throw new Error("tamper decrypted");

writeFileSync(
    "/tmp/pq-live.json",
    JSON.stringify({
        aliceSeed: Buffer.from(seedOf(alice)).toString("hex"),
        bobSeed: Buffer.from(seedOf(bob)).toString("hex"),
        handshake: Buffer.from(handshakeTx.note).toString("hex"),
        message: Buffer.from(messageTx.note).toString("hex"),
        sessionKey: Buffer.from(session.sessionKey).toString("hex"),
        text: TEXT,
    })
);
console.log(
    JSON.stringify(
        {
            handshakeBytes: handshake.length,
            messageBytes: message.length,
            handshakeRound: handshakeTx.round,
            messageRound: messageTx.round,
            recipient: opened,
            senderCopy,
            tamperFailed,
        },
        null,
        2
    )
);
