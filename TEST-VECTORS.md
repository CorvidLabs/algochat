# AlgoChat Test Vectors

**Version**: 1.5.0
**Purpose**: Cross-implementation verification

These test vectors enable implementations to verify correctness by using deterministic inputs and checking outputs match exactly.

Protocol 1.2 does not add envelope vectors. Falcon-1024 is an Algorand
authorizing signature, not an envelope mode. The 32-byte `seed` values below
are **mnemonic entropy** (identical to Ed25519 `sk[0:32]`). They are not a
prefix of a Falcon secret key.

Protocol 1.2.1 does not add envelope vectors either. It is a capacity and
fee change on the same envelopes as 1.2. The note limit is 4096 bytes.
Standard plaintext maximum is 3954 bytes. PSK plaintext maximum is 3950
bytes. The ciphertext bytes in this file are unchanged.

Protocol 1.3.0 adds one hybrid session-key vector. The handshake note itself
is not pinned here because the sender wrap uses a random nonce. Implementations
MUST match the session key for the inputs below.

## 1. Key Derivation

### Test Case 1.1: Key Derivation from Seed

Given a 32-byte seed (all zeros):

```
Input:
  seed = 0x0000000000000000000000000000000000000000000000000000000000000000
  salt = "AlgoChat-v1-encryption" (UTF-8)
  info = "x25519-key" (UTF-8)

Expected Output:
  encryption_seed = HKDF-SHA256(seed, salt, info, 32)
  encryption_seed_hex = "1bd5f8356b720b8fc639fdd240409d4f76fa0ec52ebcd5351e80235d1ceed32f"
  public_key_hex      = "7e8d332a8d69b9a69fd394b5dfb9716b1ec442482c7374c257dbb1f7a61e1014"
```

### Test Case 1.2: Key Derivation from Non-Zero Seed

Given a 32-byte seed (0x01 repeated):

```
Input:
  seed = 0x0101010101010101010101010101010101010101010101010101010101010101
  salt = "AlgoChat-v1-encryption" (UTF-8)
  info = "x25519-key" (UTF-8)

Expected Output:
  encryption_seed_hex = "d94c1062a49c32ef69e3dc1c26c2fb06ca5d4e70b437c98ee12ea84e4d6e708c"
  public_key_hex      = "cec4b54db91870aef26b5fb00a5cad74a146c69ab5bd241ba8247e977e3ee86c"
```

## 2. Envelope Encoding

### Test Case 2.1: Minimal Envelope

A minimal valid envelope with known values:

```
Input:
  version = 0x01
  protocol = 0x01
  sender_pubkey = 0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA (32 bytes)
  ephemeral_pubkey = 0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB (32 bytes)
  nonce = 0xCCCCCCCCCCCCCCCCCCCCCCCC (12 bytes)
  encrypted_sender_key = 0xDDDD...DDDD (48 bytes of 0xDD)
  ciphertext = 0xEEEE...EEEE (16 bytes of 0xEE, minimum for auth tag)

Expected Wire Format (hex):
  0101  // version, protocol
  AAAA...AA  // sender_pubkey (32 bytes)
  BBBB...BB  // ephemeral_pubkey (32 bytes)
  CCCC...CC  // nonce (12 bytes)
  DDDD...DD  // encrypted_sender_key (48 bytes)
  EEEE...EE  // ciphertext (variable)

Total Size: 126 bytes header + 16 bytes ciphertext = 142 bytes minimum
```

### Test Case 2.2: Invalid Envelopes (Standard Mode)

These should all fail validation. These are normative requirements; a port accepting a header without the required authentication tag has a validation gap, even though AEAD decryption will subsequently fail. See [docs/ACCURACY.md](docs/ACCURACY.md).

