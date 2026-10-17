---
change: CHG-0007-falcon-default-chataccounts
artifact: research
---

# Research

Official js-algorand-sdk 3.7 example (`examples/falcon.ts`) derives the
Falcon seed with `pq25WordMnemonicToSeed(mnemonic, FALCON_1024_SCHEME)` and
signs via `addressWithSignersFromRawFalcon1024Signer`. LocalNet and TestNet
(algod 5.0.0) accepted a Falcon-signed 0-amount note at 3,000 µAlgo.
