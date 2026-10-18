---
change: specify-the-group-mailbox-membership-wrap-and-one-message-note
artifact: requirements
---

# Requirements

REQ-protocol-4 specifies protocols 0x06 and 0x07. Membership is a 78-byte hybrid header with a 101-byte plaintext. The message is a 54-byte header on the mailbox. The wrap is PQ level 3. Parity is not claimed until section 5.8.4 passes.
