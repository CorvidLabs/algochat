---
module: crate
version: 1.0.1
status: active
owner: CorvidLabs
files:
  - src/lib.rs
  - src/group_admin.rs
db_tables: []
depends_on:
  - client
  - protocol
  - psk
---

# Crate

## Purpose

Defines the `algochat` crate boundary. Internal implementation modules remain
private and their supported public items are re-exported from the crate root.

## Public API

### Re-export Boundary

The root publicly re-exports the supported client, blockchain, model, queue,
storage, standard cryptography, envelope, key, signature, shared type, PSK
cryptography, PSK envelope, exchange, ratchet, state, PSK type, and hybrid ML-KEM session APIs. The
implementation modules themselves remain private and expose no separate module symbol.

### Exported Types

| Type | Description |
|------|-------------|
| `draft_admin` | Drafts an authorized 0x03 delta room note. The member list is omitted. |
| `reduce_admin` | Reduces administration transactions into one room. |
| `reduce_admin_with_parent` | Reduces a channel against its parent room timeline. |
| `sender_may_post` | Whether a member may post at an epoch. |
| `delivery_authorized` | Whether one accepted record authorizes a key delivery. |
| `authorized_recipients` | Members still authorized to receive the room key for one record. |
| `channel_departures` | Channel members who are no longer in the parent room. |
| `pending_key_deliveries` | Recipients who do not yet have a landed key payment. |
| `next_delivery_batch` | The next separate key payments, at most 16, not one atomic group. |
| `seal_group_key_delivery` | Seals a 227-byte 0x06 action-5 delivery. |
| `open_group_key_delivery` | Opens a 227-byte 0x06 action-5 delivery. |
| `RoomState` | Accepted room roster, including a parent group id of 32 zero bytes when the room is not a channel. |
| `AdminDraft` | Inputs for one administration draft, including the parent room when the note is for a channel. |
| `AdminEvent` | One administration transaction. |
| `AcceptedAdmin` | One accepted administration record. |
| `RejectedAdmin` | One rejected administration transaction. |
| `ReduceAdminResult` | Reducer output. |
| `GroupKeyDelivery` | Opened action-5 delivery. |
| `GroupAdminError` | Room administration error. |

## Invariants

1. Supported API items are reachable from the crate root without exposing implementation modules.
2. The crate root contains no independent protocol behavior; behavior remains owned by its canonical module contract.
3. A new 0x03 note omits the member list (count 65535), records one subject, and ends with the parent group id, or 32 zero bytes when the room is not a channel. The note is at most 4096 bytes. A room holds 256 members. A full list of 256 members is too large. An older full-list note still decodes and reduces. A channel is a separate room owned by the parent room's owner, and parent membership is not copied in. Key delivery stays separate payments, at most 16, and is not one atomic group.

## Behavioral Examples

### Scenario: Consumer import

- **Given** a downstream Rust consumer
- **When** it imports `algochat::ChatEnvelope` or `algochat::AlgoChat`
- **Then** the item is available through the crate-root re-export surface

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Public item is removed from its root re-export | Member-level SpecSync validation reports API drift. |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `client` | Client, ports, models, queue, and storage API. |
| `protocol` | Standard crypto and shared API. |
| `psk` | PSK crypto, ratchet, and exchange API. |

### Consumed By

| Module | What is used |
|--------|-------------|

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-07-14 | CorvidLabs | Added an explicit SpecSync contract for the crate re-export boundary. |
| 2026-10-28 | CorvidLabs | Room notes omit the member list so one room can hold 256 people, and a channel names its parent room. |
| 2026-07-14 | CHG-0001-adopt-specsync-5-0-1-and-trust-1-0-0-governance-for-the-rust-algochat-implementa: Adopt SpecSync 5.0.1 and Trust 1.0.0 governance for the Rust AlgoChat implementation |
