---
change: lift-the-swift-algorand-pin-now-that-algokit-0-1-0-builds-against-0-4
artifact: testing
---

# Testing

`swift package resolve` selects swift-algokit 0.1.0 (`2502d3a`) and swift-algorand 0.4.0 (`4e63b9e`). `swift build --build-tests` completed with no errors. The localnet test suites were compiled and not executed for this change. They talk to a local Algorand network and do not depend on the factory being non-throwing.
