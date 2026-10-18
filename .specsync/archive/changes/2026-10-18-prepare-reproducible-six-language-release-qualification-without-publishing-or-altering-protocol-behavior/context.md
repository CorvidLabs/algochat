---
change: prepare-reproducible-six-language-release-qualification-without-publishing-or-altering-protocol-behavior
artifact: context
---

# Context

Main is d53ecbb3864e089b2ec4cdc6a18dcc209a212af2. PRs #5 and #6 are merged; no open PR was found on initial inspection. Work is isolated on release/readiness-qualification. This is a proposed definition, not approved implementation.

The root verify lane only runs bun scripts/validate.ts (five documents and seven implementation registry entries). Trust passed over v1.2.1..HEAD with degraded provenance. After fetching refs/notes/attest, direct attest verify fails for d53ecbb: missing attestation and passing-test evidence. The candidate range has two commits; maintainers must confirm the actual release baseline, including any distribution-specific ranges.

REPO-2 is historical human intent and remains untouched. No human acceptance or historic attestations will be fabricated. The inherited LocalNet report is author-reported, not independently reproduced: rounds 41641–41736, six 2366-byte handshakes, 90 messages and 540 reader invocations. Withdrawn rounds 41059–41154 and the 1278-byte layout are not acceptance evidence.

Local installed tools: Bun, Node/npm, Swift 6.4, Cargo, Python3, fledge/specsync/augur/attest. Go, Java, Gradle and Python pip are unavailable on PATH. No new toolchains or ecosystem downloads are approved locally beyond the user's bounded npm/Swift exception. Hosted existing lanes are authorized for qualification.
