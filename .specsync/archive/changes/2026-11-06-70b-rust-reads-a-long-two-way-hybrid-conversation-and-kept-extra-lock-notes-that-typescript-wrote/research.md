---
change: 70b-rust-reads-a-long-two-way-hybrid-conversation-and-kept-extra-lock-notes-that-typescript-wrote
artifact: research
---

# Research

- Spike in a scratch clone at `b867cf8`, not in this branch: the draft emitter wrote both files twice with identical bytes (115,403 and 35,157 bytes). TypeScript gave the intended result for all 17 Hybrid cases, all 10 Extra lock cases and all 17 receive steps. Draft Rust readers passed 3 and 3 tests against those files. That run is not evidence for this change; the tests are rerun in the branch, failing first.
- TypeScript draws every random value from `crypto.getRandomValues`: `randomBytes` in `@noble/ciphers` for nonces and ML-KEM coins, and `x25519.utils.randomPrivateKey` for ephemeral keys. `initiatePQSession` accepts ML-KEM coins but no ephemeral key or nonce, and `encryptPQMessage` and `encryptPSKMessage` take neither. Replacing `crypto.getRandomValues` inside the emitter process is the only way to make the library's own output repeatable without changing the library.
- A `0x05` message opens only under the session of the handshake whose sender wrote it (`decryptPQMessage` and `decrypt_pq_message` both check the sender key and the handshake id). A reply therefore needs its own handshake, so the conversation has one handshake each way.
- The recipient does not open the sender wrap (PROTOCOL.md section 5.7), in TypeScript or Rust. A changed wrap byte is still accepted by the recipient with the same key and rejected by sender recovery. One case pins each side of that.
- TypeScript 0.12.0 writes Extra lock notes only as version `0x02` (`PSK_PROTOCOL.VERSION_AAD`) and has no writer for version `0x01`, so this vector cannot hold a TypeScript-written version `0x01` note.
- Rust's `PSKState` derives `Serialize` and `Deserialize` "for persistence across restarts". TypeScript's `PSKState` holds a `Set` and the package does not persist it. The vector therefore records the state at the restart as plain fields (`send_counter`, `peer_last_counter`, sorted `seen_counters`) that both languages compare with.
- Rust's `decrypt_psk_message` takes the initial secret and derives the counter's key itself; TypeScript's `decryptPSKMessage` takes the derived key. Both paths are exercised.
- TypeScript reading Rust-written Hybrid notes is the job of `ts/scripts/pq-cross-localnet.ts` with the `pqcross` binaries. A vector can't cover that direction, because vectors come only from TypeScript.
