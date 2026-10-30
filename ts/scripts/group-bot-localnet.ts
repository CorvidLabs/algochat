/**
 * LocalNet room bots (ops 13 and 14).
 *
 * Every note here is a real payment on LocalNet. Each language drafts the
 * accepted notes byte for byte, and each language reduces the confirmed chain
 * notes to the same room, the same bot record and the same rejection reasons.
 *
 * What runs on chain:
 *   - a room with the owner, an admin and a plain member
 *   - the owner adds a bot with a reply mode and the suggested 5 per 60 seconds
 *   - the bot joins at once: same epoch, no request, no accept
 *   - the owner sends the bot the room key, citing the add-bot record, over a
 *     hybrid session the bot opened with its own keys; the bot posts in the room
 *   - the admin changes the bot's mode and rate limit
 *   - should-reject notes: a self-marked bot, a plain member adding a bot,
 *     marking an existing member, a bot as admin, a bot as owner, a plain
 *     member changing a bot
 *   - a channel: a plain add of the parent's bot is rejected, an add-bot of an
 *     account that is not a bot in the parent is rejected, and add-bot works
 *
 * Tools must already be built (as for group-admin-localnet.ts):
 *   go build -o /tmp/algochat-pqcross-go ./cmd/pqcross
 *   cargo build --bin pqcross
 *   ./gradlew pqioClasspath
 *   swift build --product pqcross            (macOS 26 only)
 *
 * The Swift pqcross tool refuses to start on Linux because ML-KEM-768 needs
 * macOS 26. On Linux this script writes the confirmed chain notes to a record
 * file and runs `swift test --filter GroupAdminBotsTests` with
 * ALGOCHAT_BOT_LOCALNET_RECORD pointing at it, so Swift checks the same notes.
 *
 * Only the LocalNet KMD dispenser funds accounts. Evidence is written outside
 * the repository.
 */
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import algosdk from "algosdk";
import { deriveEncryptionKeys } from "../src/crypto/keys.js";
import { deriveMLKEMKeyPair } from "../src/pq/kem.js";
import {
    ADMIN_OP,
    BOT_MODE,
    BOT_RATE_PRESET,
    JOINING,
    deliveryAuthorized,
    draftAdmin,
    reduceAdmin,
    roomBot,
    sealGroupKeyDelivery,
    senderMayPost,
    type AdminEvent,
    type BotSettings,
    type RoomState,
} from "../src/pq/group-admin.js";
import { sealGroupMessage } from "../src/pq/group.js";
import { acceptPQSession, initiatePQSession, openPQSessionAsSender } from "../src/pq/session.js";
import type { PQSession } from "../src/pq/types.js";

const TOKEN = "a".repeat(64);
const ROOT = new URL("../../", import.meta.url).pathname;
const EVIDENCE = process.env.GROUP_BOT_EVIDENCE ?? "/tmp/algochat-group-bot-evidence";
const ALL = ["ts", "go", "rs", "py", "kt", "swift"] as const;
type Lang = (typeof ALL)[number];
/** Swift's pqcross tool runs only on macOS 26. Elsewhere Swift replays the chain record in `swift test`. */
const SWIFT_IN_MESH = process.platform === "darwin";
const MESH: Lang[] = ALL.filter((name) => name !== "swift" || SWIFT_IN_MESH);

