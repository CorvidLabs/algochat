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

At the original draft stage, Mermaid parsing/rendering was not established by that structural check. No usable browser or Mermaid renderer was installed, and tool authorization was pending. The authorized follow-up below supersedes that rendering limitation; it does not retroactively change the original draft evidence.

## Independent review

A separate reviewer inspected all six source implementations and the assembled documentation diff against `1400279`. Findings were resolved: historical membership must use transaction position rather than epoch alone; the application must check the mailbox receiver before the administration reducer; and merged parity fixes must not remain labeled pending. The reviewer then reported no remaining source/documentation correctness findings in scope, with **96% engineering confidence**, excluding unperformed rendering and runtime qualification. This is agent review, not human implementation acceptance.

Remaining behavior differences are explicit in the guide: Swift inbound hybrid size enforcement, Kotlin legacy/group-message signed integer ranges, and nonuniform hybrid text decoding. They require separate implementation work, not documentation claims that all ports already conform.

## Evidence limits

No language runtime matrix, LocalNet, package installation/publication, deployment or release qualification was performed for this documentation change. Historical interoperability runs remain author-reported. Earlier hosted checks for other commits are not attributed to this branch. The draft PR's own checks must be read at its exact head. Trust/provenance verification for this branch is recorded separately after committing; a soft provenance pass is not release-range qualification.

## Authorized rendering follow-up after merge

PR #25 merged as `14b346d140d3122b077b362f882f45c534f3299b`. The user then authorized isolated official Mermaid/headless-browser tools. On Ubuntu ARM64, npm installed **Mermaid 11.17.2** and **Playwright 1.64.1** with lifecycle scripts disabled in a task-local tools directory. Playwright downloaded its official **Chromium Headless Shell 156.0.8078.4**. No repository dependency, system Java setting or global package installation changed. Available disk before installation was 8.5 GB; the package directory and browser distribution used approximately 174 MB and 280 MB.

The browser loaded local Mermaid assets through a loopback-only server, with external browser requests blocked. Configuration matched the site's Mermaid settings: neutral theme, strict security and natural diagram widths. Each extracted source was parsed and rendered to SVG and PNG. An intentionally invalid Mermaid diagram was rejected, confirming that parser failures propagate.

The first run passed **46/48** diagrams. Literal semicolons in sequence message labels broke the dashboard flow and the new key-delivery flow. Those labels were corrected. The dashboard diagram/prose was also aligned with the already-merged six-library status workflow: candidate-bound result files, actual exit-status recording, freshness validation and deployment conditional on generation success. No workflow or implementation code changed.

The corrected run passed **48/48 parses and renders**. The [render manifest](2026-10-19-mermaid.json) records source hashes, SVG hashes, dimensions and tool versions. The six focused protocol flows and changed root diagrams were visually inspected for readable labels and correct relationships; wide overview diagrams retain the site's horizontal-scrolling behavior. Local SVG/PNG evidence and the initial failure report are preserved in the task's evidence directory.

This validates the recorded Mermaid/browser versions, not every future renderer or GitHub/mobile theme. It does not qualify cryptographic runtime behavior, LocalNet, packages or a release. Human closing acceptance and archival are still pending.

Independent follow-up review inspected all six new protocol diagrams and five relevant root diagrams, checked render-source hashes against the current fences, and reported no actionable findings at 97% confidence for this documentation scope. This is agent evidence, not human acceptance.
