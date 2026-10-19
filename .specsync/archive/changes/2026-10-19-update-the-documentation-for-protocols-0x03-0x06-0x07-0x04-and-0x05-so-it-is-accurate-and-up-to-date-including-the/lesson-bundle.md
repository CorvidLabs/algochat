# Lesson bundle — update-the-documentation-for-protocols-0x03-0x06-0x07-0x04-and-0x05-so-it-is-accurate-and-up-to-date-including-the

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Update the documentation for protocols 0x03, 0x06, 0x07, 0x04 and 0x05 so it is accurate and up to date, including the Mermaid diagrams
- **Kind**: Documentation
- **Specs**: protocol
- **Paths**: PROTOCOL.md, TEST-VECTORS.md, README.md, PARITY.md, SECURITY.md, IMPLEMENTATION.md, docs/, specs/protocol/, ts/README.md, ts/docs/HLD.md, swift/README.md, swift/docs/HLD.md
- **Acceptance**: Document the merged behavior of protocols 0x03, 0x04, 0x05, 0x06 and 0x07 accurately across six libraries, including wire fields and offsets, AAD, derivation and wrapping, discovery, administration and membership, epochs, counters, replay responsibilities, limits, security claims and release boundaries. Update relevant Mermaid diagrams and canonical references. Preserve classical 0x01/0x02 behavior and all implementation code. Validate documentation, links and diagrams where tooling is available, obtain independent review, and open a documentation-only draft PR with evidence and remaining uncertainty.

## Evidence

- Verification commit: `d906cbaa9c39906695b2fc3526bdfaf398e7c411`
- Base commit: `f8a73126518c96b506b642075069e6ccc5b6c28e`
- Verified by: `specsync check --spec protocol`

## From the change's context.md

# Context

The user requested accurate, current documentation for protocols 0x03, 0x04, 0x05, 0x06 and 0x07, including Mermaid diagrams. This is documentation-only work; no protocol, library, package, release or deployment behavior changes.

Baseline: merged main f8a73126518c96b506b642075069e6ccc5b6c28e includes administered rooms (#24). PRs #17–22 remain open at audit time. Their proposed parity fixes must not be described as shipped. Existing local review evidence is outside this checkout and is not a fresh LocalNet run.

Read source in all six libraries. Preserve historical release and fixture boundaries: 2366-byte hybrid handshakes, frozen group vectors, protocol version versus package versions, and Swift ML-KEM platform limits. Do not invent human acceptance or historical execution evidence.

## From the change's design.md

# Design

Use three complementary views: byte-offset tables in the normative protocol; sequence/state diagrams for hybrid establishment, sender recovery, administration and delivery/message acceptance; and a six-library implementation/responsibility matrix with source links.

Show clear trust boundaries: chain-authenticated transaction sender versus header X25519 key; cryptographic opening versus administration authorization; protocol counters versus application-owned durable replay state. State key-compromise and no-forward-secrecy limits without adding protocol guarantees. Show no automatic hybrid negotiation unless implemented.

Validate Mermaid parsing/rendering with available tooling, relative links and section references, repository validation and Trust. An independent reviewer must check source accuracy, completeness and diagram claims before the draft PR is described as ready for human review. Record all remaining gaps honestly. Human definition approval precedes starting the documentation change; human implementation acceptance is not recorded by this task.

## From the change's testing.md

# Documentation evidence

REQ-protocol-4: `PROTOCOL.md` sections 5.7–5.8 contain the wire-offset tables, the 101-byte legacy and 133-byte action-5 plaintexts, and the historical membership run. `docs/PROTOCOL-FLOWS.md` covers the approved diagrams, authorization/replay responsibilities and implementation boundaries. `docs/verification/2026-10-19-protocol-docs.md` records the independent six-source audit and resolved findings.

Executed checks: `bun scripts/validate.ts`, `python3 -m unittest discover -s scripts/release -v`, `specsync check --strict --json`, and `hi check`. Relative links and anchors were checked separately, as were balanced Mermaid fences. At the original draft stage Mermaid parsing/rendering was unrun; no render pass was claimed for that stage. The authorized follow-up rendered all 48 diagrams with Mermaid 11.17.2 and Chromium 156.0.8078.4 after fixing two sequence-label syntax errors. The intentionally invalid diagram was rejected. See docs/verification/2026-10-19-mermaid.json and the follow-up report.

Existing behavioral evidence remains in `ts/src/pq/group.test.ts`, `ts/src/pq/group-admin.test.ts`, `vectors/group-v1.json`, and `vectors/group-admin-v1.json`, with corresponding tests in the other five libraries. These sources were read for this documentation audit; their runtime suites were not rerun locally in this documentation task. No new behavior or vector bytes are introduced.

## Where these lessons go

- `specs/protocol/context.md`
