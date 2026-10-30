---
change: lift-the-swift-algorand-pin-now-that-algokit-0-1-0-builds-against-0-4
artifact: design
---

# Design

Require swift-algokit from 0.1.0 and swift-algorand from 0.4.0. Do not change AlgoChat's public initializers. `AlgoChat(network:)` already uses `try AlgoKit(network:)`. `AlgoChat(configuration:)` still takes a finished configuration.

Call sites that build a configuration must mark the throw. The CLI localnet path uses `try AlgorandConfiguration(network:apiToken:)`. Tests that build `AlgoKit(configuration: .localnet())` use `try` on that expression. `try await AlgoChat(configuration: .localnet(), ...)` already covers the factory throw.
