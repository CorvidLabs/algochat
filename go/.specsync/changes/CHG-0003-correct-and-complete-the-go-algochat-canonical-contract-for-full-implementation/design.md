---
change: CHG-0003-correct-and-complete-the-go-algochat-canonical-contract-for-full-implementation
artifact: design
---

# Design

Keep one canonical `algochat` module because all production files form one Go package and share protocol constants and models. Associate the companion with every non-test Go source file so SpecSync reports 100% file and LOC coverage. Treat workflow YAML as governance configuration rather than source/API coverage while documenting its blocking behavior in the governance requirement.

Preserve stable requirement IDs where their meaning remains valid. Clarify `REQ-algochat-001` so the plaintext capacity applies to encryption rather than decoding, retain signing and storage/queue contracts, and add durable requirements for envelope parsing, account construction, conversation behavior, and workflow governance. Ground every statement in a named implementation path and existing native test behavior.

Use a successor change rather than rewriting the two accepted migration records. The successor applies canonical semantic corrections through the supported definition, verification, and closing-approval gates while preserving earlier approval and verification history.
