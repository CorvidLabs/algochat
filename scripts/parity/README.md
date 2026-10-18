# Local parity replay and regression probes

These commands preserve the local audit's reproducible checks. The dated
[verification report](../../docs/verification/2026-10-18-parity.md) records the
results for `237a974`; rerunning a command creates new evidence for your checkout.
A successful low-level mesh does not establish complete feature parity,
independent security review, or a statistical confidence percentage.

Use Python 3.11+ to run the wrappers. Every `--output` must name a **new directory
outside the checkout**. Logs and JSON stay there; no library sources are edited.
Outputs label the candidate, working-tree state and local evidence category.
Toolchain builds may fetch their ordinary dependencies. No command publishes
packages or sends public-network transactions.

## All-six offline mesh

Prerequisites: Bun and installed `ts/` dependencies, Go, Cargo/Rust, Gradle with
JDK 17, Python with the `py/` dependencies, and Swift on **macOS 26+** for the
CryptoKit ML-KEM helper. Linux Swift deliberately lacks that hybrid helper; an
all-six replay fails there rather than counting it as a pass. The audit used
Rust 1.95 and found the declared 1.85 minimum incompatible with the resolved
dependencies. `kt/gradlew` currently delegates to Gradle on PATH; it does not pin
the version in wrapper properties.

For example, prepare Python and TypeScript dependencies with:

```sh
python3 -m venv py/.venv
py/.venv/bin/python -m pip install -e ./py
bun install --cwd ts --frozen-lockfile
```

Configure `JAVA_HOME` for JDK 17 and select a tested Gradle installation when
needed. The mesh builds fresh Go, Rust, Kotlin and Swift helpers, records build
logs/tool versions, then opens every writer's classical, PSK and hybrid notes in
all six readers:

```sh
python3 scripts/parity/mesh.py --output /tmp/algochat-mesh-new
# Optional tool selections:
python3 scripts/parity/mesh.py --output /tmp/algochat-mesh-other \
  --gradle /path/to/gradle/bin/gradle --java /path/to/jdk/bin/java \
  --python /path/to/venv/bin/python
```

Exit **0** means the asserted mesh paths passed; **1** means an asserted behavior
failed; **2** means the run could not complete. Missing helpers, failed builds,
malformed responses, wrong response ids and timeouts never count as passes.
`mesh-summary.json` names the scope and counts. Successful reads compare both
sender and recipient plaintext and hybrid session keys. A negative helper reply
shows the combined operation failed; it does not separately prove each endpoint
rejected every mutated legacy header. Legacy v1 does not have full payload AAD
header binding.

## Required-behavior probes

These probes target known defects from the audit. On audited commit `237a974`
they return **1** because the required behavior is violated. They assert the
required behavior; a reproduced defect is never a passing acceptance result.
Execution/build/dependency errors return **2** and are recorded separately.
Neither probe depends on the ambient `/tmp/pq-live.json` file or a live chain.

```sh
python3 scripts/parity/rust_replay.py --output /tmp/algochat-rust-replay-new
python3 scripts/parity/swift_history.py --output /tmp/algochat-swift-history-new
```

The Rust probe adds only a test in a temporary source copy and synchronizes two
receives of the same valid PSK ciphertext. At most one may return plaintext per
trial. The Swift probe uses public APIs in a temporary consumer: reading the same
transaction again, including after restoring persisted PSK state, must retain its
history while a distinct transaction with a reused counter remains a replay.
See each command's `--help` for execution options and its `result.json` for the
actual outcome. Retain failing probes when implementing the eventual fixes.

## Runner checks

```sh
python3 -m unittest discover -s scripts/parity -p 'test_*.py' -v
```

These protocol/CLI checks need only Python. They check wrong ids, malformed or
missing helper output, timeout cleanup and unsafe output directories; they do
not substitute for the language suites or regression probes. The root Trust
lane and hosted release qualification remain separate gates.
