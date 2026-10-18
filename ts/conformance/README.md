# AlgoChat Conformance Test Vectors

Deterministic, language-agnostic test vectors for the AlgoChat protocol,
checked against the current TypeScript implementation with **85 verifier checks**.
Vector metadata still records the historical generator label `v0.4.1`; it is not
the current package version (see [`package.json`](../package.json)).

These vectors exist so that:

1. **Any independent implementation** (any language, any platform) can prove
   byte-level and behavior-level agreement with the protocol without reading
   the TypeScript source.
2. **This package can detect its own regressions** — `tools/verify.mjs`
   re-checks every vector against the current source tree.
3. **External review gets cheaper.** A reviewer can confirm the crypto
   composition is self-consistent and spec-conformant before spending a
   single hour on adversarial analysis.

This is a self-consistency contract, **not a security audit**. It checks the recorded
protocol cases; it does not establish complete specification coverage or prove
that the protocol is secure.

## Layout

| File | What it pins down |
|---|---|
| `vectors/00-protocol-constants.json` | Version bytes, protocol IDs (0x01 standard / 0x02 PSK), header sizes, ratchet constants (`SESSION_SIZE` 100, `COUNTER_WINDOW` 200, standard `MAX_PAYLOAD_SIZE` 3954, PSK `MAX_PAYLOAD_SIZE` 3950) |
| `vectors/01-key-derivation.json` | HKDF-SHA256 X25519 derivation (salt `AlgoChat-v1-encryption`, info `x25519-key`), full mnemonic → account → X25519 chain, ECDH symmetry, Ed25519 key-announcement signatures, fingerprints |
| `vectors/02-standard-envelope.json` | 0x01 wire format byte-exact encoding of a fully specified envelope; a captured real envelope (frozen ephemeral key + nonce) decrypted via **both** the recipient path and the sender path |
| `vectors/03-psk-ratchet.json` | Two-level ratchet chain at counters 0/1/99/100/101/250 (session boundary crossings), hybrid ECDH+PSK message key, and the replay-window state-machine transcript |
| `vectors/04-psk-envelope.json` | 0x02 wire format (counter-bearing header, 130 bytes) byte-exact encoding; captured real PSK envelope + decryption |
| `vectors/05-psk-exchange.json` | Out-of-band exchange URI: deterministic creation, parse round-trip, malformed-URI rejection |
| `vectors/06-negative-cases.json` | Mandatory failure behavior: tampered ciphertext, tampered sender-key (both paths), wrong key, truncation, bad version, misclassification, wrong ratchet position |

All byte strings are lowercase hex. All inputs are fixed **public test
values** — every seed and PSK in these files is published by definition and
must never secure anything.

## How the vectors were produced

`tools/generate.mjs` runs the reference implementation with fixed inputs.
Encryption randomness (ephemeral keys, nonces) is **captured**, not
regenerated, so the recorded envelopes are stable decryption targets forever.
The generator refuses to emit vectors if a protocol invariant fails (ECDH
symmetry, round-trips, replay rejection) — vectors must never enshrine
broken behavior.

```bash
# Run these commands from the ts/ directory.
# Regenerate (overwrites conformance/vectors/)
bun conformance/tools/generate.mjs

# verify the current source tree against the frozen vectors
bun conformance/tools/verify.mjs
```

(The `.mjs` tools import TypeScript source and its dependencies; the documented runner is Bun.)

### Regeneration semantics (verified empirically)

- Files `00`, `01`, `03`, `05` are **fully deterministic**: they must
  regenerate byte-identically forever.
- Files `02`, `04`, `06` contain captured envelopes made with fresh
  ephemeral keys and nonces, so their `capturedEnvelope` sections (and the
  negative-case inputs derived from them) **rotate on every regeneration by
  design**. Their `encodingVector` sections are deterministic and must not
  change.
- A byte change in **any deterministic section** is a protocol change, not
  a test update — review it like one.

## Continuous integration

The file `conformance/ci/conformance.yml` is a historical standalone workflow
template, not an active monorepo workflow. Its old 79-check step label predates
the current 85-check verifier. The active root [TypeScript workflow](../../.github/workflows/ts.yml)
calls the package tests, build and consumer qualification through
[`qualify.py`](../../scripts/release/qualify.py); it does not invoke this vector
verifier or regeneration tripwire. Run the commands above explicitly when
checking these vectors.

