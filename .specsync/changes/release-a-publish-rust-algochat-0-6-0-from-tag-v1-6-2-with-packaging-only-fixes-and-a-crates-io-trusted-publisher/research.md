---
change: release-a-publish-rust-algochat-0-6-0-from-tag-v1-6-2-with-packaging-only-fixes-and-a-crates-io-trusted-publisher
artifact: research
---

# Research

- crates.io trusted publishing binds a crate to a GitHub owner, repository, workflow filename and optional environment. The workflow mints a short-lived token with `rust-lang/crates-io-auth-action` (latest release `v1.0.6`, commit `3268eb413133e2960fa4ae0e963ca76380c54cd9`, published 2026-10-21) under `id-token: write`; the action's post step revokes it.
- Cargo honours `include`; auto-discovered targets whose files are excluded are dropped from the normalized manifest with a warning, so `pqcross` stays buildable in the checkout for `scripts/parity/mesh.py` but is not shipped.
- `scripts/release/qualify.py rs` already tests, packages and compiles a consumer from the extracted `.crate`, and calls `validate_package`, which today checks only the package name and `src/lib.rs`.
- `scripts/release/test_release.py` `WorkflowTests` reject publication capability in the eight qualification workflows by name; a new publish workflow is outside that list and needs its own guard tests.
- `docs/RELEASE.md` says nested legacy workflows must not be moved to root to activate publishing and that publication needs separate explicit authorization and trusted-publisher bindings. Leif's D3 is that authorization for crates.io only.
