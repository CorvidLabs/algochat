---
id: raise-the-algochat-note-ceiling-to-4096-bytes-and-price-allowed-notes-with-the-consensus-surcharge-on-one-minimum-fee
state: implementing
type: feature
base_commit: b20f439db6b081ff7d9ded969e92d39cc3309134
---

# Raise the AlgoChat note ceiling to 4096 bytes and price allowed notes with the consensus surcharge on one minimum fee

## Intent

Raise the AlgoChat note ceiling to 4096 bytes and price allowed notes with the consensus surcharge on one minimum fee

## Affected Canonical Specs

- `algochat`

## Acceptance Criteria

- An 882-byte plaintext still encrypts and encodes to 1024 bytes. A 3954-byte plaintext encrypts and encodes to exactly 4096 bytes. One extra plaintext byte returns ErrMessageTooLarge before an envelope is returned. PaymentFee at minFee 1000 returns 1000 for 1024 bytes, 1098 for 2000 bytes, and 1308 for 4096 bytes, and rejects a 4097-byte note. Race tests pass and SpecSync stays at 100 percent coverage.

## No-spec Rationale

Not applicable
