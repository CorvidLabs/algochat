---
change: specify-the-group-mailbox-membership-wrap-and-one-message-note
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| REQ-protocol-4 | PROTOCOL.md section 5.8 states the 78-byte 0x06 header, the 101-byte membership plaintext, the 54-byte 0x07 header, the HKDF info `AlgoChat-group-v1`, and the rule that an everyday wrap is not legal. Section 5.8.4 withholds the parity claim. |

No library test is evidence for this change. The LocalNet matrix is the next change.
