---
change: python-bot-adapters-mcp-server-command-line-tool-and-webhook-bridge-on-the-shared-core
artifact: research
---

# Research

hi/agent.md AGENT-1 family: the three adapters on one shared core, Python first, readable webhook text only to this machine or authenticated HTTPS, a tool per CLI command. MCP specification (modelcontextprotocol.io, revisions 2024-11-05 to 2025-06-18): stdio transport is newline-delimited JSON-RPC 2.0; `initialize` returns `protocolVersion`, `capabilities.tools` and `serverInfo`; `tools/list` returns `name`, `description` and `inputSchema`; `tools/call` returns `content` and `isError`. Common webhook signing practice (an HMAC-SHA256 over a timestamp and the raw body, checked in constant time with a replay window) shaped the signature. The Python standard library (`urllib.request`, `ssl.create_default_context`, `hmac.compare_digest`) covers the bridge, so `cryptography` stays the only runtime dependency.
