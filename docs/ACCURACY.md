# Documentation accuracy and intent evidence

Reviewed on **2026-10-18**, starting from source commit `b4cbfaf0c40156c5c3bffcc6b14cb3fd22e6153f`. This pass corrects documentation and descriptions of existing APIs. It does not implement the behavior gaps below, change the wire format, or establish independent security review.

A later [local parity verification dated 2026-10-18](verification/2026-10-18-parity.md) records native suites, package consumers, cross-language and LocalNet checks at candidate `237a974`, all 84 intent evidence dispositions, and the reproduced gaps that remain open.

## What the checks establish

Three parallel source audits covered the six language implementations, READMEs, canonical specs and companions, root protocol/security/implementation documents, HLDs, package manifests, workflows, and Human Intent. The source/export inventories are checked separately for each language; the root configuration alone does not measure them because its configured `src/` directory does not contain these libraries.

The assembled structural checks and exact counts are recorded below. A 100% source/export inventory means every detected source/export is registered and described. It does not prove every description, requirement, example, platform, or security property by itself. Tests of one candidate do not qualify later commits.

## Human Intent remains the agreed goal

The accepted wording now lives in one root [`hi/`](../hi/). There is no `ts/hi/` or `swift/hi/`. The 84 sentences are still there. Two ids moved because `hi check` allows an id only once: the one-call send that was `ts/hi/send.md` `SEND-1` (and `.a`, `.b`) is `SEND-7`, and the single-link PSK that was `swift/hi/psk.md` `PSK-1` (and `.a`) is `PSK-7`. Root `SEND-1` and `PSK-1` keep the sentences they already had. Every other id is unchanged.

Run `hi check` from the repository root. That command detects structural problems. It does not mark intent implemented. The dated [parity evidence](verification/2026-10-18/hi-evidence.json) still names the old paths and ids. That file is a record of the audit, not the current location.

The table below records verified mismatches and important boundaries. Criteria not listed here retain their accepted meaning; this audit does not silently mark the other criteria complete or claim a fresh end-to-end acceptance run for all 84.

