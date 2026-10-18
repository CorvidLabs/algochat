// Package algochat implements the AlgoChat protocol for encrypted messaging on Algorand.
//
// AlgoChat provides end-to-end encrypted messaging using X25519 key exchange,
// ChaCha20-Poly1305 AEAD encryption, and HKDF-SHA256 key derivation. Messages are
// transmitted via Algorand transaction notes.
//
// # Protocol Features
//
//   - Per-message key separation via fresh ephemeral keys for standard and PSK notes
//   - Long-term history recovery; no forward secrecy
//   - Optional hybrid X25519 + ML-KEM-768 session helpers
//   - Bidirectional decryption (sender can decrypt their own messages)
//   - Key-publish payload filtering
//   - Reply threading with context
//   - Ed25519 signature verification for key announcements
//   - In-memory caching for messages, keys, and public key discovery
//   - Offline message queue with retry logic
//
// # Quick Start
//
//	// Create accounts from Algorand seeds
//	sender, _ := algochat.NewChatAccountFromSeed("SENDER_ADDR", senderSeed, senderEd25519Pub)
//	recipient, _ := algochat.NewChatAccountFromSeed("RECIPIENT_ADDR", recipientSeed, recipientEd25519Pub)
//
//	// Encrypt a message
//	envelope, _ := algochat.EncryptMessage("Hello!", sender.EncryptionPublicKey, recipient.EncryptionPublicKey)
//
//	// Encode for transaction note
//	noteBytes := algochat.EncodeEnvelope(envelope)
//
//	// Decode and decrypt
//	decoded, _ := algochat.DecodeEnvelope(noteBytes)
//	content, _ := algochat.DecryptMessage(decoded, recipient.EncryptionPrivateKey, recipient.EncryptionPublicKey)
//	// content.Text == "Hello!"
//
// # Standard and PSK Wire Formats (protocol 1.3.0)
//
// Standard envelope: 126-byte header + variable ciphertext. The on-chain note
// limit is 4096 bytes, including the 16-byte Poly1305 tag, so the largest
// standard plaintext is 3954 bytes. An 882-byte plaintext still encodes to
// 1024 bytes. The header stays 126 bytes. Protocol ID 0x02 is Extra lock.
// Version 0x02 binds the full header as payload associated data.
//
// The following offsets describe the standard envelope only. Extra lock uses
// protocol ID 0x02 and inserts a 4-byte counter after the protocol byte, making
// its header 130 bytes and its plaintext limit 3950 bytes. Both modes accept
// version 0x01 or 0x02; this implementation emits version 0x01. Sender-key wraps
// use empty associated data in either version.
//
//	Byte 0:       Version (0x01 or 0x02)
//	Byte 1:       Protocol ID (0x01 = standard)
//	Bytes 2-33:   Sender's X25519 public key (32 bytes)
//	Bytes 34-65:  Ephemeral X25519 public key (32 bytes)
//	Bytes 66-77:  Nonce (12 bytes)
//	Bytes 78-125: Encrypted sender key (48 bytes = 32 key + 16 auth tag)
//	Bytes 126+:   Ciphertext (plaintext plus a 16-byte tag; max 3954-byte plaintext)
//
// Hybrid sessions use separate layouts: one 2366-byte protocol 0x04 handshake,
// then protocol 0x05 messages with a 78-byte authenticated header and up to
// 4002 plaintext bytes. They reuse the established session key and do not
// provide forward secrecy.
//
// # Payment Fee
//
// PaymentFee prices an allowed note. The first 1024 bytes cost one minimum
// fee. Each byte past 1024 adds one ten-thousandth of the minimum fee, rounded
// up once. There is no Falcon signer, so the fee is one minimum fee plus that
// note surcharge. At a minimum fee of 1000 microAlgos, 1024 bytes cost 1000,
// 2000 bytes cost 1098, and 4096 bytes cost 1308. A 4097-byte note is rejected.
package algochat
