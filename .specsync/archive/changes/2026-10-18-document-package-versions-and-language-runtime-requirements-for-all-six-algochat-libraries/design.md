---
change: document-package-versions-and-language-runtime-requirements-for-all-six-algochat-libraries
artifact: design
---

# Design

Use the root README for the compact six-language package/runtime overview and docs/RELEASE.md for the full toolchain and qualification matrix. Language READMEs provide their own directly visible version/requirements section and link to the full matrix.

Package manifests, the Gradle wrapper properties, root qualification workflows, and Swift PQ availability annotations supply the facts. Different version domains remain explicit: protocol 1.3.0, envelope 0x01/0x02, protocol ids 0x01/0x02/0x04/0x05, per-library package versions, and compiler/runtime versions.

No implementation or canonical specification changes are required because existing release identities and qualification limits are unchanged. Replacing archived badges avoids presenting an old distribution's registry/release version as the current monorepo source version.
