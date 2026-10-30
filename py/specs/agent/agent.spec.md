---
module: agent
version: 7
status: active
files:
  - src/algochat/agent/__init__.py
  - src/algochat/agent/__main__.py
  - src/algochat/agent/account.py
  - src/algochat/agent/cli.py
  - src/algochat/agent/config.py
  - src/algochat/agent/core.py
  - src/algochat/agent/direct.py
  - src/algochat/agent/funds.py
  - src/algochat/agent/identity.py
  - src/algochat/agent/mcp.py
  - src/algochat/agent/policy.py
  - src/algochat/agent/rooms.py
  - src/algochat/agent/runtime.py
  - src/algochat/agent/service.py
  - src/algochat/agent/webhook.py

db_tables: []
depends_on: [algochat]
---

# Python AlgoChat Agent Core

## Purpose

Give any agent one shared Python core for a self-hosted AlgoChat bot (AGENT-1, AGENT-1.b, AGENT-1.d). The bot has its own Algorand account, loaded from a 25-word mnemonic that lives in an environment variable or a local file on the bot host and is never committed (AGENT-4). The bot reads one-to-one messages to it and replies by itself, sending through the library's own payment path (AGENT-5). It joins the rooms and channels an owner or admin adds it to, reads and replies there, and stops when it is removed or leaves (AGENT-6, AGENT-7, AGENT-7.c, AGENT-7.d, AGENT-7.g). In each room it replies only in the mode the room's record holds, within the rate limit there, never to another bot, and it declares its own slash commands (AGENT-8, AGENT-8.b, AGENT-8.c, AGENT-8.d, AGENT-8.e, AGENT-8.f). An agent plugs in through an MCP server, a command-line tool or a webhook bridge, all three on the same `AgentCore`; the MCP server has a tool for every command-line command, and the webhook bridge sends readable text only to the same machine or to a secured address over authenticated HTTPS (AGENT-1.a, AGENT-1.c, AGENT-1.e). The operator hosts the bot and funds its wallet, which pays every fee; when fewer than about 100 replies' worth of fees remain, the bot posts a short warning once, in the room where it reached that level, and not again until the wallet is refilled (AGENT-1.d, AGENT-3, AGENT-3.a). The operator can give the bot its own Raven identity NFT from the command line or MCP, paid by the bot's wallet and signed on its machine: the same 1-of-1 `RAVEN` asset a person makes in Raven, whose picture is one emoji or an NFT the bot's wallet holds (never an uploaded picture or a link) and whose public name is the bot's `@name`. A bot has at most one; asking again updates it. Having it never makes an account a bot, and a bot without one works the same (AGENT-2, AGENT-2.a to AGENT-2.f). This version sends no payments or tips: every bot payment carries no amount (AGENT-9). `docs/operator-guide.md` is the operator guide.

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
| `AgentCore` | One bot: holds its `AgentAccount` and an `AlgoChat` client bound to that address and Ed25519 key. `create` and `from_environment` take operator-supplied algod and indexer clients; properties `account`, `address`, `chat`, `encryption_public_key` (32 raw bytes); `repr` shows only the address. Keyword-only `name` (what members write after `@`, 1 to 64 letters, digits, `_`, `.` or `-`, starting with a letter or digit), `commands` (its `BotCommand` list) and `clock` (monotonic seconds, default `time.monotonic`, used only for the time since the bot last read a block; never compared with block times); properties `name`, `commands` (with `/help`, sorted) and `command_list`. |
| `DirectHandler` | Type of a `serve_direct` handler: `DirectMessage` to `str`, `None`, or an awaitable of either. |
| `DirectMessage` | Frozen dataclass: `txid`, `sender`, `text`, `confirmed_round`, and `reply_to` when the message is itself a reply. |
| `DirectReply` | Frozen dataclass: the `message`, the `reply_txid` or `None`, an `error` type name or `None`, and `skipped`: `SKIP_FROM_BOT` when the sender is a bot in one of the bot's rooms, else `None`. |
| `encode_reply` | Compact section 9.2 reply JSON with UTF-8 text. |
| `reply_preview` | The quoted original: up to 80 characters, else the first 77 and `...`. |
| `REPLY_PREVIEW_CHARS` | 80, the longest preview kept whole. |
| `Room` | Frozen dataclass of a room or channel the bot was added to: `group_id`, `mailbox` address, `name`, `epoch`, `status`, `parent_group_id` (`None` for a room), the bot's `bot` settings or `None`, and the reduced `state`. `is_channel`; `key` is `(group_id, mailbox)`. |
| `RoomMessage` | Frozen dataclass of one room message to the bot: `txid`, `group_id`, `mailbox`, `sender` address, `text`, `epoch`, `counter`, `confirmed_round`, `intra_round_offset`, `is_channel`, `reply_to` (the txid a section 9.2 reply names), `mentioned`, `command` (a `CommandCall` or `None`) and `from_bot`; `room_key`. `text` is the section 9.1 or 9.2 text when the plaintext is one of those JSON forms, else the plaintext. |
| `RoomReply` | Frozen dataclass: the `message`, the reply `txid` or `None`, an `error` type name or `None`, `skipped`, the `SKIP_*` reason the reply policy kept the bot silent, or `None`, and `low_funds_notice`, the txid of the low-funds notice posted right after this reply, or `None`. |
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
| `SKIP_TO_BOT` | `"to-bot"`: `send_direct` to an account one of the bot's rooms marks as a bot. |
| `PolicySkip` | `PermissionError` raised by `send_room`, `reply_room`, `send_direct` and `reply` when the reply policy keeps the bot silent; `reason` is one of the `SKIP_*` values. |
| `LOW_FUNDS_REPLIES` | 100: the bot warns when fewer than this many replies' worth of fees remain (AGENT-3.a). |
| `LOW_FUNDS_NOTICE` | The plain text of the warning: `"I'm running low on funds for fees. My operator needs to refill my wallet."` |
| `FundsStatus` | Frozen dataclass of the bot's wallet in microAlgos: `balance`, `min_balance`, `fee_per_reply`; properties `spendable` (balance above the minimum balance, never below 0), `threshold` (`fee_per_reply` x `LOW_FUNDS_REPLIES`), `replies_left` and `low` (`spendable < threshold`). |
| `Identity` | Frozen dataclass of a Raven identity as Raven reads it: `address`, `asset_id`, `txid` of the note it came from, `picture` (`"emoji"` or `"collectible"`), `emoji`, `media_url`, `source_asset_id` and `name` (`None` when absent); `to_json()`. |
| `IdentityPicture` | Frozen dataclass of the picture to write: `kind`, `media_url`, `source_asset_id`, `emoji`. `IdentityPicture.of_emoji(text)` checks the emoji. |
| `IdentityResult` | Frozen dataclass of a make or update: `asset_id`, `txid`, `minted` (`True` for a new asset, `False` for an update) and the `note` written. |
| `IdentityError` | `ValueError` subclass: the picture is not one emoji or not an NFT the bot holds, both or neither picture was given, or the wallet cannot pay. Nothing is sent. |
| `LEAVE_NOTICE` | The plain text the bot posts when it leaves: `"I left this room. An owner or admin can remove me to rotate the room key."` |
| `COMMANDS` | The shared commands, in order: `address`, `publish-keys`, `send`, `read`, `reply`, `rooms`, `read-rooms`, `reply-room`, `declare-commands`, `leave-room`, `funds`, `identity`, `make-identity`, `serve`. The CLI has one subcommand and the MCP server one tool for each (AGENT-1.e). |
| `AgentCommand` | Frozen dataclass of one shared command: CLI `name`, `description`, `params` (each a name, a kind `string`, `boolean` or `integer`, a description and whether it is required) and `run`; `tool_name` is the name with `-` as `_`, and `input_schema` its JSON Schema (no extra properties). |
| `AgentService` | Runs the shared commands on one `AgentCore`: `run(name, arguments)` by CLI or tool name. It keeps the messages it read, so `reply` and `reply-room` find one by transaction id (reading again first when it is not known). |
| `CommandError` | `ValueError` subclass for bad arguments, an unknown message, or a reply the reply policy refuses. |
| `WebhookBridge` | Async callable used as a `serve_direct` or `serve_rooms` handler: posts the message as JSON to the operator's URL and returns the reply text. Built with the URL, the shared secret or `None`, and an optional SSL context. |
| `WebhookError` | `RuntimeError` subclass: the URL is not allowed, or the webhook refused, failed or answered in another shape. |
| `check_webhook_url` | Allows `http` or `https` to a loopback host (`localhost` or a loopback IP), or `https` to another host only with a shared secret. Refuses credentials in the URL and any link-local, unspecified or cloud metadata host (169.254.0.0/16, fe80::/10, 0.0.0.0, ::, their IPv4-mapped forms, fd00:ec2::254, 100.100.100.200, metadata.google.internal), even over https with a secret. Returns the URL or raises `WebhookError` (AGENT-1.c). |
| `load_webhook_secret` | The shared secret from `ALGOCHAT_WEBHOOK_SECRET` or the owner-only file named by `ALGOCHAT_WEBHOOK_SECRET_FILE`; `None` when neither is set. Both set, under 32 characters, or an unsafe file raise `AgentConfigError` without the secret in the message. |
| `verify_signature` | For the operator's receiver: whether `X-AlgoChat-Signature` is the HMAC-SHA256 `sha256=<hex>` of `"<timestamp>." + body` under the secret, with the timestamp within 300 seconds. |
| `SECRET_ENV` | `"ALGOCHAT_WEBHOOK_SECRET"`. |
| `SECRET_FILE_ENV` | `"ALGOCHAT_WEBHOOK_SECRET_FILE"`. |

