---
change: raise-the-algochat-note-ceiling-to-4096-bytes-and-price-allowed-notes-with-the-consensus-surcharge-on-one-minimum-fee
artifact: requirements
---

# Requirements

- `MaxNoteSize` is 4096 and `MaxPayloadSize` is 3954. `HeaderSize` stays 126 and `TagSize` stays 16.
- An 882-byte plaintext still encrypts and encodes to 1024 bytes.
- A 3954-byte plaintext encrypts and encodes to exactly 4096 bytes.
- One extra plaintext byte returns `ErrMessageTooLarge` before an envelope is returned.
- `PaymentFee` at minFee 1000 returns 1000, 1098, and 1308 for notes of 1024, 2000, and 4096 bytes.
- A negative length or a 4097-byte note returns `ErrNoteTooLarge`.
- The fee scheme is one minimum fee. Do not add a Falcon signer.
- Do not add a PSK envelope implementation.
