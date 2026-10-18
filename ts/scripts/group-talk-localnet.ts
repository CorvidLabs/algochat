/**
 * Six libraries, one group. TypeScript opens a hybrid session with each other
 * library. That library accepts it. Each member gets the group key in 0x06.
 * Each library then posts its own 0x07 line. Every library opens every line.
 *
 * Tools must already be built:
 *   go build -o /tmp/algochat-pqcross-go ./cmd/pqcross
 *   cargo build --bin pqcross
 *   ./gradlew pqioClasspath
 *   swift build --product pqcross
 */
import { createHash, randomBytes } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync, readFileSync } from "node:fs";
import algosdk from "algosdk";

const TOKEN = "a".repeat(64);
const ROOT = new URL("../../", import.meta.url).pathname;
const LANGS = ["ts", "go", "rs", "py", "kt", "swift"] as const;
type Lang = (typeof LANGS)[number];

interface Reply {
    id: number;
    ok: boolean;
    error?: string;
    note?: string;
    handshake?: string;
    message?: string;
    sessionKey?: string;
    x25519?: string;
    text?: string;
    groupKey?: string;
}

class Tool {
    private nextId = 1;
    private readonly pending = new Map<number, (reply: Reply) => void>();
    stderr = "";

    constructor(
        readonly name: Lang,
        private readonly child: ChildProcessWithoutNullStreams
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
            const timer = setTimeout(() => reject(new Error(`${this.name} timed out on ${String(body.op)}`)), timeoutMs);
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
        return { cmd: existsSync(venv) ? venv : "python3", args: [`${ROOT}py/tools/pq_io.py`], cwd: ROOT };
    }
    if (name === "swift") return { cmd: `${ROOT}.build/debug/pqcross`, args: [], cwd: ROOT };
    const classpath = readFileSync(`${ROOT}kt/build/pqio.classpath`, "utf8").trim();
    const java =
        [
            process.env.JAVA_HOME ? `${process.env.JAVA_HOME}/bin/java` : "",
            "/opt/homebrew/opt/openjdk@17/bin/java",
        ].find((candidate) => candidate && existsSync(candidate)) ?? "java";
    return { cmd: java, args: ["-cp", classpath, "com.corvidlabs.algochat.PQIOKt"], cwd: `${ROOT}kt` };
}

function seedOf(account: algosdk.Account): string {
    const raw = account.sk.length === 64 ? account.sk.slice(0, 32) : account.sk;
    if (raw.length !== 32) throw new Error(`unexpected key length ${account.sk.length}`);
    return Buffer.from(raw).toString("hex");
}

