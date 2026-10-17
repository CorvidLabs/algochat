---
change: bring-the-current-protocol-and-language-libraries-into-one-repository
artifact: design
---

# Design

Protocol documents stay at the repository root. Each library keeps its own package layout under ts, swift, py, rs, kt, and go, taken from that library's 4096-byte note commit. The old repository names remain published. implementations.json records the new paths.
