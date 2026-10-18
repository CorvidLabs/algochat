---
hi: 1
families: [PSK]
---

# Psk

## Intent

Falcon on the payment is not enough for the envelope. If I share a secret out of band, that should actually mix into the message key.

For the few people I care most about, I want a second lock that does not rest only on the elliptic-curve key exchange, so that breaking that exchange one day is not enough on its own to open our messages. Setting it up should be one link I pass along in person or over a channel I already trust. After that it should just work: each message gets its own key, a message copied back onto the chain is refused, and a message that fails to open never costs me anything. It stays optional, and anyone who never sets it up loses nothing.

## Criteria

- **PSK-1**  I can add a pre-shared key so the message key does not rest on X25519 alone.
- **PSK-2**  Reading a message with a PSK contact takes both the pre-shared key and our account keys.
- **PSK-3**  Every PSK message uses its own key derived from the shared one.
- **PSK-4**  A PSK message that someone copies into a new transaction is refused as a replay.
  - **PSK-4.a**  A message whose counter is far outside what I expect from that contact is refused.
  - **PSK-4.b**  A message that fails to decrypt never uses up a counter.
  - **PSK-4.c**  Reading the same transaction again, as when I reopen a conversation, is never treated as a replay.
- **PSK-5**  PSK messaging is optional, and standard messages keep working alongside it.
- **PSK-6**  My PSK contacts and their counters survive a restart.
- **PSK-7**  I can share a pre-shared key with a contact as a single link.
  - **PSK-7.a**  A malformed link is refused rather than half imported.
