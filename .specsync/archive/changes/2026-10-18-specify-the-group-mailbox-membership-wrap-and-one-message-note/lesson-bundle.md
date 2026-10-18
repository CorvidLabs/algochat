# Lesson bundle — specify-the-group-mailbox-membership-wrap-and-one-message-note

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Specify the group mailbox, membership wrap, and one message note
- **Kind**: Feature
- **Specs**: protocol
- **Paths**: PROTOCOL.md
- **Acceptance**: PROTOCOL.md section 5.8 specifies 0x06 and 0x07. A 0x06 note uses the 78-byte hybrid header and carries a 101-byte membership record on an established hybrid session. A 0x07 note is 54 bytes of header plus ciphertext, paid to the mailbox. The group key wrap is PQ level 3. Everyday 0x01 is not a legal wrap. Parity is not claimed until the six-library LocalNet run in section 5.8.4.

## Evidence

- Verification commit: `c4049446659755ab3dcd82325f93937f03a36da9`
- Base commit: `237a97488ac663fdf326e07badc383b4452db4ad`
- Verified by: `specsync check --spec protocol`

## From the change's context.md

# Context

Group chat in Raven is N-1 private notes. Algorand has no multicast. A true group is one mailbox address and one current group key. The key is delivered on the hybrid session so the wrap stays PQ level 3. The message is one note on the mailbox.

## From the change's design.md

# Design

The mailbox is one Algorand address per group. The creator funds it with 100000 microAlgos. Members do not need the mailbox spending key.

0x06 reuses the hybrid session key and the 78-byte header. Only the protocol byte and the 101-byte plaintext are new. That keeps the wrap at PQ level 3 without a second KEM layout.

0x07 is the message. The header binds group id, epoch, sender, and counter. The message key is HKDF of the group key. A removed member never receives the next 0x06, so the next epoch does not open for them.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| REQ-protocol-4 | PROTOCOL.md section 5.8 states the 78-byte 0x06 header, the 101-byte membership plaintext, the 54-byte 0x07 header, the HKDF info `AlgoChat-group-v1`, and the rule that an everyday wrap is not legal. Section 5.8.4 withholds the parity claim. |

No library test is evidence for this change. The LocalNet matrix is the next change.

## Where these lessons go

- `specs/protocol/context.md`
