---
change: raise-the-algochat-note-ceiling-to-4096-bytes-and-price-allowed-notes-with-the-consensus-surcharge-on-one-minimum-fee
artifact: tasks
---

# Tasks

- [x] Raise `MaxNoteSize` to 4096 and `MaxPayloadSize` to 3954.
- [x] Price allowed notes with one minimum fee plus the consensus surcharge.
- [x] Keep 882-byte messages successful and reject one byte past the new maximum before an envelope is returned.
- [x] Document the ceiling and fee examples in `doc.go` and the canonical spec.
- [x] Leave the module path, envelope version byte, and package tag unchanged.
