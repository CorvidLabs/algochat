## Added

### REQUIREMENT REQ-protocol-7

PROTOCOL.md section 5.4.3 SHALL name hybrid `0x04` and `0x05` as the base for a new conversation. A room SHALL use that same hybrid session for `0x06` and `0x07`. Everyday `0x01` SHALL stay assigned for a message that does not need post-quantum protection. Extra lock `0x02` SHALL stay assigned and SHALL NOT be the default. This version SHALL NOT define a mode that stacks extra lock on a hybrid session, and SHALL NOT claim PQ level 2, 4, or 5 for a message protocol.

#### Acceptance Criteria

- Section 5.4.3 says a new conversation should start with `0x04` and `0x05`.
- Section 5.4.3 says a room uses that session for `0x06` and `0x07`.
- Section 5.4.3 keeps `0x01` and `0x02` assigned and says extra lock is not the default.
- Section 5.4.3 says this version does not stack extra lock on hybrid.
