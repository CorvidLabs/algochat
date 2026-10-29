---
module: agent
version: 3
status: active
files:
  - src/algochat/agent/__init__.py
  - src/algochat/agent/account.py
  - src/algochat/agent/config.py
  - src/algochat/agent/core.py
  - src/algochat/agent/direct.py
  - src/algochat/agent/rooms.py

db_tables: []
depends_on: [algochat]
---

# Python AlgoChat Agent Core

## Purpose

Give any agent one shared Python core for a self-hosted AlgoChat bot (AGENT-1, AGENT-1.b, AGENT-1.d). The bot has its own Algorand account (the wallet half of AGENT-2; the bot's own Raven identity NFT is not built here), loaded from a 25-word mnemonic that lives in an environment variable or a local file on the bot host and is never committed (AGENT-4). The bot reads one-to-one messages to it and replies by itself, sending through the library's own payment path (AGENT-5). It joins the rooms and channels an owner or admin adds it to, reads and replies there, and stops when it is removed or leaves (AGENT-6, AGENT-7, AGENT-7.c, AGENT-7.d, AGENT-7.g). Later changes add reply policy, and the MCP, CLI and webhook adapters on top of `AgentCore`.

## Public API

`algochat.agent` exports:

| Export | Contract |
|---|---|
| `MNEMONIC_ENV` | `"ALGOCHAT_AGENT_MNEMONIC"`, the environment variable holding the bot's 25-word mnemonic. |
| `MNEMONIC_FILE_ENV` | `"ALGOCHAT_AGENT_MNEMONIC_FILE"`, the environment variable holding the path of a local mnemonic file. |
| `AgentConfigError` | `ValueError` subclass raised when the bot's key is missing, ambiguous, unsafe, or malformed. Its message never contains the mnemonic. |
| `read_mnemonic_file` | Opens the path (following symlinks), checks the opened descriptor with `fstat`, and reads only that descriptor. Refuses anything but a regular file of at most 4096 bytes with no group or other permission bits, owned by the effective user or root, without a `system.posix_acl_access` ACL. Nothing is read before the checks pass. Decodes UTF-8, strips surrounding whitespace, and rejects an empty file. |
| `load_agent_mnemonic` | Returns the mnemonic from an explicit `path`, else `ALGOCHAT_AGENT_MNEMONIC`, else the file named by `ALGOCHAT_AGENT_MNEMONIC_FILE`. Both variables set (non-empty after stripping whitespace) raises `AgentConfigError`, even when `path` is given; neither set and no `path` raises too. `environ` defaults to `os.environ`. |
| `mnemonic_to_seed` | Decodes a classic 25-word Algorand mnemonic (BIP-39 English words, 11-bit little-endian packing, SHA-512/256 checksum word) to the 32-byte Ed25519 seed, case- and whitespace-insensitive. Each word may be the full word or, like `py-algorand-sdk`, a unique prefix of 4 or more letters. |
| `address_from_public_key` | Encodes a 32-byte Ed25519 public key as a 58-character Algorand address with its 4-byte SHA-512/256 checksum. |
| `public_key_from_address` | In `algochat.agent.account`, the inverse: decodes a 58-character address to its 32-byte public key, checking the checksum (`ValueError` otherwise). |
| `AgentAccount` | Frozen dataclass whose only fields are the bot's own `address` and `ed25519_public_key`. `AgentAccount(address, ed25519_public_key, seed)` re-derives the public key and address from the 32-byte seed and raises `AgentConfigError` on any mismatch. The seed is a private non-field attribute read through the `seed` property, so `repr`, `str`, `dataclasses.asdict`, `vars` and equality never expose it; pickling raises `TypeError`. `from_mnemonic` and `from_seed` build it. |
| `AgentCore` | One bot: holds its `AgentAccount` and an `AlgoChat` client bound to that address and Ed25519 key. `create` and `from_environment` take operator-supplied algod and indexer clients; properties `account`, `address`, `chat`, `encryption_public_key` (32 raw bytes); `repr` shows only the address. |
| `DirectHandler` | Type of a `serve_direct` handler: `DirectMessage` to `str`, `None`, or an awaitable of either. |
| `DirectMessage` | Frozen dataclass: `txid`, `sender`, `text`, `confirmed_round`, and `reply_to` when the message is itself a reply. |
| `DirectReply` | Frozen dataclass: the `message`, the `reply_txid` or `None`, and an `error` type name or `None`. |
| `encode_reply` | Compact section 9.2 reply JSON with UTF-8 text. |
| `reply_preview` | The quoted original: up to 80 characters, else the first 77 and `...`. |
| `REPLY_PREVIEW_CHARS` | 80, the longest preview kept whole. |
| `Room` | Frozen dataclass of a room or channel the bot was added to: `group_id`, `mailbox` address, `name`, `epoch`, `status`, `parent_group_id` (`None` for a room), the bot's `bot` settings or `None`, and the reduced `state`. `is_channel`; `key` is `(group_id, mailbox)`. |
| `RoomMessage` | Frozen dataclass of one room message to the bot: `txid`, `group_id`, `mailbox`, `sender` address, `text`, `epoch`, `counter`, `confirmed_round`, `intra_round_offset`, `is_channel`; `room_key`. |
| `RoomReply` | Frozen dataclass: the `message`, the reply `txid` or `None`, and an `error` type name or `None`. |
| `RoomHandler` | Type of a `serve_rooms` handler: `RoomMessage` to `str`, `None`, or an awaitable of either. |
| `ROOM_ACTIVE` | `Room.status` `"active"`: a member with the key for the current epoch. |
| `ROOM_WAITING` | `Room.status` `"waiting"`: a member, but the key for the current epoch has not arrived. |
| `ROOM_REMOVED` | `Room.status` `"removed"`: no longer a member, or the parent room's status is removed. |
| `ROOM_LEFT` | `Room.status` `"left"`: the bot posted its leave notice, here or in the parent room. |
| `LEAVE_NOTICE` | The plain text the bot posts when it leaves: `"I left this room. An owner or admin can remove me to rotate the room key."` |

`AgentCore` methods for one-to-one messages (AGENT-5):

- `publish_key`: Publishes the bot's X25519 key signed by its account (a self-payment). Skips and returns `None` when the same verified key is already on chain, unless `force`.
- `send_direct`: Sends a one-to-one message to an address that has a usable published key. Returns the transaction id.
- `read_direct`: Returns one-to-one messages to the bot it has not answered, oldest first, each once per core. Reads every indexer page after its cursor.
- `reply`: Answers a `DirectMessage` with a section 9.2 reply (`{"text","replyTo":{"txid","preview"}}`) and marks it answered.
- `serve_direct`: Reads new messages and replies with a sync or async handler's text. `None` or empty sends nothing. A failing handler or send is reported by error type and not retried. Returns one `DirectReply` per message.

`AgentCore` methods for rooms and channels (AGENT-6, AGENT-7):

- `publish_pq_key`: Publishes the bot's ML-KEM-768 key as a signed `ACPQ` announcement (a self-payment), so an owner's client can open a hybrid session to it. Skips and returns `None` when the same key is already on chain, unless `force`.
- `sync_rooms`: Reads the bot's inbox (hybrid handshakes to it and section 5.8 key deliveries) and every known room's chain, and returns the rooms and channels it was added to. The bot joins as soon as an owner or admin adds it (op 13 or a member add) and delivers the key: it never sends a join request or an accept. Rooms are keyed by `(group_id, mailbox)`.
- `read_rooms`: Returns room messages to the bot it has not answered, in chain order (round, intra-round offset, transaction id), each once per core.
- `send_room`: Posts plain UTF-8 text to an active room or channel (Raven's room text format). Returns the transaction id.
- `reply_room`: Answers a `RoomMessage` with plain text in its room and marks it answered. (A room reply format is left to algochat#46.)
- `serve_rooms`: Reads new room messages and replies with a sync or async handler's text, like `serve_direct`. Returns one `RoomReply` per message.
- `leave_room`: Leaves a room and its channels: posts `LEAVE_NOTICE` in each active one and stops reading and posting there. Returns the notice transaction ids.

Module internals of `algochat.agent.rooms`, used by `AgentCore` and not exported from `algochat.agent`:

| Name | Contract |
|---|---|
| `GROUP_MESSAGE_PROTOCOL` | `0x07`, the section 5.8 room message type. |
| `txid_bytes` | The 32 raw bytes of a base32 transaction id. |
| `is_admin_note` | True for a section 5.8 administration record (`0x02 0x03`). |
| `is_room_message` | True for a section 5.8 room message (`0x02 0x07`). |
| `KeyDelivery` | A key delivery the bot opened, with the transaction that carried it. |
| `RoomTrack` | Per-room state: records and messages read from the mailbox, keys by epoch, the reduced chain, the parent room, replay counters and what was answered. |

`src/algochat/agent/wordlist.txt` is the bundled 2048-word BIP-39 English list (SHA-256 `2f5eed53a4727b4bf8880d8f3f199efc90e58503646d9ff8eff3a2ed3b24dbda`).

## Invariants

1. A mnemonic decodes to the same seed and address as `py-algorand-sdk`, including its unique 4-letter-or-longer word prefixes. Wrong word count, unknown words or shorter prefixes, non-zero padding, or a bad checksum word raise `AgentConfigError`.
2. The mnemonic is read only from the explicit path, the environment, or a local file. Nothing in this module writes it, logs it, or sends it. No `AgentConfigError` message, argument or chained exception contains the phrase, any run of its words, the file bytes, or the seed, and no frame on its traceback holds them in a local.
3. A mnemonic file is refused unless it is owner-only (no group or other permission bit), owned by the effective user or root, and has no POSIX access ACL (design choice, like `ssh` private keys). Symlinks are followed and the target is checked. The checks use `fstat` on the opened descriptor, and only that descriptor is read.
4. `AgentCore` only accepts an `AlgoChat` client whose address and Ed25519 public key are the bot's own. An `AgentAccount`'s address and public key always match its seed.
5. `AgentCore` has no default endpoint. It reaches the network only through the algod and indexer clients the operator supplies.
6. The repository `.gitignore` ignores `*.mnemonic` and `.algochat-agent/`.
7. Only Ed25519 accounts are supported in this version.
8. A message the bot answered on chain is never answered again, also after a restart: a reply the bot sent names the message it answers.
9. Notes the bot cannot open (not AlgoChat, no published key, wrong key) are skipped, and so are its own notes, key publishes, and empty text.
10. The bot refuses to message itself and only sends to a key that `AlgoChat` accepts (verified unless the operator allows unverified keys).
11. A delivered room key is used only when the room's accepted chain authorizes it (section 5.8 `delivery_authorized`): the cited record is accepted, its sender may deliver, and the bot is its subject or in its members, at that epoch. The hybrid session that opens the delivery must come from a handshake sent to the bot by the same account that sent the delivery.
12. A room message is opened only with the key for its epoch, only from an account that may post at the message's chain position, and only once per sender, epoch and counter. Copied notes and notes from non-members are skipped.
13. A channel key is used only once the bot is in the parent room. Removal from, or leaving, the parent room puts the bot out of its channels at once.
14. Room messages at or before the later of the bot's join and its own last post in that room are not answered, so a restarted bot never answers again and never answers history from before it joined.
15. The bot's message counter is one more than the highest counter seen in the epoch from anyone, like Raven.
16. The protocol has no op for a member to leave by themselves, so leaving is the on-chain `LEAVE_NOTICE`; a restarted bot reads it and stays out. Only an owner or admin can remove the bot and rotate the key.
17. A removed or departed bot never posts in that room: `send_room` raises `PermissionError`.

## Behavioral Examples

```text
Given ALGOCHAT_AGENT_MNEMONIC holds a valid 25-word mnemonic
When AgentCore.from_environment runs with mock algod and indexer clients
Then core.address is that mnemonic's Algorand address and core.chat is bound to it

Given ALGOCHAT_AGENT_MNEMONIC_FILE names a file with mode 644
When the mnemonic is loaded
Then AgentConfigError says to chmod 600 and does not contain any mnemonic word

Given a person sent the bot "hello bot"
When serve_direct runs with a handler that returns "hello human"
Then the person receives "hello human" with replyTo naming "hello bot"
And a restarted bot does not answer "hello bot" again

Given an owner adds the bot to a room with op 13 and delivers the room key
When sync_rooms runs
Then the room is active, and the bot sent no join request and no accept

Given the bot is active in a room and a channel of that room
When the owner removes the bot from the room
Then sync_rooms reports both as removed and serve_rooms answers nothing there

Given the bot calls leave_room on a room
Then it posts LEAVE_NOTICE in the room and its channels
And a restarted bot reports them as left and reads nothing there
```

## Error Cases

| Error | When | Behavior |
|---|---|---|
| No source | Neither variable is set and no path is given | Raise `AgentConfigError` naming both variables |
| Ambiguous source | Both variables are set, with or without `path` | Raise `AgentConfigError` |
| Unsafe file | Missing, unreadable, not a regular file, group/other bits set, another owner, a POSIX ACL, or over 4096 bytes | Raise `AgentConfigError` before reading, without echoing the contents |
| Bad file contents | Not valid UTF-8, or empty | Raise `AgentConfigError` naming only the path |
| Bad mnemonic | Wrong count, unknown word, bad padding, or checksum mismatch | Raise `AgentConfigError` without echoing the phrase |
| Mismatched account | `AgentAccount` fields do not come from its seed | Raise `AgentConfigError` |
| Wrong client | `AgentCore` gets an `AlgoChat` client for another address | Raise `ValueError` |
| No clients | A core built without `create` reads or sends | Raise `RuntimeError` naming `AgentCore.create` |
| No key | `send_direct` or `reply` to an address without a published key | Raise `LookupError` |
| Self | `send_direct` to the bot's own address | Raise `ValueError` |
| Handler failure | A `serve_direct` handler or send raises | Record the error type in `DirectReply.error`, mark answered, go on |
| Unknown room | `send_room`, `reply_room` or `leave_room` for a room the bot was never added to | Raise `LookupError` |
| Not active | `send_room` or `reply_room` in a room the bot was removed from, left, or has no current key for | Raise `PermissionError` |
| Leave text | `send_room` with empty text or `LEAVE_NOTICE` | Raise `ValueError` (use `leave_room`) |
| Unauthorized key | A key delivery whose sender, cited record, epoch or session does not check out | Ignore it; the room stays unjoined |
| Room handler failure | A `serve_rooms` handler or send raises | Record the error type in `RoomReply.error`, mark answered, go on |

## Dependencies

- Python 3.10 or newer
- `cryptography` for Ed25519 public key derivation
- The `algochat` module's `group`, `group_admin` and `pq` functions for section 5.8 rooms and hybrid sessions
- The `algochat` module's `AlgoChat`, `AlgoChatConfig`, `AlgodClient`, `IndexerClient`, `EncryptionKeyStorage`, `MessageCache`, `send_payment`, and `sign_encryption_key`

## Change Log

| Version | Date | Changes |
|---|---|---|
| 1 | 2026-10-29 | Agent core: the bot's own account from a 25-word mnemonic in an env var or local file, and `AgentCore` (algochat#43). Review fixes: fd-based owner/ACL file checks, both-variables check before `path`, seed kept out of fields and pickles with a seed/field consistency check, no secrets in traceback locals, algosdk word prefixes. |
| 2 | 2026-10-29 | One-to-one messages: the bot publishes its key, reads messages to it and replies by itself (algochat#44, AGENT-5). |
| 3 | 2026-10-29 | Rooms and channels: the bot joins when added, reads and replies, and stops when removed or when it leaves (algochat#45, AGENT-6, AGENT-7). |
