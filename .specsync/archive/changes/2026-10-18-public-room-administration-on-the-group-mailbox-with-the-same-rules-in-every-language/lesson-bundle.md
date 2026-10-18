# Lesson bundle — public-room-administration-on-the-group-mailbox-with-the-same-rules-in-every-language

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Public room administration on the group mailbox, with the same rules in every language
- **Kind**: Feature
- **Specs**: protocol
- **Paths**: PROTOCOL.md, TEST-VECTORS.md, vectors/group-admin-v1.json, .github/workflows/spec-sync.yml
- **Acceptance**: Every library reduces vectors/group-admin-v1.json to the same accepted and rejected room states, seals the same 227-byte action-5 delivery, and still opens vectors/group-v1.json. A LocalNet invite-only room and an ask-to-join room each post one 0x07 payment. Tag v1.3.0 still does not include 0x03, 0x06, or 0x07.

## Evidence

- Verification commit: `27ffaf2fb1441e662b8021242b27ff19df558872`
- Base commit: `d71341d1cc6e2f43fd49ddb47d902a0741048d11`
- Verified by: `specsync check --spec protocol`

## From the change's context.md

# Context

People want rooms they can own: a small invite-only team and a larger room people ask to join. Anyone can create either kind. A room does not come with an NFT. A payment signature is not a promotion, and the mailbox spending key is not ownership.

The rules were captured as Human Intent GROUP-1 through GROUP-7, and REPO-2 was updated in place so protocol 0x03 is the public room administration record. Tag v1.3.0 still does not include 0x03, 0x06, or 0x07.

Legacy 0x06 actions 1–4 and 0x07 notes stay readable and do not grow an owner. A join request does not advance the room head, so many people can ask against one roster. A request that names a roster that is no longer current is rejected.

## From the change's design.md

# Design

An administration record is a 0-microAlgo payment to the room mailbox. The transaction sender is the actor. The note carries the parent transaction id, room id, mailbox, epoch, operation, display name, joining rule, owner, admins, members, and subject. Pending requests are derived and are not stored in the note.

Chain order is confirmed round, then intra-round offset, then transaction id bytes. Every operation except a join request must name the current head. Two records that name the same parent have one winner.

Action 5 plaintext is 133 bytes: action, epoch, room id, mailbox, room key, and the administration transaction id. The note is 227 bytes. Create does not authorize a delivery. Add and accept authorize delivery only to the subject. Remove withholds the new key from the subject. Rekey and transfer deliver to every remaining member.

## From the change's testing.md

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

## Where these lessons go

- `specs/protocol/context.md`
