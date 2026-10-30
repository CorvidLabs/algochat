---
change: lift-the-swift-algorand-pin-now-that-algokit-0-1-0-builds-against-0-4
artifact: context
---

# Context

algochat pinned swift-algorand below 0.4.0 because swift-algokit 0.0.2 called `AlgorandConfiguration.localnet()`, `testnet()`, and `mainnet()` as non-throwing functions. swift-algorand 0.4.0 made those factories, and `init(network:apiToken:)`, throwing.

swift-algokit 0.1.0, tag `2502d3a`, already has `AlgoKit(network:) throws` and calls `try .localnet()`, `try .testnet()`, and `try .mainnet()`. `AlgoKit(configuration:)` stays non-throwing. The pin in this repo was the only thing still holding the older SDK.
