---
change: hold-every-language-to-the-channel-rules-and-the-256-member-cap
artifact: testing
---

# Testing

Each language ran against the updated `vectors/group-admin-delta-v1.json`.

| Language | Command | Result |
| --- | --- | --- |
| TypeScript | `bun test src/pq/group-admin.test.ts` in `ts/` | 16 passed, 0 failed |
| Go | `go test -count=1 -run TestGroupAdmin .` in `go/` | passed |
| Rust | `cargo test --lib group_admin_delta_vector_matches_frozen_bytes` in `rs/` | 1 passed |
| Python | `pytest py/tests/test_group_admin.py -k "delta_v1 or draft_errors"` | 2 passed |
| Kotlin | `./gradlew test --tests com.corvidlabs.algochat.GroupAdminTest` in `kt/` | passed |
| Swift | `swift test --filter GroupAdminTests` in `swift/` | 7 passed, including the v1 vector and the delta vector |

The Swift run also kept the existing full-list vector test. No assertion was removed or widened.
