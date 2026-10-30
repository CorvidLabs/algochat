# Changelog

Protocol releases of this repository. Each library keeps its own package version. Earlier releases are described on the [releases page](https://github.com/CorvidLabs/algochat/releases). `ts/CHANGELOG.md` and `swift/CHANGELOG.md` are the archived per-language histories from before the monorepo.

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