function requireOk(lang: string, reply: Reply, what: string): void {
    if (!reply.ok) throw new Error(`${lang} ${what}: ${reply.error ?? "failed"}`);
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

const tools = new Map<Lang, Tool>();
for (const name of LANGS) {
    const command = toolCommand(name);
    const child = spawn(command.cmd, command.args, { cwd: command.cwd, stdio: ["pipe", "pipe", "pipe"] });
    tools.set(name, new Tool(name, child));
}

try {
    const algod = new algosdk.Algodv2(TOKEN, "http://127.0.0.1", 4001);
    const funder = await dispenser();
    const accounts = new Map<Lang, algosdk.Account>();
    for (const name of LANGS) accounts.set(name, algosdk.generateAccount());
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
    const creator = accounts.get("ts");
    if (!creator) throw new Error("missing creator");
    await fund(creator.addr.toString(), 20_000_000);
    for (const name of LANGS) {
        if (name === "ts") continue;
        const account = accounts.get(name);
        if (!account) throw new Error(`missing ${name}`);
        await fund(account.addr.toString(), 1_000_000);
    }
    const mailboxFundRound = await pay(algod, creator, mailbox.addr.toString(), 100_000);

    const creatorSeed = seedOf(creator);
    const creatorIdentity = await tools.get("ts")!.call({ op: "identity", seed: creatorSeed });
    requireOk("ts", creatorIdentity, "identity");
    const senderPublicKey = creatorIdentity.x25519;
    if (!senderPublicKey) throw new Error("creator x25519 missing");

    const groupId = randomBytes(32).toString("hex");
    const groupKey = randomBytes(32).toString("hex");
    const mailboxKey = Buffer.from(algosdk.decodeAddress(mailbox.addr.toString()).publicKey).toString("hex");
    const membershipRounds: Record<string, number> = {};

    for (const name of LANGS) {
        if (name === "ts") continue;
        const account = accounts.get(name);
        if (!account) throw new Error(`missing ${name}`);
        const memberSeed = seedOf(account);
        const written = await tools.get("ts")!.call({
            op: "write",
            aliceSeed: creatorSeed,
            bobSeed: memberSeed,
            text: `session ${name}`,
        });
        requireOk("ts", written, `handshake to ${name}`);
        const opened = await tools.get(name)!.call({
            op: "read",
            aliceSeed: creatorSeed,
            bobSeed: memberSeed,
            handshake: written.handshake,
            message: written.message,
            text: `session ${name}`,
        });
        requireOk(name, opened, "accept handshake");
        if (!written.sessionKey || written.sessionKey !== opened.sessionKey) {
            throw new Error(`${name} session key does not match TypeScript`);
        }
        const handshakeId = createHash("sha256").update(Buffer.from(written.handshake ?? "", "hex")).digest("hex");
        const nonce = randomBytes(12).toString("hex");
        const sealBody = {
            op: "groupSeal",
            sessionKey: opened.sessionKey,
            senderPublicKey,
            handshakeId,
            action: 1,
            epoch: 1,
            groupId,
            mailbox: mailboxKey,
            groupKey,
            nonce,
        };
        const notes = await Promise.all(
            LANGS.map(async (lang) => {
                const reply = await tools.get(lang)!.call(sealBody);
                requireOk(lang, reply, `seal for ${name}`);
                return reply.note;
            })
        );
        if (notes.some((note) => note !== notes[0])) throw new Error(`membership bytes for ${name} differ`);
        const note = Buffer.from(notes[0] ?? "", "hex");
        membershipRounds[name] = await pay(algod, creator, account.addr.toString(), 0, note);
        const joined = await tools.get(name)!.call({
            op: "groupOpen",
            sessionKey: opened.sessionKey,
            senderPublicKey,
            handshakeId,
            note: notes[0],
        });
        requireOk(name, joined, "open membership");
        if (joined.groupKey !== groupKey) throw new Error(`${name} opened the wrong group key`);
    }

    const lines: Record<string, string> = {};
    const messageRounds: Record<string, number> = {};
    for (const name of LANGS) {
        const account = accounts.get(name);
        if (!account) throw new Error(`missing ${name}`);
        const text = `hello from ${name}`;
        lines[name] = text;
        const senderAddress = Buffer.from(algosdk.decodeAddress(account.addr.toString()).publicKey).toString("hex");
        const nonce = randomBytes(12).toString("hex");
        const writeBody = {
            op: "groupWrite",
            groupKey,
            groupId,
            epoch: 1,
            counter: 0,
            senderAddress,
            text,
            nonce,
        };
        const notes = await Promise.all(
            LANGS.map(async (lang) => {
                const reply = await tools.get(lang)!.call(writeBody);
                requireOk(lang, reply, `write ${name}`);
                return reply.note;
            })
        );
        if (notes.some((note) => note !== notes[0])) throw new Error(`message bytes for ${name} differ`);
        messageRounds[name] = await pay(algod, account, mailbox.addr.toString(), 0, Buffer.from(notes[0] ?? "", "hex"));
        for (const reader of LANGS) {
            const heard = await tools.get(reader)!.call({
                op: "groupRead",
                note: notes[0],
                groupKey,
                senderAddress,
                text,
                seen: [],
            });
            requireOk(reader, heard, `read ${name}`);
            if (heard.text !== text) throw new Error(`${reader} heard ${heard.text}`);
        }
    }

    console.log(
        JSON.stringify(
            {
                mailboxFundRound,
                membershipRounds,
                messageRounds,
                lines,
                readers: LANGS.length,
            },
            null,
            2
        )
    );
} finally {
    for (const tool of tools.values()) tool.stop();
}
