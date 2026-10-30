---
hi: 1
families: [BASE]
---

# Base

## Intent

I want a new chat to start as a hybrid session. That is the base. A group uses that same session. Everyday notes are never sent. This version does not stack extra lock on top of hybrid.

On October 30, 2026, Leif confirmed that AlgoChat and Raven use only protocol `0x03` and up, so classical is never sent anywhere, by the bot or by the plain library, and sending refuses rather than falling back ([algochat#63](https://github.com/CorvidLabs/algochat/issues/63)). In his words: "Just fix this and use the standard omg". That changed BASE-3 and ENCRYPT-2.

## Criteria

- **BASE-1**  A new chat starts as a hybrid session, and that is the base level of security I expect.
- **BASE-2**  A group uses that same hybrid session for the room key and the messages.
- **BASE-3**  I never send an everyday note. Every one-to-one message I send is a hybrid one, and nothing falls back to classical.
- **BASE-4**  Extra lock stays available when I have a shared secret, and it is not the default.
- **BASE-5**  This version does not add a mode that stacks extra lock on top of the hybrid session.
