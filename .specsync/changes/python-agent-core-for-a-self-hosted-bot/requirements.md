---
change: python-agent-core-for-a-self-hosted-bot
artifact: requirements
---

# Requirements

- AGENT-2: `AgentAccount.from_mnemonic` builds the bot's own Algorand account from its 25-word mnemonic. The seed and address match `py-algorand-sdk`. A malformed mnemonic is refused without echoing it.
- AGENT-4: the mnemonic is read only from `ALGOCHAT_AGENT_MNEMONIC`, from the file named by `ALGOCHAT_AGENT_MNEMONIC_FILE`, or from an explicit path. The repository ignores `*.mnemonic` and `.algochat-agent/`.
- AGENT-1, AGENT-1.b, AGENT-1.d: `AgentCore` is one Python object, run by its operator on operator-supplied algod and indexer clients, with an `AlgoChat` client bound to the bot's own address.
- Tests use mocks and public non-secret seeds. No test calls a network.
