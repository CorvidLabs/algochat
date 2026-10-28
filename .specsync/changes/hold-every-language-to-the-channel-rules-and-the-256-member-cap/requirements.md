---
change: hold-every-language-to-the-channel-rules-and-the-256-member-cap
artifact: requirements
---

# Requirements

- The shared delta vector rejects a 257th member.
- The shared delta vector rejects forged channel actions, including a stranger creating a channel and a channel-create note posted by someone other than the parent owner.
- TypeScript, Go, Rust, Python, Kotlin, and Swift walk those `draft_errors` with the parent room when the case has one.
- Canonical protocol specs do not change.
