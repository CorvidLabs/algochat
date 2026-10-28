# Lesson bundle — hold-every-language-to-the-channel-rules-and-the-256-member-cap

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Hold every language to the channel rules and the 256-member cap
- **Kind**: Feature
- **Paths**: vectors/group-admin-delta-v1.json, ts/src/pq/group-admin.test.ts, TEST-VECTORS.md
- **Acceptance**: Every language rejects a 257th member and forged channel actions from the shared delta vector.

## Evidence

- Verification commit: `270325f1f97cfb8cbfbadb02bd4d4d8be490237e`
- Base commit: `c1f0eb2bb1a5ab1e7a95de83ec49ebda8a298721`
- Verified by: `specsync check --spec protocol`

## From the change's context.md

# Context

Leif confirmed on 28 October 2026 that the shared cross-language room-note tests must reject the channel rules and the 256-member cap before the room-notes branch merges. Examples are a forged channel action and a 257th member.

GROUP-8.b already says a room holds 256 people. GROUP-9 already says a channel is another room, the group owner creates it, and the owner keeps it. This change does not add a protocol rule. It puts those rejects in `vectors/group-admin-delta-v1.json` and makes each language's delta test walk `draft_errors`, including a parent room when the case has one.

The wire layout stays the delta note. No second layout is introduced.

## From the change's testing.md

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

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
