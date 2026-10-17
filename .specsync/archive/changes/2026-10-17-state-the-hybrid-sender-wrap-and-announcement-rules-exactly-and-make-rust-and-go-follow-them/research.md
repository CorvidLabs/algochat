---
change: state-the-hybrid-sender-wrap-and-announcement-rules-exactly-and-make-rust-and-go-follow-them
artifact: research
---

# Research

The sender can recompute X25519(sender, ephemeral) from the note. The sender cannot recompute the recipient's ML-KEM secret later. A second ML-KEM ciphertext, addressed to the sender, gives the sender a secret they can decapsulate later. The wrap key uses both, so one broken algorithm does not open the copy.
