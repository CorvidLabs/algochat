---
spec: agent.spec.md
---

## Requirements

### REQ-agent-001

The Python agent core SHALL build a bot's own Algorand account from its 25-word mnemonic (the wallet half of AGENT-2; the Raven identity NFT half is out of scope for this module).

Acceptance Criteria

- A known mnemonic decodes to its seed and Algorand address, matching `py-algorand-sdk`, with full words or `py-algorand-sdk`'s unique word prefixes of 4 or more letters.
- Malformed mnemonics are rejected without echoing the phrase, and no traceback frame keeps the phrase or seed in a local.
- An account's address and public key always match its seed; the seed is not a dataclass field and cannot be pickled.

### REQ-agent-002

The Python agent core SHALL load the bot's mnemonic only from an environment variable or a local file on the bot host (AGENT-4).

Acceptance Criteria

- The mnemonic loads from `ALGOCHAT_AGENT_MNEMONIC`, from the file named by `ALGOCHAT_AGENT_MNEMONIC_FILE`, or from an explicit path.
- A file open to group or others, owned by another user, or carrying a POSIX ACL is refused before it is read; the check and the read use the same open descriptor.
- A missing source and two sources (even with an explicit path) are refused.
- The repository ignores `*.mnemonic` and `.algochat-agent/`.

### REQ-agent-003

The Python agent core SHALL be one self-hosted object that later adapters build on (AGENT-1, AGENT-1.b, AGENT-1.d).

Acceptance Criteria

- `AgentCore` binds an `AlgoChat` client to the bot's own address on operator-supplied clients and refuses a client for another address.
