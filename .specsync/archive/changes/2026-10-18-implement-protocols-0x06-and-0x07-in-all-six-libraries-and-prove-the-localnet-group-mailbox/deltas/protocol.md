## Modified

### REQUIREMENT REQ-protocol-4

PROTOCOL.md section 5.8 SHALL specify group membership as protocol `0x06` and a group message as protocol `0x07`. A `0x06` note SHALL use the 78-byte hybrid header with the protocol byte set to `0x06`, SHALL be sealed under an established hybrid session key, and SHALL carry a 101-byte plaintext of action, epoch, group id, mailbox public key, and group key. A `0x07` note SHALL be a payment to the mailbox with a 54-byte header of version, protocol, group id, epoch, per-sender counter, and nonce, and SHALL derive its message key with HKDF-SHA256 info `AlgoChat-group-v1`. The group key wrap SHALL be PQ level 3. An everyday `0x01` wrap SHALL NOT deliver a group key. Identifier `0x03` SHALL NOT be assigned. Parity for `0x06` and `0x07` SHALL be claimed only after section 5.8.4 records a passing LocalNet run.

#### Acceptance Criteria

- Section 5.8 states both headers and the 101-byte membership plaintext.
- The identifier table lists `0x06` and `0x07` as implemented only after section 5.8.4 records the run.
- Section 5.8.4 requires a removed member's open to fail, and names the rounds after the run passes.

## Added

### REQUIREMENT REQ-protocol-5

Each library SHALL seal and open protocol `0x06` and protocol `0x07` as section 5.8 specifies. vectors/group-v1.json SHALL be the shared membership note, message key, and message note. A repeated sender, epoch, and counter SHALL be rejected. On LocalNet, the libraries SHALL create a group of three, add a fourth member, remove one member, and post one `0x07` note to that mailbox. Every library SHALL open that note. Opening it with the removed member's previous group key SHALL fail.

#### Acceptance Criteria

- All six libraries match vectors/group-v1.json.
- A repeated counter is rejected in each library.
- The LocalNet script records one mailbox, one posted message, six successful opens, and a failed open with the previous group key.