```
// Too short (< 142 bytes minimum for standard, < 146 for PSK)
0x0101AABB  // Only 4 bytes

// Illegal version. Version 0x02 with protocol 0x01 or 0x02 is valid.
// Readers MUST accept it. See PROTOCOL.md section 5.4.1.
0x0001...   // Version 0x00 is not accepted

// Not an everyday note. Room administration is version 0x02 and protocol 0x03.
0x0103...   // Version 0x01 with protocol 0x03 is not a 0x03 record

// Missing data
0x0101 + 30 bytes  // Header truncated
```

Note: Protocol `0x02` (ratcheting PSK) is valid as of v1.1. See Test Case 4.5.

## 3. Encryption Round-Trip (Standard Mode)

### Test Case 3.1: Static Key Encryption

Using deterministic keys for reproducible results. **WARNING**: In production, ephemeral keys and nonces MUST be randomly generated. These deterministic values are for testing only.

```
Sender (seed 0x01 repeated):
  private_key = d94c1062a49c32ef69e3dc1c26c2fb06ca5d4e70b437c98ee12ea84e4d6e708c
  public_key  = cec4b54db91870aef26b5fb00a5cad74a146c69ab5bd241ba8247e977e3ee86c

Recipient (seed 0x02 repeated):
  private_key = 65f0757ead8b4214b1fe3374eb309cfd4c8d70fb8f3b3cd7152d5d031a5c32ee
  public_key  = 5d5da7177c24372f08fbd5f2acaf1a94296a9fd1d747e03a370ab162ed484d09

Ephemeral (derived from seed 0x03 repeated - TEST ONLY):
  private_key = 28d42355e2702856cf164e837854636bfaf31bbf3c67b845d52967f1f0fd1624
  public_key  = a56fa4362f0646d8818192d769727ca9dca7fc60730b69b632fc7bb370757f53

Nonce (TEST ONLY): 040404040404040404040404

Plaintext (JSON): {"text":"Hello, AlgoChat!"}
Plaintext (hex):  7b2274657874223a2248656c6c6f2c20416c676f4368617421227d

Intermediate Values:
  shared_secret (eph→recipient) = 3d4a443a1a0cafb7bb0eee148334f307e862ba9b5d517b475c903f8245ff1750
  symmetric_key                 = 46c424fb9d8004597f8ebd3d13f6c76147e0f483f51eb7ecf92ba13c84a52df6
  shared_secret (eph→sender)    = 86a66e48b0821f96ec63514f37ab235c2805bdb4b1b2fce695ff8a75c287eb16
  sender_encryption_key         = 98f6d0a310b1e690cb57fd709b2ab3abf4800430979128daccc724f278e08c2c

Expected Outputs:
  ciphertext (43 bytes):           fe1961dd7e1b600f439b401d2e68ed121ccc9ee49affb0c854e4676ce4da495edf12944cb1aa5431e1ce98
  encrypted_sender_key (48 bytes): da920f09c621960fa09f1da7218c88dd53e6a04a6053635c9c38aa9dfb52f142809219686c92e5d8c438dbf66318db24

Full Envelope (169 bytes):
  0101cec4b54db91870aef26b5fb00a5cad74a146c69ab5bd241ba8247e977e3ee86c
  a56fa4362f0646d8818192d769727ca9dca7fc60730b69b632fc7bb370757f53
  040404040404040404040404
  da920f09c621960fa09f1da7218c88dd53e6a04a6053635c9c38aa9dfb52f142809219686c92e5d8c438dbf66318db24
  fe1961dd7e1b600f439b401d2e68ed121ccc9ee49affb0c854e4676ce4da495edf12944cb1aa5431e1ce98
```

**Verification Steps:**

1. Derive sender encryption keys from sender seed
2. Derive recipient encryption keys from recipient seed
3. Parse envelope and verify fields match expected values
4. Decrypt as recipient - must return exact plaintext
5. Decrypt as sender (via encrypted_sender_key) - must return exact plaintext

### Test Case 3.2: UTF-8 Text Handling

```
Plaintext: "Hello! Bonjour! Hallo! Ciao! Hola!"

Verification:
- Encrypt with any valid key pair
- Decrypt must return exact UTF-8 string
- Byte length verification: plaintext is 34 bytes UTF-8 (all characters in this example are ASCII)
```