## Verifying an independent implementation

The JSON files are the contract; the verifier is just one consumer of it. A
third-party implementation passes when, for every vector file:

- **Derivation vectors** — recompute from the recorded inputs; outputs must
  be byte-equal.
- **Encoding vectors** — encode the recorded fields; bytes must be exact.
  Decode the recorded bytes; fields must round-trip.
- **Captured envelopes** — decrypt the frozen envelope with the recorded
  keys; the exact plaintext must come out, via both paths where specified.
- **Negative cases** — match the recorded failure mode (`throw` with error
  class, or `null`); **no case may emit plaintext or partial content**.
- **State transcript** — replay the operations; every `valid` flag and state
  snapshot must match.

## Documented behaviors an implementer must know

Surfaced while generating these vectors — each is recorded in the vectors
with a note, and collected here because they are easy to get wrong:

1. **Version `0x02` authenticates the whole fixed header.** The recipient
   derives its key through ephemeral ECDH rather than unwrapping
   `encryptedSenderKey`, but that field is still part of the payload AAD.
   Tampering with it therefore fails both decryption paths in current
   captured vectors (see `06`). Only legacy version `0x01`, which has no
   header AAD, permits recipient decryption after sender-wrap tampering.
2. **AEAD authentication failures surface as generic `Error`** (from
   `@noble/ciphers`) at the decrypt layer, while wire-format violations
   (truncation, bad version) throw the typed `EnvelopeError` at the decode
   layer. Spec invariant 2 covers decoders; the decrypt layer's contract is
   "fail, never emit plaintext," and the exact error class is not part of
   the protocol.
3. **Replay window is enforced relative to the highest accepted counter:**
   with `peerLastCounter = 2` and `COUNTER_WINDOW = 200`, counter 250 is
   already "unreasonably far ahead" and is rejected (see `03` transcript).
4. **Packaging note (non-protocol):** source relative imports use `.js`
   extensions and the build uses TypeScript `NodeNext`. The active release
   qualification installs the packed artifact into a separate consumer,
   imports it with Node.js, and checks its TypeScript declarations. This
   package check is separate from the vector verifier.

## Relationship to the existing `bun test` suite

The unit tests and these vectors test **different properties**, and the gap
runs in both directions:

- `bun test` checks runtime behavior, randomized round-trips and selected
  fixtures, including the newer hybrid helpers. This frozen corpus separately
  records standard/PSK bytes and failure transcripts for independent consumers.
  Passing a round-trip alone would miss a coordinated encoder/decoder change
  that made old messages unreadable; the frozen compatibility values help
  detect that regression.
- Conversely, the vectors do **not** cover everything the unit tests do:
  key-publish payloads decrypting to `null`, empty-PSK equivalence with
  no-PSK, invalid-PSK-length errors, ephemeral uniqueness, and the
  blockchain/queue/cache layers are unit-test territory (I/O and behavior,
  not byte determinism).

They are complements. Run both.

## Coverage and non-goals

Covered: key derivation, ECDH, both envelope wire formats, the PSK ratchet
and its replay window, exchange URIs, and recorded failure behavior. These
vectors do not cover hybrid ML-KEM sessions (`0x04` / `0x05`); those have
separate tests and root [`vectors/`](../../vectors/) fixtures.

Deliberately not covered (and why): on-chain transport, key announcement
discovery, indexing, queue/sync, and storage — these are I/O boundaries, not
deterministic functions, so they belong in integration tests, not byte
vectors. Per spec invariant 10, AlgoChat makes **no metadata-privacy
claims**; nothing in this suite should be read as one.

## Maintenance rules

- **Vectors are append-only.** Changing existing bytes invalidates every
  independent implementation that passed them. If the protocol changes, bump
  the protocol version and add a new vector set.
- **Regeneration requires review of the deterministic sections** (see
  semantics above). Rotating captured bytes alone is not a protocol change;
  a changed deterministic byte is.
- **Never commit real key material.** Fixed, public, sequential test inputs
  only. If a vector ever needs entropy, freeze the captured value.