`AgentCore` methods for one-to-one messages (AGENT-5):

- `publish_key`: Publishes the bot's X25519 key signed by its account (a self-payment). Skips and returns `None` when the same verified key is already on chain, unless `force`.
- `send_direct`: Sends a one-to-one message to an address that has a usable published key. Reads the bot's rooms first and raises `PolicySkip` (`SKIP_TO_BOT`) before paying when any of them marks the address as a bot. Returns the transaction id.
- `read_direct`: Returns one-to-one messages to the bot it has not answered, oldest first, each once per core. Reads every indexer page after its cursor.
- `reply`: Answers a `DirectMessage` with a section 9.2 reply (`{"text","replyTo":{"txid","preview"}}`) and marks it answered. Reads the bot's rooms first and raises `PolicySkip` (`SKIP_FROM_BOT`) before paying when any of them marks the sender as a bot.
- `serve_direct`: Reads new messages and replies with a sync or async handler's text. `None` or empty sends nothing. A failing handler or send is reported by error type and not retried. A sender marked as a bot in any of the bot's rooms is not answered (`skipped` is `SKIP_FROM_BOT`); when there are new messages it reads its rooms first, so a fresh core knows the marks. Returns one `DirectReply` per message.

`AgentCore` methods for rooms and channels (AGENT-6, AGENT-7):