## 4. PSK Ratchet Derivation

### Test Case 4.1: Session PSK Derivation

```
Input:
  initial_psk = 0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA (32 bytes of 0xAA)

Counter = 0 (session_index = 0, position = 0):
  session_psk_hex  = "a031707ea9e9e50bd8ea4eb9a2bd368465ea1aff14caab293d38954b4717e888"
  position_psk_hex = "2918fd486b9bd024d712f6234b813c0f4167237d60c2c1fca37326b20497c165"

Counter = 99 (session_index = 0, position = 99):
  session_psk_hex  = "a031707ea9e9e50bd8ea4eb9a2bd368465ea1aff14caab293d38954b4717e888"
  position_psk_hex = "5b48a50a25261f6b63fe9c867b46be46de4d747c3477db6290045ba519a4d38b"

Counter = 100 (session_index = 1, position = 0):
  session_psk_hex  = "994cffbb4f84fa5410d44574bb9fa7408a8c2f1ed2b3a00f5168fc74c71f7cea"
  position_psk_hex = "7a15d3add6a28858e6a1f1ea0d22bdb29b7e129a1330c4908d9b46a460992694"
```

**Verification:**
- Counter 0 and 99 produce the **same** `session_psk` (same session)
- Counter 100 produces a **different** `session_psk` (new session)
- All three counters produce **different** `position_psk` values

### Test Case 4.2: PSK Symmetric Key Derivation

Using the same sender/recipient/ephemeral keys as Test Case 3.1, with PSK at counter 0:

```
Sender (seed 0x01 repeated):
  public_key  = cec4b54db91870aef26b5fb00a5cad74a146c69ab5bd241ba8247e977e3ee86c

Recipient (seed 0x02 repeated):
  public_key  = 5d5da7177c24372f08fbd5f2acaf1a94296a9fd1d747e03a370ab162ed484d09

Ephemeral (seed 0x03 repeated - TEST ONLY):
  public_key  = a56fa4362f0646d8818192d769727ca9dca7fc60730b69b632fc7bb370757f53

initial_psk = 0xAAAA...AA (32 bytes of 0xAA)
ratchet_counter = 0

Intermediate Values:
  shared_secret (eph→recipient)    = 3d4a443a1a0cafb7bb0eee148334f307e862ba9b5d517b475c903f8245ff1750
  current_psk (position_psk at 0)  = 2918fd486b9bd024d712f6234b813c0f4167237d60c2c1fca37326b20497c165
  psk_symmetric_key                = cf082d0fbd4d380a5278cc29b3d584ede66f29776f86cbc8c065a9c5705de9d1

  shared_secret (eph→sender)       = 86a66e48b0821f96ec63514f37ab235c2805bdb4b1b2fce695ff8a75c287eb16
  psk_sender_encryption_key        = ca575ea2874b1f074930026f7a2729cc1543f593bc185712e65be4eab6660a59
```

### Test Case 4.3: PSK Encryption Round-Trip

Full end-to-end PSK encryption using the keys from Test Case 4.2:

```
Nonce (TEST ONLY): 040404040404040404040404

Plaintext (JSON): {"text":"Hello, AlgoChat!"}
Plaintext (hex):  7b2274657874223a2248656c6c6f2c20416c676f4368617421227d

Expected Outputs:
  psk_ciphertext (43 bytes):           e12310ee1bb20af305c081c781ca5c812851be7463629020db38b18eecb9e1ba17f3cdb5eb3b61b4a0d8af
  encrypted_sender_key (48 bytes):     1e52d902edadbb55263ded7fdd3cbaf39224813d2b528ac8977ad7a826a2a74965f97d8460a288ee6ed2b1b233b76e62

Full PSK Envelope (173 bytes):
  010200000000
  cec4b54db91870aef26b5fb00a5cad74a146c69ab5bd241ba8247e977e3ee86c
  a56fa4362f0646d8818192d769727ca9dca7fc60730b69b632fc7bb370757f53
  040404040404040404040404
  1e52d902edadbb55263ded7fdd3cbaf39224813d2b528ac8977ad7a826a2a74965f97d8460a288ee6ed2b1b233b76e62
  e12310ee1bb20af305c081c781ca5c812851be7463629020db38b18eecb9e1ba17f3cdb5eb3b61b4a0d8af
```

