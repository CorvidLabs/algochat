## Modified

### REQUIREMENT REQ-protocol-4

PROTOCOL.md section 5.8 SHALL specify group membership as protocol `0x06`, a group message as protocol `0x07`, and room administration as protocol `0x03`. A legacy `0x06` note SHALL use the 78-byte hybrid header with the protocol byte set to `0x06`, SHALL be sealed under an established hybrid session key, and SHALL carry a 101-byte plaintext of action, epoch, group id, mailbox public key, and group key. Action 5 SHALL carry a 133-byte plaintext that appends the administration transaction id. A `0x07` note SHALL be a payment to the mailbox with a 54-byte header of version, protocol, group id, epoch, per-sender counter, and nonce, and SHALL derive its message key with HKDF-SHA256 info `AlgoChat-group-v1`. The group key wrap SHALL be PQ level 3. An everyday `0x01` wrap SHALL NOT deliver a group key. Section 5.8.4 SHALL remain the historical membership run.

#### Acceptance Criteria

- Section 5.8 states both headers, the 101-byte legacy plaintext, and the 133-byte action 5 plaintext.
- The identifier table lists `0x03`, `0x06`, and `0x07`, says tag v1.4.0 includes them, and says tag v1.3.0 does not.
- Version history names 1.5.0 as the delta room note: member count 65535, 256 people, and channels the group owner keeps.
- Version history names 1.6.0 as room bots, `0x03` ops 13 and 14, listed after 1.5.0.
- Section 5.8.4 names rounds 46313 through 46322 and stays a historical membership record.
- Document the existing wire offsets, AAD and key derivations for protocols `0x03` through `0x07`, with source-grounded diagrams and explicit application responsibilities for authorization and replay tracking.
- Distinguish merged implementation behavior, normative requirements, historical reported evidence and released-version boundaries; validate documentation and obtain independent review.
