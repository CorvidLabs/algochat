---
id: 73-rust-creates-restores-and-validates-ed25519-algochat-accounts-from-the-same-algorand-25-word-phrase-as-typescript
state: approved
type: feature
base_commit: 6cfb970c9f7d2c326b5105698673b68afda430d6
---

# 73: Rust creates, restores and validates Ed25519 AlgoChat accounts from the same Algorand 25-word phrase as TypeScript, checked against TypeScript-generated phrase vectors, and rejects every phrase that is not exactly 25 lowercase wordlist words separated by single spaces with a valid checksum

## Intent

73: Rust creates, restores and validates Ed25519 AlgoChat accounts from the same Algorand 25-word phrase as TypeScript, checked against TypeScript-generated phrase vectors, and rejects every phrase that is not exactly 25 lowercase wordlist words separated by single spaces with a valid checksum

## Affected Canonical Specs

- `protocol`

## Acceptance Criteria

- A new TypeScript-generated vector ts/conformance/vectors/07-mnemonic-accounts.json (made with algosdk 3.7.0 and mnemonic.service.ts from fixed synthetic test-only entropy, never by Rust) lists, per phrase, the phrase, its 32-byte entropy, Ed25519 public key and Algorand address, X25519 public key and ML-KEM-768 encapsulation key, plus the SHA-256 of the 2048-word list, and negative cases with the expected verdict: 24 words, 26 words ending in the right checksum, a bad checksum word, nonzero padding bits, an unknown word, uppercase, leading/trailing/double spaces, tab and newline separators, four-letter prefixes and the empty string. bun conformance/tools/verify.mjs recomputes every positive with TypeScript and checks that TypeScript rejects every negative. Rust exposes validate_mnemonic, an Ed25519 restore from a phrase and create-random returning the phrase and account, matches every 07 positive exactly, rejects every 07 negative with an error, round-trips a freshly generated account through its phrase, and its conformance test also checks the 01 accounts[].mnemonic and accounts[].algorandAddress fields, so the #73 PENDING entries are gone. No test or log prints a phrase or secret, and the Rust account types do not Debug-print secrets.

## No-spec Rationale

Not applicable
