# Go

Go implementation of the AlgoChat protocol. The source lives in this repository.

## Status

The envelope, handshake, and announcement primitives are here. A high-level client is not.

## Version and requirements

- Module: `github.com/CorvidLabs/algochat/go` **0.2.0**, implementing protocol **1.3.0**.
- Module release tag: **`go/v0.2.0`**; consumers request **`v0.2.0`**. The root **`v1.3.0`** tag selects the protocol/Swift release, not this nested module.
- [Declared toolchain](go.mod): Go **1.25.0+**. Qualification is configured for **Go 1.25**, with the exact patch version recorded in receipts. See [all language versions and qualification limits](../docs/RELEASE.md#language-and-runtime-versions).

## Cryptography

Messages are encrypted using an X25519 key exchange with ChaCha20-Poly1305
authenticated encryption. Encryption keys are derived from an Algorand account seed.

## Install

```sh
go get github.com/CorvidLabs/algochat/go@v0.2.0
```

## License

See [LICENSE](LICENSE).
