---
change: raise-the-algochat-note-ceiling-to-4096-bytes-and-price-allowed-notes-with-the-consensus-surcharge-on-one-minimum-fee
artifact: plan
---

# Plan

1. Set the note limit and standard plaintext maximum in `models.go`.
2. Add `PaymentFee` and `ErrNoteTooLarge` in `blockchain.go`.
3. Document protocol revision 1.2.1, the 4096-byte note, and the fee examples in `doc.go`.
4. Test the 882-byte note, the 4096-byte max note, the extra plaintext byte, and the fee examples.
5. Update the canonical AlgoChat spec and requirements so exported API coverage stays complete.
