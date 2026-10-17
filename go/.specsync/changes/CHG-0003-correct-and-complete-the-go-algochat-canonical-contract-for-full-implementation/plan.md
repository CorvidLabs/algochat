---
change: CHG-0003-correct-and-complete-the-go-algochat-canonical-contract-for-full-implementation
artifact: plan
---

# Plan

1. Audit every production Go file, native test, workflow trigger, policy file, and existing canonical statement.
2. Define a successor delta that removes the unsupported decode-size claim and completes requirement coverage without changing package behavior.
3. Associate all governed implementation and workflow files with the canonical module and enforce 100% SpecSync coverage in Trust.
4. Regenerate all four portable agent integrations and include every Trust policy/specification input in the Go matrix path filters.
5. Run strict SpecSync, agent status, the native build/vet/race lane, Trust doctor/verify, and hosted checks before closing approval.
