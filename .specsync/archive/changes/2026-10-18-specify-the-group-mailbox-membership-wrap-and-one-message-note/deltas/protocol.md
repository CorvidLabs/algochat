## Added

### REQUIREMENT REQ-protocol-4

PROTOCOL.md section 5.8 SHALL specify group membership as protocol `0x06` and a group message as protocol `0x07`. A `0x06` note SHALL use the 78-byte hybrid header with the protocol byte set to `0x06`, SHALL be sealed under an established hybrid session key, and SHALL carry a 101-byte plaintext of action, epoch, group id, mailbox public key, and group key. A `0x07` note SHALL be a payment to the mailbox with a 54-byte header of version, protocol, group id, epoch, per-sender counter, and nonce, and SHALL derive its message key with HKDF-SHA256 info `AlgoChat-group-v1`. The group key wrap SHALL be PQ level 3. An everyday `0x01` wrap SHALL NOT deliver a group key. Identifier `0x03` SHALL NOT be assigned. Parity for `0x06` and `0x07` SHALL NOT be claimed until every library passes the LocalNet test in section 5.8.4.

#### Acceptance Criteria

- Section 5.8 states both headers and the 101-byte membership plaintext.
- The identifier table lists `0x06` and `0x07` as specified and not yet in the parity matrix.
- Section 5.8.4 requires a removed member's open to fail.
