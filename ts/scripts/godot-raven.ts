/**
 * LocalNet bridge between the Godot example and a development Raven.
 * One JSON request file in, one JSON result file out.
 * The dispenser key comes from LocalNet kmd and is never written to the result.
 */
import { readFileSync, writeFileSync } from "node:fs";
import algosdk from "algosdk";
import { notePaymentFee } from "../src/blockchain/message-transaction.js";
import { parseKeyAnnouncement } from "../src/blockchain/discovery.js";
import { decodeEnvelope, isChatMessage } from "../src/crypto/envelope.js";
import { deriveEncryptionKeys } from "../src/crypto/keys.js";
import { signEncryptionKey } from "../src/crypto/signature.js";
import { createChatAccountFromMnemonic, createRandomChatAccount } from "../src/services/mnemonic.service.js";

const LOCALNET_TOKEN = "a".repeat(64);
const ALGOD_SERVER = "http://localhost";
const ALGOD_PORT = 4001;
const INDEXER_PORT = 8980;
const KMD_PORT = 4002;
const FUND_MICRO_ALGO = 2_000_000;

interface RequestBody {
    mnemonic?: string;
    address?: string;
    to?: string;
    note?: string;
    amount?: number;
}

function fail(error: string): never {
    throw new Error(error);
}

function noteBytes(note: unknown): Uint8Array {
    if (note instanceof Uint8Array) return note;
    if (typeof note === "string" && note.length > 0) return Buffer.from(note, "base64");
    return new Uint8Array();
}

function algod(): algosdk.Algodv2 {
    return new algosdk.Algodv2(LOCALNET_TOKEN, ALGOD_SERVER, ALGOD_PORT);
}

function indexer(): algosdk.Indexer {
    return new algosdk.Indexer(LOCALNET_TOKEN, ALGOD_SERVER, INDEXER_PORT);
}

async function dispenser(): Promise<{ address: string; sk: Uint8Array }> {
    const kmd = new algosdk.Kmd(LOCALNET_TOKEN, ALGOD_SERVER, KMD_PORT);
    const { wallets } = await kmd.listWallets();
    const wallet = wallets.find((entry) => entry.name === "unencrypted-default-wallet");
    if (!wallet) fail("LocalNet wallet not found. Start AlgoKit LocalNet first.");
    const { wallet_handle_token: handle } = await kmd.initWalletHandle(wallet.id, "");
    try {
        const { addresses } = await kmd.listKeys(handle);
        const client = algod();
        let best: { address: string; amount: number } | null = null;
        for (const address of addresses) {
            const info = await client.accountInformation(address).do();
            const amount = Number(info.amount);
            if (!best || amount > best.amount) best = { address, amount };
        }
        if (!best) fail("LocalNet dispenser has no funded account");
        const exported = await kmd.exportKey(handle, "", best.address);
        const sk = exported.private_key;
        return { address: best.address, sk };
    } finally {
        await kmd.releaseWalletHandle(handle);
    }
}

function accountFromMnemonic(mnemonic: string) {
    const account = createChatAccountFromMnemonic(mnemonic, { scheme: "ed25519" });
    if (!account.account) fail("account has no Ed25519 signer");
    return account;
}

async function submit(
    sender: string,
    sk: Uint8Array,
    receiver: string,
    amount: number,
    note: Uint8Array,
    send: boolean,
) {
    const client = algod();
    const suggested = await client.getTransactionParams().do();
    const minFee = Number(suggested.minFee);
    // Same surcharge as the libraries: one minimum fee, plus ceil(bytes past 1024 / 10).
    suggested.flatFee = true;
    suggested.fee = notePaymentFee(note.length, minFee, "ed25519");
    const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender,
        receiver,
        amount,
        note,
        suggestedParams: suggested,
    });
    const fee = Number(txn.fee);
    if (!send) return { fee, amount, network: "localnet" };
    const signed = txn.signTxn(sk);
    const posted = await client.sendRawTransaction(signed).do();
    const txid = String(posted.txid);
    const confirmation = await algosdk.waitForConfirmation(client, txid, 8);
    return {
        txid,
        fee,
        amount,
        confirmedRound: Number(confirmation.confirmedRound ?? 0),
        network: "localnet",
    };
}

async function submitMnemonic(mnemonic: string, receiver: string, amount: number, note: Uint8Array, send: boolean) {
    const chat = accountFromMnemonic(mnemonic);
    return submit(chat.address, chat.account!.sk, receiver, amount, note, send);
}

function paymentReceiver(tx: { paymentTransaction?: { receiver?: string }; "payment-transaction"?: { receiver?: string } }): string {
    return tx.paymentTransaction?.receiver ?? tx["payment-transaction"]?.receiver ?? "";
}

