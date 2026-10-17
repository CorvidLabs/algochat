---
change: prove-on-localnet-that-all-six-libraries-read-and-write-0x01-0x02-0x04-and-0x05-notes-for-empty-small-large-and-maximum
artifact: requirements
---

# Requirements

Each library writes notes that every other library opens after algod confirms the bytes.

- `0x01` and `0x02`: empty, small, large (plaintext that pushes the note past 1024 bytes), and maximum plaintext. Several messages in one exchange use ratchet counters 0, 1, and 2 for Extra lock.
- `0x04`: one 1278-byte handshake per writer.
- `0x05`: empty, small, large, and maximum plaintext on that handshake.
- Version `0x01` stays valid with empty associated data.
- Version `0x02` matches TypeScript: the payload binds the full fixed header, and the sender-key wrap does not.
- Go implements Extra lock well enough to write and open those notes.
- Identifier `0x03` is not used.
