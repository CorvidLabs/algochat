---
change: room-administration-reducer-and-action-5-key-delivery
artifact: design
---

# Design

`reduceAdmin` sorts by round, offset, then transaction id. A repeated transaction id is a replay. A join request does not advance `headTxId`. Other operations must name the current head. The note's public roster must equal the only legal next state. Pending requests stay off the wire.
