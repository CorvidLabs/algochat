## Modified

### REQUIREMENT REQ-protocol-3

PROTOCOL.md section 5.4.2 SHALL be the post-quantum level of every assigned protocol, as an integer from 0 to 5. Levels 1 through 5 SHALL mean the NIST categories. Level 0 SHALL mean that Shor's algorithm breaks the key exchange and no category 1 through 5 primitive is required. Everyday `0x01` SHALL be level 0. Extra lock `0x02` SHALL be level 1 while the 32-byte pre-shared key stays secret, and level 0 if that secret is lost or low entropy. Hybrid `0x04` and `0x05` SHALL be level 3. Identifier `0x03` SHALL NOT be assigned. Levels 2, 4, and 5 SHALL NOT be claimed for a message protocol in this version. A future group key wrap SHALL be level 3 when hybrid keys are available, and at least level 1 otherwise. Level 0 does not meet that bar.

#### Acceptance Criteria

- Section 5.4.2 defines levels 0 through 5 and assigns `0x01` to 0, `0x02` to 1, and `0x04` and `0x05` to 3.
- SECURITY.md and the repository README use those integers.
- No assigned protocol is given a second, conflicting level.
