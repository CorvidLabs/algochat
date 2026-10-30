# Changelog

Protocol releases of this repository. Each library keeps its own package version. Earlier releases are described on the [releases page](https://github.com/CorvidLabs/algochat/releases). `ts/CHANGELOG.md` and `swift/CHANGELOG.md` are the archived per-language histories from before the monorepo.

## 1.6.1 - 2026-10-30

Python one-to-one messages are hybrid only (#63). The wire format is unchanged: protocol 1.6.0.

| Library | Version |
| --- | --- |
| Protocol and Swift | 1.6.1, tag `v1.6.1` (protocol specification 1.6.0) |
| TypeScript `@corvidlabs/ts-algochat` | 0.12.0 |
| Python `py-algochat` | 0.6.0 |
| Rust `algochat` | 0.6.0 |
| Kotlin `com.corvidlabs:kt-algochat` | 0.5.0 |
| Go `github.com/CorvidLabs/algochat/go` | 0.5.0, tag `go/v0.5.0` |

### Python: hybrid-only one-to-one messages (#63)

- The bot sends a `0x04` handshake, then `0x05` messages, and never `0x01` or `0x02`. It reuses its session, and a restarted bot finds it again on chain instead of paying for a new handshake.
- When the other account has not published an encryption key and a signed ML-KEM-768 key, sending stops with `HybridKeyNotFoundError` and pays nothing. It never falls back to a classical note.
- The bot reads `0x04` and `0x05` messages sent to it. It rejects `0x01` and `0x02` messages and does not read or answer them.
- The plain library sends hybrid too: `AlgoChat.encrypt_hybrid` returns the notes to pay, and `process_transaction` and `sync` read them. `AlgoChat.encrypt` now refuses with `ClassicalSendRefusedError`. Reading older `0x01` and `0x02` notes with the plain library still works.
- `discover_encryption_key` finds keys the way TypeScript does. Only a 32- or 96-byte note an account sends itself counts as a key announcement, so a `0x02` note to itself is no longer read as a key. A 96-byte announcement whose signature fails is rejected, not used unverified. Otherwise the key in the header of the account's own `0x01` messages is used, as for a rekeyed account. It searches the whole history by default; `search_depth` limits it.

### Breaking changes

- Python: `AlgoChat.encrypt` raises `ClassicalSendRefusedError` instead of returning a `0x01` or `0x02` note. Use `AlgoChat.encrypt_hybrid`.
- Python: the bot no longer answers `0x01` or `0x02` messages. People need a client that sends hybrid messages, and the bot needs its ML-KEM-768 key published (the `publish-keys` command, or `AgentCore.publish_pq_key`).
- Python: `send_direct` and `reply` raise `HybridKeyNotFoundError` (still a `LookupError`) when the other account lacks either key.

## 1.6.0 - 2026-10-30

Room bots, and a self-hosted bot in Python.

| Library | Version |
| --- | --- |
| Protocol and Swift | 1.6.0, tag `v1.6.0` |
| TypeScript `@corvidlabs/ts-algochat` | 0.12.0 |
| Python `py-algochat` | 0.5.0 |
| Rust `algochat` | 0.6.0 |
| Kotlin `com.corvidlabs:kt-algochat` | 0.5.0 |
| Go `github.com/CorvidLabs/algochat/go` | 0.5.0, tag `go/v0.5.0` |

### Protocol: room bots (#51)

- A room's owner or an admin can add a bot with `0x03` op 13 and change it with op 14. The note holds the bot's reply mode (mentions, every message, or its commands) and its rate limit (most replies in a window of seconds).
- There is no default mode or limit. 5 replies per 60 seconds is a suggested preset.
- Only an owner or admin makes an account a bot. Nothing an account posts about itself counts. A bot joins at once, is never an admin and cannot own the room.
- Each channel adds a bot separately, with its own settings. Removing a bot is a normal remove (op 11) and gives the room a new key.
- All six libraries write and read the same bytes and reject bad notes with the same sentences. `vectors/group-admin-bots-v1.json` pins them, and `ts/scripts/group-bot-localnet.ts` runs them on LocalNet.
- Notes without ops 13 and 14 are unchanged. See [PROTOCOL.md section 5.8.2](PROTOCOL.md#582-room-administration-0x03) and [Bots in a room](docs/PROTOCOL-FLOWS.md#bots-in-a-room).

### Python: run your own bot (#49, #52, #53, #54, #55, #56, #60)

- `algochat.agent` is a shared core for a bot you host yourself, with its own account. Its 25 words come only from `ALGOCHAT_AGENT_MNEMONIC` or an owner-only file named by `ALGOCHAT_AGENT_MNEMONIC_FILE` (#49).
- It reads one-to-one messages and replies by itself. The library now builds, signs and sends payments, and has standard-library algod and indexer clients (#52).
- It joins the rooms and channels it is added to, replies there, and stops when removed or when it leaves (#53).
- It follows each room's reply mode and rate limit, never answers another bot, counts `@name` and replies as mentions, and declares its own slash commands (#54).
- The same core runs as an MCP server, the `algochat-agent` command, or a webhook bridge. The MCP server has a tool for every command. The webhook only sends readable text to this machine or to a secured https address (#55).
- When fewer than about 100 replies' worth of fees remain, it posts one warning in that room and stays quiet until the wallet is refilled. `funds` shows the numbers. The [operator guide](py/docs/operator-guide.md) covers hosting and funding (#56).
- The bot can have its own Raven identity NFT, with an emoji or an NFT it holds as the picture and its `@name` as the name. Its own wallet pays. Asking again updates the same NFT. Having one never makes an account a bot (#60, #59).
- New page: [Run your own bot](py/docs/run-your-own-bot.md).

### Fixes

- Python: `AlgoChat.encryption_public_key` returns the raw 32-byte key instead of a key object, so signing it or putting it in a key announcement works (#50).
- Swift: depends on swift-algorand 0.4 and swift-algokit 0.1.0 (#58).

### Breaking changes

- Rust: `RoomState` gained `bots` and `AdminDraft` gained `bot`. Code that builds either struct with a struct literal must set the new field (`bots: Vec::new()`, `bot: None`).

### Not in this release

- No package is published to npm, PyPI, crates.io or Maven by this tag. Install from source as each library's README says.
- Bots are self-hosted. There is no hosted bot service and no payments or tips.
