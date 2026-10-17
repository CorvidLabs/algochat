# Changelog

## [0.8.0] - 2026-10-16

### Features

- Public note-capacity release after 0.6.1. Protocol revision 1.2.1 allows a
  4096-byte Algorand note. Standard plaintext max is 3954 bytes and PSK
  plaintext max is 3950 bytes (note size, minus the header, minus the 16-byte
  tag). A note of 1024 bytes or fewer keeps the previous fee: 1000 for
  Ed25519 and 3000 for Falcon-1024 when minFee is 1000. Larger notes add the
  consensus surcharge on that scheme fee. One byte past the plaintext max
  fails before a transaction is sent.

## [0.6.1] - 2026-09-21

### Security

- Discovery prefers signed key announcements and runs `verifyEncryptionKey`;
  forged signed announcements are rejected (#229 companion for raven).
- Ed25519 `publishKey` emits a 96-byte signed announcement (X25519 || Ed25519 sig).
- ChaCha20-Poly1305 binds the fixed envelope header as AAD for `VERSION_AAD`
  (0x02) standard and PSK envelopes; legacy `VERSION` (0x01) still decrypts (#232).
- Header single-byte mutation fuzz coverage for standard envelopes.
- Regenerate conformance vectors for `VERSION_AAD` (0x02) and AAD-bound
  envelopes; recipient-path tamper of `encryptedSenderKey` now fails closed.

## [v0.6.0] - 2026-09-20

### CI

- publish to GitHub Packages via GITHUB_TOKEN (no external npm token) (#30) (01dd5de)

### Changes

- pin Trust 1.2.0 and SpecSync 6.0.0 (#48) (301405e)
- standardize GitHub Actions (path filters, concurrency, runners) (#28) (e556468)

### Chores

- pin Trust 1.2.1 (#52) (24ee2da)
- adopt SpecSync 6 workflow v2 (#51) (75fe249)
- archive remove-raven-mailbox SpecSync change (#50) (715a910)
- archive Trust 1.2.0-rc.1 pin change (b53c28e)
- pin Trust 1.2.0-rc.1 (SpecSync 6.0.0-rc.9) (#46) (546ad4f)
- archive CHG-0007 Falcon ChatAccounts (d8fe232)
- archive integrated SpecSync change CHG-0005 (#40) (ac0bd23)
- archive integrated SpecSync change CHG-0004 (#38) (3b2ac4a)
- archive integrated SpecSync change CHG-0003 (#36) (885496a)
- archive integrated SpecSync changes CHG-0001, CHG-0002 (#35) (4d6d764)
- add fledge.toml for dev lifecycle management (#27) (a6169eb)

### Features

- Falcon-1024 default for new ChatAccounts (#45) (a7e4466)
- opt-in MailboxRouterTransport (raven mailbox protocol) (#41) (ca0ff09)

### Fixes

- state plainly that the protocol has no forward secrecy (#44) (46ea343)
- NodeNext module resolution — make dist importable by raw Node.js ESM (#34) (66c188d)
- scope publish version check to @corvidlabs/ts-algochat (#29) (b1b015c)

### Other

- specsync: archive CHG-0006 (MailboxRouterTransport, integrated in #41) (#42) (6a875de)
- conformance: install CI workflow (CHG-0005) (#39) (e3b6041)
- conformance: install CI workflow (CHG-0004) (#37) (3d93aae)
- conformance: test-vector suite v1 (#32) (48b734a)
- Adopt SpecSync 5 and Trust 1 (#31) (a7dfde3)

### Removals

- Raven mailbox router; keep Falcon encrypted notes (#49) (01efb62)

