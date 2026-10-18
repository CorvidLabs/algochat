/**
 * LocalNet administered rooms.
 *
 * One 5-member invite-only room and one 100-member ask-to-join room.
 * One account is in both. Each room gets one ordinary 0x07 payment.
 * The team room then removes one member. Setup, membership, the ordinary
 * message, and the removal are counted separately.
 *
 * Tools must already be built:
 *   go build -o /tmp/algochat-pqcross-go ./cmd/pqcross
 *   cargo build --bin pqcross
 *   ./gradlew pqioClasspath
 *   swift build --product pqcross
 *
 * Evidence is written outside the repository.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import algosdk from "algosdk";
import { deriveEncryptionKeys } from "../src/crypto/keys.js";
import { deriveMLKEMKeyPair } from "../src/pq/kem.js";
import {
    ADMIN_OP,
    JOINING,
    deliveryAuthorized,
    draftAdmin,
    reduceAdmin,
    sealGroupKeyDelivery,
    senderMayPost,
    type AdminEvent,
    type RoomState,
} from "../src/pq/group-admin.js";
import { openGroupMessage, sealGroupMessage } from "../src/pq/group.js";
import { initiatePQSession } from "../src/pq/session.js";
import type { PQSession } from "../src/pq/types.js";

const TOKEN = "a".repeat(64);
const ROOT = new URL("../../", import.meta.url).pathname;
const EVIDENCE = process.env.GROUP_ADMIN_EVIDENCE ?? "/tmp/algochat-group-admin-evidence";
const LANGS = ["ts", "go", "rs", "py", "kt", "swift"] as const;
type Lang = (typeof LANGS)[number];

interface Reply {
    id: number;
    ok: boolean;
    error?: string;
    note?: string;
    state?: Record<string, unknown> | null;
    allowed?: boolean;
    text?: string;
}

interface Receipt {
    phase: "faucet" | "channel" | "setup" | "membership" | "message" | "removal";
    kind: string;
    txid: string;
    round: number;
    fee: number;
    amount: number;
    noteBytes: number;
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
        const candidates = [
            `${ROOT}py/.venv/bin/python`,
            "/Users/leif/Development/_CorvidLabs/algochat/py/.venv/bin/python",
        ];
        return {
            cmd: candidates.find((item) => existsSync(item)) ?? "python3",
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

function hex(bytes: Uint8Array): string {
    return Buffer.from(bytes).toString("hex");
}

function pub(account: algosdk.Account): Uint8Array {
    return new Uint8Array(algosdk.decodeAddress(account.addr.toString()).publicKey);
}

function seedOf(account: algosdk.Account): Uint8Array {
    if (account.sk.length === 64) return account.sk.slice(0, 32);
    if (account.sk.length === 32) return account.sk;
    throw new Error(`unexpected key length ${account.sk.length}`);
}

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
    };
}

function requireOk(lang: string, reply: Reply, what: string): void {
    if (!reply.ok) throw new Error(`${lang} ${what}: ${reply.error ?? "failed"}`);
}

class Room {
    readonly events: AdminEvent[] = [];
    readonly receipts: Receipt[] = [];

    constructor(
        readonly groupId: Uint8Array,
        readonly mailboxAccount: algosdk.Account,
    ) {}

    get mailbox(): Uint8Array {
        return pub(this.mailboxAccount);
    }

    state(): RoomState {
        const reduced = reduceAdmin(this.events);
        if (reduced.rejected.length > 0 || !reduced.state) {
            throw new Error(reduced.rejected.map((item) => item.reason).join("; ") || "room missing");
        }
        return reduced.state;
    }

    draft(input: {
        op: number;
        sender: Uint8Array;
        subject?: Uint8Array;
        name?: Uint8Array;
        policy?: number;
    }): Uint8Array {
        const prior = this.events.length === 0 ? null : this.state();
        return draftAdmin(prior, {
            ...input,
            groupId: this.groupId,
            mailbox: this.mailbox,
        });
    }
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

async function submit(
    algod: algosdk.Algodv2,
    from: algosdk.Account,
    to: string,
    amount: number,
    note: Uint8Array | undefined,
    phase: Receipt["phase"],
    kind: string,
): Promise<{ receipt: Receipt; rawId: Uint8Array }> {
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
    const rawId = txn.rawTxID();
    const txid = txn.txID();
    const fee = Number(txn.fee ?? minFee + extra);
    await algod.sendRawTransaction(txn.signTxn(from.sk)).do();
    const confirmed = await algosdk.waitForConfirmation(algod, txid, 40);
    if (note) {
        const pending = await algod.pendingTransactionInformation(txid).do();
        const raw = pending.txn?.txn?.note ?? pending.txn?.note;
        let confirmedNote: Uint8Array | null = null;
        if (raw instanceof Uint8Array) confirmedNote = raw;
        else if (typeof raw === "string") confirmedNote = Buffer.from(raw, "base64");
        if (!confirmedNote || !Buffer.from(confirmedNote).equals(Buffer.from(note))) {
            throw new Error(`${kind} chain note differs`);
        }
    }
    return {
        rawId,
        receipt: {
            phase,
            kind,
            txid,
            round: Number(confirmed.confirmedRound ?? confirmed["confirmed-round"]),
            fee,
            amount,
            noteBytes: note?.length ?? 0,
        },
    };
}

async function agreeDraft(
    tools: Tool[],
    prior: RoomState | null,
    note: Uint8Array,
    input: { op: number; sender: Uint8Array; subject?: Uint8Array; name?: string; policy?: number; groupId: Uint8Array; mailbox: Uint8Array },
): Promise<void> {
    const body = {
        op: "adminDraft",
        basis_state: snap(prior),
        admin_op: input.op,
        sender: hex(input.sender),
        subject: hex(input.subject ?? new Uint8Array(32)),
        name_utf8: input.name,
        policy: input.policy,
        group_id: hex(input.groupId),
        mailbox: hex(input.mailbox),
    };
    const expected = hex(note);
    await Promise.all(tools.map(async (tool) => {
        const reply = await tool.call(body);
        requireOk(tool.name, reply, `adminDraft ${input.op}`);
        if (reply.note !== expected) throw new Error(`${tool.name} administration bytes differ`);
    }));
}

async function agreeDelivery(tools: Tool[], session: PQSession, fields: {
    epoch: number;
    groupId: Uint8Array;
    mailbox: Uint8Array;
    groupKey: Uint8Array;
    adminTxId: Uint8Array;
    nonce: Uint8Array;
}, expected: Uint8Array): Promise<void> {
    const body = {
        op: "deliverSeal",
        session_key: hex(session.sessionKey),
        sender_x25519: hex(session.senderPublicKey),
        handshake_id: hex(session.handshakeId),
        epoch: fields.epoch,
        group_id: hex(fields.groupId),
        mailbox: hex(fields.mailbox),
        group_key: hex(fields.groupKey),
        admin_tx_id: hex(fields.adminTxId),
        nonce: hex(fields.nonce),
    };
    const want = hex(expected);
    await Promise.all(tools.map(async (tool) => {
        const reply = await tool.call(body);
        requireOk(tool.name, reply, "deliverSeal");
        if (reply.note !== want) throw new Error(`${tool.name} delivery bytes differ`);
    }));
}

function tally(receipts: Receipt[], phase: Receipt["phase"]) {
    const rows = receipts.filter((item) => item.phase === phase);
    return {
        transactions: rows.length,
        fee: rows.reduce((sum, item) => sum + item.fee, 0),
        amount: rows.reduce((sum, item) => sum + item.amount, 0),
        rounds: rows.map((item) => item.round),
        kinds: rows.reduce<Record<string, number>>((counts, item) => {
            counts[item.kind] = (counts[item.kind] ?? 0) + 1;
            return counts;
        }, {}),
    };
}

async function handshake(owner: algosdk.Account, member: algosdk.Account): Promise<{ note: Uint8Array; session: PQSession }> {
    const sender = deriveEncryptionKeys(seedOf(owner));
    const senderKem = deriveMLKEMKeyPair(seedOf(owner));
    const recipient = deriveEncryptionKeys(seedOf(member));
    const recipientKem = deriveMLKEMKeyPair(seedOf(member));
    return initiatePQSession({
        sender,
        senderEncapsKey: senderKem.encapsKey,
        recipientPublicKey: recipient.publicKey,
        recipientEncapsKey: recipientKem.encapsKey,
    });
}

async function main(): Promise<void> {
    const algod = new algosdk.Algodv2(TOKEN, "http://127.0.0.1", 4001);
    await algod.status().do();
    const tools = LANGS.map((name) => {
        const command = toolCommand(name);
        const child = spawn(command.cmd, command.args, {
            cwd: command.cwd,
            env: { ...process.env, ...command.env },
            stdio: ["pipe", "pipe", "pipe"],
        });
        return new Tool(name, child);
    });
    try {
        const funder = await dispenser();
        const owner = algosdk.generateAccount();
        const friend = algosdk.generateAccount();
        const teamOnly = [algosdk.generateAccount(), algosdk.generateAccount(), algosdk.generateAccount()];
        const generalOnly = Array.from({ length: 98 }, () => algosdk.generateAccount());
        const teamInvite = [friend, ...teamOnly];
        const generalJoiners = [friend, ...generalOnly];
        const sessions = new Map<string, PQSession>();
        const receipts: Receipt[] = [];

        const fund = async (to: string, amount: number) => {
            const paid = await submit(algod, funder, to, amount, undefined, "faucet", "dispenser");
            receipts.push(paid.receipt);
        };
        console.error("funding accounts");
        await fund(owner.addr.toString(), 50_000_000);
        for (const joiner of generalJoiners) await fund(joiner.addr.toString(), 500_000);

        const team = new Room(randomBytes(32), algosdk.generateAccount());
        const general = new Room(randomBytes(32), algosdk.generateAccount());
        const teamKey = randomBytes(32);
        const generalKey = randomBytes(32);

        console.error("opening hybrid sessions");
        for (const member of [...teamInvite, ...generalOnly]) {
            const opened = await handshake(owner, member);
            sessions.set(member.addr.toString(), opened.session);
            const paid = await submit(algod, owner, member.addr.toString(), 0, opened.note, "channel", "handshake");
            receipts.push(paid.receipt);
        }

        const postAdmin = async (
            room: Room,
            sender: algosdk.Account,
            phase: Receipt["phase"],
            kind: string,
            input: { op: number; subject?: Uint8Array; name?: string; policy?: number },
            check: boolean,
        ) => {
            const prior = room.events.length === 0 ? null : room.state();
            const note = room.draft({
                op: input.op,
                sender: pub(sender),
                subject: input.subject,
                name: input.name === undefined ? undefined : new TextEncoder().encode(input.name),
                policy: input.policy,
            });
            if (check) {
                await agreeDraft(tools, prior, note, {
                    op: input.op,
                    sender: pub(sender),
                    subject: input.subject,
                    name: input.name,
                    policy: input.policy,
                    groupId: room.groupId,
                    mailbox: room.mailbox,
                });
            }
            const paid = await submit(algod, sender, room.mailboxAccount.addr.toString(), 0, note, phase, kind);
            receipts.push(paid.receipt);
            room.events.push({
                note,
                sender: pub(sender),
                txId: paid.rawId,
                round: paid.receipt.round,
                offset: 0,
            });
            room.receipts.push(paid.receipt);
            return paid.rawId;
        };

        const deliver = async (
            room: Room,
            member: algosdk.Account,
            epoch: number,
            groupKey: Uint8Array,
            adminTxId: Uint8Array,
            phase: Receipt["phase"],
            check: boolean,
        ) => {
            const session = sessions.get(member.addr.toString());
            if (!session) throw new Error("missing session");
            const nonce = randomBytes(12);
            const note = sealGroupKeyDelivery(session, epoch, room.groupId, room.mailbox, groupKey, adminTxId, nonce);
            if (check) {
                await agreeDelivery(tools, session, {
                    epoch,
                    groupId: room.groupId,
                    mailbox: room.mailbox,
                    groupKey,
                    adminTxId,
                    nonce,
                }, note);
            }
            const paid = await submit(algod, owner, member.addr.toString(), 0, note, phase, "deliver");
            receipts.push(paid.receipt);
        };

        console.error("team room");
        const teamFund = await submit(algod, owner, team.mailboxAccount.addr.toString(), 100_000, undefined, "setup", "fund-mailbox");
        receipts.push(teamFund.receipt);
        await postAdmin(team, owner, "setup", "create", { op: ADMIN_OP.CREATE, name: "team", policy: JOINING.INVITE }, true);
        for (const [index, member] of teamInvite.entries()) {
            const adminTxId = await postAdmin(team, owner, "membership", "add", {
                op: ADMIN_OP.ADD_MEMBER,
                subject: pub(member),
            }, index === 0);
            await deliver(team, member, 1, teamKey, adminTxId, "membership", index === 0);
        }
        if (team.state().members.length !== 5 || team.state().epoch !== 1) throw new Error("team roster");

        console.error("general room");
        const generalFund = await submit(algod, owner, general.mailboxAccount.addr.toString(), 100_000, undefined, "setup", "fund-mailbox");
        receipts.push(generalFund.receipt);
        await postAdmin(general, owner, "setup", "create", { op: ADMIN_OP.CREATE, name: "general", policy: JOINING.ASK }, true);
        const requestNotes = generalJoiners.map((joiner) => ({
            joiner,
            note: general.draft({ op: ADMIN_OP.REQUEST_JOIN, sender: pub(joiner), subject: pub(joiner) }),
        }));
        await agreeDraft(tools, general.state(), requestNotes[0]!.note, {
            op: ADMIN_OP.REQUEST_JOIN,
            sender: pub(generalJoiners[0]!),
            subject: pub(generalJoiners[0]!),
            groupId: general.groupId,
            mailbox: general.mailbox,
        });
        console.error("submitting 99 join requests");
        for (const item of requestNotes) {
            const paid = await submit(algod, item.joiner, general.mailboxAccount.addr.toString(), 0, item.note, "membership", "request");
            receipts.push(paid.receipt);
            general.events.push({
                note: item.note,
                sender: pub(item.joiner),
                txId: paid.rawId,
                round: paid.receipt.round,
                offset: 0,
            });
        }
        if (general.state().pending.length !== 99) throw new Error(`pending ${general.state().pending.length}`);
        console.error("accepting 99 join requests");
        for (const [index, joiner] of generalJoiners.entries()) {
            const adminTxId = await postAdmin(general, owner, "membership", "accept", {
                op: ADMIN_OP.ACCEPT_JOIN,
                subject: pub(joiner),
            }, index === 0 || index === generalJoiners.length - 1);
            await deliver(general, joiner, 1, generalKey, adminTxId, "membership", index === 0);
            if ((index + 1) % 10 === 0) console.error(`accepted ${index + 1}`);
        }
        if (general.state().members.length !== 100 || general.state().epoch !== 1) {
            throw new Error(`general roster ${general.state().members.length}`);
        }

        console.error("ordinary messages");
        const postMessage = async (room: Room, key: Uint8Array, text: string) => {
            const nonce = randomBytes(12);
            const note = sealGroupMessage(new TextEncoder().encode(text), key, room.groupId, 1, 0, pub(owner), nonce);
            const body = {
                op: "groupWrite",
                groupKey: hex(key),
                groupId: hex(room.groupId),
                epoch: 1,
                counter: 0,
                senderAddress: hex(pub(owner)),
                text,
                nonce: hex(nonce),
            };
            const notes = await Promise.all(tools.map(async (tool) => {
                const reply = await tool.call(body);
                requireOk(tool.name, reply, "groupWrite");
                return reply.note;
            }));
            if (notes.some((item) => item !== hex(note))) throw new Error("message bytes differ");
            const paid = await submit(algod, owner, room.mailboxAccount.addr.toString(), 0, note, "message", "message");
            receipts.push(paid.receipt);
            await Promise.all(tools.map(async (tool) => {
                const reply = await tool.call({
                    op: "groupRead",
                    note: hex(note),
                    groupKey: hex(key),
                    senderAddress: hex(pub(owner)),
                    text,
                    seen: [],
                });
                requireOk(tool.name, reply, "groupRead");
                if (reply.text !== text) throw new Error(`${tool.name} read ${reply.text}`);
            }));
            return paid.receipt;
        };
        const teamMessage = await postMessage(team, teamKey, "team line");
        const generalMessage = await postMessage(general, generalKey, "general line");

        console.error("removal");
        const removed = teamOnly[2]!;
        const adminTxId = await postAdmin(team, owner, "removal", "remove", {
            op: ADMIN_OP.REMOVE_MEMBER,
            subject: pub(removed),
        }, true);
        const teamKeyEpoch2 = randomBytes(32);
        for (const [index, member] of [owner, friend, teamOnly[0]!, teamOnly[1]!].entries()) {
            if (member === owner) continue;
            await deliver(team, member, 2, teamKeyEpoch2, adminTxId, "removal", index === 1);
        }
        const ownerDelivery = sealGroupKeyDelivery(
            sessions.get(friend.addr.toString())!,
            2,
            team.groupId,
            team.mailbox,
            teamKeyEpoch2,
            adminTxId,
            randomBytes(12),
        );
        if (ownerDelivery[1] !== 0x06) throw new Error("delivery protocol");
        const reducedTeam = reduceAdmin(team.events);
        if (deliveryAuthorized(reducedTeam.accepted, adminTxId, pub(owner), pub(removed), 2)) {
            throw new Error("removed member was authorized for the new key");
        }
        if (!senderMayPost(team.state(), pub(owner), 2) || senderMayPost(team.state(), pub(removed), 2)) {
            throw new Error("posting rule after removal");
        }
        const oldNote = sealGroupMessage(new TextEncoder().encode("team line"), teamKey, team.groupId, 1, 0, pub(owner), randomBytes(12));
        const oldOpened = openGroupMessage(oldNote, teamKey, pub(owner), []);
        if (new TextDecoder().decode(oldOpened.plaintext) !== "team line") throw new Error("old message");
        const fresh = sealGroupMessage(new TextEncoder().encode("after"), teamKeyEpoch2, team.groupId, 2, 0, pub(owner), randomBytes(12));
        let oldKeyFailed = false;
        try {
            openGroupMessage(fresh, teamKey, pub(owner), []);
        } catch {
            oldKeyFailed = true;
        }
        if (!oldKeyFailed) throw new Error("old key opened the new epoch");

        console.error("comparing reducers");
        for (const room of [team, general]) {
            const events = room.events.map((item) => ({
                note: hex(item.note),
                sender: hex(item.sender),
                tx_id: hex(item.txId),
                round: item.round,
                offset: item.offset,
            }));
            const expected = snap(room.state());
            await Promise.all(tools.map(async (tool) => {
                const reply = await tool.call({ op: "adminReduce", events });
                requireOk(tool.name, reply, "adminReduce");
                const actual = reply.state;
                const keys = ["group_id", "mailbox", "owner", "admins", "members", "pending", "policy", "name_hex", "epoch", "head_tx_id"] as const;
                const mismatched = keys.filter((key) => JSON.stringify(actual?.[key]) !== JSON.stringify(expected?.[key]));
                if (mismatched.length > 0) {
                    const detail = mismatched.map((key) => `${key} expected ${JSON.stringify(expected?.[key]).slice(0, 80)} got ${JSON.stringify(actual?.[key]).slice(0, 80)}`).join("; ");
                    throw new Error(`${tool.name} room state differs: ${detail}`);
                }
            }));
        }

        const shared = hex(pub(friend));
        if (!team.state().members.some((item) => hex(item) === shared)) throw new Error("friend missing from team");
        if (!general.state().members.some((item) => hex(item) === shared)) throw new Error("friend missing from general");
        const evidence = {
            evidence_dir: EVIDENCE,
            historical_rounds_not_used: "46313-46386",
            shared_member: friend.addr.toString(),
            team: {
                members_before_removal: 5,
                members_after_removal: team.state().members.length,
                policy: team.state().policy,
                epoch_after_removal: team.state().epoch,
                message: teamMessage,
            },
            general: {
                members: general.state().members.length,
                policy: general.state().policy,
                epoch: general.state().epoch,
                message: generalMessage,
            },
            costs: {
                faucet: tally(receipts, "faucet"),
                channel: tally(receipts, "channel"),
                setup: tally(receipts, "setup"),
                membership: tally(receipts, "membership"),
                message: tally(receipts, "message"),
                removal: tally(receipts, "removal"),
            },
            removal_note: "The owner generates the rotated key and does not send it to themselves. On-chain deliveries go to the other remaining members. The removed member gets none.",
            ordinary_message_transactions: {
                team: 1,
                general: 1,
            },
        };
        mkdirSync(EVIDENCE, { recursive: true });
        writeFileSync(`${EVIDENCE}/localnet.json`, `${JSON.stringify(evidence, null, 2)}\n`);
        console.log(JSON.stringify(evidence, null, 2));
    } finally {
        for (const tool of tools) tool.stop();
    }
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exit(1);
});
