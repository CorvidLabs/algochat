---
change: update-the-documentation-for-protocols-0x03-0x06-0x07-0x04-and-0x05-so-it-is-accurate-and-up-to-date-including-the
artifact: design
---

# Design

Use three complementary views: byte-offset tables in the normative protocol; sequence/state diagrams for hybrid establishment, sender recovery, administration and delivery/message acceptance; and a six-library implementation/responsibility matrix with source links.

Show clear trust boundaries: chain-authenticated transaction sender versus header X25519 key; cryptographic opening versus administration authorization; protocol counters versus application-owned durable replay state. State key-compromise and no-forward-secrecy limits without adding protocol guarantees. Show no automatic hybrid negotiation unless implemented.

Validate Mermaid parsing/rendering with available tooling, relative links and section references, repository validation and Trust. An independent reviewer must check source accuracy, completeness and diagram claims before the draft PR is described as ready for human review. Record all remaining gaps honestly. Human definition approval precedes starting the documentation change; human implementation acceptance is not recorded by this task.
