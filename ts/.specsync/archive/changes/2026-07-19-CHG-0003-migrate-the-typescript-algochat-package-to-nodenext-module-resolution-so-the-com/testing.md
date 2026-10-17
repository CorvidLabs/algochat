---
change: CHG-0003-migrate-the-typescript-algochat-package-to-nodenext-module-resolution-so-the-com
artifact: testing
---

# Testing

Run `bun run tsc` and `bun test` through the existing Fledge verification lane. The lane type-checks under NodeNext, builds the package, and passes all 454 Bun tests. Separately, the 79-vector conformance suite and a raw Node.js ESM import smoke test (`node --input-type=module -e "await import('./dist/index.js')"`) were run against the exact published tree; the published branch was verified byte-exactly against that tested tree by recursive blob comparison.
