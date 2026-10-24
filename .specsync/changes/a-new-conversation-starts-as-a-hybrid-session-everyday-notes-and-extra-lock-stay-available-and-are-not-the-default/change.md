---
id: a-new-conversation-starts-as-a-hybrid-session-everyday-notes-and-extra-lock-stay-available-and-are-not-the-default
state: implementing
type: documentation
base_commit: 0066fd38457314f7b740d208229815d74a8411ab
---

# A new conversation starts as a hybrid session. Everyday notes and extra lock stay available and are not the default.

## Intent

A new conversation starts as a hybrid session. Everyday notes and extra lock stay available and are not the default.

## Affected Canonical Specs

- `protocol`

## Acceptance Criteria

- PROTOCOL.md section 5.4.3 says a new conversation should start with hybrid 0x04 and 0x05. A room uses that session for 0x06 and 0x07. Everyday 0x01 and extra lock 0x02 stay assigned, and extra lock is not the default. This version does not stack extra lock on hybrid and does not claim PQ level 2, 4, or 5 for a message.

## No-spec Rationale

Not applicable
