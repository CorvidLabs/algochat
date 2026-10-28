# Lesson bundle — python-speaks-the-delta-room-note-and-the-256-member-cap

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Python speaks the delta room note and the 256 member cap
- **Kind**: Feature
- **Paths**: py/specs/algochat/algochat.spec.md, py/specs/algochat/context.md, py/specs/algochat/tasks.md, py/specs/algochat/testing.md, py/src/algochat/group_admin.py, py/tests/test_group_admin.py
- **Acceptance**: Python drafts and reduces the same delta room note as TypeScript. A full-list note of 256 members is rejected. A delta note folds through 256. Old full-list notes still open. A channel keeps its own roster. A missed key payment can be resumed.

## Evidence

- Verification commit: `cecc427b020c284f904a236ccfaf85862ed9ca5a`
- Base commit: `3124ff1e5d1bda5c7328eb29c86f7da8c0f14977`
- Verified by: `specsync check (no spec in scope)`

## From the change's context.md

# Context

The protocol change already records one added or removed person per room note, a 256 member cap, and a channel as another room owned by the group owner. That contract is the base of this branch. Python still had to speak the same bytes.

This change is the Python implementation of that contract. It does not add a second note layout. PROTOCOL.md, the canonical protocol spec, and the frozen vectors stay as the base left them.

The cross-library tool glue that passes a parent room into the local test adapter is not part of this change. It stays uncommitted while review of the joint run continues.

## From the change's design.md

# Design

Python follows the frozen delta layout. The prefix through the admin keys is unchanged. A new note writes the member-count sentinel 0xFFFF, the 32-byte subject, and a 32-byte parent group id. A full-list note keeps the old layout and must not name a parent.

`draft_admin` omits the member list. `reduce_admin` folds one operation at a time and takes the parent events for a channel. `GROUP_MEMBER_MAX` is 256. The admin cap stays 16. The owner is a separate field and is not one of those 16.

People who stayed may receive the new key. The removed subject may not. The next delivery batch is at most 16 separate payments and is not an atomic group. A missed payment is resumed from the recipients who have not been paid.

## From the change's testing.md

# Testing

`py/tests/test_group_admin.py` tests `test_full_list_of_256_is_too_large_and_delta_folds_through_256`, `test_channel_keeps_its_own_roster_and_a_missed_key_payment_can_resume`, and `test_group_admin_delta_v1_vector_matches_frozen_bytes`. A channel keeps its own roster. A missed key payment can resume.

The joint LocalNet run that included this Python library is recorded with the protocol work. It is not re-run as the gate for this archive. The node was not restarted.

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| Same delta note as TypeScript | `py/src/algochat/group_admin.py` drafts the 0xFFFF sentinel, one subject, and the parent group id. The tests match `vectors/group-admin-delta-v1.json`. |
| Full list of 256 is rejected | The Python tests reject that note as too large. |
| Delta fold through 256 | The Python tests fold from 1 member to 256. |
| Old full-list notes still open | The Python tests still reduce `vectors/group-admin-v1.json`. |
| Channel roster stays separate | The Python tests reduce a channel with its parent events and do not copy the parent roster. |
| Missed key payment can resume | The Python tests cover a resumed delivery after a payment that already landed. |

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