**Verification Steps:**

1. Derive PSK at counter 0 from `initial_psk`
2. Derive PSK symmetric key using hybrid ECDH + PSK
3. Parse PSK envelope and verify all fields match
4. Decrypt as recipient - must return exact plaintext
5. Decrypt as sender (via encrypted_sender_key) - must return exact plaintext

### Test Case 4.4: PSK Counter Window

```
// Setup: peer_last_counter = 50, COUNTER_WINDOW = 200

// Within window - MUST succeed
counter = 51    // PASS (next expected)
counter = 0     // PASS (within window, 50 behind)
counter = 249   // PASS (within window, 199 ahead)

// Outside window - SHOULD reject
counter = 251   // FAIL (> 200 ahead of 50)

// Replay - MUST reject
counter = 50    // FAIL (already seen, if 50 was successfully decrypted)
```

### Test Case 4.5: PSK Envelope Encoding

A minimal valid PSK envelope (protocol `0x02`) with known values:

```
Input:
  version = 0x01
  protocol = 0x02
  ratchet_counter = 0x00000000 (4 bytes, big-endian)
  sender_pubkey = 0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA (32 bytes)
  ephemeral_pubkey = 0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB (32 bytes)
  nonce = 0xCCCCCCCCCCCCCCCCCCCCCCCC (12 bytes)
  encrypted_sender_key = 0xDDDD...DDDD (48 bytes of 0xDD)
  ciphertext = 0xEEEE...EEEE (16 bytes of 0xEE, minimum for auth tag)

Expected Wire Format (hex):
  0102           // version, protocol
  00000000       // ratchet_counter (4 bytes)
  AAAA...AA      // sender_pubkey (32 bytes)
  BBBB...BB      // ephemeral_pubkey (32 bytes)
  CCCC...CC      // nonce (12 bytes)
  DDDD...DD      // encrypted_sender_key (48 bytes)
  EEEE...EE      // ciphertext (variable)

Total Size: 130 bytes header + 16 bytes ciphertext = 146 bytes minimum
```

## 5. HKDF Constants

All implementations must use these exact constants:

```
Key Derivation:
  salt = "AlgoChat-v1-encryption"    // 22 bytes ASCII
  info = "x25519-key"                // 10 bytes ASCII

Encryption (Standard):
  info_prefix = "AlgoChatV1"         // 10 bytes ASCII
  // Full info = info_prefix || sender_pubkey || recipient_pubkey

Sender Key (Standard):
  info_prefix = "AlgoChatV1-SenderKey"  // 20 bytes ASCII
  // Full info = info_prefix || sender_pubkey

Encryption (PSK):
  info_prefix = "AlgoChatV1-PSK"        // 14 bytes ASCII
  // Full info = info_prefix || sender_pubkey || recipient_pubkey
  // IKM = shared_secret || current_psk

Sender Key (PSK):
  info_prefix = "AlgoChatV1-PSK-SenderKey"  // 24 bytes ASCII
  // Full info = info_prefix || sender_pubkey
  // IKM = sender_shared_secret || current_psk

PSK Session Derivation:
  salt = "AlgoChat-PSK-Session"      // 20 bytes ASCII
  // info = session_index as 4-byte big-endian

PSK Position Derivation:
  salt = "AlgoChat-PSK-Position"     // 21 bytes ASCII
  // info = position as 4-byte big-endian
```

## 6. Message Payload Formats

### Test Case 6.1: Simple Text Message

```json
{"text":"Hello, world!"}
```

Must be parsed as:
- text: "Hello, world!"
- replyTo: undefined/null

### Test Case 6.2: Reply Message

