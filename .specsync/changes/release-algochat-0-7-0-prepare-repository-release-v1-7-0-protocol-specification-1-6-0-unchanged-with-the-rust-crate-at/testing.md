---
change: release-algochat-0-7-0-prepare-repository-release-v1-7-0-protocol-specification-1-6-0-unchanged-with-the-rust-crate-at
artifact: testing
---

# Testing

- Release unit tests: `cd scripts/release && python3 -m unittest test_release`.
- In a clean committed clone of the candidate: `qualify.py rs`, `ts`, `py`, `go`, and `kt` and `swift` where this machine has the toolchains. Exit 0 is required, along with the receipts and the crate sha256.
- Hosted: `release-qualification.yml` on the candidate head. All seven lanes and the aggregate must be green.
- Consumer: a fresh Cargo project outside the repository depends on the extracted `algochat-0.7.0.crate`.
  - It runs `restore_ed25519_account` on a synthetic `07-mnemonic-accounts` phrase, `encode_pq_announcement` and `pq_announcement_signing_input`. It prints no phrase or secret.
  - It is built once alone and once with `algonaut` 0.9.0 (rustls TLS), with `cargo tree` showing the resolved `ctutils`, `reqwest` and `rustls`.
- `fledge lanes run verify`, `specsync check`, `hi check` and `fledge trust verify`.
- `provenance.py v1.6.2 <candidate>`: the result is recorded, and a failure is reported, not hidden.
