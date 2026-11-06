# Proposed scope: a released Rust `algochat` crate for Raven Desktop

Status: **proposal, waiting at the intent and scope gate.** No code, specs, HI files, tags,
pushes, PRs or publishes were made. The only writes are `chough init` (`.chough/`,
`.agents/skills/chough-workflow/`) and this file.

Prepared 2026-11-05 on worktree branch `leif/algochat-crate-scope` (HEAD `fae3900`, one docs
commit after tag `v1.6.1` = `094caa5`).

## 1. Intent

**Relayed goal (from t18, not Leif's verbatim words):** Leif wants Raven Desktop built, so
AlgoChat's Rust crate must be released with interop vectors.

Recorded as the Chough objective. Existing intent this touches: `REPO-1` and `REPO-2`
(one repo, every library), `RELEASE-1` and `RELEASE-2` (qualify before publishing, missing
evidence is visible). No existing criterion says a Rust app can depend on a *released* crate,
or that Rust and Raven web must interoperate.

### Proposed HI criteria (new family `CRATE`; none captured yet)

These are my drafts. I capture them with `hi` only once Leif agrees with the wording.

- **CRATE-1** I can add AlgoChat to a Rust app from crates.io by version number, with no path, Git or copied dependency.
- **CRATE-2** A Rust app and Raven web can read each other's messages, and shared test vectors prove that before the crate is released.
- **CRATE-3** If a shared vector a release relies on is missing, the check fails. It never passes quietly.
- **CRATE-4** I can create and restore an account in Rust from the same 25 words I use in Raven web, and get the same address and keys.
- **CRATE-5** I can publish my Hybrid key from Rust the same way Raven web does, signed or unsigned, without building the note myself.
- **CRATE-6** Apps built on the crate never need their own copy of AlgoChat's cryptography.
- **CRATE-7** Every crate release names the AlgoChat tag it came from, and nothing goes to crates.io until I approve that release.

Not proposed yet: criteria for attachments (#72), Falcon accounts (#69) and Auto-join/Open
channels (#71). Each needs its own owner decision first (see §4), and #71 belongs in the
existing `GROUP` family.

## 2. What I found

| Item | Finding | Why it matters |
|---|---|---|
| crates.io | `algochat` latest is 0.2.1; its `repository` is the archived `CorvidLabs/rs-algochat`. The sole owner is `0xLeif`. | Leif has to publish, either by hand or by setting up a trusted publisher. No agent holds the credential. |
| Publish path | The repo root has no crates.io workflow (`docs/RELEASE.md` says so). `rs/.github/workflows/release.yml` is an OIDC publish workflow left over from the old repo. GitHub never runs it from a subdirectory. | 0.6.0 needs a publish mechanism that has been chosen on purpose. |
| `rs/Cargo.toml` metadata | `repository = "https://github.com/CorvidLabs/rs-algochat"` (archived). There's no `include` list. | Whatever goes up with 0.6.0 stays on crates.io for good. A version can be yanked but never replaced. |
| Package contents | `cargo package --list` shows 122 files. Besides the code, that includes the old repo's `.github/workflows/*`, `.specsync/`, `.claude/.codex/.cursor/.gemini/`, `AGENTS.md`, `specs/` and a `pqcross` binary target. | Noise, and published agent and CI config. Cleaning it changes the package metadata but no Rust source. |
| Dependency pin | `ctutils = "=0.4.2"` (exact), kept for Rust 1.85. | An exact pin inside a library can break dependency resolution in Raven Desktop (Rust 1.95, algonaut 0.9.0, reqwest/rustls). The external-consumer proof has to resolve together with Raven Desktop's real dependency set. |
| Vectors in the package | `pq.rs` and `group.rs` tests read `../vectors/*`, which is outside the crate. Qualification checks only that a consumer compiles. | The published crate can't re-run its own vector tests. #70 asks for self-contained vectors. |
| `rs/tests/cross_impl.rs` | Swift/TS/Python/Kotlin/Rust envelope tests `return` early when the sibling `test-envelopes-*` directories are missing (lines 100, 163, 199, 231, 263, 361). | They currently "pass" while running nothing. This is exactly what CRATE-3 forbids. |
| API gaps vs TS 0.12.0 | No ACPQ encoder or signing input (#68). No 25-word create/restore/validate (#73). No Falcon (`types.rs` says so explicitly) (#69). No attachment AEAD (#72). Channel joining encodes only 1 = invite and 2 = ask (#71). | These match `raven-desktop/parity/PROTOCOL.md` exactly. |
| Raven Desktop | `parity/PROTOCOL.md` treats #67 as the hard gate and #73 and #68 as Slice 1 blockers. It pins algonaut 0.9.0 + reqwest/rustls (decision 3) and forbids path/Git/vendored deps and local crypto. | This fixes the order below. |

Commands run (read-only): `gh issue view 67..73`, `cargo info algochat`, `cargo owner --list
algochat`, `cargo info algonaut`, `cargo search falcon`, `cargo package --list` (in `rs/`),
`gh run list --workflow release-qualification.yml` (latest main run, for the 1.6.0 release, was a success). I didn't run
Rust tests, a consumer build, `fledge trust verify` or any key or mnemonic operation. Nothing here
counts as test evidence.

## 3. Proposed order and release split

### Release A: `algochat` 0.6.0 (issue #67). Unblocks Raven Desktop's dependency.

No Rust source changes. The `rs/src` diff from `v1.6.1` must be empty.

1. **Packaging hygiene only** (needs decision D1): fix `repository` and add `homepage`
   and `documentation`. Add an `include` list (src, README, LICENSE, Cargo.toml) so that old-repo
   workflows, agent config and specs don't ship. Delete the dead `rs/.github/` publish
   workflow so nobody thinks it's live. Decide whether the `pqcross` bin ships (D2).
2. **Qualify** with the existing `release-qualification.yml` and `scripts/release/qualify.py rs`,
   plus `fledge trust verify`, against the candidate commit.
3. **Tag** `v1.6.2` (protocol unchanged, crate still 0.6.0) or publish `v1.6.1` exactly as it is (D1).
4. **Publish** 0.6.0 to crates.io. **Human action by Leif** (D3).
5. **External-consumer proof** after publish: a fresh project outside the repo with
   `algochat = "0.6.0"` from crates.io, `cargo build --locked` and a smoke call. Run it once
   alone and once alongside `algonaut = "0.9.0"` with Raven Desktop's TLS features, to catch
   `ctutils =0.4.2` resolution conflicts. Record it with `chough evidence add` and in
   `docs/RELEASE.md`, then close #67.

All five vectors named in #67 are already part of the in-repo qualification. 0.6.0 doesn't claim
that the packaged crate is self-contained.

### Release B: `algochat` 0.7.0 (#73, #68, #70 part 1). Unblocks Raven Slice 1 (Hybrid first contact).

Additive APIs, no wire-format change. Proposed tag `v1.7.0`, because the vectors and TS checks change across
implementations. Within the release, in this order:

1. **#70a: make vectors mandatory and self-contained** (CRATE-3). Replace the early `return`s
   with failures. Vendor or generate the needed fixtures in-repo. Ship vector JSON inside the crate
   (e.g. `rs/vectors/` or `include_str!` of files inside the package), and make the packaged crate's
   tests pass from the `.crate` tarball. Doing this first means every later item lands with real
   checks.
2. **#73: 25-word account path** (CRATE-4). `validate_mnemonic`, create-random, restore. The output
   is the 32-byte entropy, Ed25519 address, X25519 public key and ML-KEM-768 encapsulation key.
   Vectors are generated by TS 0.12.0 `mnemonic.service.ts` and checked in TS CI and Rust CI. Negatives:
   24 words, a bad checksum, malformed words, whitespace rules. Owner decision D4.
3. **#68: ACPQ write path** (CRATE-5). Encoder for the 1189-byte unsigned and 1253-byte signed note,
   plus the signing-input helper. New `vectors/pq-announcement-v1.json` shared by TS and Rust,
   with the negatives listed in #68.
4. **#70b: long two-way Hybrid conversation and `0x02` read-only vectors** (CRATE-2). Phrase-derived
   keys, `0x04`, recovery on both sides, many `0x05` messages each way. Also kept-secret `0x02` notes with
   counters, replay and restart cases.
5. Qualify, then a human release decision, publish, and an external-consumer proof as in Release A.

### Later releases (0.8.0+). Each needs its own intent and scope gate.

| Issue | Proposal | Why later |
|---|---|---|
| #70c: rooms (`0x03`/`0x06`/`0x07`, batches of 16) and Raven payload byte-survival vectors | Next after 0.7.0. AlgoChat owns envelope vectors carrying Raven payload bytes unchanged. Raven keeps the JSON codecs. | Primitives already exist, so this is evidence work rather than new API. |
| #70d: LocalNet end-to-end Raven web ↔ Raven Desktop | **Move to raven-desktop / raven.** AlgoChat can't run Raven Desktop. | Needs both apps. AlgoChat supplies the vectors only. |
| #72: attachment AES-256-GCM | Needs an owner decision (D5). An `attachment` module in algochat would mean TS AlgoChat gets the same API, with vectors cross-checked against Raven web's `image-crypto.ts`. | The scheme is Raven's, not AlgoChat's protocol. Putting it in the crate has to be a choice someone made deliberately. |
| #71: Auto-join and Open channels | A protocol change (new `0x03` rule values, key acquisition with no admin online) in all six implementations, under protocol 1.7.x/1.8.0. Capture `GROUP-*` intent first. | Biggest design risk. It touches security properties such as current-key-only history and removal/rekey. Raven Desktop keeps these off until then. |
| #69: Falcon-1024 accounts and `pqsig` | Research spike first (D6). algonaut 0.9.0 has no `pqsig` support (unverified in source; to confirm). The crates.io Falcon crates found (`falcon-rs` FN-DSA draft, others) aren't known to match Algorand's deterministic compressed Falcon-1024. | Highest crypto risk. A mismatched Falcon implementation can't be fixed after the fact, and the rules say it must come from a released crate. |

## 4. Risks

1. **Crypto must not be reimplemented in Raven Desktop.** Every helper Raven Desktop needs
   (phrase, ACPQ, attachment, Falcon) has to come from a *released* crate. Anything not released
   stays a blocker. Raven Desktop doesn't get a workaround.
2. **Released deps only.** Raven Desktop can't use path, Git or vendored deps. A git tag isn't a
   release. Each step is done only when a crates.io consumer proof passes.
3. **crates.io is permanent.** Versions can be yanked but never replaced. Whatever packaging and metadata
   ship with 0.6.0 stay public for good, hence D1.
4. **The exact `ctutils` pin** may conflict with Raven Desktop's dependency graph. The consumer proof has to
   include algonaut 0.9.0 with reqwest/rustls.
5. **Silent-pass tests.** Until #70a lands, a green Rust CI doesn't prove cross-implementation
   interop. Nobody should cite it as interop evidence.
6. **Mnemonic handling (#73).** A mistake here sends funds to the wrong wallet. Vectors must be generated by
   TS/algosdk, never by the Rust code under test. Use synthetic phrases only. Nothing may be logged.
7. **Falcon (#69) may have no suitable released Rust implementation.** If it doesn't, CorvidLabs would
   have to build and release one, which is a separate project with its own review.
8. **Scope creep into Raven policy.** Raven's JSON codecs and UI rules stay in Raven. AlgoChat only proves
   their bytes survive.
9. **Publishing credentials.** Only Leif can publish, and no workflow is set up yet.

## 5. Decisions only Leif can make

- **D1 (0.6.0 source):** (a, recommended) tag `v1.6.2` with packaging and metadata fixes only, crate still 0.6.0,
  `rs/src` byte-identical to v1.6.1. Or (b) publish v1.6.1 exactly as it is, with the archived-repo link and 122 files.
  #67 allows "v1.6.1 or newer".
- **D2:** should the `pqcross` cross-test binary ship in the published crate? (I recommend not: mark it test-only or move it.)
- **D3 (publish mechanism):** Leif runs `cargo publish` by hand from the tagged checkout (recommended for 0.6.0),
  or sets up a crates.io trusted publisher plus a root workflow (better for 0.7.0 and later).
- **D4 (#73 owner):** algochat implements Algorand mnemonic decoding itself (small and dependency-free; wordlist plus
  SHA-512/256 checksum; vectors from algosdk), or it depends on a released Algorand Rust crate's
  mnemonic module (to be confirmed in algonaut 0.9.0, and only if that's light enough).
- **D5 (#72 owner):** is attachment encryption part of the AlgoChat crate (and TS AlgoChat), or a separate released Raven crate?
- **D6 (#69 owner):** approve a research spike to choose the released Falcon/`pqsig` owner before any scope.
- **Split of #70:** algochat owns vectors (#70a–c). LocalNet app-to-app E2E (#70d) moves to raven-desktop.

## 6. Human gates

1. **Intent gate (now):** approve §1 as a whole, editing the wording if needed. Then I capture CRATE-1..7 with `hi`.
2. **Scope gate (now, alongside):** approve Release A and Release B as defined in §3, plus answers to D1–D4.
   Later rows stay out of scope until they get their own gates.
3. **Acceptance:** native SpecSync implementation review for each release's change.
4. **Release:** a separate decision from Leif before each tag and `cargo publish`. It never happens as a side effect.
5. **Merge:** Leif merges every PR.
