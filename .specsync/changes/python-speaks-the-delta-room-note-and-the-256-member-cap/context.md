---
change: python-speaks-the-delta-room-note-and-the-256-member-cap
artifact: context
---

# Context

The protocol change already records one added or removed person per room note, a 256 member cap, and a channel as another room owned by the group owner. That contract is the base of this branch. Python still had to speak the same bytes.

This change is the Python implementation of that contract. It does not add a second note layout. PROTOCOL.md, the canonical protocol spec, and the frozen vectors stay as the base left them.

The cross-library tool glue that passes a parent room into the local test adapter is not part of this change. It stays uncommitted while review of the joint run continues.
