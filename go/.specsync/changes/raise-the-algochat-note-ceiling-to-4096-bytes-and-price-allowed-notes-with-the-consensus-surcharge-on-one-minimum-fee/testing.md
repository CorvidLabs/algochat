---
change: raise-the-algochat-note-ceiling-to-4096-bytes-and-price-allowed-notes-with-the-consensus-surcharge-on-one-minimum-fee
artifact: testing
---

# Testing

- `TestLegacy882ByteMessage` encrypts 882 bytes and expects a 1024-byte note.
- `TestMaxPlaintextEncodesToNoteLimit` encrypts 3954 bytes and expects a 4096-byte note.
- `TestEncryptMessageTooLarge` expects `ErrMessageTooLarge` for one byte past the maximum.
- `TestPaymentFeeNoteSurcharge` expects minFee 1000 to price 1024 as 1000, 2000 as 1098, and 4096 as 1308, and expects `ErrNoteTooLarge` for 4097.
- Run `fledge lanes run verify` (`go build`, `go vet`, and `go test -v -race -count=1 ./...`).

## Requirement evidence

| Requirement | Evidence |
|-------------|----------|
| REQ-algochat-001 | `TestLegacy882ByteMessage`, `TestMaxPlaintextEncodesToNoteLimit`, and `TestEncryptMessageTooLarge` in `crypto_test.go`, plus the existing encrypt and decrypt race suite |
| REQ-algochat-008 | `TestPaymentFeeNoteSurcharge` in `blockchain_test.go` checks minFee 1000 for 1024, 2000, and 4096 bytes and rejects 4097 |
