---
change: specify-the-group-mailbox-membership-wrap-and-one-message-note
artifact: plan
---

# Plan

## Approach

Freeze the group wire in PROTOCOL.md before any library writes it. One mailbox per group. One hybrid-session note per member when the key changes. One mailbox note per message.

## Out of scope

The six library implementations, the LocalNet run, and the parity claim. Those are the next change, on this branch, after this spec is approved. Identifier 0x03 stays unassigned. Raven keeps its fan-out until the libraries ship.

## Steps

1. Add 0x06 and 0x07 to the protocol identifier table as specified, not yet parity.
2. Write section 5.8 with the byte layouts, the HKDF, and the PQ level 3 rule.
3. Record REQ-protocol-4.
4. Stop before library code so the wire can be reviewed once.

## Risks

Two layouts for 0x06 would split the implementations. This version has one layout, the hybrid header. A group whose members have no hybrid keys is not supported yet.

## Constraints consulted

Cryptography of the wrap is the existing hybrid session. The group message is ChaCha20-Poly1305 under a key delivered at PQ level 3. No new KEM.