- `publish_pq_key`: Publishes the bot's ML-KEM-768 key as a signed `ACPQ` announcement (a self-payment), so an owner's client can open a hybrid session to it. Skips and returns `None` when the same key is already on chain, unless `force`.
- `sync_rooms`: Reads the bot's inbox (hybrid handshakes to it and section 5.8 key deliveries) and every known room's chain, and returns the rooms and channels it was added to. The bot joins as soon as an owner or admin adds it (op 13 or a member add) and delivers the key: it never sends a join request or an accept. Rooms are keyed by `(group_id, mailbox)`.
- `read_rooms`: Returns room messages to the bot it has not answered, in chain order (round, intra-round offset, transaction id), each once per core.
- `send_room`: Posts plain UTF-8 text to an active room or channel (Raven's room text format). Reads the rooms again first and raises `PolicySkip` when the room gives the bot no mode (`SKIP_NO_MODE`) or the rate window is full (`SKIP_RATE_LIMIT`). Returns the transaction id.
- `reply_room`: Answers a `RoomMessage` with plain text in its room and marks it answered. Reads the rooms again first and raises `PolicySkip` with the reason when the reply policy keeps the bot silent on that message on the fresh record (mode, rate window, and whether the sender is now a bot); nothing is posted then. (A room reply format is left to algochat#46.)
- `serve_rooms`: Reads new room messages, posts the command list where it is due, and replies with a sync or async handler's text where the reply policy allows (AGENT-8). Returns one `RoomReply` per message, with `skipped` set for each message the policy kept the bot silent on.
- `declare_commands`: Posts `command_list` in each active room whose current mode is commands and whose latest list from the bot (since it was last added) is different. Waits when the rate limit is full. Returns the transaction ids, with a low-funds notice after the list that brought the wallet low.
- `leave_room`: Leaves a room and its channels: posts `LEAVE_NOTICE` in each active one and stops reading and posting there. Returns the notice transaction ids, with a low-funds notice after the leave notice that brought the wallet low (posted before the bot stops posting there).

`AgentCore` methods for funds (AGENT-3, AGENT-3.a):

- `check_funds`: Reads the bot's balance and minimum balance from algod and the network's minimum fee, and returns a `FundsStatus`. Seeing the wallet not low counts as a refill, so the next drop warns again.
- After every room post through `send_room`, `reply_room` or `serve_rooms`, the bot checks its funds. When they are low and no notice is current, it posts `LOW_FUNDS_NOTICE` in that same room. A one-to-one reply also checks funds (a refill seen there re-arms the notice), but the notice itself goes only in a room. A failed funds check is logged by error type and never blocks the reply.

`AgentCore` methods for the bot's Raven identity NFT (AGENT-2, AGENT-2.a to AGENT-2.f). Both need algod and indexer clients with the asset reads the library's HTTP clients have (`AssetAlgod`, `AssetIndexer`); others raise `TypeError`:

- `identity`: The bot's identity read from the indexer the way Raven reads it: the newest undeleted asset the bot created with unit `RAVEN`, then the newest asset-config note on it that the bot itself sent and that names the bot's address in `properties.raven.address`. Returns an `Identity` or `None`.
- `make_identity(emoji=None, nft=None)`: Makes the identity, or updates the one the bot has. `emoji` is one emoji; `nft` is the id of an NFT the bot's wallet holds now. With neither, an existing identity keeps its picture (an NFT picture must still be held) and only the name is rewritten. The name is the bot's `name`; a core without one keeps the name already on the identity. When algod shows no `RAVEN` asset created by the bot, it sends one asset create: total 1, decimals 0, unit `RAVEN`, asset name `Raven identity`, URL the picture's link (empty for an emoji), manager the bot, no reserve, freeze or clawback, and the note. Otherwise it sends one asset config on that asset that keeps the bot as manager and carries the new note. Before sending it checks that the spendable balance covers the fee, plus the 0.1 ALGO minimum balance the new asset locks when minting. Signs on the bot's machine, waits for confirmation, and returns an `IdentityResult` with the created asset id read from the confirmed transaction.

Module internals of `algochat.agent.identity`, used by `AgentCore` and not exported from `algochat.agent`:

| Name | Contract |
|---|---|
| `IDENTITY_UNIT_NAME` | `"RAVEN"`. |
| `IDENTITY_FALLBACK_NAME` | `"Raven identity"`, the asset name (a bot has no `.algo` name). |
| `IDENTITY_MIN_BALANCE` | 100000 microAlgos, the minimum balance a created asset locks. |
| `check_emoji` | Returns the text, stripped, when it is exactly one emoji of at most 32 UTF-8 bytes: one pictograph with optional variation selector and skin tone, joined by zero-width joiners, a flag of two regional indicators or tag characters, or a keycap. Otherwise raises `IdentityError`. |
| `identity_display_name` | Raven's name rule: control characters become spaces, runs of white space collapse, the ends are trimmed and the result is cut to 32 UTF-8 bytes on a character boundary; empty is `None`. |
| `nft_picture_pointer` | The link Raven shows for an NFT, worked out from its on-chain URL without fetching anything: an ARC-19 `template-ipfs://{ipfscid:1:raw:reserve:sha2-256}` (or `dag-pb`) URL becomes `ipfs://` and the CID of the reserve address; an IPFS link becomes `ipfs://<cid>/<path>`; another `http(s)` link to an image or media file stays as it is. `None` when nothing fits in 96 bytes. |
| `nft_picture` | Checks that the bot holds at least one unit of the asset, that it is a picture NFT the way Raven counts one (0 decimals and a total of 1, or up to 100000 with a media URL) and not the bot's own identity, and returns its `IdentityPicture`. |
| `build_identity_note` | Raven's ARC-69 note as a dict, in Raven's key order. An NFT picture: `{"standard":"arc69","description":"Raven identity picture","media_url":...,"properties":{"raven":{"address":...,"picture":"collectible","sourceAssetId":...,"name":...}}}`. An emoji: the same without `media_url`, with `"picture":"emoji","emoji":...` in place of `sourceAssetId`. `name` is left out when there is none. |
| `encode_identity_note` | That note as compact UTF-8 JSON (non-ASCII kept as UTF-8); over 1024 bytes raises `IdentityError`. |
| `decode_identity_note` | Parses a note back; `None` for anything that is not an ARC-69 Raven note with a valid picture. |
| `ASSET_URL_MAX_BYTES` | 96, the longest asset URL. |
| `NAME_MAX_BYTES` | 32, the longest public name. |
| `EMOJI_MAX_BYTES` | 32, the longest emoji. |
| `PICTURE_COLLECTIBLE` | `"collectible"`, an NFT picture. |
| `PICTURE_EMOJI` | `"emoji"`, an emoji picture. |
| `ipfs_link_pointer` | `ipfs://<cid>` (with any path) for an `ipfs://` link, a bare CID or an `https` gateway link under `/ipfs/`, query and fragment dropped, else `None` (Raven's `ipfsLinkPointer`). |
| `is_media_url` | Whether an `http(s)` link points at an image or media file (by extension or an `#i` fragment). |
| `AssetAlgod` | Protocol of the algod calls identity needs: suggested params, submit, wait for confirmation, pending transaction, created assets, an asset holding and asset params. `HttpAlgodClient` has them. |
| `AssetIndexer` | Protocol of the indexer reads Raven makes: `account_created_assets` and `asset_config_history`. `HttpIndexerClient` has them. |
| `newest_identity_asset` | The newest undeleted `RAVEN` asset id in a created-assets list, or `None`. |
| `read_identity` | The read behind `AgentCore.identity`, on the indexer. |
| `own_identity_asset` | The bot's `RAVEN` asset id from algod, so a quick second call cannot mint twice. |
| `make_identity` | The build, sign, send and wait behind `AgentCore.make_identity`. |

`algochat.transaction` adds `build_asset_create` and `build_asset_config` (canonical msgpack, the same bytes as `py-algorand-sdk`), signed by `sign_payment`. `HttpAlgodClient` adds `pending_transaction`, `account_created_assets`, `asset_holding` and `asset_params`; `HttpIndexerClient` adds `account_created_assets` and `asset_config_history` (`/v2/transactions?asset-id=...&tx-type=acfg`, every page). None is exported from `algochat`.

Module internals of `algochat.agent.rooms`, used by `AgentCore` and not exported from `algochat.agent`:

| Name | Contract |
|---|---|
| `GROUP_MESSAGE_PROTOCOL` | `0x07`, the section 5.8 room message type. |
| `txid_bytes` | The 32 raw bytes of a base32 transaction id. |
| `is_admin_note` | True for a section 5.8 administration record (`0x02 0x03`). |
| `is_room_message` | True for a section 5.8 room message (`0x02 0x07`). |
| `KeyDelivery` | A key delivery the bot opened, with the transaction that carried it. |
| `RoomTrack` | Per-room state: records and messages read from the mailbox, keys by epoch, the reduced chain, the parent room, replay counters, what was answered, and when the bot posted (`own_txids`, `post_times`, `latest_command_list`, `last_text_since_join`). |

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

Adapters (AGENT-1.a, AGENT-1.c, AGENT-1.e). The CLI, the MCP server and the webhook bridge sit on `AgentCore` through `AgentService` and `COMMANDS`, so the CLI and the MCP server offer the same commands with the same parameters by construction.

| Command (MCP tool) | Parameters | Result |
|---|---|---|
| `address` | none | The bot's `address` and `name`. |
| `publish-keys` (`publish_keys`) | `force` | `encryption_key_txid` and `pq_key_txid`, each `None` when already on chain. |
| `send` | `to`, `text` | The `txid` of a one-to-one message. |
| `read` | none | One-to-one messages not yet answered: `txid`, `sender`, `text`, `reply_to`, `confirmed_round`, `from_bot`. |
| `reply` | `txid`, `text` | The reply `txid`. Refused for a sender a room marks as a bot (AGENT-8.c). |
| `rooms` | none | Each room and channel: `group_id` (hex), `mailbox`, `name`, `epoch`, `status`, `is_channel`, `parent_group_id`, and the bot's `mode`, `replies`, `seconds`. |
| `read-rooms` (`read_rooms`) | none | New room messages with `mentioned`, `command`, `from_bot` and `skipped`, the reason the reply policy keeps the bot silent, or `None`. |
| `reply-room` (`reply_room`) | `txid`, `text` | The reply `txid` and `low_funds_notice` (txid or `None`). Refused when the room's mode, rate limit or bot mark keeps the bot silent (AGENT-8). |
| `declare-commands` (`declare_commands`) | none | `command_list` and the `txids` posted (a low-funds notice included). |
| `leave-room` (`leave_room`) | `group_id` (hex), `mailbox` | The leave notice `txids` (a low-funds notice included). |
| `funds` | none | `balance`, `min_balance`, `spendable`, `fee_per_reply`, `threshold`, `replies_left` and `low`. |
| `identity` | none | `address` and `identity`, the bot's identity as Raven reads it (`asset_id`, `address`, `picture`, `emoji`, `media_url`, `source_asset_id`, `name`, `txid`) or `None`. |
| `make-identity` (`make_identity`) | `emoji`, `nft` (integer) | Makes or updates the bot's identity: `asset_id`, `txid`, `minted`, `picture`, `emoji`, `media_url`, `source_asset_id` and `name`. Refused, with nothing sent, for anything but one emoji or an NFT the bot holds, for both, or when the wallet cannot pay. |
| `serve` | `webhook` | One pass of `serve_direct` and `serve_rooms` with a `WebhookBridge`: per message its `txid`, `reply_txid`, `error` and `skipped`, and for rooms `low_funds_notice`. |

- CLI: `algochat-agent` (also `python -m algochat.agent`) takes `--name`, a repeatable `--command NAME=DESCRIPTION`, then one subcommand per command with `--param` flags (`--group-id` for `group_id`). `serve` runs until stopped, one pass every `--interval` seconds (default 5), or once with `--once`. `mcp` runs the MCP server. Each command prints its result as JSON; an error prints one `error: <Type>: <message>` line to stderr and exits 1.
- MCP server: JSON-RPC 2.0, one message per line on stdin and stdout. `initialize` (protocol versions `2025-06-18`, `2025-03-26`, `2024-11-05`), `ping`, `tools/list` and `tools/call`. A tool's result is its JSON as text; a `CommandError` or other failure is a result with `isError`. Notifications get no answer; bad JSON, bad requests, unknown methods and bad parameters get the JSON-RPC errors -32700, -32600, -32601 and -32602. The bot is built on the first tool call.
- Webhook request: `POST` of JSON with `type` (`direct` or `room`), `txid`, `sender`, `text`, `reply_to`, `confirmed_round`, and for rooms `group_id`, `mailbox`, `is_channel`, `mentioned`, `command`; headers `X-AlgoChat-Timestamp` and, with a secret, `X-AlgoChat-Signature`. Only messages the reply policy allows reach it. The answer is `{"reply": "<text>"}`, `{"reply": null}`, an empty body or HTTP 204; at most 65536 bytes, 15 seconds.
- Settings for the CLI and MCP server come from the environment: the mnemonic (`ALGOCHAT_AGENT_MNEMONIC` or `ALGOCHAT_AGENT_MNEMONIC_FILE`), `ALGOCHAT_ALGOD_URL`, `ALGOCHAT_ALGOD_TOKEN`, `ALGOCHAT_INDEXER_URL`, `ALGOCHAT_INDEXER_TOKEN`, the webhook secret, and `ALGOCHAT_WEBHOOK_CA_FILE` for a private CA.

Module internals used by the adapters and not exported from `algochat.agent`:

| Name | Contract |
|---|---|
| `config.read_owner_only_file` | The owner-only file reader behind `read_mnemonic_file` and the webhook secret file, with the label in its messages. |
| `AgentCore.room_skip_reason` | The `SKIP_*` reason the room's current record and the bot's recent posts keep it silent on a `RoomMessage`, or `None`. |
| `AgentCore.is_known_bot` | Whether any of the bot's rooms marks an address as a bot. |
| `webhook.is_loopback_host`, `webhook.is_link_local_or_metadata`, `webhook.sign`, `webhook.direct_payload`, `webhook.room_payload` | The loopback test, the signature, and the request bodies. |
| `service.Param`, `service.check_arguments`, `service.command_by_name`, `service.to_json` | A command parameter, argument checks (unknown or mistyped ones refused), lookup by CLI or tool name, and JSON for results. |
| `runtime.build_core`, `runtime.webhook_factory`, `runtime.parse_command` | Build the bot and its webhook bridges from the environment, and read `NAME=DESCRIPTION`. |
| `funds.reply_fee` | One reply's fee: `payment_fee(MAX_NOTE_SIZE, max(min_fee, 1000))`. |
| `AgentCore._post_noting_funds`, `AgentCore._send_room_noting_funds`, `AgentCore._reply_room_noting_funds` | Post a room text, then the low-funds notice when due, returning both txids; every room post but the notice itself goes through `_post_noting_funds` (`send_room`, `reply_room`, `serve_rooms`, the command list and the leave notice), and `reply-room` uses `_reply_room_noting_funds` so the CLI and MCP report the notice. |
| `mcp.McpServer` | The MCP server on an async factory of `AgentService`. |
| `cli.main`, `cli.build_parser` | The command-line tool. |

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
21. Every post the bot makes in a room counts toward the rate limit there: replies, `/help` answers and command lists. The leave notice is the one exception, because the bot posts nothing there after it except the low-funds notice when the leave notice itself took the wallet low (invariant 29). The low-funds notice counts too. A post is made only when fewer than `replies` posts fall in the last `seconds` seconds. The window is counted in chain time: "now" is the newest block time the bot has read plus the monotonic time since it read it, and each post counts at its block time (or, until the bot reads that block, the chain time when it sent it). The host's wall clock is never compared with block times, so a node whose clock differs from the host's keeps the same limit, and a restart does not reset it. `send_room`, `reply_room` and `serve_rooms` count against the same window. A message over the limit is skipped, not queued.
22. The command list is plain room text that every implementation reads. The bot posts it only in commands mode, and only when its latest list there since it was last added is different, so a restart posts nothing new.
23. The bot's own replies stay plain room text (Raven shows room text as it is); it reads section 9.2 replies from members only to know when they reply to it.
24. The CLI and the MCP server are built from the same `COMMANDS`: every CLI command has an MCP tool with the same parameters, and the reverse (AGENT-1.e).
25. Replies through any adapter follow the reply policy: `reply-room` refuses what `serve_rooms` would skip, `reply` refuses a sender a room marks as a bot, `send` refuses an account a room marks as a bot and posts nothing; each reads the rooms again first, so a long-lived MCP server follows a mode change or a new bot, and `serve` sends the webhook only the messages the policy allows. The adapters post no room message except replies, command lists and the leave notice (design choice).
26. The webhook bridge sends readable text only to a loopback host, or over `https` with the certificate checked to another host when a shared secret signs every request. Proxies in the environment are ignored and redirects refused (AGENT-1.c; signing, proxies and redirects are design choices).
27. The CLI and the MCP server have no default network: without `ALGOCHAT_ALGOD_URL` and `ALGOCHAT_INDEXER_URL` they stop with an error. They use only keys signed by their account. Their output and errors never contain the mnemonic or the webhook secret.
28. One reply's worth of fees is the fee of a payment carrying the largest note (`MAX_NOTE_SIZE` bytes) at the network's minimum fee, and only the balance above the account's minimum balance counts, so the estimate errs toward warning early (design choice). The warning comes when `spendable < 100 x fee_per_reply` (AGENT-3.a).
29. The bot checks its wallet after every room post except the notice itself: replies, `send_room`, the command list and the leave notice (checked before it stops posting there). It posts `LOW_FUNDS_NOTICE` once per drop, in the room whose post took it low (or the first room it posts in while low), and in no other room, until it sees the wallet not low again (AGENT-3.a). The notice is posted even when the rate limit there is full, and counts toward the limit after (design choice).
30. A core that has not checked its wallet yet (a restart, or a new CLI run) finds its latest notice in any room since it was last added. That notice is current unless the spendable balance today plus the fees of every note the bot sent after it reaches the threshold, which can only happen if the wallet was refilled, because the bot spends nothing but fees (design choice).
31. The bot sends no payments or tips: every payment it sends carries amount 0, and it sends no asset transfers (AGENT-9). Only the operator funds the wallet (AGENT-3).
32. The bot's identity is the same kind of asset a person makes in Raven: a 1-of-1 `RAVEN` asset the bot created, managed by the bot, with no reserve, freeze or clawback, and a Raven ARC-69 note (AGENT-2.b).
33. A bot has at most one identity: `make_identity` mints only when algod shows no undeleted `RAVEN` asset created by the bot, and otherwise updates the newest one with an asset config. Repeated calls, from one core or separate CLI runs, never create a second (AGENT-2.d).
34. The picture is one emoji or an NFT the bot's wallet holds when the note is written. No command or method takes a picture link or an uploaded image; a link given as the emoji is refused (AGENT-2.c, design rule from Leif).
35. The public name is the bot's `@name` cut to 32 bytes the way Raven cuts it (AGENT-2.c).
36. Only an asset the account created, and only a note that account sent naming its own address, count as its identity; a look-alike made by anyone else is ignored (AGENT-2.b).
37. Holding an identity changes nothing about who is a bot: rooms mark bots only by their own record, the note carries no bot flag, and every other part of the core works the same with or without one (AGENT-2.e).
38. The identity is signed on the bot's machine with the key from the env var or local file; no request carries the mnemonic or the seed (AGENT-2.f, AGENT-4).
39. The minimum balance the identity locks is not spendable, so the low-funds check, which counts only the balance above the minimum balance, already leaves it out.

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

Given the bot is in mentions mode in a room
When an MCP client calls reply_room on a message that does not mention the bot
Then the tool result is an error naming not-mentioned and nothing is posted

Given ALGOCHAT_WEBHOOK_SECRET is set and a receiver listens on 127.0.0.1
When `algochat-agent serve --webhook http://127.0.0.1:PORT/hook --once` runs
Then the receiver gets each message the policy allows, signed, and the bot posts its replies
And a message from another bot never reaches the receiver

Given the bot's spendable balance is just above 100 replies' worth of fees and it is in rooms A and B
When it replies in room A and that reply takes it below the threshold
Then it posts LOW_FUNDS_NOTICE once in room A, and its next replies in A and B carry no notice
And after the operator refills the wallet, the next drop posts one new notice, in the room where it happened

Given a funded bot named helper with no identity
When the operator runs `algochat-agent --name helper make-identity --emoji 🦊`
Then the bot's wallet creates one RAVEN asset (total 1, decimals 0, manager the bot) whose note shows 🦊 and the name helper
And Raven, reading the bot's created assets and notes, shows that picture and name

Given that bot holds an NFT with asset id 42
When the operator runs `make-identity --nft 42`, then `make-identity --emoji 🐦`
Then both update the same asset; the bot still created exactly one RAVEN asset

Given someone else creates a RAVEN asset whose note names the bot's address
When anyone reads the bot's identity
Then that asset is ignored

Given the operator runs `make-identity --emoji https://example.com/me.png`
Then it fails with IdentityError and nothing is sent

Given a webhook URL http://example.com/hook
Then check_webhook_url refuses it: readable text goes over plain http only to this machine
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
| Policy refusal | `send_room` or `reply_room` the reply policy rules out on the fresh record; `send_direct` or `reply` to an account a room marks as a bot | Raise `PolicySkip` with the reason; nothing is paid or posted |
| Reserved text | `send_room` with `LOW_FUNDS_NOTICE` | Raise `ValueError`: that text is the bot's own notice |
| Funds check failure | algod cannot report the balance or parameters after a post | Log the error type, post no notice; the reply stands and the next post checks again |
| Unauthorized key | A key delivery whose sender, cited record, epoch or session does not check out | Ignore it; the room stays unjoined |
| Bad name or command | `name` or a `BotCommand` breaks its pattern, a command repeats, or the list is over 4026 bytes | Raise `ValueError` when the core or command is built |
| Policy skip | A room message the mode, the bot mark or the rate limit rules out | No handler call and no post; `RoomReply.skipped` says why; the message is handled |
| Room handler failure | A `serve_rooms` handler or send raises | Record the error type in `RoomReply.error`, mark answered, go on |
| Policy refusal | `reply` or `reply-room` on a message the reply policy keeps silent, or an unknown txid | Raise `CommandError` (MCP: `isError` result; CLI: exit 1) and post nothing |
| Bad arguments | An unknown parameter, a missing required one, or a wrong type | Raise `CommandError`; MCP `tools/call` with an unknown tool answers -32602 |
| Webhook not allowed | Plain http to another machine, https to another machine without a secret, credentials in the URL, a link-local, unspecified or cloud metadata host | Raise `WebhookError` before any request |
| Webhook failure | A non-2xx answer, a redirect, a bad certificate, a timeout, over 65536 bytes or another shape | The bridge raises `WebhookError`; the core records it as the message's error and goes on |
| Bad identity picture | `make_identity` with a link, text or several emoji as the emoji, an NFT the bot does not hold, a fungible or non-picture asset, an NFT whose URL gives no picture link, both pictures, or no picture and no identity yet | Raise `IdentityError` (CLI exit 1, MCP `isError`); nothing is sent |
| Identity not affordable | The spendable balance is below the fee, plus 0.1 ALGO when minting | Raise `IdentityError` naming the amount needed; nothing is sent |
| Missing settings | No algod or indexer URL, or no mnemonic | CLI and MCP stop with `AgentConfigError`, never echoing a secret |

## Dependencies

- Python 3.10 or newer
- `cryptography` for Ed25519 public key derivation
- The `algochat` module's `group`, `group_admin` and `pq` functions for section 5.8 rooms and hybrid sessions
- The `algochat` module's `build_asset_create`, `build_asset_config`, `sign_payment` and the HTTP clients' asset reads for the identity NFT
- The `algochat` module's `AlgoChat`, `AlgoChatConfig`, `AlgodClient`, `IndexerClient`, `EncryptionKeyStorage`, `MessageCache`, `send_payment`, and `sign_encryption_key`

## Change Log

| Version | Date | Changes |
|---|---|---|
| 1 | 2026-10-29 | Agent core: the bot's own account from a 25-word mnemonic in an env var or local file, and `AgentCore` (algochat#43). Review fixes: fd-based owner/ACL file checks, both-variables check before `path`, seed kept out of fields and pickles with a seed/field consistency check, no secrets in traceback locals, algosdk word prefixes. |
| 2 | 2026-10-29 | One-to-one messages: the bot publishes its key, reads messages to it and replies by itself (algochat#44, AGENT-5). |
| 3 | 2026-10-29 | Rooms and channels: the bot joins when added, reads and replies, and stops when removed or when it leaves (algochat#45, AGENT-6, AGENT-7). |
| 4 | 2026-10-29 | Reply policy from the room record: mode, rate limit, mentions, never another bot, declared slash commands (algochat#46, AGENT-8). |
| 6 | 2026-10-29 | Out-of-funds notice: the operator funds the wallet, the bot warns once in the room where fewer than about 100 replies' worth of fees remain, until refilled; the `funds` command; no payments or tips; operator guide (algochat#48, AGENT-1.d, AGENT-3, AGENT-3.a, AGENT-4, AGENT-9). |
| 7 | 2026-10-30 | The bot's own Raven identity NFT: `identity` and `make-identity` on the CLI and MCP; one 1-of-1 `RAVEN` asset per bot, paid by its wallet and signed on its machine; an emoji or a held NFT as the picture and the `@name` as its name; asking again updates it; a look-alike is ignored and it never makes an account a bot (algochat#59, AGENT-2, AGENT-2.a to AGENT-2.f). |
| 5 | 2026-10-29 | MCP server, command-line tool and webhook bridge on the shared core; an MCP tool for every CLI command; webhook text only to this machine or authenticated HTTPS (algochat#47, AGENT-1.a, AGENT-1.c, AGENT-1.e). |
