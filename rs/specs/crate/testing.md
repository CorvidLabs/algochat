---
spec: crate.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| All colocated unit modules | Compile/test | Public items resolve through the crate implementation. |
| tests/cross_impl.rs | External-crate integration | Consumer-style imports from algochat. |
| examples/export_envelopes.rs | Example build | Public encryption and envelope exports remain usable. |

## Manual Testing

No manual flow is needed; Cargo build, test, and example compilation protect this boundary.

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| Root re-export removed | Consumer compilation or SpecSync validation fails. |
| Full list of 256 members | Encode fails because the note is too large. A delta note still folds through 256. |
| Channel roster and a missed key payment | The channel does not copy parent members. The next batch is 16 separate payments and can resume the one that did not land. |
| `vectors/group-admin-delta-v1.json` | Draft bytes and reduced rooms match the frozen delta vector. Older `vectors/group-admin-v1.json` full-list notes still reduce. |
