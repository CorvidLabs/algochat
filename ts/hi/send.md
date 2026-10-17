---
hi: 1
families: [SEND]
owner: leif
---

# Talking over the chain

## Intent

Sending a message should feel like calling one function, and reading a conversation should need nothing but the chain and my keys. The blockchain is the post office, so the library has to respect what that costs: a message is a real payment, the note has a hard size limit, and history lives in an indexer that can lag behind. It should refuse early rather than spend money on something that cannot arrive, carry on when one note in a thread is unreadable, and let an app that goes offline keep writing and catch up later. Because other AlgoChat clients read the same notes, the bytes on the wire are a promise to them, not an implementation detail.

## Criteria

- **SEND-1**  I can send an encrypted message to any Algorand address with one call once I have their key.
  - **SEND-1.a**  A reply carries a pointer to the message it answers and a short preview of it.
  - **SEND-1.b**  I choose whether a send waits for confirmation, for the indexer, or for neither.
- **SEND-2**  A message too big for one payment note is refused before anything is signed or paid for.
- **SEND-3**  I can rebuild a conversation, both sides of it, from the chain alone with nothing stored locally.
  - **SEND-3.a**  I can read my own sent messages back, not only the ones sent to me.
  - **SEND-3.b**  Messages come back in the order they happened.
  - **SEND-3.c**  A note I cannot decrypt is skipped instead of breaking the whole conversation.
- **SEND-4**  I can queue messages while offline and have them go out when I am back online.
  - **SEND-4.a**  A message that keeps failing stops retrying after a bounded number of attempts, and I am told.
  - **SEND-4.b**  The queue survives a restart when I give it durable storage.
- **SEND-5**  A message sent from this library reads the same in every other AlgoChat implementation, and theirs read the same here.
  - **SEND-5.a**  A change to the bytes on the wire is caught as a protocol change, not waved through as a test update.
- **SEND-6**  I can test everything my app does with AlgoChat without a live network or credentials.
