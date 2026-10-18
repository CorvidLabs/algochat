---
hi: 1
families: [PRIVATE]
owner: leif
---

# What stays private

## Intent

The content of a message belongs to the two people in the conversation and to nobody else, including whoever runs the node or the indexer. Tampering should break a message rather than change it. Just as important, the library must not oversell itself: addresses, timing and amounts are public forever, and a leaked key or phrase exposes that account's past messages, so it should say that in plain words. For people who want more, a pre-shared key should be one QR scan away and make an attacker's job strictly harder. Upgrading the protocol should never lock anyone out of what they already wrote.

## Criteria

- **PRIVATE-1**  Only the sender and the recipient can read what a message says.
  - **PRIVATE-1.a**  A tampered message fails to open instead of showing altered or partial text.
  - **PRIVATE-1.b**  Changing any header byte, the version included, makes the message fail to open.
- **PRIVATE-2**  I am told plainly what is not protected: who talks to whom, when, and my whole history if a key or phrase leaks.
- **PRIVATE-3**  I can add a pre-shared key so an attacker needs it as well as the key exchange to read my messages.
  - **PRIVATE-3.a**  I can hand that key to the other person with one QR scan.
  - **PRIVATE-3.b**  A replayed pre-shared-key message is rejected.
- **PRIVATE-4**  Messages written before a protocol upgrade stay readable after it.
- **PRIVATE-5**  The cryptography comes from audited libraries rather than home-grown primitives.
