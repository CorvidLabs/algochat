---
change: CHG-0003-migrate-the-typescript-algochat-package-to-nodenext-module-resolution-so-the-com
artifact: plan
---

# Plan

1. Switch `tsconfig.json` module and moduleResolution to NodeNext.
2. Rewrite all 132 relative import specifiers across 43 `src/` files.
3. Type-check, build, and run the full Bun test suite.
4. Run the 79-vector conformance suite against the migrated tree.
5. Prove raw Node.js ESM can import the compiled entrypoint.
6. Publish with byte-exact remote-versus-local tree verification.
7. Validate with SpecSync 5.0.1 and Trust 1.0.0.
