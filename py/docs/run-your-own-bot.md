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

```bash
algochat-agent --name helper address        # the address to send Algo to
algochat-agent funds                        # balance, cost of one reply, replies left
algochat-agent --name helper publish-keys   # once; skipped if already on chain
```

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
from algochat import AlgoChatConfig, HttpAlgodClient, HttpIndexerClient
from algochat.agent import AgentCore, BotCommand

algod = HttpAlgodClient("http://127.0.0.1:4001", "<algod token>")
indexer = HttpIndexerClient("http://127.0.0.1:8980", "<indexer token>")
core = await AgentCore.from_environment(
    AlgoChatConfig.localnet(), algod, indexer,
    name="helper",
    commands=[BotCommand("echo", "Repeat your text")],
)

def answer(message):
    return f"You said: {message.text}"  # return None to stay silent

await core.serve_rooms(answer)   # call on a timer; serve_direct does the same for one-to-one
```

**A webhook to your own service:**

```bash
algochat-agent --name helper serve --webhook http://localhost:8080/bot
```

Readable text only goes to this machine, or over https to another address with a shared secret. See the [Python README](../README.md#mcp-server-command-line-and-webhook) for the request format and signature check.

**An MCP client:** run `algochat-agent --name helper mcp`. It has a tool for every command above.

Whichever you pick, the bot follows the room's mode and rate limit, never answers another bot, and never answers the same message twice, also after a restart.
