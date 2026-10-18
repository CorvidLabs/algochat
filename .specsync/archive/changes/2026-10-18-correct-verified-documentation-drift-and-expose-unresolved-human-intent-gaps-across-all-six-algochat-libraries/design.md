---
change: correct-verified-documentation-drift-and-expose-unresolved-human-intent-gaps-across-all-six-algochat-libraries
artifact: design
---

# Design

Keep the normative wire contract and library runtime behavior unchanged. Use each module's existing canonical spec rather than duplicate API ownership. Keep accepted intent as desired outcomes, separate from implementation evidence and historical acceptance. Existing requirement IDs stay stable; implementation gaps are explicit. Source-doc comments can be corrected without changing executable source. The status renderer links each registry path under the monorepo, declares its evidence limitations, and keeps missing results pending. No new workflow, test gate, credential, dependency, policy or publication behavior is introduced.
