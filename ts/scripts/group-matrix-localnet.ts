/**
 * LocalNet group mailbox. One group of three, then a fourth member, then a
 * removal, then one 0x07 payment to that mailbox. Every library seals the
 * same notes and opens the confirmed message. The previous group key fails.
 *
 * Tools must already be built:
 *   go build -o /tmp/algochat-pqcross-go ./cmd/pqcross
 *   cargo build --bin pqcross
 *   ./gradlew pqioClasspath
 *   swift build --product pqcross
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync, readFileSync } from "node:fs";
import algosdk from "algosdk";
import { deriveEncryptionKeys } from "../src/crypto/keys.js";
import { deriveMLKEMKeyPair } from "../src/pq/kem.js";
import { initiatePQSession } from "../src/pq/session.js";

const TOKEN = "a".repeat(64);
const ROOT = new URL("../../", import.meta.url).pathname;
const LANGS = ["ts", "go", "rs", "py", "kt", "swift"] as const;
type Lang = (typeof LANGS)[number];

interface Reply {
    id: number;
    ok: boolean;
    error?: string;
    note?: string;
    messageKey?: string;
    text?: string;
    action?: number;
    epoch?: number;
    groupKey?: string;
    groupId?: string;
}

interface Vector {
    session_key: string;
    sender_x25519: string;
    handshake_id: string;
    membership_nonce: string;
    action: number;
    epoch: number;
    group_id: string;
    mailbox: string;
    group_key: string;
    membership_note: string;
    message_nonce: string;
    counter: number;
    sender_address: string;
    plaintext_utf8: string;
    message_key: string;
    message_note: string;
}

class Tool {
    private nextId = 1;
    private readonly pending = new Map<number, (reply: Reply) => void>();
    stderr = "";

    constructor(
        readonly name: Lang,
        private readonly child: ChildProcessWithoutNullStreams,
    ) {
        child.on("error", (error) => this.failAll(`${name} failed to start: ${error.message}`));
        child.stderr.on("data", (chunk: Buffer) => {
            this.stderr = (this.stderr + chunk.toString()).slice(-2000);
        });
        child.on("exit", (code) => this.failAll(`${name} exited ${code}: ${this.stderr}`));
        createInterface({ input: child.stdout }).on("line", (line) => {
            const reply = JSON.parse(line) as Reply;
            const done = this.pending.get(reply.id);
            if (!done) return;
            this.pending.delete(reply.id);
            done(reply);
        });
    }

    call(body: Record<string, unknown>, timeoutMs = 120_000): Promise<Reply> {
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(
                () => reject(new Error(`${this.name} timed out on ${String(body.op)}`)),
                timeoutMs,
            );
            this.pending.set(id, (reply) => {
                clearTimeout(timer);
                resolve(reply);
            });
            this.child.stdin.write(`${JSON.stringify({ id, ...body })}\n`);
        });
    }

    stop(): void {
        this.child.kill();
    }

    private failAll(error: string): void {
        for (const [id, done] of this.pending) {
            this.pending.delete(id);
            done({ id, ok: false, error });
        }
    }
}

function toolCommand(name: Lang): { cmd: string; args: string[]; cwd: string } {
    if (name === "ts") return { cmd: "bun", args: ["scripts/pq-io.ts"], cwd: `${ROOT}ts` };
    if (name === "go") return { cmd: "/tmp/algochat-pqcross-go", args: [], cwd: ROOT };
    if (name === "rs") return { cmd: `${ROOT}rs/target/debug/pqcross`, args: [], cwd: ROOT };
    if (name === "py") {
        const venv = `${ROOT}py/.venv/bin/python`;
        return {
            cmd: existsSync(venv) ? venv : "python3",
            args: [`${ROOT}py/tools/pq_io.py`],
            cwd: ROOT,
        };
    }
    if (name === "swift") return { cmd: `${ROOT}.build/debug/pqcross`, args: [], cwd: ROOT };
    const classpath = readFileSync(`${ROOT}kt/build/pqio.classpath`, "utf8").trim();
    const java =
        [
            process.env.JAVA_HOME ? `${process.env.JAVA_HOME}/bin/java` : "",
            "/opt/homebrew/opt/openjdk@17/bin/java",
            "/opt/homebrew/opt/openjdk@21/bin/java",
        ].find((candidate) => candidate && existsSync(candidate)) ?? "java";
    return {
        cmd: java,
        args: ["-cp", classpath, "com.corvidlabs.algochat.PQIOKt"],
        cwd: `${ROOT}kt`,
    };
}

function seedOf(account: algosdk.Account): Uint8Array {
    if (account.sk.length === 64) return account.sk.slice(0, 32);
    if (account.sk.length === 32) return account.sk;
    throw new Error(`unexpected key length ${account.sk.length}`);
}

function hex(bytes: Uint8Array): string {
    return Buffer.from(bytes).toString("hex");
}

function randomHex(size: number): string {
    const bytes = new Uint8Array(size);
    crypto.getRandomValues(bytes);
    return Buffer.from(bytes).toString("hex");
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
    return {
        addr: algosdk.Address.fromString(address),
        sk: exported.private_key as Uint8Array,
    };
}

async function pay(
    algod: algosdk.Algodv2,
    from: algosdk.Account,
    to: string,
    amount: number,
    note?: Uint8Array,
): Promise<number> {
    const params = await algod.getTransactionParams().do();
    const minFee = Number(params.minFee ?? 1000);
    const over = Math.max(0, (note?.length ?? 0) - 1024);
    const extra = over === 0 ? 0 : Math.floor((over * minFee + 9999) / 10000);
    const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: from.addr.toString(),
        receiver: to,
        amount,
        note,
        suggestedParams: { ...params, fee: minFee + extra, flatFee: true },
    });
    const sent = await algod.sendRawTransaction(txn.signTxn(from.sk)).do();
    const confirmed = await algosdk.waitForConfirmation(algod, sent.txid as string, 30);
    if (note) {
        const pending = await algod.pendingTransactionInformation(sent.txid as string).do();
        const raw = pending.txn?.txn?.note ?? pending.txn?.note;
        let confirmedNote: Uint8Array | null = null;
        if (raw instanceof Uint8Array) confirmedNote = raw;
        else if (typeof raw === "string") confirmedNote = Buffer.from(raw, "base64");
        if (!confirmedNote || !Buffer.from(confirmedNote).equals(Buffer.from(note))) {
            throw new Error("chain note differs");
        }
    }
    return Number(confirmed.confirmedRound ?? confirmed["confirmed-round"]);
}

function requireOk(lang: Lang, reply: Reply, what: string): void {
    if (!reply.ok) throw new Error(`${lang} ${what}: ${reply.error ?? "failed"}`);
}

async function agreed(
    tools: Tool[],
    op: string,
    body: Record<string, unknown>,
    field: "note" | "messageKey",
): Promise<string> {
    const values = await Promise.all(
        tools.map(async (tool) => {
            const reply = await tool.call({ op, ...body });
            requireOk(tool.name, reply, op);
            const value = reply[field];
            if (!value) throw new Error(`${tool.name} ${op} missing ${field}`);
            return value;
        }),
    );
    const first = values[0];
    if (!first) throw new Error(`${op} produced no ${field}`);
    values.forEach((value, index) => {
        if (value !== first) throw new Error(`${tools[index]?.name} ${op} ${field} differs`);
    });
    return first;
}

const vector = JSON.parse(readFileSync(`${ROOT}vectors/group-v1.json`, "utf8")) as Vector;
const tools = LANGS.map((name) => {
    const command = toolCommand(name);
    const child = spawn(command.cmd, command.args, {
        cwd: command.cwd,
        stdio: ["pipe", "pipe", "pipe"],
    });
    return new Tool(name, child);
});

try {
    for (const tool of tools) {
        const sealed = await tool.call({
            op: "groupSeal",
            sessionKey: vector.session_key,
            senderPublicKey: vector.sender_x25519,
            handshakeId: vector.handshake_id,
            action: vector.action,
            epoch: vector.epoch,
            groupId: vector.group_id,
            mailbox: vector.mailbox,
            groupKey: vector.group_key,
            nonce: vector.membership_nonce,
        });
        requireOk(tool.name, sealed, "vector groupSeal");
        if (sealed.note !== vector.membership_note) throw new Error(`${tool.name} membership note differs`);
        const opened = await tool.call({
            op: "groupOpen",
            sessionKey: vector.session_key,
            senderPublicKey: vector.sender_x25519,
            handshakeId: vector.handshake_id,
            note: vector.membership_note,
        });
        requireOk(tool.name, opened, "vector groupOpen");
        if (opened.groupKey !== vector.group_key) throw new Error(`${tool.name} opened the wrong group key`);
        const written = await tool.call({
            op: "groupWrite",
            groupKey: vector.group_key,
            groupId: vector.group_id,
            epoch: vector.epoch,
            counter: vector.counter,
            senderAddress: vector.sender_address,
            text: vector.plaintext_utf8,
            nonce: vector.message_nonce,
        });
        requireOk(tool.name, written, "vector groupWrite");
        if (written.note !== vector.message_note || written.messageKey !== vector.message_key) {
            throw new Error(`${tool.name} message note differs`);
        }
        const read = await tool.call({
            op: "groupRead",
            note: vector.message_note,
            groupKey: vector.group_key,
            senderAddress: vector.sender_address,
            text: vector.plaintext_utf8,
            seen: [],
        });
        requireOk(tool.name, read, "vector groupRead");
        const replay = await tool.call({
            op: "groupRead",
            note: vector.message_note,
            groupKey: vector.group_key,
            senderAddress: vector.sender_address,
            text: vector.plaintext_utf8,
            seen: [{ epoch: vector.epoch, counter: vector.counter }],
        });
        if (replay.ok) throw new Error(`${tool.name} accepted a repeated counter`);
        const wrongKey = "98".repeat(32);
        const removed = await tool.call({
            op: "groupRead",
            note: vector.message_note,
            groupKey: wrongKey,
            senderAddress: vector.sender_address,
            text: vector.plaintext_utf8,
            seen: [],
        });
        if (removed.ok) throw new Error(`${tool.name} opened with the wrong group key`);
    }

    const algod = new algosdk.Algodv2(TOKEN, "http://127.0.0.1", 4001);
    const funder = await dispenser();
    const creator = algosdk.generateAccount();
    const memberA = algosdk.generateAccount();
    const memberB = algosdk.generateAccount();
    const memberC = algosdk.generateAccount();
    const mailbox = algosdk.generateAccount();
    const fund = async (to: string, amount: number) => {
        const params = await algod.getTransactionParams().do();
        const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
            sender: funder.addr.toString(),
            receiver: to,
            amount,
            suggestedParams: params,
        });
        const sent = await algod.sendRawTransaction(txn.signTxn(funder.sk)).do();
        await algosdk.waitForConfirmation(algod, sent.txid as string, 30);
    };
    await fund(creator.addr.toString(), 20_000_000);
    await fund(memberA.addr.toString(), 1_000_000);
    await fund(memberB.addr.toString(), 1_000_000);
    await fund(memberC.addr.toString(), 1_000_000);
    const mailboxFundRound = await pay(algod, creator, mailbox.addr.toString(), 100_000);

    const creatorSeed = seedOf(creator);
    const sessionFor = (member: algosdk.Account) => {
        const sender = deriveEncryptionKeys(creatorSeed);
        const recipientSeed = seedOf(member);
        const recipient = deriveEncryptionKeys(recipientSeed);
        const senderKem = deriveMLKEMKeyPair(creatorSeed);
        const recipientKem = deriveMLKEMKeyPair(recipientSeed);
        const { session } = initiatePQSession({
            sender,
            senderEncapsKey: senderKem.encapsKey,
            recipientPublicKey: recipient.publicKey,
            recipientEncapsKey: recipientKem.encapsKey,
        });
        return {
            sessionKey: hex(session.sessionKey),
            senderPublicKey: hex(session.senderPublicKey),
            handshakeId: hex(session.handshakeId),
        };
    };
    const sessionA = sessionFor(memberA);
    const sessionB = sessionFor(memberB);
    const sessionC = sessionFor(memberC);
    const groupId = randomHex(32);
    const key1 = randomHex(32);
    const key2 = randomHex(32);
    const key3 = randomHex(32);
    const mailboxKey = hex(algosdk.decodeAddress(mailbox.addr.toString()).publicKey);

    const membership = async (
        session: {
            sessionKey: string;
            senderPublicKey: string;
            handshakeId: string;
        },
        action: number,
        epoch: number,
        groupKey: string,
        to: algosdk.Account,
    ) => {
        const noteHex = await agreed(
            tools,
            "groupSeal",
            {
                ...session,
                action,
                epoch,
                groupId,
                mailbox: mailboxKey,
                groupKey,
                nonce: randomHex(12),
            },
            "note",
        );
        const round = await pay(algod, creator, to.addr.toString(), 0, Buffer.from(noteHex, "hex"));
        for (const tool of tools) {
            const opened = await tool.call({
                op: "groupOpen",
                ...session,
                note: noteHex,
            });
            requireOk(tool.name, opened, "groupOpen");
            if (opened.groupKey !== groupKey) throw new Error(`${tool.name} group key mismatch at epoch ${epoch}`);
        }
        return round;
    };

    const createA = await membership(sessionA, 1, 1, key1, memberA);
    const createB = await membership(sessionB, 1, 1, key1, memberB);
    const addA = await membership(sessionA, 2, 2, key2, memberA);
    const addB = await membership(sessionB, 2, 2, key2, memberB);
    const addC = await membership(sessionC, 2, 2, key2, memberC);
    const removeA = await membership(sessionA, 3, 3, key3, memberA);
    const removeC = await membership(sessionC, 3, 3, key3, memberC);

    const senderAddress = hex(algosdk.decodeAddress(creator.addr.toString()).publicKey);
    const messageHex = await agreed(
        tools,
        "groupWrite",
        {
            groupKey: key3,
            groupId,
            epoch: 3,
            counter: 0,
            senderAddress,
            text: "group mailbox",
            nonce: randomHex(12),
        },
        "note",
    );
    const messageRound = await pay(algod, creator, mailbox.addr.toString(), 0, Buffer.from(messageHex, "hex"));
    for (const tool of tools) {
        const opened = await tool.call({
            op: "groupRead",
            note: messageHex,
            groupKey: key3,
            senderAddress,
            text: "group mailbox",
            seen: [],
        });
        requireOk(tool.name, opened, "groupRead");
        const removed = await tool.call({
            op: "groupRead",
            note: messageHex,
            groupKey: key2,
            senderAddress,
            text: "group mailbox",
            seen: [],
        });
        if (removed.ok) throw new Error(`${tool.name} opened the message with the removed member key`);
        const replay = await tool.call({
            op: "groupRead",
            note: messageHex,
            groupKey: key3,
            senderAddress,
            text: "group mailbox",
            seen: [{ epoch: 3, counter: 0 }],
        });
        if (replay.ok) throw new Error(`${tool.name} accepted the posted counter twice`);
    }

    console.log(
        JSON.stringify(
            {
                mailboxFundRound,
                createRounds: [createA, createB],
                addRounds: [addA, addB, addC],
                removeRounds: [removeA, removeC],
                messageRound,
                opens: LANGS.length,
                removedKeyFailed: LANGS.length,
            },
            null,
            2,
        ),
    );
} finally {
    for (const tool of tools) tool.stop();
}
