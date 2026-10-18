---
change: let-the-swift-room-administration-tests-seal-a-note
artifact: context
---

# Context

The GroupAdmin suite seals an action-5 note with ChaChaPoly. That type comes from swift-crypto. The AlgoChat library target already depends on Crypto. The test target did not, so the new test could not compile.

Package.swift is the manifest for that test target. It is not a module spec. The room-administration behavior itself is already archived.
