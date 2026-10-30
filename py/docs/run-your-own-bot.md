# Run your own bot

This page takes you from nothing to a bot that answers in an AlgoChat room. The bot runs on your machine, with its own wallet, and you pay its fees. For the details behind each step, see the [operator guide](operator-guide.md).

Try every step on a local network first, never TestNet or MainNet. [localnet-testing.md](localnet-testing.md) shows how to run one.

## 1. Install

```bash
pip install "git+https://github.com/CorvidLabs/algochat.git#subdirectory=py"
algochat-agent --help
```

This installs the library and the `algochat-agent` command. The only runtime dependency is `cryptography`.

## 2. Give the bot its own account

Make a new Algorand account just for the bot. Never use your own. Put its 25 words in a file only you can read:

```bash
mkdir -p ~/.algochat-agent && chmod 700 ~/.algochat-agent
# write the 25 words into ~/.algochat-agent/bot.mnemonic with your editor, then:
chmod 600 ~/.algochat-agent/bot.mnemonic
export ALGOCHAT_AGENT_MNEMONIC_FILE=~/.algochat-agent/bot.mnemonic
```

You can use `ALGOCHAT_AGENT_MNEMONIC` instead, but not both. The words never leave this machine. Add `*.mnemonic` and `.algochat-agent/` to your project's `.gitignore`.

## 3. Point it at a node

There is no default network. Name your algod and indexer:

```bash
export ALGOCHAT_ALGOD_URL=http://localhost:4001
export ALGOCHAT_ALGOD_TOKEN=...      # if your node needs one
export ALGOCHAT_INDEXER_URL=http://localhost:8980
export ALGOCHAT_INDEXER_TOKEN=...    # if your indexer needs one
```

## 4. Fund it and publish its keys

Every `algochat-agent` command, including `address` and `funds`, needs the bot's 25 words from step 2 and both URLs from step 3. Without the URLs it stops with "Set ALGOCHAT_ALGOD_URL and ALGOCHAT_INDEXER_URL"; without the words it stops with "No bot mnemonic". Set them in every shell where you run the bot.

```bash
algochat-agent --name helper address        # the address to send Algo to
algochat-agent funds                        # balance, cost of one reply, replies left
algochat-agent --name helper publish-keys   # once; skipped if already on chain
```

Run `publish-keys` before anyone adds the bot to a room or messages it. It publishes the bot's signed encryption key and its signed post-quantum (ML-KEM-768) key in one go. Adding a bot sends it the room key in a hybrid-session `0x06` note, so the owner's client needs the bot's published post-quantum key to hand that key over ([PROTOCOL.md section 5.8](../../PROTOCOL.md#58-group-mailbox-protocols-0x03-0x06-and-0x07)). One-to-one messages need both keys too (see [One-to-one messages](#one-to-one-messages)). From Python code, `AgentCore.publish_key()` publishes the encryption key and `AgentCore.publish_pq_key()` the post-quantum key; `publish-keys` calls both.

`--name` and `--command` are not saved anywhere. Pass the same ones on every run.

The bot's wallet pays every fee it spends. It never sends Algo, payments or tips. When fewer than about 100 replies' worth of fees remain, it posts one short warning in the room where that happened, and not again until you refill it.

## 5. Give it a Raven identity (optional)

```bash
algochat-agent --name helper make-identity --emoji 🦊      # one emoji
algochat-agent --name helper make-identity --nft 123456    # or an NFT the bot's wallet holds
algochat-agent --name helper identity                      # show it the way Raven reads it
```

This makes the same identity NFT a person makes in Raven, so Raven shows the bot's picture and name like anyone else's. The picture is one emoji or an NFT the bot holds, never a link or an uploaded picture. The name is its `--name`. Running it again updates the same NFT. The first time costs the fee plus 0.1 Algo, which stays locked while the NFT exists.

Having an identity never makes the bot a bot in a room, and a bot works fine without one.

## 6. Get added to a room

Ask the room's owner or an admin to add the bot's address as a bot, in Raven or any AlgoChat client. They pick its reply mode and rate limit, and every member can see them:

- **Mentions**: it answers `@helper` and replies to its own messages.
- **Every message**: it answers everything.
- **Commands**: it posts its command list once, then answers only those commands.

The bot joins at once and is never an admin. Each channel adds it separately. If someone removes it, it stops in that room and its channels.

## 7. Answer messages

Pick one way to plug in your bot's brain.

**Your own Python code:**

```python
import asyncio

from algochat import AlgoChatConfig, HttpAlgodClient, HttpIndexerClient
from algochat.agent import AgentCore, BotCommand


def answer(message):
    return f"You said: {message.text}"  # return None to stay silent


async def main():
    algod = HttpAlgodClient("http://127.0.0.1:4001", "<algod token>")
    indexer = HttpIndexerClient("http://127.0.0.1:8980", "<indexer token>")
    core = await AgentCore.from_environment(
        AlgoChatConfig.localnet(), algod, indexer,
        name="helper",
        commands=[BotCommand("echo", "Repeat your text")],
    )
    while True:
        await core.serve_rooms(answer)  # serve_direct does the same for one-to-one
        await asyncio.sleep(5)


asyncio.run(main())
```

**A webhook to your own service:**

```bash
algochat-agent --name helper --command "echo=Repeat your text" serve --webhook http://localhost:8080/bot
```

`serve` needs `--webhook`; the command has no reply logic of its own. Pass every `--command` the bot declares, or a room in commands mode only gets `/help`. It answers every 5 seconds by default (`--interval`), or once with `--once`.

Readable text only goes to this machine, or over https to another address with a shared secret. See the [Python README](../README.md#mcp-server-command-line-and-webhook) for the request format and signature check.

**An MCP client:** run `algochat-agent --name helper mcp`. It has a tool for every command above.

Whichever you pick, the bot follows the room's mode and rate limit, never answers another bot, and never answers the same message twice, also after a restart.

## One-to-one messages

AlgoChat and Raven messaging uses protocol `0x03` and up only. The bot never sends `0x01` (classical) or `0x02` (PSK) notes, and it does not read or answer `0x01` or `0x02` one-to-one messages sent to it. These rules apply from py-algochat `0.6.0` (AlgoChat 1.6.1, [algochat#64](https://github.com/CorvidLabs/algochat/pull/64)).

- **Hybrid only.** The first time the bot messages an address it sends a `0x04` hybrid handshake (X25519 + ML-KEM-768), then `0x05` messages under that session ([PROTOCOL.md section 5.7](../../PROTOCOL.md#57-hybrid-session-protocols-0x04-and-0x05)). A restarted bot finds its handshake on chain and reuses it. A `0x05` message is read only under a handshake from the same sender.
- **The bot must publish its keys to be reachable.** Run `publish-keys` (step 4). Without its signed ML-KEM-768 key on chain, nobody can open a hybrid session with it.
- **The other person needs a hybrid client.** To get answers, a person needs a client that sends hybrid messages and has published their X25519 encryption key and a signed ML-KEM-768 key.
- **No fallback.** When the other address lacks either key, `AgentCore.send_direct` and `AgentCore.reply` raise `HybridKeyNotFoundError` (a `LookupError`) and pay nothing, so the `send` and `reply` commands fail too. Nothing falls back to a classical note.