| Goal or contract | Current source evidence | Status and next decision |
| --- | --- | --- |
| [`ENCRYPT-2`](../hi/encrypt.md): PQ when both peers have keys, classical fallback otherwise | The [TypeScript send path](../ts/src/services/algorand.service.ts), [Swift client](../swift/Sources/AlgoChat/AlgoChat.swift), [Python client](../py/src/algochat/client.py), [Rust client](../rs/src/algochat.rs), and [Kotlin client](../kt/src/main/kotlin/com/corvidlabs/algochat/AlgoChat.kt) use classical or explicit PSK paths. PQ session primitives are separate. | Automatic high-level negotiation/integration is unfinished. Applications currently select and wire the low-level hybrid mode. Preserve the goal. |
| [`PRIVATE-1.b`](../hi/private.md) and [`ENCRYPT-1.a`](../hi/encrypt.md): tamper rejection | [The accepted protocol](../PROTOCOL.md) retains legacy envelope v1 with empty payload AAD; v2 authenticates the full fixed header, including the sender wrap. | Full-header binding is a v2 property. Read compatibility with v1 must not be presented as equivalent header protection. A changed ciphertext still fails authenticated decryption. |
| [`SEND-3`](../hi/send.md), [`KEYS-1`](../hi/keys.md), and [`KEY-1`](../hi/key.md): recovery from the account/chain | Account-derived keys recover identity. An out-of-band PSK is not reconstructed from the chain or recovery phrase; PSK replay state also has persistence requirements. See [PSK and recovery](../PROTOCOL.md) and the language storage docs. | Recovery promises need mode-specific evidence. Do not present the recovery phrase alone as sufficient for PSK history or assume high-level clients restore hybrid sessions automatically. |
| [`PRIVATE-5`](../hi/private.md): audited cryptographic dependencies | The package includes a PQ dependency set and protocol integration beyond the classical primitives. [Security documentation](../SECURITY.md) does not establish an independent audit of AlgoChat or the complete shipped dependency set. | An assurance goal, not a completed audit claim. A standardized algorithm does not establish implementation or integration security. |
| [`MESSAGE-9`](../hi/message.md): only the network minimum unless chosen otherwise | [`MessageTransaction.fee`](../swift/Sources/AlgoChat/Blockchain/MessageTransaction.swift) adds the consensus surcharge for note bytes past 1024. | The unconditional sentence exceeds current fee behavior for larger notes. It is preserved for human review; documentation explains actual fees. |
| [`KEY-5` / `KEY-6`](../hi/key.md) and Swift storage requirements | [`KeychainKeyStorage`](../swift/Sources/AlgoChat/Storage/KeychainKeyStorage.swift) uses generic-password Keychain records on supported platforms, with a memory fallback on tvOS, watchOS, and Linux. It is not Secure Enclave key storage. | Password-protected file storage is an explicit option; durable/biometric protection is not automatic on every Apple platform. Accepted unsupported-capability requirements remain visible as gaps. |
| [`PSK-6`](../hi/psk.md), durable PSK/queue state and key-storage boundaries | [`FilePSKStorage`](../swift/Sources/AlgoChat/Storage/FilePSKStorage.swift) persists contact secrets/counters as JSON; [the file queue](../swift/Sources/AlgoChat/Queue/FileSendQueueStorage.swift) stores queued plaintext. The password-encrypted X25519 key file is a different storage facility. | Durability does not imply encrypted PSK or queued-message files. Choose storage and filesystem protection explicitly; do not reuse key-file security claims for these files. |
| Required minimum framing in [test vectors](../TEST-VECTORS.md) | TypeScript and Go reject standard notes below header-plus-tag size. [Python's parser](../py/src/algochat/envelope.py) accepts a header-only structure before later decryption fails. | A parser-level conformance gap remains. Do not claim uniform early rejection across ports or weaken the shared minimum to match the permissive parser. |
| Swift inbound oversized-envelope rejection in [testing requirements](../swift/specs/algochat/testing.md) | [`ChatEnvelope.decode`](../swift/Sources/AlgoChat/Models/ChatEnvelope.swift) and [`PSKEnvelope.decode`](../swift/Sources/AlgoChat/Models/PSKEnvelope.swift) enforce minimum framing; outgoing encryption/transaction construction enforces the 4096-byte note ceiling. | Standalone decoder rejection of oversized input is not established by those outgoing checks. Preserve the accepted requirement and qualify current behavior. |
| Historical governance clauses in Go/Swift companions | Legacy matrix versions and fixed migration test counts refer to former standalone workflows. Current root qualification is defined by the shared release workflows. | Preserve the historical record without presenting it as a current CI result. Current Go qualification does ordinary tests/build; vet/race commands are separate in its module Fledge lane. |
| Kotlin fail-before-wrap and bounded forward-counter requirements in [PSK spec](../kt/specs/psk/psk.spec.md) | [`PSKState.nextSendCounter`](../kt/src/main/kotlin/com/corvidlabs/algochat/PSKState.kt) increments `UInt`; receive validation deliberately accepts future counters without the claimed forward bound. | These normative promises exceed implementation. A behavior fix and targeted regression evidence need separate work; the requirements are not silently relaxed here. |
| Kotlin account-address derivation in [client requirements](../kt/specs/client/requirements.md) | [`fromSeed`](../kt/src/main/kotlin/com/corvidlabs/algochat/AlgoChat.kt) accepts an independently supplied address rather than deriving or verifying it. | Document caller responsibility while retaining the unmet derivation requirement. |
| Kotlin round/intra-round ordering in [client requirements](../kt/specs/client/requirements.md) | [`Conversation.append`](../kt/src/main/kotlin/com/corvidlabs/algochat/Models.kt) sorts by timestamp. | Timestamp sorting is not proof of transaction-round/offset ordering, especially for ties. |
| Kotlin no-private-key-persistence requirement in [client requirements](../kt/specs/client/requirements.md) | Construction calls the supplied key storage; [`FileKeyStorage`](../kt/src/main/kotlin/com/corvidlabs/algochat/Storage.kt) is a durable encrypted-file implementation. | The accepted blanket prohibition and the implemented opt-in persistence need human reconciliation. Do not hide the storage call or describe encrypted persistence as no persistence. |
| Rust concurrent PSK replay rejection in [client spec](../rs/specs/client/client.spec.md) | [`receive_psk`](../rs/src/algochat.rs) validates under one lock, decrypts, then records under a separate write lock. | Source-review risk: concurrent duplicate receives may both validate. Not reproduced in this audit; a deterministic concurrency regression is needed before claiming atomic replay rejection. |

## Qualification and distribution evidence

The [release matrix](RELEASE.md) distinguishes declared toolchain minima from configured hosted runners. Node 18, Python 3.10, Rust 1.85, older Apple platforms, and Android have not been established by those newer-runner lanes. Swift hybrid methods require Apple OS 26 APIs; the qualification lane covers macOS 26, while Linux excludes ML-KEM methods.

The root `v1.3.0` and nested `go/v0.2.0` tags select `8f4eaff`, not current `main`. [Dated registry observations](RELEASE.md#package-versions-and-distribution) distinguish source versions, release-note statements, public registry results, and authenticated-install evidence. GitHub metadata lists TypeScript 0.9.0; no registry package was installed or published by this audit.

[`PARITY.md`](../PARITY.md) preserves reported historical LocalNet rounds and separates the withdrawn 1278-byte handshake from the current 2366-byte layout. This pass did not replay LocalNet, obtain committed raw receipts for those rounds, or turn that report into exact-current-head qualification. Cryptographic/source review is also not an independent security audit.

## Legacy dashboard limitations

The daily/manual [status workflow](../.github/workflows/status.yml) is separate from release qualification. It currently tests five libraries and an archived web client; it omits Go. Several result-upload paths point to root filenames even though the jobs write their JSON inside language directories. The Swift job can infer success from matching output even when the command exits unsuccessfully. These are workflow defects, not evidence that the missing or failed checks passed.

The [renderer](../scripts/generate-status.ts) consumes result JSON without candidate SHA or artifact-hash validation. Its page-generation time is not each result's execution time. The library registry now lists six monorepo libraries and excludes the archived `algochat-web`; [Raven](https://corvidlabs.xyz/algorand/raven/) is the app linked from the README. Project status labels are metadata, not independent audit or release qualification. The checked-in dashboard is regenerated without test results so it does not carry old passes forward.

## Final local verification

| Language root | Registered source files | Specs | Strict structural result |
| --- | --- | --- | --- |
| `ts/` | 50/50 | 1 | 100%; no errors/warnings |
| `swift/` | 38/38 | 1 | 100%; no errors/warnings |
| `go/` | 11/11 | 1 | 100%; no errors/warnings |
| `py/` | 18/18 | 1 | 100%; no errors/warnings |
| `rs/` | 19/19 | 5 | 100%; no errors/warnings |
| `kt/` | 18/18 | 4 | 100%; no errors/warnings |

All **154/154** detected language source files are covered across **13 language specs**, with no strict warnings or missing detected-export descriptions. The root's two specs also pass strict checking; its `0/0` source-file count is not represented as language coverage. Checks ran against an isolated copy of the assembled tree with installed SpecSync 6.0.0 and did not change project policy.

The root verification lane passed document/registry validation and all **18 release-check tests**. The TypeScript conformance verifier passed **85/85** checks. Corrected Python standard/PSK examples executed; Rust/Kotlin usage blocks compiled and their low-level examples executed using existing local dependencies. The Python encrypted-storage example received a syntax check, and adapter-dependent client factories were compile-checked rather than exercised against a network.

All **84 hi criteria**, IDs, product sentences and intent text match the pre-audit exports exactly; all three `hi check` commands pass. Modified Markdown local targets and code fences pass checks. The renderer was exercised with empty results: six pending library rows, correct monorepo source links, and no carried-forward passes. The 21 touched library implementation files have unchanged executable tokens/AST when documentation comments/docstrings are excluded. The documentation renderer's changes are limited to links and explanatory markup.

Independent review addressed the original findings and caught additional wording/table errors before handoff. This is a documentation correction, not a new full six-language test run, live network replay, minimum-toolchain qualification, authenticated package-install test, or independent security audit. The remaining behavior/evidence gaps above stay open. Exact Trust and provenance results are retained with the change's verification record.
