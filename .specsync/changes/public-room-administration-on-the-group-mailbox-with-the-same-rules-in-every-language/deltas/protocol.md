## MODIFIED

### REQUIREMENT REQ-protocol-6

Each library SHALL reduce protocol `0x03` and seal protocol `0x06` action 5 as section 5.8 and `vectors/group-admin-v1.json` specify. A client SHALL accept an administration record only when the parent state authorized that sender. A join request SHALL NOT advance the room head. Adding a member SHALL NOT rotate the room key. Removal, rekey, and ownership transfer SHALL rotate it. The mailbox spending key SHALL NOT be treated as ownership. A legacy `group-v1` note SHALL still open and SHALL NOT create an owner.

Acceptance Criteria
- All six libraries match `vectors/group-admin-v1.json`, including rejected reasons.
- A non-admin record is rejected, a transfer to a non-member is rejected, and a replay is rejected.
- Removal withholds the new key from the removed member. An old message still opens. A new message fails under the old key.
- `vectors/group-v1.json` is unchanged.
- ts/src/pq/group-admin.test.ts, go/group_admin_test.go, py/tests/test_group_admin.py, rs/src/group_admin.rs, kt/src/test/kotlin/com/corvidlabs/algochat/GroupAdminTest.kt, and swift/Tests/AlgoChatTests/GroupAdminTests.swift name REQ-protocol-6.
