---
id: lift-the-swift-algorand-pin-now-that-algokit-0-1-0-builds-against-0-4
state: implementing
type: bug_fix
base_commit: 8e165d5a399fd0e5b94fe2998a07f2a43f448328
---

# Lift the swift-algorand pin now that AlgoKit 0.1.0 builds against 0.4

## Intent

Lift the swift-algorand pin now that AlgoKit 0.1.0 builds against 0.4

## Affected Canonical Specs

- None

## Acceptance Criteria

- swift package resolve selects swift-algokit 0.1.0 and swift-algorand 0.4.0, and swift build --build-tests succeeds. AlgoChat(network:) and the CLI localnet configuration still compile, with try on the throwing factories.

## No-spec Rationale

The protocol specs do not change. swift-algokit 0.1.0 already propagates the throwing AlgorandConfiguration factories, so algochat can depend on swift-algorand 0.4.0. swift/docs/HLD.md records the new minima.
