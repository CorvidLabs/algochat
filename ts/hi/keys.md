---
hi: 1
families: [KEYS]
owner: leif
---

# Knowing who I am talking to

## Intent

A chat identity should be nothing more than a recovery phrase: lose the device, keep the words, get everything back. Finding someone else's key should work from their address alone, because asking them first defeats the point of an open network. The hard part is honesty about trust. A public ledger read through an indexer cannot always prove which key belongs to whom, so the library should prove it when it can, say so when it cannot, and never quietly accept a key that failed its proof. Keys should stay where the person is, signed and used locally, and be protected when they are written down.

## Criteria

- **KEYS-1**  My 25-word recovery phrase is all I need to get my chat identity back.
  - **KEYS-1.a**  Importing a phrase I already use elsewhere gives me the same address my wallet shows.
  - **KEYS-1.b**  The same words give me the same encryption key whichever signature scheme I pick.
- **KEYS-2**  A brand-new account signs with a post-quantum signature unless I ask otherwise.
- **KEYS-3**  I can publish my encryption key so anyone can start writing to me.
- **KEYS-4**  I can find someone's encryption key from their address alone, without asking them for it.
  - **KEYS-4.a**  I am told whether that key is proven to belong to the address or only trusted on first use.
  - **KEYS-4.b**  A forged key announcement is never accepted, not even as an unverified key.
  - **KEYS-4.c**  I can show a short fingerprint so two people can compare keys out of band.
- **KEYS-5**  My private keys never leave my process; everything is signed where I run it.
- **KEYS-6**  When I keep keys on disk they are encrypted with my password and readable only by my user.
