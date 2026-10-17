---
change: raise-the-algochat-note-ceiling-to-4096-bytes-and-price-allowed-notes-with-the-consensus-surcharge-on-one-minimum-fee
artifact: design
---

# Design

Keep the version-one envelope layout. Raise `MaxPayloadSize` to `MaxNoteSize - HeaderSize - TagSize` (3954). `EncryptMessage` already rejects plaintext above `MaxPayloadSize` before it builds an envelope, so one extra byte still fails before any note exists.

Add `PaymentFee(noteBytes, minFee)` on the blockchain boundary. For an allowed note:

    over = max(0, noteBytes - 1024)
    surcharge = (over * minFee + 9999) / 10000
    fee = minFee + surcharge

Reject a negative length or a note longer than 4096 with `ErrNoteTooLarge`. Do not invent Falcon signing and do not multiply the scheme component by three. Do not implement the reserved PSK protocol ID.
