# AlgoChat

Quantum-resistant end-to-end encrypted messaging through Algorand blockchain transactions. No servers. No accounts. No trust required.

## Overview

AlgoChat is an open protocol for secure messaging that uses Algorand transaction note fields as the transport layer. Messages are encrypted client-side using ML-KEM (Kyber) + X25519 hybrid key exchange, making them resistant to both classical and quantum attacks.

### Use Cases

- **Wallet-to-Wallet Messaging** - Direct encrypted communication between Algorand wallets
- **DAO Governance** - Secure governance discussions with cryptographic identity
- **P2P Trading** - Negotiate trades with immutable message history

## How It Works

1. **Key Exchange** - Sender fetches recipient's public key from an on-chain opt-in transaction
2. **Encrypt** - Message is encrypted client-side using hybrid ML-KEM + X25519
3. **Send** - Encrypted payload is embedded in an Algorand transaction note field
4. **Decrypt** - Recipient decrypts locally using their private key

## Protocol

Messages use a structured envelope in the transaction note field:

```
algochat:v1:<recipient>:<nonce>:<ciphertext>
```

## SDKs

| SDK | Language | Status |
|-----|----------|--------|
| `algochat-swift` | Swift | In Development |
| `algochat-ts` | TypeScript | In Development |
| `algochat-py` | Python | In Development |

## Links

- [Landing Page](https://corvidlabs.github.io/algochat/)
- [Corvid Labs](https://github.com/CorvidLabs)

## License

MIT