```json
{"text":"This is a reply","replyTo":{"txid":"ABC123DEF456","preview":"Original message..."}}
```

Must be parsed as:
- text: "This is a reply"
- replyTo.txid: "ABC123DEF456"
- replyTo.preview: "Original message..."

### Test Case 6.3: Key Publish Payload

```json
{"type":"key-publish"}
```

Must be detected as key-publish and filtered from message lists. An optional `publicKey` field is redundant with the envelope's sender key.

### Test Case 6.4: Legacy Plain Text

```text
Hello, AlgoChat!
```

This raw UTF-8 plaintext remains readable as message text. JSON parsing is not a precondition for decrypting legacy text.

## 7. Cross-Implementation Verification

To verify interoperability between implementations:

1. **Generate Envelope in Implementation A**
   - Use seed `0x0101...01` for sender
   - Use seed `0x0202...02` for recipient
   - Encrypt message "Test message for cross-impl verification"
   - Export envelope as hex string

2. **Import and Decrypt in Implementation B**
   - Import envelope hex from step 1
   - Use same seeds to derive keys
   - Decrypt as recipient - must return exact plaintext
   - Decrypt as sender - must return exact plaintext

3. **Repeat with swapped roles**
   - Generate in Implementation B
   - Decrypt in Implementation A

## 8. Size Boundary Tests

### Test Case 8.1: 1024-byte Note (Standard)

This vector remains valid. It is no longer the maximum. An 882-byte plaintext still encrypts, and that note is 1024 bytes.

```
Plaintext size: 882 bytes
Envelope size: 126 + 882 + 16 = 1024 bytes
```

### Test Case 8.2: 1024-byte Note (PSK)

This vector remains valid. It is no longer the maximum. An 878-byte plaintext still encrypts, and that note is 1024 bytes.

```
Plaintext size: 878 bytes
Envelope size: 130 + 878 + 16 = 1024 bytes
```

### Test Case 8.3: Empty Message

```
Standard:
  Plaintext: "" (empty string)
  Ciphertext: 16 bytes (auth tag only)
  Envelope size: 126 + 16 = 142 bytes (minimum valid size)

PSK:
  Plaintext: "" (empty string)
  Ciphertext: 16 bytes (auth tag only)
  Envelope size: 130 + 16 = 146 bytes (minimum valid size)
```

### Test Case 8.4: Maximum Size Message (Standard)

No ciphertext bytes are given for this size. The lengths are the protocol maximum. The plaintext encrypts to a note of exactly 4096 bytes.

```
Plaintext size: 3954 bytes (MAX_PAYLOAD_SIZE)
Envelope size: 126 + 3954 + 16 = 4096 bytes (exactly MAX_NOTE_SIZE)
```

### Test Case 8.5: Maximum Size Message (PSK)

No ciphertext bytes are given for this size. The lengths are the protocol maximum. The plaintext encrypts to a note of exactly 4096 bytes.

```
Plaintext size: 3950 bytes (PSK_MAX_PAYLOAD_SIZE)
Envelope size: 130 + 3950 + 16 = 4096 bytes (exactly MAX_NOTE_SIZE)
```

### Test Case 8.6: Oversized Message (Must Fail)

883 bytes (standard) and 879 bytes (PSK) used to be oversized. Under 1.2.1 they are legal. One byte past the new maximum MUST fail before a transaction is built. A 4097-byte note is not a legal note.

```
Standard:
  Plaintext size: 3955 bytes
  Expected: Encryption error "message too large"

PSK:
  Plaintext size: 3951 bytes
  Expected: Encryption error "message too large"
```

## 9. Version Upgrade Path

Protocol `0x02` (ratcheting PSK) was added in v1.1. Implementations SHOULD:

1. Support both `0x01` (standard) and `0x02` (ratcheting PSK) for decryption
2. Reject unknown protocol bytes with a clear error
3. Use the protocol byte in the envelope to determine the decryption path

## Appendix A: Reference Hex Values

