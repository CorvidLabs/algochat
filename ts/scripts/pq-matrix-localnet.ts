/**
 * LocalNet matrix. Each library writes 0x01, 0x02, 0x04, and 0x05 notes
 * at empty, small, large, and maximum plaintext. Every library opens every
 * confirmed note. Identifier 0x03 is not used.
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

const TOKEN = "a".repeat(64);
const ROOT = new URL("../../", import.meta.url).pathname;
const LANGS = ["ts", "go", "rs", "py", "kt", "swift"] as const;
type Lang = (typeof LANGS)[number];
const PSK = "44".repeat(32);

interface Reply {
    id: number;
    ok: boolean;
    error?: string;
    x25519?: string;
    encapsKey?: string;
    note?: string;
    handshake?: string;
    messages?: string[];
    sessionKey?: string;
    recipient?: string;
    sender?: string;
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
            "/opt/homebrew/opt/openjdk@21/bin/java",
        ].find((candidate) => candidate && existsSync(candidate)) ?? "java";
    return { cmd: java, args: ["-cp", classpath, "com.corvidlabs.algochat.PQIOKt"], cwd: `${ROOT}kt` };
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
    note: Uint8Array
): Promise<{ round: number; note: Uint8Array }> {
    const params = await algod.getTransactionParams().do();
    const minFee = Number(params.minFee ?? 1000);
    const over = Math.max(0, note.length - 1024);
    const extra = over === 0 ? 0 : Math.floor((over * minFee + 9999) / 10000);
    const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: from.addr.toString(),
        receiver: to,
        amount: 1000,
        note,
        suggestedParams: { ...params, fee: minFee + extra, flatFee: true },
    });
    const sent = await algod.sendRawTransaction(txn.signTxn(from.sk)).do();
    const confirmed = await algosdk.waitForConfirmation(algod, sent.txid as string, 30);
    const pending = await algod.pendingTransactionInformation(sent.txid as string).do();
    const raw = pending.txn?.txn?.note ?? pending.txn?.note;
    let confirmedNote: Uint8Array | null = null;
    if (raw instanceof Uint8Array) confirmedNote = raw;
    else if (typeof raw === "string") confirmedNote = Buffer.from(raw, "base64");
    if (!confirmedNote || !Buffer.from(confirmedNote).equals(Buffer.from(note))) {
        throw new Error("chain note differs");
    }
    return { round: Number(confirmed.confirmedRound ?? confirmed["confirmed-round"]), note: confirmedNote };
}

interface Item {
    writer: Lang;
    kind: string;
    text: string;
    note: Uint8Array;
    round: number;
    op: "read01" | "read02" | "read";
    handshake?: Uint8Array;
    counter?: number;
}

const algod = new algosdk.Algodv2(TOKEN, "http://127.0.0.1", 4001);
const funder = await dispenser();
const alice = algosdk.generateAccount();
const bob = algosdk.generateAccount();
const aliceSeed = Buffer.from(seedOf(alice)).toString("hex");
const bobSeed = Buffer.from(seedOf(bob)).toString("hex");

const fund = async (to: string) => {
    const params = await algod.getTransactionParams().do();
    const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: funder.addr.toString(),
        receiver: to,
        amount: 20_000_000,
        suggestedParams: params,
    });
    const sent = await algod.sendRawTransaction(txn.signTxn(funder.sk)).do();
    await algosdk.waitForConfirmation(algod, sent.txid as string, 30);
};
await fund(alice.addr.toString());
await fund(bob.addr.toString());

const tools = LANGS.map((name) => new Tool(name, spawn(toolCommand(name).cmd, toolCommand(name).args, { cwd: toolCommand(name).cwd, stdio: ["pipe", "pipe", "pipe"] })));
const byName = new Map(tools.map((tool) => [tool.name, tool]));

function expectPrefix(lang: Lang, kind: string, note: Uint8Array): void {
    const head = note.subarray(0, 2).toString("hex");
    const want =
        kind.startsWith("01") ? (lang === "ts" ? "0201" : "0101")
        : kind.startsWith("02") ? (lang === "ts" ? "0202" : "0102")
        : kind === "04" ? "0204"
        : "0205";
    if (head !== want) throw new Error(`${lang} ${kind} prefix ${head}, wanted ${want}`);
}

try {
    const identities = await Promise.all(
        tools.map(async (tool) => ({
            name: tool.name,
            bob: await tool.call({ op: "identity", seed: bobSeed }),
        }))
    );
    const reference = identities.find((item) => item.name === "ts");
    if (!reference?.bob.ok) throw new Error(`typescript identity ${reference?.bob.error}`);
    for (const item of identities) {
        if (!item.bob.ok || item.bob.x25519 !== reference.bob.x25519 || item.bob.encapsKey !== reference.bob.encapsKey) {
            throw new Error(`${item.name} keys differ: ${item.bob.error ?? item.bob.x25519?.slice(0, 8)}`);
        }
    }
    console.log("identity ok");

    const sizes = {
        empty: "",
        small: "hi",
        large: "L".repeat(2000),
        max01: "M".repeat(3954),
        max02: "P".repeat(3950),
        max05: "Q".repeat(4002),
    };
    const items: Item[] = [];

    for (const lang of LANGS) {
        const tool = byName.get(lang);
        if (!tool) throw new Error(lang);
        const classical: Array<[string, string, "write01" | "write02", number?]> = [
            ["01-empty", sizes.empty, "write01"],
            ["01-small", sizes.small, "write01"],
            ["01-large", sizes.large, "write01"],
            ["01-max", sizes.max01, "write01"],
            ["02-empty", sizes.empty, "write02", 0],
            ["02-small", sizes.small, "write02", 0],
            ["02-large", sizes.large, "write02", 0],
            ["02-max", sizes.max02, "write02", 0],
            ["02-multi-0", "multi-0", "write02", 0],
            ["02-multi-1", "multi-1", "write02", 1],
            ["02-multi-2", "multi-2", "write02", 2],
        ];
        for (const [kind, text, op, counter] of classical) {
            const written = await tool.call({
                op,
                aliceSeed,
                bobSeed,
                text,
                psk: PSK,
                counter,
            });
            if (!written.ok || !written.note) throw new Error(`${lang} ${kind}: ${written.error}`);
            const note = Buffer.from(written.note, "hex");
            expectPrefix(lang, kind, note);
            const sent = await pay(algod, alice, bob.addr.toString(), note);
            items.push({
                writer: lang,
                kind,
                text,
                note: sent.note,
                round: sent.round,
                op: op === "write01" ? "read01" : "read02",
                counter,
            });
            console.log(`${lang} ${kind} round ${sent.round} ${note.length}b`);
        }
        const many = await tool.call({
            op: "write05s",
            aliceSeed,
            bobSeed,
            texts: [sizes.empty, sizes.small, sizes.large, sizes.max05],
        });
        if (!many.ok || !many.handshake || !many.messages || many.messages.length !== 4) {
            throw new Error(`${lang} 05: ${many.error}`);
        }
        const handshake = Buffer.from(many.handshake, "hex");
        expectPrefix(lang, "04", handshake);
        const handshakeTx = await pay(algod, alice, bob.addr.toString(), handshake);
        console.log(`${lang} 04 round ${handshakeTx.round}`);
        const labels = ["05-empty", "05-small", "05-large", "05-max"];
        const bodies = [sizes.empty, sizes.small, sizes.large, sizes.max05];
        for (let i = 0; i < 4; i++) {
            const message = Buffer.from(many.messages[i], "hex");
            expectPrefix(lang, "05", message);
            const sent = await pay(algod, alice, bob.addr.toString(), message);
            items.push({
                writer: lang,
                kind: labels[i],
                text: bodies[i],
                note: sent.note,
                round: sent.round,
                op: "read",
                handshake: handshakeTx.note,
            });
            console.log(`${lang} ${labels[i]} round ${sent.round} ${message.length}b`);
        }
    }

    let failed = 0;
    for (const reader of LANGS) {
        const tool = byName.get(reader);
        if (!tool) throw new Error(reader);
        for (const item of items) {
            const opened = await tool.call({
                op: item.op,
                aliceSeed,
                bobSeed,
                note: Buffer.from(item.note).toString("hex"),
                handshake: item.handshake ? Buffer.from(item.handshake).toString("hex") : undefined,
                message: item.op === "read" ? Buffer.from(item.note).toString("hex") : undefined,
                text: item.text,
                psk: PSK,
                counter: item.counter ?? 0,
            });
            if (!opened.ok || opened.recipient !== item.text) {
                failed += 1;
                console.error(`FAIL ${reader} open ${item.writer} ${item.kind}: ${opened.error ?? "text mismatch"}`);
            }
        }
        console.log(`${reader} finished reads`);
    }
    console.log(`notes ${items.length}, failures ${failed}, rounds ${items[0]?.round} through ${items[items.length - 1]?.round}`);
    if (failed > 0) process.exitCode = 1;
} finally {
    for (const tool of tools) tool.stop();
}
