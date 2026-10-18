---
change: prepare-reproducible-six-language-release-qualification-without-publishing-or-altering-protocol-behavior
artifact: plan
---

# Plan

## Approach

Extend existing CI lanes with non-publishing qualification and shared root release-path triggers. Add standard-library checks and a documented manual release gate. Keep protocol and library implementation untouched.

## Out of scope

No merge, tags, releases, package publication, deployment, wallets, LocalNet provisioning, production/VPS access, spending, ownership migration, credentials or protocol/crypto/session changes. No silent rewrite of human intent.

## Steps

1. Obtain explicit definition approval and desired release criteria confirmation; capture only confirmed human intent. Start the Spec-Sync change after approval.
2. Define the release module spec and a testable provenance command requiring explicit base/head with ancestry and nonempty-range checks; invoke attest under existing policy.
3. Extend all six lanes: TypeScript build and npm pack with scripts disabled plus import/type content checks; Python sdist/wheel build and isolated wheel smoke import; Rust cargo package with verification; Kotlin jar/source/POM generation without publish tasks; Go tests/build plus module/source metadata checks; Swift macOS tests/build and package/source manifest checks. Source-only Swift/Go archives are qualification evidence, not proof of registry installation or tag mapping.
4. Add artifact inspection and negative tests; include release-check tests in root verification. Make final-head source identity explicit rather than conflating GitHub synthetic merge commits with the PR head.
5. Document exact release gates and destination decisions. Run local safe checks and hosted lanes, inspect real artifacts, self-review and record only truthful agent evidence after verification.
6. Push and open a clearly labeled draft PR once allowed by governance. Attach the PR, verify remote head and monitor all six hosted lanes. Leave human implementation acceptance outstanding.

## Risks

Nested publisher workflows are historical references and must not become root auto-publish workflows. Six green lanes do not establish destination credentials or complete historical provenance. Artifact contents can differ from source-tree tests; test packages where feasible. Exact tool/dependency reproducibility limitations must be explicit.

## Constraints consulted

Root AGENTS.md, .codex/skills/spec-sync/SKILL.md, hi/AGENTS.md, .attest.json, .trust.toml, fledge.toml, root and nested workflows, manifests, README and the delegated authorization.

## Additional acceptance details from audit

Qualification triggers must include relevant shared vectors, manifests, workflow and release-script changes. Evidence validation must reject stale SHA, dirty or ambiguous source identity, missing language/artifact, unsuccessful command, absent required Apple lane, malformed evidence and tampered artifact hashes. Use external temporary consumers for package checks, preserving actual dependency resolution and reporting any local replacements.

Inspect Kotlin's generated POM before deciding how to document consumption: settings declares kt-algochat, group is com.corvidlabs, version is 0.2.0, and no artifactId override is configured. README's com.corvidlabs:algochat:0.2.0 therefore appears inconsistent with generated coordinates. Preserve current configured identity; do not claim a verified public published identity or silently migrate it.
