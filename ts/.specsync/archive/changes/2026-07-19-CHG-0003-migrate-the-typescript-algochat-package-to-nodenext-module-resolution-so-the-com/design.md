---
change: CHG-0003-migrate-the-typescript-algochat-package-to-nodenext-module-resolution-so-the-com
artifact: design
---

# Design

Switch `tsconfig.json` to `module: "NodeNext"` and `moduleResolution: "NodeNext"`, then apply a deterministic codemod that rewrites every relative import/export specifier to its explicit NodeNext form. The codemod is mechanical and total: every match is rewritten, so there is no partial-migration state. Review safety comes from byte-exact verification rather than manual inspection: the published branch tree is compared blob-by-blob against the locally tested tree, and one transcription defect found by that comparison (a renamed HKDF variable in `decryptAsSender`) was corrected before acceptance.
