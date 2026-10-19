---
hi: 1
families: [REPO]
---

# Repository

## Intent

The public protocol and every language library live in one repository, so a wire-format change is one change.

## Criteria

- **REPO-1**  I can find the protocol and the TypeScript, Swift, Python, Rust, Kotlin, and Go libraries in one AlgoChat repository.

- **REPO-2**  The libraries speak envelope versions 0x01 and 0x02, and protocols 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, and 0x07. Protocol 0x03 is the public room administration record. Protocols 0x03, 0x06, and 0x07 are in tag v1.4.0. They were not in tag v1.3.0. The earlier note that postponed post-quantum envelopes is historical.
