---
module: agent
version: 4
status: active
files:
  - src/algochat/agent/__init__.py
  - src/algochat/agent/account.py
  - src/algochat/agent/config.py
  - src/algochat/agent/core.py
  - src/algochat/agent/direct.py
  - src/algochat/agent/policy.py
  - src/algochat/agent/rooms.py

db_tables: []
depends_on: [algochat]
---

# Python AlgoChat Agent Core

## Purpose

Give any agent one shared Python core for a self-hosted AlgoChat bot (AGENT-1, AGENT-1.b, AGENT-1.d). The bot has its own Algorand account (the wallet half of AGENT-2; the bot's own Raven identity NFT is not built here), loaded from a 25-word mnemonic that lives in an environment variable or a local file on the bot host and is never committed (AGENT-4). The bot reads one-to-one messages to it and replies by itself, sending through the library's own payment path (AGENT-5). It joins the rooms and channels an owner or admin adds it to, reads and replies there, and stops when it is removed or leaves (AGENT-6, AGENT-7, AGENT-7.c, AGENT-7.d, AGENT-7.g). In each room it replies only in the mode the room's record holds, within the rate limit there, never to another bot, and it declares its own slash commands (AGENT-8, AGENT-8.b, AGENT-8.c, AGENT-8.d, AGENT-8.e, AGENT-8.f). Later changes add the MCP, CLI and webhook adapters on top of `AgentCore`.

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
| `AgentCore` | One bot: holds its `AgentAccount` and an `AlgoChat` client bound to that address and Ed25519 key. `create` and `from_environment` take operator-supplied algod and indexer clients; properties `account`, `address`, `chat`, `encryption_public_key` (32 raw bytes); `repr` shows only the address. Keyword-only `name` (what members write after `@`, 1 to 64 letters, digits, `_`, `.` or `-`, starting with a letter or digit), `commands` (its `BotCommand` list) and `clock` (seconds, default `time.time`, for the rate limit); properties `name`, `commands` (with `/help`, sorted) and `command_list`. |
| `DirectHandler` | Type of a `serve_direct` handler: `DirectMessage` to `str`, `None`, or an awaitable of either. |
| `DirectMessage` | Frozen dataclass: `txid`, `sender`, `text`, `confirmed_round`, and `reply_to` when the message is itself a reply. |
| `DirectReply` | Frozen dataclass: the `message`, the `reply_txid` or `None`, an `error` type name or `None`, and `skipped`: `SKIP_FROM_BOT` when the sender is a bot in one of the bot's rooms, else `None`. |
| `encode_reply` | Compact section 9.2 reply JSON with UTF-8 text. |
| `reply_preview` | The quoted original: up to 80 characters, else the first 77 and `...`. |
| `REPLY_PREVIEW_CHARS` | 80, the longest preview kept whole. |
| `Room` | Frozen dataclass of a room or channel the bot was added to: `group_id`, `mailbox` address, `name`, `epoch`, `status`, `parent_group_id` (`None` for a room), the bot's `bot` settings or `None`, and the reduced `state`. `is_channel`; `key` is `(group_id, mailbox)`. |
| `RoomMessage` | Frozen dataclass of one room message to the bot: `txid`, `group_id`, `mailbox`, `sender` address, `text`, `epoch`, `counter`, `confirmed_round`, `intra_round_offset`, `is_channel`, `reply_to` (the txid a section 9.2 reply names), `mentioned`, `command` (a `CommandCall` or `None`) and `from_bot`; `room_key`. `text` is the section 9.1 or 9.2 text when the plaintext is one of those JSON forms, else the plaintext. |
| `RoomReply` | Frozen dataclass: the `message`, the reply `txid` or `None`, an `error` type name or `None`, and `skipped`, the `SKIP_*` reason the reply policy kept the bot silent, or `None`. |
| `BotCommand` | Frozen dataclass of a slash command the bot declares: `name` (1 to 32 lowercase letters, digits, `_` or `-`, starting with a letter or digit) and a one-line `description`. Anything else raises `ValueError`. |
| `CommandCall` | Frozen dataclass of a declared command a message starts with: lowercase `name` and the rest of the message as `arguments`. |
| `RoomHandler` | Type of a `serve_rooms` handler: `RoomMessage` to `str`, `None`, or an awaitable of either. |
| `ROOM_ACTIVE` | `Room.status` `"active"`: a member with the key for the current epoch. |
| `ROOM_WAITING` | `Room.status` `"waiting"`: a member, but the key for the current epoch has not arrived. |
| `ROOM_REMOVED` | `Room.status` `"removed"`: no longer a member, or the parent room's status is removed. |
| `ROOM_LEFT` | `Room.status` `"left"`: the bot posted its leave notice, here or in the parent room. |
| `SKIP_FROM_BOT` | `"from-bot"`: a room's record marks the sender as a bot. |
| `SKIP_NO_MODE` | `"no-mode"`: the bot was added as a plain member, so the room's record has no mode for it. |
| `SKIP_NOT_MENTIONED` | `"not-mentioned"`: mentions mode, and the message neither mentions the bot nor replies to one of its messages. |
| `SKIP_NOT_A_COMMAND` | `"not-a-command"`: commands mode, and the message does not start with one of the bot's declared commands. |
| `SKIP_RATE_LIMIT` | `"rate-limit"`: one more post would go over the room's rate limit for the bot. |
| `LEAVE_NOTICE` | The plain text the bot posts when it leaves: `"I left this room. An owner or admin can remove me to rotate the room key."` |

`AgentCore` methods for one-to-one messages (AGENT-5):

- `publish_key`: Publishes the bot's X25519 key signed by its account (a self-payment). Skips and returns `None` when the same verified key is already on chain, unless `force`.
- `send_direct`: Sends a one-to-one message to an address that has a usable published key. Returns the transaction id.
- `read_direct`: Returns one-to-one messages to the bot it has not answered, oldest first, each once per core. Reads every indexer page after its cursor.
- `reply`: Answers a `DirectMessage` with a section 9.2 reply (`{"text","replyTo":{"txid","preview"}}`) and marks it answered.
- `serve_direct`: Reads new messages and replies with a sync or async handler's text. `None` or empty sends nothing. A failing handler or send is reported by error type and not retried. A sender marked as a bot in any of the bot's rooms is not answered (`skipped` is `SKIP_FROM_BOT`); when there are new messages it reads its rooms first, so a fresh core knows the marks. Returns one `DirectReply` per message.

`AgentCore` methods for rooms and channels (AGENT-6, AGENT-7):

- `publish_pq_key`: Publishes the bot's ML-KEM-768 key as a signed `ACPQ` announcement (a self-payment), so an owner's client can open a hybrid session to it. Skips and returns `None` when the same key is already on chain, unless `force`.
- `sync_rooms`: Reads the bot's inbox (hybrid handshakes to it and section 5.8 key deliveries) and every known room's chain, and returns the rooms and channels it was added to. The bot joins as soon as an owner or admin adds it (op 13 or a member add) and delivers the key: it never sends a join request or an accept. Rooms are keyed by `(group_id, mailbox)`.
- `read_rooms`: Returns room messages to the bot it has not answered, in chain order (round, intra-round offset, transaction id), each once per core.
- `send_room`: Posts plain UTF-8 text to an active room or channel (Raven's room text format). Returns the transaction id.
- `reply_room`: Answers a `RoomMessage` with plain text in its room and marks it answered. (A room reply format is left to algochat#46.)
- `serve_rooms`: Reads new room messages, posts the command list where it is due, and replies with a sync or async handler's text where the reply policy allows (AGENT-8). Returns one `RoomReply` per message, with `skipped` set for each message the policy kept the bot silent on.
- `declare_commands`: Posts `command_list` in each active room whose current mode is commands and whose latest list from the bot (since it was last added) is different. Waits when the rate limit is full. Returns the transaction ids.
- `leave_room`: Leaves a room and its channels: posts `LEAVE_NOTICE` in each active one and stops reading and posting there. Returns the notice transaction ids.

Module internals of `algochat.agent.rooms`, used by `AgentCore` and not exported from `algochat.agent`:

| Name | Contract |
|---|---|
| `GROUP_MESSAGE_PROTOCOL` | `0x07`, the section 5.8 room message type. |
| `txid_bytes` | The 32 raw bytes of a base32 transaction id. |
| `is_admin_note` | True for a section 5.8 administration record (`0x02 0x03`). |
| `is_room_message` | True for a section 5.8 room message (`0x02 0x07`). |
| `KeyDelivery` | A key delivery the bot opened, with the transaction that carried it. |
| `RoomTrack` | Per-room state: records and messages read from the mailbox, keys by epoch, the reduced chain, the parent room, replay counters, what was answered, and when the bot posted (`own_txids`, `post_times`, `latest_command_list`). |

Reply policy (AGENT-8): the reply mode and rate limit come from the bot's entry in the room's current reduced state (op 13, changed by op 14), read every time the bot serves.

| Mode | The bot answers |
|---|---|
| 1, mentions | A message that writes `@` and the bot's `name` (any case) or its address (exact), not inside a longer word or an email address, or a section 9.2 reply naming one of the bot's own messages in that room. |
| 2, every message | Every message. |
| 3, commands | A message starting with `/command` or `/command@name` for a command it declared. It posts `command_list` there first. `/help` is always declared; unless the operator declares their own `help`, the bot answers it with `command_list` without calling the handler. |

Module internals of `algochat.agent.policy`, used by `AgentCore` and not exported from `algochat.agent`:

| Name | Contract |
|---|---|
| `COMMAND_NAME_PATTERN` | The regular expression for a command name. |
| `HELP_COMMAND` | `"help"`. |
| `COMMANDS_HEADER` | `"Commands"`, the first word of the command list. |
| `MAX_ROOM_TEXT_BYTES` | 4026, the largest room plaintext (section 5.8.3). |
| `RoomText` | A room plaintext read as `text` and an optional `reply_to` txid. |
| `parse_room_text` | Reads plain text, `{"text": ...}` or a section 9.2 reply; anything else is kept as plain text. |
| `mentions` | Whether text mentions the bot by `@name` or `@address`. |
| `command_call` | The declared command a text starts with, or `None`. |
| `check_bot_name` | Validates the bot's name. |
| `declared_commands` | The operator's commands plus `/help`, sorted; a repeated name raises `ValueError`. |
| `command_list_text` | `Commands for @name:` (or `Commands:`), then one `/name - description` line per command; over 4026 bytes raises `ValueError`. |
| `is_command_list` | Whether a text has that shape. |
| `within_rate` | Whether one more post at `now` keeps at most `replies` posts in the last `seconds` seconds. |

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
18. The bot answers a room message only as its current mode in that room says (the table above). A change by the owner or an admin (op 14) applies from the next message the bot handles, including messages posted before the change that it has not handled yet.
19. A bot added as a plain member has no mode, because there is no default mode: it reads but never replies there, and posts no command list.
20. The bot never answers an account that any of its rooms' records marks as a bot, in rooms or one-to-one. Nothing an account says about itself makes it a bot.
21. Every post the bot makes in a room counts toward the rate limit there: replies, `/help` answers and command lists. The leave notice is the one exception, because the bot posts nothing there after it. A post is made only when fewer than `replies` posts fall in the last `seconds` seconds. Posts from before a restart are counted by their block time, so a restart does not reset the limit. A message over the limit is skipped, not queued.
22. The command list is plain room text that every implementation reads. The bot posts it only in commands mode, and only when its latest list there since it was last added is different, so a restart posts nothing new.
23. The bot's own replies stay plain room text (Raven shows room text as it is); it reads section 9.2 replies from members only to know when they reply to it.

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

Given the room's record has the bot in mentions mode with 2 replies per 20 seconds
When members write "@helper hi", "@HELPER loud", "@helper one more" and "good morning"
Then the bot answers the first two, skips the third for the rate limit and the last as not mentioned
And a message from another bot in the room is skipped as from a bot

Given an admin changes the bot to commands mode with op 14
When serve_rooms runs
Then the bot posts its command list once, answers "/echo hi" and "/help", and skips "hello" and "/echo@other"
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
| Bad name or command | `name` or a `BotCommand` breaks its pattern, a command repeats, or the list is over 4026 bytes | Raise `ValueError` when the core or command is built |
| Policy skip | A room message the mode, the bot mark or the rate limit rules out | No handler call and no post; `RoomReply.skipped` says why; the message is handled |
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
| 4 | 2026-10-29 | Reply policy from the room record: mode, rate limit, mentions, never another bot, declared slash commands (algochat#46, AGENT-8). |
