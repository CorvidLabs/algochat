---
change: python-bot-adapters-mcp-server-command-line-tool-and-webhook-bridge-on-the-shared-core
artifact: context
---

# Context

hi/agent.md AGENT-1.a (MCP server, command-line tool or webhook bridge, all on the same shared core), AGENT-1.c (the webhook bridge may carry readable text only to the same machine or a secured address over authenticated HTTPS) and AGENT-1.e (in the first version, the MCP server has a tool for every command-line command), confirmed by Leif on 2026-10-29. algochat#47 adds them. This branch is stacked on feat/agent-reply-policy (draft PR algochat#54, algochat#46).

Before this change an operator could only use the bot by writing Python against `AgentCore`. There was no command, no MCP server and no way to hand messages to a service in another language.

Found while building this: a fresh `AgentCore` that answered one-to-one messages before reading its rooms did not yet know which senders were bots; that fix went into algochat#46 (49b8cc2) and this branch includes it. A fresh CLI process starts with no memory, so `reply` and `reply-room` read again to find the message by transaction id.

Out of scope: the out-of-funds warning and the operator guide (algochat#48), hosted bots (AGENT-1.d says self-hosted first), an MCP transport other than stdio, and posting unprompted in rooms through the adapters.
