---
change: state-the-hybrid-sender-wrap-and-announcement-rules-exactly-and-make-rust-and-go-follow-them
artifact: design
---

# Design

The handshake gains one 1088-byte ML-KEM ciphertext addressed to the sender, after the recipient encapsulation-key hash and before the nonce. The wrap key is HKDF-SHA256:

```
ikm  = X25519(sender, ephemeral) || sender ML-KEM shared secret
salt = ephemeral public
info = "AlgoChatPQ-SenderKey" || sender X25519
```

Associated data for that wrap is the handshake prefix. Associated data for a 0x05 message stays the 78-byte header. The recipient path does not use the sender ciphertext.
