---
change: 79-rs-readme-md-describes-the-packaged-crate-s-contents-the-way-70a-packages-it-req-release-3-library-sources-tests-rs
artifact: context
---

# Context

Issue #79. `rs/README.md` line 40 (install section) said the published crate contains only the library sources, the README and the license, and that the tests read the shared `../vectors/` files from a checkout. That was true for 0.6.0 (Release A, #67). #70a (PR #75, merged as 45e3d35) made the crate ship `tests/*.rs` and byte-identical `vectors/*.json` copies the tests read from inside the package (REQ-release-3, `rs/Cargo.toml` `include`), and qualification runs `cargo test --locked` inside the extracted crate. The README's later paragraph (Compatibility evidence and limits) already said so, so the two contradicted each other. Found while building #68 (PR #77) and #70b (PR #78).

This is a bug fix under Leif's merge rule of 2026-11-10 (passed on by the coordinator, hc terminal t370): work that makes behaviour or docs match existing specs, requirements or HI may run the full SpecSync lifecycle with 0xLeif as approve and review actor, and squash-merge once CI is green and every review thread is resolved. The sentence now matches REQ-release-3 as already approved; no requirement, contract, code or packaging changes.

The 0.6.0 crate on crates.io still lacks the tests and vectors, and the README's install line still shows `algochat = "0.6.0"`, so the new wording says that 0.6.0 predates the change rather than claiming the published 0.6.0 crate holds tests.
