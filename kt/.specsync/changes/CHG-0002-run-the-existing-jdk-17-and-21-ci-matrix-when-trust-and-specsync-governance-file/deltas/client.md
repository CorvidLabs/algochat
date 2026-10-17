## ADDED
### SPEC SECTION SDD Adoption

The client contract was established from the existing production sources and `AlgoChatClientTest`, `AlgoChatTest`, `BlockchainTest`, `ModelsTest`, `QueueTest`, and `StorageTest`. Adoption changes governance only; it does not change client behavior.

### REQUIREMENT REQ-client-001
The client SHALL derive its encryption identity and Algorand address deterministically from the supplied seed.

Acceptance Criteria
- Existing seeded construction and encryption round-trip cases pass in `AlgoChatClientTest` and `AlgoChatTest`.

### REQUIREMENT REQ-client-002
Key discovery SHALL parse announcements and preserve whether the announcing Algorand identity verified the key signature.

Acceptance Criteria
- Existing address, signature, and discovery cases pass in `BlockchainTest`.

### REQUIREMENT REQ-client-003
Conversation state SHALL deduplicate transaction identifiers and retain deterministic round and intra-round ordering.

Acceptance Criteria
- Existing append, merge, filter, ordering, and reply-context cases pass in `ModelsTest`.

### REQUIREMENT REQ-client-004
The send queue SHALL enforce its capacity, retry timing, retry limit, state transitions, pruning, and recipient queries.

Acceptance Criteria
- Existing queue lifecycle and boundary cases pass in `QueueTest`.

### REQUIREMENT REQ-client-005
Storage implementations SHALL preserve namespaced messages, sync rounds, keys, verification metadata, and caller byte-array isolation.

Acceptance Criteria
- Existing persistence, cache, and key-storage cases pass in `StorageTest`.
