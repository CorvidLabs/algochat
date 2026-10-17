/**
 * Every language writes a 0x04 handshake and a 0x05 message.
 * Those notes are confirmed on LocalNet, then every language opens every note.
 *
 * Build the six tools first:
 *   go build -o /tmp/algochat-pqcross-go ./cmd/pqcross          (from go/)
 *   cargo build --bin pqcross                                   (from rs/)
 *   ./gradlew pqioClasspath                                     (from kt/)
 *   swift build --product pqcross                               (from the repo root)
 */
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
    x25519?: string;
    encapsKey?: string;
    handshake?: string;
    message?: string;
    sessionKey?: string;
    recipient?: string;
    sender?: string;
}

interface Note {
    lang: Lang;
    text: string;
    handshake: Uint8Array;
    message: Uint8Array;
    sessionKey: string;
    handshakeRound: number;
    messageRound: number;
}

class Tool {
    private nextId = 1;
    private readonly pending = new Map<number, (reply: Reply) => void>();
    stderr = "";

    constructor(
        readonly name: Lang,
        private readonly child: ChildProcessWithoutNullStreams
    ) {
        createInterface({ input: child.stdout }).on("line", (line) => {
            const reply = JSON.parse(line) as Reply;
            const done = this.pending.get(reply.id);
            if (!done) return;
            this.pending.delete(reply.id);
            done(reply);
        });
        child.on("error", (error) => {
            this.failAll(`${name} failed to start: ${error.message}`);
        });
        child.stderr.on("data", (chunk: Buffer) => {
            this.stderr = (this.stderr + chunk.toString()).slice(-2000);
        });
        child.on("exit", (code) => {
            this.failAll(`${name} exited ${code}: ${this.stderr}`);
        });
    }

    private failAll(error: string): void {
        for (const [id, done] of this.pending) {
            this.pending.delete(id);
            done({ id, ok: false, error });
        }
    }

    call(body: Record<string, string>, timeoutMs = 60_000): Promise<Reply> {
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`${this.name} timed out on ${body.op}`)), timeoutMs);
            this.pending.set(id, (reply) => {
                clearTimeout(timer);
                resolve(reply);
            });
            this.child.stdin.write(`${JSON.stringify({ id, ...body })}\n`);
        });
    }

    stop(): void {
        this.child.stdin.end();
        this.child.kill();
    }
}

function toolCommand(name: Lang): { cmd: string; args: string[]; cwd: string; env?: NodeJS.ProcessEnv } {
    if (name === "ts") return { cmd: "bun", args: ["scripts/pq-io.ts"], cwd: `${ROOT}ts` };
    if (name === "go") return { cmd: "/tmp/algochat-pqcross-go", args: [], cwd: ROOT };
    if (name === "rs") return { cmd: `${ROOT}rs/target/debug/pqcross`, args: [], cwd: ROOT };
    if (name === "py") {
        const venv = `${ROOT}py/.venv/bin/python`;
        return { cmd: existsSync(venv) ? venv : "python3", args: [`${ROOT}py/tools/pq_io.py`], cwd: ROOT };
    }
    if (name === "swift") return { cmd: `${ROOT}.build/debug/pqcross`, args: [], cwd: ROOT };
    const classpath = readFileSync(`${ROOT}kt/build/pqio.classpath`, "utf8").trim();
    const javaCandidates = [
        process.env.JAVA_HOME ? `${process.env.JAVA_HOME}/bin/java` : "",
        "/opt/homebrew/opt/openjdk@17/bin/java",
        "/opt/homebrew/opt/openjdk@21/bin/java",
        "/opt/homebrew/opt/openjdk/bin/java",
    ];
    const java = javaCandidates.find((candidate) => candidate && existsSync(candidate)) ?? "java";
    return { cmd: java, args: ["-cp", classpath, "com.corvidlabs.algochat.PQIOKt"], cwd: `${ROOT}kt` };
}

function start(name: Lang): Tool {
    const spec = toolCommand(name);
    const child = spawn(spec.cmd, spec.args, {
        cwd: spec.cwd,
        env: { ...process.env, ...spec.env },
        stdio: ["pipe", "pipe", "pipe"],
    });
    return new Tool(name, child);
}

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
): Promise<{ round: number; note: Uint8Array | null }> {
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
    return { round: Number(confirmed.confirmedRound ?? confirmed["confirmed-round"]), note: confirmedNote };
}

