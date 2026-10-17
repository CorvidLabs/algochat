---
change: CHG-0007-falcon-default-chataccounts
artifact: plan
---

# Plan

1. Bump algosdk to 3.7.0; add falcon-1024.
2. Extend ChatAccount; Falcon create; Ed25519 import default.
3. Sign send/reply/publishKey through txnSigner; apply Falcon fee.
4. Tests for scheme recovery and shared encryption keys.
5. Spec + README; `fledge lanes run verify`.
