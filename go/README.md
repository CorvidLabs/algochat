# Go

Go implementation of the AlgoChat protocol. The source lives in this repository.

## Status

The envelope, handshake, and announcement primitives are here. A high-level client is not.

## Requirements

- Go 1.25+

## Cryptography

Messages are encrypted using an X25519 key exchange with ChaCha20-Poly1305
authenticated encryption. Encryption keys are derived from an Algorand account seed.

## Install

```sh
go get github.com/CorvidLabs/algochat/go@v0.2.0
```

## License

See [LICENSE](LICENSE).
