# Lesson bundle — a-new-conversation-starts-as-a-hybrid-session-everyday-notes-and-extra-lock-stay-available-and-are-not-the-default

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: A new conversation starts as a hybrid session. Everyday notes and extra lock stay available and are not the default.
- **Kind**: Documentation
- **Specs**: protocol
- **Paths**: PROTOCOL.md, SECURITY.md, README.md, specs/protocol/protocol.spec.md, specs/protocol/requirements.md, hi/base.md
- **Acceptance**: PROTOCOL.md section 5.4.3 says a new conversation should start with hybrid 0x04 and 0x05. A room uses that session for 0x06 and 0x07. Everyday 0x01 and extra lock 0x02 stay assigned, and extra lock is not the default. This version does not stack extra lock on hybrid and does not claim PQ level 2, 4, or 5 for a message.

## Evidence

- Verification commit: `b5e3df6d7c5f4f23b3995018e102bbb9aaefbc6b`
- Base commit: `0066fd38457314f7b740d208229815d74a8411ab`
- Verified by: `specsync check --spec protocol`

## From the change's context.md

# Context

Human Intent BASE-1 through BASE-5 name hybrid `0x04` and `0x05` as the base for a new chat. Groups already wrap the room key in that session. Everyday `0x01` and extra lock `0x02` stay on the wire. Raven still defaults a new chat to extra lock. This change records the protocol default. It does not change bytes and it does not change Raven.

## From the change's design.md

# Design

The default is a sentence in section 5.4.3, after the level tables. It uses SHOULD for a new conversation and MAY for everyday and extra lock. It does not add a protocol id, a header, or a PQ level. Readers keep accepting `0x01` and `0x02`.

## From the change's testing.md

# Testing

`specsync check --spec protocol` reads PROTOCOL.md section 5.4.3. No library test changes, because the wire bytes are unchanged.

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| REQ-protocol-7 | PROTOCOL.md section 5.4.3 states the hybrid default, the room wrap, and that everyday and extra lock stay assigned. |

## Where these lessons go

- `specs/protocol/context.md`
