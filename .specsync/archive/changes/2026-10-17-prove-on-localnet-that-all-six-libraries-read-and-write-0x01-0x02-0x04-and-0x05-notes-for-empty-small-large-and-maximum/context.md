---
change: prove-on-localnet-that-all-six-libraries-read-and-write-0x01-0x02-0x04-and-0x05-notes-for-empty-small-large-and-maximum
artifact: context
---

# Context

The 6x6 LocalNet mesh only sent one small `0x05` body per library. It did not cover `0x01`, `0x02`, empty notes, large notes, maximum notes, or several messages in one exchange.

TypeScript's default everyday and Extra lock notes use version byte `0x02`. The payload AEAD binds the full fixed header, including the wrapped sender key. The sender-key wrap itself has empty associated data. Rust's `encrypt_message_v2` binds a shorter prefix on both AEAD operations, so it does not open a TypeScript note. Python, Go, Kotlin, and Swift accept only version `0x01`. Go does not implement Extra lock.

Identifier `0x03` stays unassigned. Do not put Raven's private sender authentication into this repository.