For byte-level verification:

```
UTF-8 Constants (hex):
  "AlgoChat-v1-encryption"       = 416c676f436861742d76312d656e6372797074696f6e (22 bytes)
  "x25519-key"                   = 7832353531392d6b6579 (10 bytes)
  "AlgoChatV1"                   = 416c676f436861745631 (10 bytes)
  "AlgoChatV1-SenderKey"         = 416c676f4368617456312d53656e6465724b6579 (20 bytes)
  "AlgoChat-PSK-Session"         = 416c676f436861742d50534b2d53657373696f6e (20 bytes)
  "AlgoChat-PSK-Position"        = 416c676f436861742d50534b2d506f736974696f6e (21 bytes)
  "AlgoChatV1-PSK"               = 416c676f4368617456312d50534b (14 bytes)
  "AlgoChatV1-PSK-SenderKey"     = 416c676f4368617456312d50534b2d53656e6465724b6579 (24 bytes)

Protocol Constants:
  version             = 0x01
  protocol_standard   = 0x01
  protocol_psk        = 0x02
  standardNotePrefix  = 0x0101
  pskNotePrefix       = 0x0102
```

## 1.3 Hybrid session key

Inputs are raw bytes, not the account seed. `recipient_encaps_key` is the ML-KEM-768 encapsulation key derived from seed `0x22` repeated 32 times, using section 5.7. The other fields are the stated fill bytes. `kem_ciphertext` is 1088 bytes.

```
x25519_shared = 0x05 repeated 32 times
mlkem_shared  = 0x06 repeated 32 times
ephemeral_pub = 0x01 repeated 32 times
kem_ciphertext = 0x02 repeated 1088 times
sender_x25519 = 0x03 repeated 32 times
recipient_x25519 = 0x04 repeated 32 times

session_key = 9b393e8cec553ada4821c1fa04b40bf499446b19ca9218fd8dcf8b705e06d734
```

A real handshake with account seeds `0x11` and `0x22` MUST produce one 2366-byte `0x04` note, and both parties MUST derive the same session key. The sender copy is sealed under X25519 and ML-KEM to the sender. That session key is not this vector. This vector pins the combiner only. The recorded 1278-byte handshake in `vectors/pq-mlkem768.json` is the withdrawn layout.

## Group mailbox

`vectors/group-v1.json` is the shared `0x06` and `0x07` vector. The session key is an input, not a handshake output. Every field below is a repeated fill byte except the two notes and the message key, which the file records in full.

```
session_key       = 0x42 repeated 32 times
sender_x25519     = 0x11 repeated 32 times
handshake_id      = 0x43 repeated 32 times
membership_nonce  = 0x55 repeated 12 times
action            = 1
epoch             = 1
group_id          = 0x77 repeated 32 times
mailbox           = 0x88 repeated 32 times
group_key         = 0x99 repeated 32 times
message_nonce     = 0x66 repeated 12 times
counter           = 0
sender_address    = 0xAA repeated 32 times
plaintext         = UTF-8 "group-v1"

message_key = aa2036c95c79e0d8c7ce0aebcc3b2918292c3beea0b22b510dcd2315140ec905
```

The membership note is 195 bytes and starts with `0x0206`. The message note starts with `0x0207`. A repeated epoch and counter MUST fail. The previous group key MUST fail authentication. This vector does not use identifier `0x03`.

## Room administration

`vectors/group-admin-v1.json` is the shared full-list `0x03` record and the `0x06` action-5 key delivery. Those notes still open. Legacy actions 1 through 4 stay in `vectors/group-v1.json`. A create record starts with `0x0203`. Action 5 is a 227-byte note: the 78-byte hybrid header, a 133-byte plaintext, and a 16-byte tag. The session key in the delivery object is an input, not a handshake output. Fill-byte addresses in that file are test ids. A transaction id is 32 bytes of one fill value.

