# Lesson bundle — correct-verified-documentation-drift-and-expose-unresolved-human-intent-gaps-across-all-six-algochat-libraries

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Correct verified documentation drift and expose unresolved Human Intent gaps across all six AlgoChat libraries
- **Kind**: Documentation
- **Specs**: protocol, release
- **Paths**: README.md, INTENT.md, PROTOCOL.md, IMPLEMENTATION.md, SECURITY.md, TEST-VECTORS.md, PARITY.md, docs, ts/README.md, ts/docs, ts/conformance/README.md, ts/specs, swift/README.md, swift/docs/HLD.md, swift/SECURITY.md, swift/specs, swift/Sources/AlgoChat/Storage/KeychainKeyStorage.swift, go/README.md, go/specs, py/README.md, py/specs, rs/README.md, rs/specs, rs/src/crypto.rs, rs/src/psk_crypto.rs, kt/README.md, kt/specs, implementations.json, index.html, status.html, scripts/generate-status.ts, badges, ts/src/crypto/encryption.ts, ts/src/psk/encryption.ts, swift/Sources, go/crypto.go, go/doc.go, rs/src/types.rs, rs/src/psk_types.rs, rs/src/psk_ratchet.rs, rs/src/psk_state.rs, py/src/algochat/client.py, kt/src/main/kotlin/com/corvidlabs/algochat/PSKRatchet.kt, kt/src/main/kotlin/com/corvidlabs/algochat/PSKState.kt, kt/src/main/kotlin/com/corvidlabs/algochat/PQ.kt
- **Acceptance**: All six library READMEs/spec descriptions and the root protocol/security/implementation/HLD docs reflect current source APIs, formats, platform boundaries, and workflows; current versus historical package/registry/parity evidence is labeled; existing PQ/PSK source/export inventories are documented; all84 accepted hi criteria and their IDs/text remain unchanged with explicit evidence/gap status; strict structural/source/export checks, link/manifest checks and Trust pass without changing library runtime behavior or claiming absolute security/parity. Generated documentation fixes are limited to source links, scope notices, and truthful pending snapshots.

## Evidence

- Verification commit: `94c77b5b3226bddfa97530e968b99c14a2be56b1`
- Base commit: `b4cbfaf0c40156c5c3bffcc6b14cb3fd22e6153f`
- Verified by: `specsync check --spec protocol --spec release --strict`

## From the change's context.md

# Context

The user asked to fan out and make docs and hi accurate after merging the version documentation. Three read-only source audits identified drift in protocol guides, security disclosures, language APIs/examples, source/export inventories, workflow history, package distribution and accepted-intent status. Three disjoint workers corrected factual documentation, followed by independent read-only review. Source base is b4cbfaf0c40156c5c3bffcc6b14cb3fd22e6153f.

Accepted hi content stays unchanged: 14 shared, 34 TypeScript, 36 Swift criteria, 84 total. The generated INTENT index now includes RELEASE. docs/ACCURACY.md maps concrete unmet or unverified goals and normative contracts; none are silently weakened to match code. No new feature criteria are captured from implementation.

The 21 changed library implementation files differ only in comments/docstrings, verified by source-token/AST comparison. Documentation renderer changes only source links and explanatory markup; the registry lists 6 libraries and removes archived web. Current/historical tags, registry associations, runtime-minimum gaps and LocalNet evidence remain distinct. No runtime bug, publisher binding, release, tag or deployment is changed. The user explicitly approved the prepared documentation scope and PR creation with approved. Record definition/closing approval from that instruction; no approval is self-granted.

Verification: all 154 language source files covered in 13 strict language specs; root 2 specs strict; no warnings/errors. Root 18 tests and document/registry lane pass. TS conformance 85/85. Targeted Python/Rust/Kotlin examples tested offline by the assigned worker. All 84 hi exports unchanged. Local paths/fences, generated pending dashboard and comment-only implementation checks passed. See docs/ACCURACY.md for limits. Trust and exact snapshot provenance are recorded after the final lane.

Final gate: fledge trust verify --range b4cbfaf0c40156c5c3bffcc6b14cb3fd22e6153f..f142f38d481060c6192aa9ab9709d22793980bb7 passed progressively; Augur proceed at risk 33. Its cached root SpecSync check emitted one old-cache warning; fresh isolated strict checks passed with zero warnings. The public documentation snapshot f142f38d481060c6192aa9ab9709d22793980bb7 was truthfully attested by agent:codex after the lane, and attest verify --commit that snapshot --policy .attest.json --json passed with zero violations. The verification snapshot does not claim human approval; the later user instruction supplies approval of the prepared documentation pass. The branch and real index were not changed by snapshot creation. Root generated cache was restored to avoid tool-version cache churn. badges/go-algochat.svg is intentionally generated pending output; include it explicitly when committing this prepared change.

## From the change's design.md

# Design

Keep the normative wire contract and library runtime behavior unchanged. Use each module's existing canonical spec rather than duplicate API ownership. Keep accepted intent as desired outcomes, separate from implementation evidence and historical acceptance. Existing requirement IDs stay stable; implementation gaps are explicit. Source-doc comments can be corrected without changing executable source. The status renderer links each registry path under the monorepo, declares its evidence limitations, and keeps missing results pending. No new workflow, test gate, credential, dependency, policy or publication behavior is introduced.

## Where these lessons go

- `specs/protocol/context.md`
- `specs/release/context.md`
