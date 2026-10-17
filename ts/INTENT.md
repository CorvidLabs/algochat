# ts-algochat

ts-algochat lets a TypeScript app send private messages between Algorand accounts, using the blockchain itself as the post office. There is no server to run, trust or keep alive: a message is an encrypted note on an ordinary payment, and anyone holding the right key can read it back from the chain years later, in any language that speaks AlgoChat. It is for developers who want messaging tied to an on-chain identity without building a backend, and for their users, who should be able to get everything back from a recovery phrase. It has to be honest about what a public ledger cannot hide, careful about whose key it trusts, and dull to integrate: one package, typed errors, and tests that run without a network.

## Features

<!-- hi:index -->
- [keys](hi/keys.md): KEYS (11 criteria)
- [private](hi/private.md): PRIVATE (9 criteria)
- [send](hi/send.md): SEND (14 criteria)
<!-- /hi:index -->
