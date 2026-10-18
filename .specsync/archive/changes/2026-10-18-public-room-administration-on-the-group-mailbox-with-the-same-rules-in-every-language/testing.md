---
change: public-room-administration-on-the-group-mailbox-with-the-same-rules-in-every-language
artifact: testing
---

# Testing

REQ-protocol-6 is evidenced by the shared vector and the library tests that load it:

- ts/src/pq/group-admin.test.ts
- go/group_admin_test.go
- py/tests/test_group_admin.py
- rs/src/group_admin.rs
- kt/src/test/kotlin/com/corvidlabs/algochat/GroupAdminTest.kt
- swift/Tests/AlgoChatTests/GroupAdminTests.swift

Each test checks drafts, draft errors, reductions, delivery authorization, who may post, and the 227-byte action-5 note. Legacy vectors/group-v1.json stays covered by the existing group tests.

ts/scripts/group-admin-localnet.ts posts one invite-only room, one ask-to-join room, one ordinary 0x07 in each, and one removal. All six pqcross tools reduce both chains.
