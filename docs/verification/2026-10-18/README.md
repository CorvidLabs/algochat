# Selected evidence

The [dated report](../2026-10-18-parity.md) explains scope and count definitions. Every result refers to candidate `237a97488ac663fdf326e07badc383b4452db4ad` unless a new probe records another checkout.

- [summary.json](summary.json): native counts, exact observed runtimes, matrix totals and limits.
- [hi-evidence.json](hi-evidence.json): all 84 unchanged criteria with portable evidence references. Source paths resolve from repository root at the candidate; included evidence resolves here; omitted-artifact IDs resolve to the catalog.
- [mesh-checks.jsonl](mesh-checks.jsonl), [mesh-summary.json](mesh-summary.json), [mesh-notes-catalog.json](mesh-notes-catalog.json): 2,388 observed checks and 180 note identities. Offline note bodies are omitted.
- [localnet-notes.jsonl](localnet-notes.jsonl), [localnet-summary.json](localnet-summary.json), [localnet-reader-catalog.jsonl](localnet-reader-catalog.jsonl): 96 actual encrypted notes and 540 compact reader results. Plaintext/session-key bodies are replaced with hashes and comparison fields.
- Boundary receipts: [TypeScript](boundaries/typescript.json), [TypeScript authenticated size](boundaries/typescript-authenticated-oversize.json), [Go classical](boundaries/go-classical.json), [Go PQ](boundaries/go-pq.json), [Python](boundaries/python.json), [Rust](boundaries/rust.json), [Swift](boundaries/swift.json), [Kotlin](boundaries/kotlin.json), [six-reader PQ size](boundaries/pq-inbound-all-six.json).
- [qualification-catalog.json](qualification-catalog.json): seven local categories, eight original receipts and their artifact hashes. Package/archive/log bytes are omitted; this is not hosted qualification input.
- [review.json](review.json): independent evidence review and its explicit scope limits.
- [manifest.json](manifest.json): SHA-256 of committed selected files. [omitted-artifacts.json](omitted-artifacts.json) instead identifies original local files that are unavailable here. A hash catalog is not a package artifact or proof that its bytes are available.

The selection omits generated wallet identity secrets and raw session keys. No original package archives, cached dependencies or binary audit bundle are committed. Machine-local path prefixes appearing in historical diagnostic prose are normalized to symbolic labels; they are not links or promised files.
