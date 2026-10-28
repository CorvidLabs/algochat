---
spec: algochat.spec.md
---

## Tasks

- [x] Inventory every production and colocated test source in the package.
- [x] Define the standard encryption, signature, envelope, and discovery contract.
- [x] Define the PSK hybrid encryption, ratchet, replay, envelope, and exchange contract.
- [x] Define transaction, indexing, service, queue, cache, storage, model, and error behavior.
- [x] Tie each normative requirement to deterministic native verification.
- [x] Remove the raven mailbox router; keep encrypted payment notes and Falcon-1024 `pqsig` accounts.
- [x] Raise the note ceiling to 4096 bytes and price notes past 1024 bytes with the consensus surcharge (protocol 1.2.1).

- [x] Reconcile the source/export inventory with existing header-AAD and hybrid-session modules.
- [x] Document low-level/high-level API boundaries and link accepted implementation gaps.
- [x] Keep managed PSK counters inside uint32, exhaust without wrapping to 0, and reject illegal inputs before encoding.
- [x] Order indexer and Conversation history by round then intra-round offset, including a pagination boundary.
- [x] Reject note-facing opens longer than 4096 bytes before returning plaintext.
- [x] Correct the sendReply example and do not claim a `/node` file-storage export.
- [x] Draft delta room notes, keep full-list notes readable, cap a room at 256 members, and point a channel at its parent room.
