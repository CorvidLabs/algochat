---
spec: crate.spec.md
---

## Key Decisions

- Keep implementation modules private and re-export supported items at crate root.
- Keep behavior in the owning module rather than duplicating logic in src/lib.rs.

## Files to Read First

- src/lib.rs for the crate boundary, then the owning canonical module spec.

## Current Status

- The existing crate-root surface is active; this migration changes governance only.

## Notes

- Cargo package metadata and release publication remain independent workflows.

The crate root also re-exports the shipped `pq.rs` items; their source inventory and behavior live in the protocol contract. The module remains private while its public types/functions are root imports.

`Cargo.toml` declares `rust-version` 1.85. `ctutils` is pinned to 0.4.2 because 0.4.3, which an unpinned `hybrid-array` 0.4.15 and `module-lattice` 0.2.3 resolution selects, requires Rust 1.87. The pin still builds the current ML-KEM code.
