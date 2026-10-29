---
id: python-bot-reads-one-to-one-messages-and-replies-by-itself
state: draft
type: feature
base_commit: 5b92d0a172670ff3fb87273b7db7681bdae6cdf5
---

# Python bot reads one-to-one messages and replies by itself

## Intent

Python bot reads one-to-one messages and replies by itself

## Affected Canonical Specs

- None

## Acceptance Criteria

- AGENT-5 in hi/agent.md, as scoped by algochat#44: the Python bot publishes its signed key, reads one-to-one messages to it across every indexer page, and replies by itself through the library's own payment path with a section 9.2 reply; a message is answered at most once, also after a restart; messages written by TypeScript, Go, Rust, Python and Kotlin are read on localnet, and every implementation including Swift (through a recorded-notes swift test on Linux) reads the bot's replies; unit tests use public non-secret seeds and no network; localnet tests use throwaway accounts funded only from the local KMD wallet.

## No-spec Rationale

The protocol spec and vectors do not change. Replies use the existing section 9.2 reply payload and 0x01 notes. This change adds library payments, HTTP clients and one-to-one bot methods, with the Python module specs under py/specs updated in place. Wire bytes are untouched.
