# go-algochat

🔐 Go implementation of the AlgoChat protocol for encrypted messaging on Algorand.

## Status

Early / in development. The core AlgoChat client (send, receive, key discovery) is
tracked in [issue #2](https://github.com/CorvidLabs/go-algochat/issues/2). The
cryptography, envelope, queue, storage, and model primitives are in place; the
high-level client is not yet implemented.

## Requirements

- Go 1.25+

## Cryptography

Messages are encrypted using an X25519 key exchange with ChaCha20-Poly1305
authenticated encryption. Encryption keys are derived from an Algorand account seed.

## Install

```sh
go get github.com/CorvidLabs/go-algochat
```

## License

See [LICENSE](LICENSE).
