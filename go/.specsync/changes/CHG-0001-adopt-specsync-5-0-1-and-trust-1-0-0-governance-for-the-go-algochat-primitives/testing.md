---
change: CHG-0001-adopt-specsync-5-0-1-and-trust-1-0-0-governance-for-the-go-algochat-primitives
artifact: testing
---

# Testing

- REQ-algochat-001: run the envelope round-trip, size-limit, wrong-key, version, protocol, and tamper-sensitive encryption tests under the race detector.
- REQ-algochat-002: run signing, mismatched-key, invalid-length, and deterministic fingerprint tests under the race detector.
- REQ-algochat-003: run the queue, conversation, message-cache, key-storage, and public-key-cache behavior tests under the race detector.
- REQ-algochat-004: run the complete build, vet, and uncached race-test lane for every Go package.
- Strict SpecSync at advisory threshold zero
- All four agent integrations and Trust doctor
- `go build ./...`
- `go vet ./...`
- `go test -v -race -count=1 ./...`
- Existing hosted Go compatibility matrix
