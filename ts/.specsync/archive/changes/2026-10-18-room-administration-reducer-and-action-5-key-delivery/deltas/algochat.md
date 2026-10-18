## ADDED

### REQUIREMENT REQ-algochat-026

The TypeScript package SHALL draft and reduce protocol 0x03 room administration records and SHALL seal and open 0x06 action 5 key deliveries as PROTOCOL.md section 5.8 and vectors/group-admin-v1.json specify. A legacy group-v1 membership note SHALL still open and SHALL NOT create an owner.

Acceptance Criteria
- ts/src/pq/group-admin.test.ts matches vectors/group-admin-v1.json for REQ-algochat-026.
- src/pq/group.test.ts still opens vectors/group-v1.json.

### SPEC SECTION Room administration

`draftAdmin` builds a public 0x03 note. `reduceAdmin` accepts a record only when the parent state authorized that sender. `senderMayPost` allows a member at the current epoch. `deliveryAuthorized` checks one accepted record. `sealGroupKeyDelivery` and `openGroupKeyDelivery` use the 227-byte action-5 note.

Exports: `GROUP_ADMIN_PROTOCOL`, `GROUP_DELIVER_ACTION`, `GROUP_NAME_MAX`, `GROUP_ADMIN_MAX`, `GROUP_MEMBER_MAX`, `GROUP_DELIVER_PLAINTEXT_SIZE`, `JOINING`, `ADMIN_OP`, `RoomState`, `AdminEvent`, `AcceptedAdmin`, `ReduceAdminResult`, `encodeAdminRecord`, `draftAdmin`, `reduceAdmin`, `senderMayPost`, `deliveryAuthorized`, `sealGroupKeyDelivery`, `openGroupKeyDelivery`, `GROUP_INFO_LABEL`, `GROUP_ACTION`, `GROUP_MEMBERSHIP_PLAINTEXT_SIZE`, `GROUP_MEMBERSHIP_NOTE_SIZE`, `GROUP_MESSAGE_HEADER_SIZE`, `GROUP_MAX_PAYLOAD_SIZE`, `GroupMembership`, `GroupCounter`, `OpenedGroupMessage`, `isGroupMembership`, `isGroupMessage`, `sealGroupMembership`, `openGroupMembership`, `deriveGroupMessageKey`, `sealGroupMessage`, `openGroupMessage`.
