---
change: implement-protocols-0x06-and-0x07-in-all-six-libraries-and-prove-the-localnet-group-mailbox
artifact: research
---

# Research

Section 5.8 is already on this branch. The hybrid session key is the membership key, so the wrap does not add a KEM. ChaCha20-Poly1305 and HKDF-SHA256 are already in every library. The LocalNet fee rule for notes over 1024 bytes is the same integer surcharge the 0x04 matrix uses. The mailbox must exist before a 0-microAlgo payment, which is why the creator funds it with 100000 microAlgos once.
