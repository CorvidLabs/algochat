---
change: number-the-pq-level-of-every-protocol-from-0-through-5
artifact: requirements
---

# Requirements

REQ-protocol-3 now uses integers 0 through 5. Everyday `0x01` is level 0. Extra lock `0x02` is level 1 while the 32-byte pre-shared key stays secret. Hybrid `0x04` and `0x05` are level 3. Levels 2, 4, and 5 are unused by a message protocol. A future group wrap is level 3 when hybrid keys exist, and at least level 1 otherwise.
