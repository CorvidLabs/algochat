---
change: preserve-the-verified-six-language-parity-audit-with-portable-replay-scripts-and-explicit-rust-replay-and-swift-history
artifact: context
---

# Context

The requested parallel local audit of merged commit `237a974` finished with passing low-level interoperability but reproduced behavioral and documentation gaps. Three language-pair workers and an independent reviewer verified the result. The user then explicitly requested, "make a pr".

This definition packages that already reported audit and makes its highest-risk probes reproducible. Existing RELEASE-1/RELEASE-2 intent covers qualification and visible missing evidence. All 84 accepted intent sentences and IDs remain unchanged. No library behavior, dependencies, wire format, release credentials, workflows or publishing permissions change. The PR does not certify full parity, a statistical 95 percent correctness result, human acceptance of the implementations, or a release.

The local evidence bundle is `/tmp/algochat-local-parity-237a974-evidence.zip`. Commit portable scripts and selected receipts; clearly distinguish retained summaries/hash catalogs from package artifacts kept outside Git. Replay only low-level offline paths by default. Regression probes use temporary copies or consumers and fail when the existing replay/history requirements are violated. They must never pass merely because the defect is present.