interface Reply {
    id: number;
    ok: boolean;
    error?: string;
    note?: string;
    state?: Record<string, unknown> | null;
    accepted?: Array<Record<string, unknown>>;
    rejected?: Array<{ tx_id: string; reason: string }>;
    allowed?: boolean;
    text?: string;
    epoch?: number;
    group_id?: string;
    mailbox?: string;
    group_key?: string;
    admin_tx_id?: string;
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

function toolCommand(name: Lang): { cmd: string; args: string[]; cwd: string; env?: Record<string, string> } {
    if (name === "ts") return { cmd: "bun", args: ["scripts/pq-io.ts"], cwd: `${ROOT}ts` };
    if (name === "go") return { cmd: "/tmp/algochat-pqcross-go", args: [], cwd: ROOT };
    if (name === "rs") return { cmd: `${ROOT}rs/target/debug/pqcross`, args: [], cwd: ROOT };
    if (name === "py") {
        return {
            cmd: [`${ROOT}py/.venv/bin/python`].find((item) => existsSync(item)) ?? "python3",
            args: [`${ROOT}py/tools/pq_io.py`],
            cwd: ROOT,
            env: { PYTHONPATH: `${ROOT}py/src` },
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
    return { cmd: java, args: ["-cp", classpath, "com.corvidlabs.algochat.PQIOKt"], cwd: `${ROOT}kt` };
}

const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString("hex");
const pub = (account: algosdk.Account): Uint8Array => new Uint8Array(algosdk.decodeAddress(account.addr.toString()).publicKey);
const seedOf = (account: algosdk.Account): Uint8Array => account.sk.slice(0, 32);

function snap(state: RoomState | null) {
    if (!state) return null;
    return {
        group_id: hex(state.groupId),
        mailbox: hex(state.mailbox),
        owner: hex(state.owner),
        admins: state.admins.map(hex),
        members: state.members.map(hex),
        pending: state.pending.map(hex),
        policy: state.policy,
        name_hex: hex(state.name),
        epoch: state.epoch,
        head_tx_id: hex(state.headTxId),
        parent_group_id: hex(state.parentGroupId),
        bots: (state.bots ?? []).map((item) => ({
            account: hex(item.account),
            mode: item.mode,
            replies: item.replies,
            seconds: item.seconds,
        })),
    };
}

/** JSON with sorted keys, so tools that order fields differently still compare equal. */
function canonical(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value && typeof value === "object") {
        const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
        return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
    }
    return JSON.stringify(value ?? null);
}

function requireOk(lang: string, reply: Reply, what: string): void {
    if (!reply.ok) throw new Error(`${lang} ${what}: ${reply.error ?? "failed"}`);
}

function wireEvents(events: readonly AdminEvent[]) {
    return events.map((item) => ({
        note: hex(item.note),
        sender: hex(item.sender),
        tx_id: hex(item.txId),
        round: item.round,
        offset: item.offset,
    }));
}

class Room {
    readonly events: AdminEvent[] = [];

    constructor(
        readonly label: string,
        readonly groupId: Uint8Array,
        readonly mailboxAccount: algosdk.Account,
        readonly parent: Room | null = null,
    ) {}

    get mailbox(): Uint8Array {
        return pub(this.mailboxAccount);
    }

    reduced() {
        return reduceAdmin(this.events, this.parent?.events);
    }

    state(): RoomState {
        const state = this.reduced().state;
        if (!state) throw new Error(`${this.label} missing`);
        return state;
    }
}

interface Step {
    room: Room;
    sender: algosdk.Account;
    op: number;
    subject?: Uint8Array;
    name?: string;
    policy?: number;
    bot?: BotSettings;
    /** A doctored view a careless or hostile client might draft from. The chain must reject the note. */
    basis?: RoomState | null;
    parentBasis?: RoomState | null;
    reject?: string;
    label: string;
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
    const algod = new algosdk.Algodv2(TOKEN, "http://127.0.0.1", 4001);
    let best: { address: string; amount: bigint } | null = null;
    for (const address of keys.addresses as string[]) {
        const info = await algod.accountInformation(address).do();
        const amount = BigInt(info.amount);
        if (!best || amount > best.amount) best = { address, amount };
    }
    if (!best) throw new Error("dispenser wallet has no keys");
    const exported = await kmd.exportKey(token, "", best.address);
    await kmd.releaseWalletHandle(token);
    return { addr: algosdk.Address.fromString(best.address), sk: exported.private_key as Uint8Array };
}

async function localnetReachable(): Promise<boolean> {
    try {
        const response = await fetch("http://127.0.0.1:4001/health", { signal: AbortSignal.timeout(1500) });
        return response.ok;
    } catch {
        return false;
    }
}

async function main(): Promise<void> {
    if (!await localnetReachable()) {
        if (process.env.ALGOCHAT_REQUIRE_LOCALNET === "1") throw new Error("LocalNet is required and algod at 127.0.0.1:4001 is down");
        console.log(JSON.stringify({ localnet: "down", skipped: "group-bot-localnet" }));
        return;
    }
    const algod = new algosdk.Algodv2(TOKEN, "http://127.0.0.1", 4001);
    const genesis = (await algod.getTransactionParams().do()).genesisID;
    if (genesis !== "dockernet-v1" && !String(genesis).startsWith("sandnet")) {
        throw new Error(`refusing to run on ${genesis}: LocalNet only`);
    }
    const tools = MESH.map((name) => {
        const command = toolCommand(name);
        const child = spawn(command.cmd, command.args, {
            cwd: command.cwd,
            env: { ...process.env, ...command.env },
            stdio: ["pipe", "pipe", "pipe"],
        });
        return new Tool(name, child);
    });
    const txids: string[] = [];
    const submit = async (from: algosdk.Account, to: string, amount: number, note?: Uint8Array) => {
        const params = await algod.getTransactionParams().do();
        // Notes past 1024 bytes pay extra, as in group-admin-localnet.ts.
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
        await algod.sendRawTransaction(txn.signTxn(from.sk)).do();
        const confirmed = await algosdk.waitForConfirmation(algod, txn.txID(), 40);
        txids.push(txn.txID());
        if (note) {
            const pending = await algod.pendingTransactionInformation(txn.txID()).do();
            const raw = pending.txn?.txn?.note;
            if (!(raw instanceof Uint8Array) || !Buffer.from(raw).equals(Buffer.from(note))) {
                throw new Error("chain note differs from the note sent");
            }
            return { rawId: txn.rawTxID(), round: Number(confirmed.confirmedRound), note: new Uint8Array(raw) };
        }
        return { rawId: txn.rawTxID(), round: Number(confirmed.confirmedRound), note: new Uint8Array() };
    };

    const record: {
        drafts: Array<Record<string, unknown>>;
        reductions: Record<string, unknown>;
    } = { drafts: [], reductions: {} };
    const checks: string[] = [];

    try {
        const funder = await dispenser();
        const owner = algosdk.generateAccount();
        const admin = algosdk.generateAccount();
        const plain = algosdk.generateAccount();
        const bot = algosdk.generateAccount();
        const stranger = algosdk.generateAccount();
        console.error("funding from the LocalNet dispenser");
        await submit(funder, owner.addr.toString(), 20_000_000);
        for (const account of [admin, plain, bot, stranger]) await submit(funder, account.addr.toString(), 2_000_000);

        const room = new Room("room", randomBytes(32), algosdk.generateAccount());
        const channel = new Room("channel", randomBytes(32), algosdk.generateAccount(), room);
        await submit(owner, room.mailboxAccount.addr.toString(), 100_000);
        await submit(owner, channel.mailboxAccount.addr.toString(), 100_000);

        const post = async (step: Step): Promise<Uint8Array> => {
            const target = step.room;
            const prior = target.events.length === 0 ? null : target.state();
            const basis = step.basis === undefined ? prior : step.basis;
            const parentRoom = target.parent
                ? (step.parentBasis === undefined ? target.parent.state() : step.parentBasis)
                : undefined;
            const input = {
                op: step.op,
                sender: pub(step.sender),
                subject: step.subject,
                name: step.name === undefined ? undefined : new TextEncoder().encode(step.name),
                policy: step.policy,
                groupId: target.groupId,
                mailbox: target.mailbox,
                parentRoom,
                bot: step.bot,
            };
            const note = draftAdmin(basis, input);
            if (!step.reject) {
                const body = {
                    op: "adminDraft",
                    basis_state: snap(basis),
                    parent_room: parentRoom ? snap(parentRoom) : null,
                    admin_op: step.op,
                    sender: hex(pub(step.sender)),
                    subject: hex(step.subject ?? new Uint8Array(32)),
                    name_utf8: step.name,
                    policy: step.policy,
                    group_id: hex(target.groupId),
                    mailbox: hex(target.mailbox),
                    bot: step.bot ?? null,
                };
                await Promise.all(tools.map(async (tool) => {
                    const reply = await tool.call(body);
                    requireOk(tool.name, reply, `adminDraft ${step.label}`);
                    if (reply.note !== hex(note)) throw new Error(`${tool.name} drafted different bytes for ${step.label}`);
                }));
                record.drafts.push({
                    name: step.label,
                    basis_state: snap(basis),
                    parent_room: parentRoom ? snap(parentRoom) : null,
                    op: step.op,
                    sender: hex(pub(step.sender)),
                    subject: hex(step.subject ?? new Uint8Array(32)),
                    name_utf8: step.name ?? null,
                    policy: step.policy ?? null,
                    group_id: hex(target.groupId),
                    mailbox: hex(target.mailbox),
                    bot: step.bot ?? null,
                    note: hex(note),
                    error_includes: null,
                });
            }
            const paid = await submit(step.sender, target.mailboxAccount.addr.toString(), 0, note);
            target.events.push({ note: paid.note, sender: pub(step.sender), txId: paid.rawId, round: paid.round, offset: 0 });
            const reduced = target.reduced();
            const rejected = reduced.rejected.find((item) => hex(item.txId) === hex(paid.rawId));
            if (step.reject) {
                if (!rejected) throw new Error(`${step.label} was accepted on chain`);
                if (rejected.reason !== step.reject) throw new Error(`${step.label} rejected with "${rejected.reason}"`);
                checks.push(`rejected on chain: ${step.label} -> ${rejected.reason}`);
            } else if (rejected) {
                throw new Error(`${step.label} rejected: ${rejected.reason}`);
            }
            return paid.rawId;
        };

        const preset: BotSettings = { mode: BOT_MODE.MENTIONS, replies: BOT_RATE_PRESET.replies, seconds: BOT_RATE_PRESET.seconds };
        const changed: BotSettings = { mode: BOT_MODE.COMMANDS, replies: 10, seconds: 30 };

        console.error("room with owner, admin and a plain member");
        await post({ room, sender: owner, op: ADMIN_OP.CREATE, name: "bots", policy: JOINING.INVITE, label: "create room" });
        await post({ room, sender: owner, op: ADMIN_OP.ADD_MEMBER, subject: pub(admin), label: "add admin-to-be" });
        await post({ room, sender: owner, op: ADMIN_OP.APPOINT_ADMIN, subject: pub(admin), label: "appoint admin" });
        await post({ room, sender: owner, op: ADMIN_OP.ADD_MEMBER, subject: pub(plain), label: "add plain member" });

        console.error("should-reject notes before the bot exists");
        const asAdmin = (state: RoomState, account: Uint8Array): RoomState => ({ ...state, admins: [...state.admins, account] });
        await post({
            room, sender: stranger, op: ADMIN_OP.ADD_BOT, subject: pub(stranger), bot: preset,
            basis: asAdmin(room.state(), pub(stranger)),
            reject: "Sender cannot add that bot", label: "self-marked bot",
        });
        const otherBot = algosdk.generateAccount();
        await post({
            room, sender: plain, op: ADMIN_OP.ADD_BOT, subject: pub(otherBot), bot: preset,
            basis: asAdmin(room.state(), pub(plain)),
            reject: "Sender cannot add that bot", label: "plain member adds a bot",
        });
        await post({
            room, sender: owner, op: ADMIN_OP.ADD_BOT, subject: pub(plain), bot: preset,
            basis: { ...room.state(), members: room.state().members.filter((item) => hex(item) !== hex(pub(plain))) },
            reject: "Sender cannot add that bot", label: "mark an existing member",
        });

        console.error("owner adds the bot with the suggested preset");
        const before = room.state();
        const addBotTx = await post({ room, sender: owner, op: ADMIN_OP.ADD_BOT, subject: pub(bot), bot: preset, label: "owner adds bot" });
        const after = room.state();
        const found = roomBot(after, pub(bot));
        if (!found || found.mode !== preset.mode || found.replies !== 5 || found.seconds !== 60) throw new Error("bot record missing");
        if (after.epoch !== before.epoch) throw new Error("adding a bot changed the epoch");
        if (!after.members.some((item) => hex(item) === hex(pub(bot)))) throw new Error("bot is not a member");
        if (after.pending.length !== 0) throw new Error("bot left a pending request");
        checks.push("bot joined at once: member, same epoch, nothing pending");

        console.error("hybrid session to the bot and the room key");
        const ownerKeys = deriveEncryptionKeys(seedOf(owner));
        const ownerKem = deriveMLKEMKeyPair(seedOf(owner));
        const botKeys = deriveEncryptionKeys(seedOf(bot));
        const botKem = deriveMLKEMKeyPair(seedOf(bot));
        const opened = initiatePQSession({
            sender: ownerKeys,
            senderEncapsKey: ownerKem.encapsKey,
            recipientPublicKey: botKeys.publicKey,
            recipientEncapsKey: botKem.encapsKey,
        });
        const handshake = await submit(owner, bot.addr.toString(), 0, opened.note);
        const botSession: PQSession = acceptPQSession(handshake.note, botKeys, botKem.encapsKey, botKem.decapsKey);
        const ownerSession = openPQSessionAsSender(handshake.note, ownerKeys, ownerKem.decapsKey);
        if (hex(botSession.sessionKey) !== hex(ownerSession.sessionKey)) throw new Error("bot did not derive the posted handshake");
        const roomKey = randomBytes(32);
        const nonce = randomBytes(12);
        const delivery = sealGroupKeyDelivery(ownerSession, after.epoch, room.groupId, room.mailbox, roomKey, addBotTx, nonce);
        const deliveredOnChain = await submit(owner, bot.addr.toString(), 0, delivery);
        const reducedNow = room.reduced();
        await Promise.all(tools.map(async (tool) => {
            const reduced = await tool.call({ op: "adminReduce", events: wireEvents(room.events) });
            requireOk(tool.name, reduced, "adminReduce");
            const allowed = await tool.call({
                op: "deliveryAuthorized",
                accepted: reduced.accepted,
                admin_tx_id: hex(addBotTx),
                sender: hex(pub(owner)),
                recipient: hex(pub(bot)),
                epoch: after.epoch,
            });
            requireOk(tool.name, allowed, "deliveryAuthorized");
            if (allowed.allowed !== true) throw new Error(`${tool.name} did not authorize the bot's key`);
            const other = await tool.call({
                op: "deliveryAuthorized",
                accepted: reduced.accepted,
                admin_tx_id: hex(addBotTx),
                sender: hex(pub(owner)),
                recipient: hex(pub(plain)),
                epoch: after.epoch,
            });
            if (other.allowed !== false) throw new Error(`${tool.name} let the add-bot record carry another member's key`);
            const open = await tool.call({
                op: "deliverOpen",
                note: hex(deliveredOnChain.note),
                session_key: hex(botSession.sessionKey),
                sender_x25519: hex(botSession.senderPublicKey),
                handshake_id: hex(botSession.handshakeId),
            });
            requireOk(tool.name, open, "deliverOpen");
            if (open.group_key !== hex(roomKey) || open.admin_tx_id !== hex(addBotTx)) {
                throw new Error(`${tool.name} opened a different key or record`);
            }
        }));
        if (!deliveryAuthorized(reducedNow.accepted, addBotTx, pub(owner), pub(bot), after.epoch)) {
            throw new Error("ts did not authorize the bot's key");
        }
        checks.push("bot opened the room key from its own session, citing the add-bot record, in every mesh language");

        console.error("bot posts in the room with the delivered key");
        if (!senderMayPost(after, pub(bot), after.epoch)) throw new Error("bot may not post");
        const text = "hello from the bot";
        const msgNonce = randomBytes(12);
        const message = sealGroupMessage(new TextEncoder().encode(text), roomKey, room.groupId, after.epoch, 0, pub(bot), msgNonce);
        await Promise.all(tools.map(async (tool) => {
            const reply = await tool.call({
                op: "groupWrite",
                groupKey: hex(roomKey),
                groupId: hex(room.groupId),
                epoch: after.epoch,
                counter: 0,
                senderAddress: hex(pub(bot)),
                text,
                nonce: hex(msgNonce),
            });
            requireOk(tool.name, reply, "groupWrite");
            if (reply.note !== hex(message)) throw new Error(`${tool.name} sealed different message bytes`);
        }));
        const posted = await submit(bot, room.mailboxAccount.addr.toString(), 0, message);
        await Promise.all(tools.map(async (tool) => {
            const reply = await tool.call({
                op: "groupRead",
                note: hex(posted.note),
                groupKey: hex(roomKey),
                senderAddress: hex(pub(bot)),
                text,
                seen: [],
            });
            requireOk(tool.name, reply, "groupRead");
            if (reply.text !== text) throw new Error(`${tool.name} read ${reply.text}`);
        }));
        checks.push("bot posted a room message on chain and every mesh language read it");

        console.error("should-reject notes against the bot");
        const withoutBots = (state: RoomState): RoomState => ({ ...state, bots: [] });
        await post({
            room, sender: owner, op: ADMIN_OP.APPOINT_ADMIN, subject: pub(bot),
            basis: withoutBots(room.state()), reject: "A bot cannot be an admin", label: "appoint the bot admin",
        });
        await post({
            room, sender: owner, op: ADMIN_OP.TRANSFER_OWNER, subject: pub(bot),
            basis: withoutBots(room.state()), reject: "A bot cannot own the room", label: "give the bot the room",
        });
        await post({
            room, sender: plain, op: ADMIN_OP.SET_BOT, subject: pub(bot), bot: changed,
            basis: asAdmin(room.state(), pub(plain)), reject: "Sender cannot change that bot", label: "plain member changes the bot",
        });

        console.error("admin changes the bot");
        await post({ room, sender: admin, op: ADMIN_OP.SET_BOT, subject: pub(bot), bot: changed, label: "admin changes bot" });
        const updated = roomBot(room.state(), pub(bot));
        if (!updated || updated.mode !== changed.mode || updated.replies !== 10 || updated.seconds !== 30) throw new Error("bot change missing");
        checks.push("admin changed the bot to commands, 10 per 30 seconds");

        console.error("channel");
        await post({ room: channel, sender: owner, op: ADMIN_OP.CREATE, name: "bots-channel", policy: JOINING.INVITE, label: "create channel" });
        await post({
            room: channel, sender: owner, op: ADMIN_OP.ADD_MEMBER, subject: pub(bot),
            parentBasis: withoutBots(room.state()), reject: "A bot joins a channel only when added as a bot", label: "plain add of the parent's bot",
        });
        await post({
            room: channel, sender: owner, op: ADMIN_OP.ADD_BOT, subject: pub(plain), bot: preset,
            parentBasis: { ...room.state(), bots: [{ account: pub(plain), ...preset }] },
            reject: "That account is not a bot in the parent room", label: "add-bot of a parent member who is not a bot",
        });
        const channelSettings: BotSettings = { mode: BOT_MODE.EVERY_MESSAGE, replies: 5, seconds: 60 };
        await post({ room: channel, sender: owner, op: ADMIN_OP.ADD_BOT, subject: pub(bot), bot: channelSettings, label: "owner adds bot to channel" });
        const inChannel = roomBot(channel.state(), pub(bot));
        if (!inChannel || inChannel.mode !== BOT_MODE.EVERY_MESSAGE) throw new Error("channel bot record missing");
        if (roomBot(room.state(), pub(bot))?.mode !== BOT_MODE.COMMANDS) throw new Error("channel add changed the parent room");
        checks.push("channel add is its own record with its own settings; the parent room is unchanged");

        console.error("every mesh language reduces the confirmed chain notes");
        for (const target of [room, channel]) {
            const reduced = target.reduced();
            const expected = canonical(snap(reduced.state));
            const reasons = JSON.stringify(reduced.rejected.map((item) => [hex(item.txId), item.reason]));
            const ops = JSON.stringify(reduced.accepted.map((item) => item.op));
            const body = {
                op: "adminReduce",
                events: wireEvents(target.events),
                parent_events: target.parent ? wireEvents(target.parent.events) : undefined,
            };
            await Promise.all(tools.map(async (tool) => {
                const reply = await tool.call(body);
                requireOk(tool.name, reply, `adminReduce ${target.label}`);
                if (canonical(reply.state) !== expected) {
                    throw new Error(`${tool.name} ${target.label} state differs: ${JSON.stringify(reply.state).slice(0, 400)}`);
                }
                const got = JSON.stringify((reply.rejected ?? []).map((item) => [item.tx_id, item.reason]));
                if (got !== reasons) throw new Error(`${tool.name} ${target.label} rejections differ: ${got}`);
                const gotOps = JSON.stringify((reply.accepted ?? []).map((item) => item.op));
                if (gotOps !== ops) throw new Error(`${tool.name} ${target.label} accepted ops differ: ${gotOps}`);
            }));
            record.reductions[target.label] = {
                parent_events: target.parent ? wireEvents(target.parent.events) : null,
                events: wireEvents(target.events),
                accepted: reduced.accepted.map((item) => ({ op: item.op })),
                rejected: reduced.rejected.map((item) => ({ tx_id: hex(item.txId), reason: item.reason })),
                state: snap(reduced.state),
            };
        }
        checks.push(`${MESH.join(", ")} agree on state, bot records, accepted ops and rejection reasons`);

        mkdirSync(EVIDENCE, { recursive: true });
        const recordPath = `${EVIDENCE}/chain-record.json`;
        writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
        let swift = "in the pqcross mesh";
        if (!SWIFT_IN_MESH) {
            console.error("swift replays the chain record");
            const run = spawnSync("swift", ["test", "--filter", "GroupAdminBotsTests"], {
                cwd: ROOT,
                env: { ...process.env, ALGOCHAT_BOT_LOCALNET_RECORD: recordPath },
                encoding: "utf8",
            });
            const out = `${run.stdout ?? ""}${run.stderr ?? ""}`;
            if (run.status !== 0 || !/localnet chain record/.test(out) || /skipped/i.test(out.split("\n").filter((line) => /localnet chain record/.test(line)).join("\n"))) {
                throw new Error(`swift replay failed (${run.status}):\n${out.slice(-3000)}`);
            }
            swift = "swift test replayed the confirmed chain record (pqcross needs macOS 26)";
            checks.push("swift drafted the same bytes and reduced the confirmed notes to the same state and reasons");
        }

        const evidence = {
            evidence_dir: EVIDENCE,
            genesis,
            mesh: MESH,
            swift,
            room: { events: room.events.length, rejected: room.reduced().rejected.length, state: snap(room.state()) },
            channel: { events: channel.events.length, rejected: channel.reduced().rejected.length, state: snap(channel.state()) },
            transactions: txids.length,
            checks,
        };
        writeFileSync(`${EVIDENCE}/localnet.json`, `${JSON.stringify(evidence, null, 2)}\n`);
        console.log(JSON.stringify({ ok: true, mesh: MESH, swift, transactions: txids.length, checks }, null, 2));
    } finally {
        for (const tool of tools) tool.stop();
    }
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exit(1);
});
