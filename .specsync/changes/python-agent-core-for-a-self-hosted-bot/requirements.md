---
change: python-agent-core-for-a-self-hosted-bot
artifact: requirements
---

# Requirements

- AGENT-2, wallet half only: `AgentAccount.from_mnemonic` builds the bot's own Algorand (Ed25519) account from its 25-word mnemonic. The seed and address match `py-algorand-sdk`, including its unique word prefixes of 4 or more letters. A malformed mnemonic is refused without echoing it, and no traceback frame keeps the phrase or the seed in a local. An account's address and public key always match its seed.
- AGENT-2 is not fully met by this change. Its other half, the bot's own Raven identity NFT (and that the NFT does not make it a bot), is out of scope here. See "AGENT-2 identity NFT" in plan.md for which issue owns it.
- AGENT-4: the mnemonic is read only from `ALGOCHAT_AGENT_MNEMONIC`, from the file named by `ALGOCHAT_AGENT_MNEMONIC_FILE`, or from an explicit path. Both variables set is refused, even with a path. A file must be owner-only, owned by the bot's user or root, and free of POSIX ACLs, checked on the open descriptor before it is read. The repository ignores `*.mnemonic` and `.algochat-agent/`.
- AGENT-1, AGENT-1.b, AGENT-1.d: `AgentCore` is one Python object, run by its operator on operator-supplied algod and indexer clients, with an `AlgoChat` client bound to the bot's own address.
- Unit tests use mocks and public non-secret seeds and call no network. Localnet integration tests run only against a local Algorand network (algod, kmd and indexer on this machine), which algochat#43 allows, with throwaway accounts funded from that network's own KMD wallet. Mock plus localnet only: no test uses TestNet, MainNet, or real funds.
