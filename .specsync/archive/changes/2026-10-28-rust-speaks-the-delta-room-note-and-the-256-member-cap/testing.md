---
change: rust-speaks-the-delta-room-note-and-the-256-member-cap
artifact: testing
---

# Testing

`rs/src/group_admin.rs` tests `full_list_of_256_is_too_large_and_a_delta_note_folds_through_256`, `channel_keeps_its_roster_and_a_missed_key_payment_can_resume`, and `group_admin_delta_vector_matches_frozen_bytes`. A channel keeps its own roster. A missed key payment can resume.

The joint LocalNet run that included this Rust library is recorded with the protocol work. It is not re-run as the gate for this archive. The node was not restarted.

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| Same delta note as TypeScript | `rs/src/group_admin.rs` drafts the 0xFFFF sentinel, one subject, and the parent group id. The tests match `vectors/group-admin-delta-v1.json`. |
| Full list of 256 is rejected | The Rust tests reject that note as too large. |
| Delta fold through 256 | The Rust tests fold from 1 member to 256. |
| Old full-list notes still open | The Rust tests still reduce `vectors/group-admin-v1.json`. |
| Channel roster stays separate | The Rust tests reduce a channel with its parent events and do not copy the parent roster. |
| Missed key payment can resume | The Rust tests cover a resumed delivery after a payment that already landed. |
