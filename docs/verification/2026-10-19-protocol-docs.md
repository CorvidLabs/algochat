# Protocol documentation verification — 2026-10-19

## Scope and source baseline

This documentation-only change describes protocols `0x03` through `0x07`, preserving classical behavior, frozen vector bytes and released-version boundaries. The initial scope definition used `f8a7312`; the branch was subsequently rebased onto `140027936aec649ead5beccba06b5ec727c42974`, including the merged parity fixes and the single root `hi/` organization. The original approved definition remains historical scope evidence, not a claim that its initial source baseline is current.

The user approved definition digest `427993fc29d4b1e42f1cd37aff24866d92f95ccff2f55cfcdc787dd0dfadacd0`. The genuine scope approval is recorded in SpecSync. No finished-work human acceptance is recorded.

## Local checks

- `fledge lanes run verify`: required protocol/registry validation passed; all **25** release-check tests passed, including negative evidence, archive, package and provenance cases.
- `specsync check --strict --json`: two canonical root specs passed without errors or warnings. Root structural checks do not measure all language implementations.
- `hi check`: **106 criteria, 12 families, 14 files**, structurally valid. This is not human acceptance or proof that every intent is implemented.
- Relative Markdown links and heading fragments in the changed public documents were checked, including source links and the moved root intent references. Two inherited broken anchors were corrected.
- `git diff --check` passed. Diff review found only documentation/governance files; executable source, package manifests, workflows and frozen vectors are unchanged.

## Diagram coverage

All **42** existing Mermaid fences across root README/HLD and TypeScript/Swift README/HLD were inventoried and reviewed for scope. Relevant overview/module/dispatch diagrams now include the additional primitives, while classical client and PSK sequences stay explicitly scoped. The shared [flow guide](../PROTOCOL-FLOWS.md) adds **six** focused diagrams: discovery, recipient establishment, sender recovery/session data, administration, key delivery and message acceptance. All **48** fences passed extraction and balanced-fence checks.

Mermaid parsing/rendering is not yet established by that structural check. No usable browser or Mermaid renderer was installed on this VM; a request for isolated official validation tools is pending. This limitation is retained for the draft review rather than represented as a rendered-diagram pass.

## Independent review

A separate reviewer inspected all six source implementations and the assembled documentation diff against `1400279`. Findings were resolved: historical membership must use transaction position rather than epoch alone; the application must check the mailbox receiver before the administration reducer; and merged parity fixes must not remain labeled pending. The reviewer then reported no remaining source/documentation correctness findings in scope, with **96% engineering confidence**, excluding unperformed rendering and runtime qualification. This is agent review, not human implementation acceptance.

Remaining behavior differences are explicit in the guide: Swift inbound hybrid size enforcement, Kotlin legacy/group-message signed integer ranges, and nonuniform hybrid text decoding. They require separate implementation work, not documentation claims that all ports already conform.

## Evidence limits

No language runtime matrix, LocalNet, package installation/publication, deployment or release qualification was performed for this documentation change. Historical interoperability runs remain author-reported. Earlier hosted checks for other commits are not attributed to this branch. The draft PR's own checks must be read at its exact head. Trust/provenance verification for this branch is recorded separately after committing; a soft provenance pass is not release-range qualification.
