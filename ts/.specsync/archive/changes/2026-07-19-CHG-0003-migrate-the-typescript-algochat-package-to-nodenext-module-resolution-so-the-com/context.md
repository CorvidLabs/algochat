---
change: CHG-0003-migrate-the-typescript-algochat-package-to-nodenext-module-resolution-so-the-com
artifact: context
---

# Context

TypeScript AlgoChat is published as an ESM package whose `dist/` output should be importable by any standards-compliant ESM consumer. Issue #33 reported that raw Node.js ESM could not import the compiled package: the previous `tsconfig` emitted extensionless relative import specifiers, which bundlers and Bun tolerate but Node.js ESM rejects (`ERR_MODULE_NOT_FOUND`). The package source is otherwise stable, fully specified by the canonical `algochat` spec, and covered by 454 Bun tests.