`vectors/group-admin-delta-v1.json` is the delta `0x03` note. The member count is `0xFFFF`, the member keys are absent, and the last 32 bytes are the parent group id (32 zero bytes when the room is not a channel). A create named `team` is 209 bytes. TypeScript, Go, Rust, Python, Kotlin, and Swift draft and reduce that file, and each walks its draft_errors. Those cases reject a 257th member and forged channel actions: a stranger creating a channel, a channel that reuses the parent mailbox, an add of someone who is not in the parent room, a channel ownership transfer, and a channel action with no parent room. A channel-create note posted by someone other than the parent owner is rejected. No language invents a different delta layout.

`vectors/group-admin-bots-v1.json` is the room bot record, ops 13 (add bot) and 14 (set bot). A bot note is a delta note with five more bytes after the parent group id: reply mode, then replies and seconds as big-endian 16-bit numbers. Its drafts cover an owner and an admin adding a bot with the suggested 5 per 60 seconds, an admin adding or the owner changing a bot to mode 2 (every message), an admin changing it, a remove, a channel add with its own settings, and the owner's op 11 that drops a removed bot from a channel. Its draft_errors cover missing settings, mode 0 or 4 and a zero rate or window on both op 13 and op 14, a rate or window above 65535 (marked `wide_integer`: TypeScript, Go, Python and Kotlin must refuse it; Rust and Swift take 16-bit values and check that it does not fit), a plain member adding a bot, marking an existing member, appointing a bot admin, giving a bot the room, changing a person who is not a bot, a bot changing itself, a plain channel add of a parent bot, and a channel add-bot of someone who is not a bot in the parent. Its reductions post the same forgeries as notes and record the exact rejection sentence, plus malformed bot notes: a bad mode, a zero limit, missing settings, settings on another op, and a full-list bot note. Bad bot notes with mode 4, a zero window, and op 14 with mode 0 or 4 are rejected; mode 2 is accepted. A join request does not make anyone a bot, and neither does anything an account posts about itself: a key announcement, a chat note, a plain-text flag, a join request, or an op 13 naming itself. A removed bot is gone from the room at a new epoch; `checks.channel_departures` names it as a channel departure, and the owner's op 11 on the channel drops it there too. TypeScript, Go, Rust, Python, Kotlin, and Swift draft, reduce and check that file the same way. `ts/scripts/emit-group-admin-bots-vector.ts` regenerates it.

## Coverage boundaries

| Evidence | Establishes | Does not establish alone |
| --- | --- | --- |
| Hybrid combiner above and valid component fields in `vectors/pq-mlkem768.json` | Deterministic ML-KEM components and KDF bytes | A valid current handshake from the withdrawn `handshake_note` field |
| `vectors/group-v1.json` | Legacy 195-byte delivery, group KDF and message bytes | Discovery or derivation of its supplied session key |
| `vectors/group-admin-v1.json` | Public full-list admin encoding/reduction and 227-byte action-5 delivery with supplied inputs | Authenticated blockchain context, actual recipient handshake recovery, persistent replay handling |
| `vectors/group-admin-delta-v1.json` | Delta `0x03` bytes, a channel parent group id, the 256-member cap, and forged channel rejects in TypeScript, Go, Rust, Python, Kotlin, and Swift | Authenticated blockchain context |
| `vectors/group-admin-bots-v1.json` | Bot `0x03` bytes (ops 13 and 14), the bot list in room state, delivery to an added bot, and the exact reject sentences in TypeScript, Go, Rust, Python, Kotlin, and Swift | Authenticated blockchain context; whether a bot keeps to its rate limit |
| Historical LocalNet reports in [PARITY.md](PARITY.md) | The author's reported run at its stated rounds | Independent current-head or release-package qualification |

Use the exact [wire tables](PROTOCOL.md#57-hybrid-session-protocols-0x04-and-0x05) and [flow guide](docs/PROTOCOL-FLOWS.md) alongside the fixtures. `vectors/group-admin-v1.json` is unchanged. `vectors/group-admin-delta-v1.json` is the delta note. The LocalNet record for that note is PROTOCOL.md.
