---
change: CHG-0003-correct-and-complete-the-go-algochat-canonical-contract-for-full-implementation
artifact: testing
---

# Testing

- `specsync check --strict --force --require-coverage 100`
- `specsync agents status` with Claude, Cursor, Codex, and Gemini installed
- `fledge lanes run verify`, which runs `go build ./...`, `go vet ./...`, and uncached `go test -v -race -count=1 ./...`
- `fledge trust doctor` and `fledge trust verify`
- Hosted Go 1.22, 1.23, and 1.24 jobs, Trust, and CodeQL checks

Requirement evidence comes from the existing focused suites: cryptography and replies in `crypto_test.go`; envelope validation in `envelope_test.go`; signatures in `signature_test.go`; account construction in `blockchain_test.go`; conversation semantics in `models_test.go`; queue transitions in `queue_test.go`; and message/key/cache behavior in `storage_test.go`.

- REQ-algochat-001: `go test -v -race -count=1 ./...` runs key derivation, randomized encryption, size boundary, wrong-key, reply, key-publish, and sender/recipient round-trip tests.
- REQ-algochat-002: `go test -v -race -count=1 ./...` runs valid/mismatched signature, invalid-length, and deterministic fingerprint tests.
- REQ-algochat-003: `go test -v -race -count=1 ./...` runs queue capacity/transitions/retry/purge tests and all message, private-key, and expiring public-key storage tests.
- REQ-algochat-004: `fledge lanes run verify` runs the blocking build, vet, and complete race suite; hosted checks exercise the preserved Go compatibility matrix and Trust gate.
- REQ-algochat-005: `go test -v -race -count=1 ./...` runs envelope layout, round-trip, minimum-size, version, protocol, header recognition, and encoded-size tests.
- REQ-algochat-006: `go test -v -race -count=1 ./...` runs conversation construction, deduplication, ordering, lookup, filtering, highest-round, clear, and send-option tests.
- REQ-algochat-007: `go test -v -race -count=1 ./...` runs seed, secret-key, deterministic, and end-to-end account-construction tests.
