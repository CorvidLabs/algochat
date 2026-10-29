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

### REQ-agent-004

The Python agent core SHALL read one-to-one messages to the bot and reply to them itself (AGENT-5).

Acceptance Criteria

- The bot publishes its signed encryption key once and reads messages to it, oldest first, across every indexer page.
- The bot replies with its own account through the library's payment path, as a section 9.2 reply naming the message.
- A message is answered at most once, also after a restart. Unreadable notes, its own notes and key publishes are skipped.
- Messages written by every implementation are read, and every implementation reads the bot's replies.

### REQ-agent-005

The Python agent core SHALL join the rooms and channels an owner or admin adds it to, read and reply there, and stop when it is removed or leaves (AGENT-6, AGENT-7, AGENT-7.c, AGENT-7.d, AGENT-7.g).

Acceptance Criteria

- The bot joins as soon as it is added and an authorized key reaches it, with no join request or accept. A key from an account that may not deliver it, or citing a record that does not add the bot, is ignored.
- The bot reads room and channel messages in chain order and replies in plain text with its own account. A message is answered at most once, also after a restart; messages from before it joined, from non-members and copied notes are not answered.
- After another member is removed the bot uses the new key. After the bot is removed it stops in the room and its channels; after it leaves it posts a notice and stays out, also after a restart.
- Messages written by every implementation are read, and every implementation reads the bot's room notes and reduces the room chains the same way.

### REQ-agent-006

The Python agent core SHALL reply in each room only as the room's record says: in the reply mode the owner or an admin chose, within the rate limit set there, never to another bot, and with its own declared slash commands (AGENT-8, AGENT-8.b, AGENT-8.c, AGENT-8.d, AGENT-8.e, AGENT-8.f).

Acceptance Criteria

- Mentions mode answers `@` and the bot's name or address, and replies to one of the bot's messages; every-message mode answers everything; commands mode answers only commands the bot declared.
- The bot posts at most the record's number of messages in that room in any window of its length, also across a restart; a message over the limit is skipped, not queued.
- The bot never answers an account a room's record marks as a bot, in rooms or one-to-one.
- A mode or limit change by the owner or an admin applies from the next message the bot handles.
- In commands mode the bot posts its command list once (again only when the list changes), as plain room text every implementation reads, and answers `/help` with it.
- A bot added as a plain member has no mode and does not reply.

### REQ-agent-007

The Python agent module SHALL let any agent plug in through an MCP server, a command-line tool or a webhook bridge, all on the shared core, with an MCP tool for every command-line command, and SHALL send readable message text through the webhook only to the same machine or to a secured address over authenticated HTTPS (AGENT-1.a, AGENT-1.c, AGENT-1.e).

Acceptance Criteria

- The CLI, the MCP server and the webhook bridge all run on `AgentCore`.
- Every CLI command has an MCP tool with the same parameters.
- The webhook bridge sends readable text only to a loopback address, or over HTTPS with a checked certificate and a signed request to another address.
- The adapters keep the reply policy and never print the bot's key.
