---
change: raise-the-algochat-note-ceiling-to-4096-bytes-and-price-allowed-notes-with-the-consensus-surcharge-on-one-minimum-fee
artifact: docs
---

# Docs

Update `doc.go` to protocol revision 1.2.1. State the 126-byte header, the 16-byte tag, the 3954-byte plaintext maximum, and the 4096-byte note limit. State that an 882-byte plaintext still encodes to 1024 bytes. Document `PaymentFee` examples at minFee 1000: 1024 bytes cost 1000, 2000 bytes cost 1098, and 4096 bytes cost 1308. Say that PSK envelopes and Falcon signing are not implemented.

Update the canonical spec purpose, public API, invariants, examples, errors, changelog, and `REQ-algochat-001`. Add `REQ-algochat-008` for the note fee.
