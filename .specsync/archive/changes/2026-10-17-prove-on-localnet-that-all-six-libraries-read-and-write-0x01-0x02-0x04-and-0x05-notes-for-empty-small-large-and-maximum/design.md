---
change: prove-on-localnet-that-all-six-libraries-read-and-write-0x01-0x02-0x04-and-0x05-notes-for-empty-small-large-and-maximum
artifact: design
---

# Design

Version `0x02` for protocol `0x01` binds the 126-byte header as payload associated data: version, protocol, sender X25519, ephemeral X25519, nonce, wrapped sender key. The sender-key wrap uses empty associated data. Protocol `0x02` does the same with the 130-byte header, which inserts the 4-byte big-endian ratchet counter after the protocol byte.

Version `0x01` keeps empty associated data for both operations. Decoders accept both versions. A version `0x02` note must fail if the header is rewritten and decrypted with empty associated data.

Rust's shorter v2 prefix is replaced by this TypeScript layout. Go gains encode, decode, encrypt, and decrypt for Extra lock, including the two-level ratchet used by the other libraries.

The LocalNet driver submits each note and passes only the confirmed bytes to every reader.
