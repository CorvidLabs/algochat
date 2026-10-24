---
change: a-new-conversation-starts-as-a-hybrid-session-everyday-notes-and-extra-lock-stay-available-and-are-not-the-default
artifact: testing
---

# Testing

`specsync check --spec protocol` reads PROTOCOL.md section 5.4.3. No library test changes, because the wire bytes are unchanged.

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| REQ-protocol-7 | PROTOCOL.md section 5.4.3 states the hybrid default, the room wrap, and that everyday and extra lock stay assigned. |
