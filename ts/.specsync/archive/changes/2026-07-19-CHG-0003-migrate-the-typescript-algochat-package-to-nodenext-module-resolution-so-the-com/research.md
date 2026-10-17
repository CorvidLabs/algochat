---
change: CHG-0003-migrate-the-typescript-algochat-package-to-nodenext-module-resolution-so-the-com
artifact: research
---

# Research

Node.js ESM requires explicit file extensions on relative imports and does not support directory imports; TypeScript only enforces this under `module`/`moduleResolution` set to `NodeNext`. The migration surface is exactly 132 relative import specifiers across 44 files (43 under `src/` plus `tsconfig.json`): `./x` becomes `./x.js` and `./dir` becomes `./dir/index.js`. No public export, type, or runtime behavior changes. Verification on the finished tree: `bun run tsc` type-check passes, `bun run build` emits `dist/`, all 454 Bun tests pass, the 79-vector conformance suite passes, and `node --input-type=module -e "await import('./dist/index.js')"` succeeds.
