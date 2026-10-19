---
change: update-the-documentation-for-protocols-0x03-0x06-0x07-0x04-and-0x05-so-it-is-accurate-and-up-to-date-including-the
artifact: testing
---

# Documentation evidence

REQ-protocol-4: `PROTOCOL.md` sections 5.7–5.8 contain the wire-offset tables, the 101-byte legacy and 133-byte action-5 plaintexts, and the historical membership run. `docs/PROTOCOL-FLOWS.md` covers the approved diagrams, authorization/replay responsibilities and implementation boundaries. `docs/verification/2026-10-19-protocol-docs.md` records the independent six-source audit and resolved findings.

Executed checks: `bun scripts/validate.ts`, `python3 -m unittest discover -s scripts/release -v`, `specsync check --strict --json`, and `hi check`. Relative links and anchors were checked separately, as were balanced Mermaid fences. Mermaid parsing/rendering remains unrun pending validation-tool authorization; no render pass is claimed.

Existing behavioral evidence remains in `ts/src/pq/group.test.ts`, `ts/src/pq/group-admin.test.ts`, `vectors/group-v1.json`, and `vectors/group-admin-v1.json`, with corresponding tests in the other five libraries. These sources were read for this documentation audit; their runtime suites were not rerun locally in this documentation task. No new behavior or vector bytes are introduced.
