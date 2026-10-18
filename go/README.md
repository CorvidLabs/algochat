# Go

Go implementation of the AlgoChat protocol. The source lives in this repository. PQ levels are integers 0 through 5 in [PROTOCOL.md section 5.4.2](../PROTOCOL.md#542-pq-levels). Everyday `0x01` is level 0, Extra lock `0x02` is level 1, and hybrid `0x04` and `0x05` are level 3. `0x03` is not assigned.

## Status

The envelope, handshake, and announcement primitives are here. A high-level client is not.

## Version and requirements

- Module: `github.com/CorvidLabs/algochat/go` **0.2.0**, implementing protocol **1.3.0**.
- Module release tag: **`go/v0.2.0`**; consumers request **`v0.2.0`**. The root **`v1.3.0`** tag selects the protocol/Swift release, not this nested module.
- [Declared toolchain](go.mod): Go **1.25.0+**. Qualification is configured for **Go 1.25**, with the exact patch version recorded in receipts. See [all language versions and qualification limits](../docs/RELEASE.md#language-and-runtime-versions).

## Cryptography

Messages are encrypted using an X25519 key exchange with ChaCha20-Poly1305
authenticated encryption. Encryption keys are derived from an Algorand account seed.

Standard encryption writes envelope version `0x01`; standard decoding and PSK decryption also accept header-authenticated version `0x02`. Standard plaintext is limited to 3954 bytes (a 126-byte header plus 16-byte tag), and PSK plaintext to 3950 bytes (a 130-byte header plus tag).

`EncryptPSKMessage` and `DecryptPSKMessage` implement protocol `0x02` with a counter-derived PSK. They do not maintain receive/replay state; callers must validate counters and persist their own replay policy.

`DeriveMLKEM768`, `InitiatePQHandshake`, `AcceptPQHandshake`, `OpenPQHandshakeAsSender`, `EncryptPQMessage` and `DecryptPQMessage` provide low-level X25519 + ML-KEM-768 sessions. The handshake is 2366 bytes (protocol `0x04`); session data uses protocol `0x05`, a 78-byte authenticated header and a 4002-byte plaintext maximum. `ParsePQAnnouncement` reads unsigned or Ed25519-signed `ACPQ` encapsulation-key notes. Applications arrange transport, key trust, session storage and replay handling. There is no Falcon transaction signer or high-level send/discovery client.

See the [canonical specification](specs/algochat/algochat.spec.md), [shared protocol](../PROTOCOL.md) and [implementation gaps](../docs/ACCURACY.md).

## Install

```sh
go get github.com/CorvidLabs/algochat/go@v0.2.0
```

## License

See [LICENSE](LICENSE).