function sameBytes(left: Uint8Array, right: Uint8Array | null): boolean {
    return right !== null && Buffer.from(left).equals(Buffer.from(right));
}

const algod = new algosdk.Algodv2(TOKEN, "http://127.0.0.1", 4001);
const funder = await dispenser();
const alice = algosdk.generateAccount();
const bob = algosdk.generateAccount();
await pay(algod, funder, alice.addr.toString(), 5_000_000);
await pay(algod, funder, bob.addr.toString(), 5_000_000);
const aliceSeed = Buffer.from(seedOf(alice)).toString("hex");
const bobSeed = Buffer.from(seedOf(bob)).toString("hex");

const tools = LANGS.map((name) => start(name));
const byName = new Map(tools.map((tool) => [tool.name, tool]));

try {
    const identities = await Promise.all(
        tools.map(async (tool) => ({ tool, alice: await tool.call({ op: "identity", seed: aliceSeed }), bob: await tool.call({ op: "identity", seed: bobSeed }) }))
    );
    const reference = identities.find((item) => item.tool.name === "ts");
    if (!reference?.alice.ok || !reference.bob.ok) throw new Error(`typescript identity failed ${reference?.alice.error}`);
    for (const item of identities) {
        for (const side of ["alice", "bob"] as const) {
            const got = item[side];
            const want = reference[side];
            if (!got.ok) throw new Error(`${item.tool.name} identity ${side}: ${got.error}`);
            if (got.x25519 !== want.x25519 || got.encapsKey !== want.encapsKey) {
                throw new Error(
                    `${item.tool.name} ${side} keys differ from typescript (x25519 ${got.x25519?.slice(0, 16)} ek ${got.encapsKey?.slice(0, 16)})`
                );
            }
        }
    }
    console.log("identity: all six languages derive the same X25519 key and encapsulation key");

    const notes: Note[] = [];
    for (const lang of LANGS) {
        const tool = byName.get(lang);
        if (!tool) throw new Error(lang);
        const text = `cross from ${lang}`;
        const written = await tool.call({ op: "write", aliceSeed, bobSeed, text });
        if (!written.ok || !written.handshake || !written.message || !written.sessionKey) {
            throw new Error(`${lang} write: ${written.error}`);
        }
        const handshake = Buffer.from(written.handshake, "hex");
        const message = Buffer.from(written.message, "hex");
        if (handshake.length !== 2366 || handshake[0] !== 0x02 || handshake[1] !== 0x04) {
            throw new Error(`${lang} handshake is ${handshake.length} bytes`);
        }
        if (message.length < 78 + 16 || message[0] !== 0x02 || message[1] !== 0x05) {
            throw new Error(`${lang} message is ${message.length} bytes`);
        }
        const handshakeTx = await pay(algod, alice, bob.addr.toString(), 1000, handshake);
        const messageTx = await pay(algod, alice, bob.addr.toString(), 1000, message);
        if (!sameBytes(handshake, handshakeTx.note) || !sameBytes(message, messageTx.note)) {
            throw new Error(`${lang} chain bytes differ from the note it built`);
        }
        notes.push({
            lang,
            text,
            handshake,
            message,
            sessionKey: written.sessionKey,
            handshakeRound: handshakeTx.round,
            messageRound: messageTx.round,
        });
        console.log(`${lang} wrote rounds ${handshakeTx.round} and ${messageTx.round}`);
    }

    const header = ["reader\\writer", ...LANGS].join("\t");
    console.log(header);
    let failed = 0;
    for (const reader of LANGS) {
        const cells: string[] = [reader];
        const tool = byName.get(reader);
        if (!tool) throw new Error(reader);
        for (const note of notes) {
            const opened = await tool.call({
                op: "read",
                aliceSeed,
                bobSeed,
                handshake: Buffer.from(note.handshake).toString("hex"),
                message: Buffer.from(note.message).toString("hex"),
                text: note.text,
            });
            if (!opened.ok || opened.sessionKey !== note.sessionKey || opened.recipient !== note.text) {
                cells.push("FAIL");
                failed += 1;
                console.error(`${reader} could not open ${note.lang}: ${opened.error ?? "session key mismatch"}`);
            } else {
                cells.push("ok");
            }
        }
        console.log(cells.join("\t"));
    }
    if (failed > 0) {
        console.error(`${failed} pair(s) failed`);
        process.exitCode = 1;
    } else {
        console.log(`mesh: 6 writers x 6 readers opened the LocalNet notes`);
    }
} finally {
    for (const tool of tools) tool.stop();
}
