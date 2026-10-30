# Running an AlgoChat bot: operator guide

This guide is for the person who runs a bot built on `algochat.agent`. In the
first version you host the bot yourself (AGENT-1.d), you fund its wallet, and
that wallet pays every fee the bot spends (AGENT-3). The bot sends no payments
or tips (AGENT-9).

## 1. Host it yourself

The bot is a process on a machine you control: the `algochat-agent` command,
its MCP server (`algochat-agent mcp`), or your own Python code on `AgentCore`.
There is no hosted service and no default network. You point it at an algod
and an indexer you choose:

```bash
export ALGOCHAT_ALGOD_URL=http://localhost:4001
export ALGOCHAT_ALGOD_TOKEN=...      # if your node needs one
export ALGOCHAT_INDEXER_URL=http://localhost:8980
export ALGOCHAT_INDEXER_TOKEN=...    # if your indexer needs one
```

## 2. Give it its own account and keep the key on that machine

The bot has its own Algorand account (AGENT-2), never yours. Its 25 words live
on the machine that runs it, in exactly one of (AGENT-4):

- `ALGOCHAT_AGENT_MNEMONIC`: the 25 words in the environment, or
- `ALGOCHAT_AGENT_MNEMONIC_FILE`: the path of a local file that only you can read.

```bash
mkdir -p ~/.algochat-agent && chmod 700 ~/.algochat-agent
# write the 25 words into the file with your editor, then:
chmod 600 ~/.algochat-agent/bot.mnemonic
export ALGOCHAT_AGENT_MNEMONIC_FILE=~/.algochat-agent/bot.mnemonic
```

The bot refuses a file that your group or other users can read, and refuses to
choose when both variables are set. Never commit the words: add `*.mnemonic`
and `.algochat-agent/` to your bot project's `.gitignore` (this repository
already ignores them). No command prints them.

## 3. Fund the wallet

Send Algo to the bot's address (`algochat-agent address`). The account must
keep Algorand's minimum balance; only the amount above it pays fees. Every
message the bot sends is a zero-amount payment that carries the encrypted note,
so its only spending is the fee on each one.

Check the wallet at any time:

```bash
algochat-agent funds
```

```json
{"balance": 1500000, "min_balance": 100000, "spendable": 1400000,
 "fee_per_reply": 1308, "threshold": 130800, "replies_left": 1070, "low": false}
```

`fee_per_reply` is what the bot counts for one reply: the fee of the largest
note at the network's minimum fee (1308 microAlgos at a 1000 microAlgo minimum
fee). Most replies cost less, so the estimate errs toward warning early. The
same numbers are the MCP tool `funds` and `AgentCore.check_funds()`.

## 4. The out-of-funds warning

When fewer than about 100 replies' worth of fees remain (`spendable` below
`threshold`, 0.1308 Algo at the minimum fee), the bot posts once, in the room
where its post took it to that level (AGENT-3.a). That post can be a reply, its
command list or its leave notice (the warning then goes in before it stops
posting in that room):

> I'm running low on funds for fees. My operator needs to refill my wallet.

It does not post that again, in that room or any other, until you refill the
wallet. The next time it runs low after a refill it warns once more, in the
room where that happens. A restarted bot or a new `algochat-agent` run that is
still low finds its earlier notice on chain and stays quiet. One-to-one replies
spend fees too, but the warning only goes in a room. `reply-room` and `serve`
report the notice's transaction id as `low_funds_notice`; `declare-commands`
and `leave-room` list it among their `txids`.

To refill, send Algo to the bot's address again so `spendable` is above
`threshold`; `algochat-agent funds` then shows `"low": false`. If the wallet
runs out entirely, sends fail and the bot reports the error for that message
instead of replying.

## 5. Give the bot its Raven identity

The bot can have its own Raven identity NFT, the same kind a person makes in
Raven, so Raven shows its picture and name like anyone else's (AGENT-2). You
make it from the command line or MCP; the bot's own wallet pays and its key
signs it on this machine:

```bash
algochat-agent --name helper make-identity --emoji 🦊      # one emoji
algochat-agent --name helper make-identity --nft 123456    # an NFT the bot's wallet holds
algochat-agent --name helper identity                      # show it, as Raven reads it
```

The MCP tools are `make_identity` (`emoji` or `nft`) and `identity`.

- The picture is one emoji or an NFT the bot's wallet holds. There are no
  custom pictures: a link, text, several emoji, an NFT it does not hold or a
  token that is not a picture NFT is refused and nothing is sent. To show an
  NFT, send it to the bot's address first (the bot must opt in to it, which
  your wallet tool can do with the bot's key on this machine).
- The public name is the bot's `--name`, cut to 32 bytes. Run without
  `--name`, it keeps the name already on the identity.
- A bot has one identity. Running `make-identity` again updates the same
  asset. With neither `--emoji` nor `--nft` it keeps the picture and refreshes
  the name.
- The first time costs the fee plus 0.1 Algo, which the asset keeps locked in
  the wallet as minimum balance; updates cost only the fee. `funds` already
  leaves the locked amount out.
- Having an identity never makes the bot, or anyone, a bot in a room. Only a
  room's owner or admin does that, when adding it. A bot without one works the
  same.

## 6. What the bot never does

- It never sends Algo, payments or tips to anyone (AGENT-9).
- It never sends its key anywhere, and never logs or prints it.
- It never makes itself a bot or an admin: a room owner or admin adds it and
  marks it as a bot (AGENT-7.a, AGENT-7.e).

## Testing your setup without real funds

Use a local network, never TestNet or MainNet, while you try things out.
`scripts/native-localnet.sh` runs a dev node, kmd and an indexer on this
machine; see `docs/localnet-testing.md`.
