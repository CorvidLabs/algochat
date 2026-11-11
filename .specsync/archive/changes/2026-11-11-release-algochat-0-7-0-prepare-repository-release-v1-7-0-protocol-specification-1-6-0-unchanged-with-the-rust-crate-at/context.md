---
change: release-algochat-0-7-0-prepare-repository-release-v1-7-0-protocol-specification-1-6-0-unchanged-with-the-rust-crate-at
artifact: context
---

# Context

Release B is complete on main at 60f9893. Its four parts are #75 (#70a), #86 (#73), #77 (#68) and #78 (#70b). rs-lint (#85), #79 (#87) and #65 (#88) also merged. Leif approved Release B on 2026-11-05 ("Approve intent + A and B") as defined in `.chough/proposals/rust-crate-scope.md` §3. Step 5 there is: "Qualify, then a human release decision, publish, and an external-consumer proof as in Release A". On 2026-11-10 Leif asked, through coordinator hc t370, for this preparation: the changelog, qualification of every lane and the consumer proof. Both the definition approval and the release go stay his.

Library sources since `v1.6.2`:
- `PROTOCOL.md` is unchanged, so the protocol specification stays 1.6.0.
- `rs/src` changed in 7 files (new APIs), so the crate goes to 0.7.0.
- `ts/src/services/mnemonic.service.ts` changed (#73: phrases longer than 25 words are rejected).
- `py/src/algochat/agent/policy.py` and `core.py` changed (#65).
- Kotlin, Go and Swift sources are unchanged.

Leif's decisions, relayed by coordinator hc t370 on 2026-11-10 together with his approval of this definition and his release go:
- D-r1, repository tag: `v1.7.0`.
- D-r2, TypeScript: `0.12.1`, published to GitHub Packages with the release by the manual `Publish npm` workflow from tag `v1.7.0`, after the merge.
- D-r3, Python: `0.6.1` in source only. PyPI has no publisher.
- Provenance: he accepts it degraded, as for 1.6.2. `provenance.py v1.6.2 1a87ccc` fails because none of the 12 commits since `v1.6.2` is attested.
- crates.io: `publish-crates.yml` is dispatched only after he confirms the trusted publisher (`CorvidLabs/algochat`, `publish-crates.yml`, environment `crates-io`) and revokes the API token used for 0.6.0.

**Order.** The candidate edits were prepared on a draft PR before the native definition approval, at the coordinator's instruction. Leif's single decision therefore covers a concrete, qualified candidate. Nothing merges, tags or publishes before he approves.

**Ruled out:**
- A `v0.7.0` repository tag. Repository tags are the release and Swift package line, and the crate version is a separate input to `publish-crates.yml`.
- Publishing from this PR or by hand. REQ-release-9 makes `publish-crates.yml` the only path. 0.6.0 was published by hand, so the trusted publisher has never run.