async function discover(address: string): Promise<Uint8Array | null> {
    const client = indexer();
    const verifying = algosdk.Address.fromString(address).publicKey;
    let tofu: Uint8Array | null = null;
    let nextToken: string | undefined;
    let seen = 0;
    while (seen < 200) {
        let query = client.searchForTransactions().address(address).txType("pay").limit(50);
        if (nextToken) query = query.nextToken(nextToken);
        const response = await query.do();
        for (const tx of response.transactions ?? []) {
            seen += 1;
            if (tx.sender !== address) continue;
            const note = noteBytes(tx.note);
            if (paymentReceiver(tx) === address && (note.length === 32 || note.length === 96)) {
                const announced = parseKeyAnnouncement(note, verifying);
                if (announced?.isVerified) return announced.publicKey;
                if (note.length === 96) continue;
                if (announced && !tofu) tofu = announced.publicKey;
                continue;
            }
            if (!isChatMessage(note)) continue;
            try {
                if (!tofu) tofu = decodeEnvelope(note).senderPublicKey;
            } catch {
                continue;
            }
        }
        nextToken = response["next-token"];
        if (!nextToken) break;
    }
    return tofu;
}

async function run(op: string, body: RequestBody): Promise<Record<string, unknown>> {
    if (op === "create") {
        const created = createRandomChatAccount({ scheme: "ed25519" });
        const seed = algosdk.seedFromMnemonic(created.mnemonic);
        return {
            address: created.account.address,
            mnemonic: created.mnemonic,
            seed: Buffer.from(seed).toString("hex"),
            network: "localnet",
        };
    }
    if (op === "fund") {
        const address = body.address ?? fail("missing address");
        if (!algosdk.isValidAddress(address)) fail("address is not valid");
        const source = await dispenser();
        const amount = body.amount ?? FUND_MICRO_ALGO;
        const paid = await submit(source.address, source.sk, address, amount, new Uint8Array(), true);
        return { ...paid, funded: amount };
    }
    if (op === "publish") {
        const mnemonic = body.mnemonic ?? fail("missing mnemonic");
        const chat = accountFromMnemonic(mnemonic);
        const seed = algosdk.seedFromMnemonic(mnemonic);
        const signature = signEncryptionKey(chat.encryptionKeys.publicKey, seed);
        const note = new Uint8Array(96);
        note.set(chat.encryptionKeys.publicKey, 0);
        note.set(signature, 32);
        return submitMnemonic(mnemonic, chat.address, 0, note, true);
    }
    if (op === "discover") {
        const address = body.to ?? body.address ?? fail("missing address");
        const key = await discover(address);
        if (!key) fail("Raven has not published an encryption key yet. Send one message from that account first.");
        return { publicKey: Buffer.from(key).toString("hex") };
    }
    if (op === "quote" || op === "send") {
        const mnemonic = body.mnemonic ?? fail("missing mnemonic");
        const to = body.to ?? fail("missing Raven address");
        const noteHex = body.note ?? fail("missing note");
        const note = Buffer.from(noteHex, "hex");
        const amount = body.amount ?? 1000;
        return submitMnemonic(mnemonic, to, amount, note, op === "send");
    }
    if (op === "inbox") {
        const mnemonic = body.mnemonic ?? fail("missing mnemonic");
        const chat = accountFromMnemonic(mnemonic);
        const response = await indexer().searchForTransactions().address(chat.address).txType("pay").limit(20).do();
        const notes = [];
        for (const tx of response.transactions ?? []) {
            const note = noteBytes(tx.note);
            if (note.length < 2) continue;
            const payment = tx.paymentTransaction;
            notes.push({
                txid: tx.id,
                sender: tx.sender,
                receiver: payment?.receiver ?? "",
                round: Number(tx.confirmedRound ?? 0),
                note: Buffer.from(note).toString("hex"),
            });
        }
        return { address: chat.address, notes };
    }
    if (op === "localkey") {
        const mnemonic = body.mnemonic ?? fail("missing mnemonic");
        const seed = algosdk.seedFromMnemonic(mnemonic);
        const keys = deriveEncryptionKeys(seed);
        return { publicKey: Buffer.from(keys.publicKey).toString("hex") };
    }
    fail(`unknown op ${op}`);
}

async function main(): Promise<void> {
    const op = process.argv[2];
    const requestPath = process.argv[3];
    const resultPath = process.argv[4];
    if (!op || !requestPath || !resultPath) fail("usage: godot-raven.ts <op> <request.json> <result.json>");
    try {
        const body = JSON.parse(readFileSync(requestPath, "utf8")) as RequestBody;
        const result = await run(op, body);
        writeFileSync(resultPath, JSON.stringify({ ok: true, ...result }));
    } catch (error) {
        const message = error instanceof Error ? error.message : "bridge failed";
        writeFileSync(resultPath, JSON.stringify({ ok: false, error: message }));
        process.exitCode = 1;
    }
}

void main();
