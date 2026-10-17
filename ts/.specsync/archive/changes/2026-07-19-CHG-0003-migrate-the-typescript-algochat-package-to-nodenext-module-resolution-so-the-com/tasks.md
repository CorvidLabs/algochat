---
change: CHG-0003-migrate-the-typescript-algochat-package-to-nodenext-module-resolution-so-the-com
artifact: tasks
---

# Tasks

- [x] Switch `tsconfig.json` to NodeNext module and moduleResolution.
- [x] Rewrite all relative import/export specifiers with explicit `.js` and `index.js` forms.
- [x] Pass `bun run tsc` and `bun run build`.
- [x] Pass all 454 Bun tests.
- [x] Pass the 79-vector conformance suite.
- [x] Prove raw Node.js ESM imports the compiled package.
- [x] Verify the published tree byte-exactly against the tested tree and correct the one transcription defect found.
