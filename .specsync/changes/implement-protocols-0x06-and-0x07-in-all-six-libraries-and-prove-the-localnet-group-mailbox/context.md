---
change: implement-protocols-0x06-and-0x07-in-all-six-libraries-and-prove-the-localnet-group-mailbox
artifact: context
---

# Context

Section 5.8 already freezes protocols 0x06 and 0x07. No library writes them yet, and parity is not claimed. Raven still fans a group out as separate 1:1 notes. This change is the library and LocalNet follow-through, in the feat/group-mailbox worktree, so it does not touch the checkout on test/local-parity-evidence.

The wrap stays the hybrid session from 0x04. There is one membership layout. Identifier 0x03 stays unassigned. A group whose members have no hybrid keys is not in this change.
