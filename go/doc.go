// Package algochat implements the AlgoChat protocol for encrypted messaging on Algorand.
//
// AlgoChat provides end-to-end encrypted messaging using X25519 key exchange,
// ChaCha20-Poly1305 AEAD encryption, and HKDF-SHA256 key derivation. Messages are
// transmitted via Algorand transaction notes.
//
// # Protocol Features
//
//   - Forward secrecy via ephemeral key pairs per message
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
// # Wire Format (protocol 1.2.1)
//
// Standard envelope: 126-byte header + variable ciphertext. The on-chain note
// limit is 4096 bytes, including the 16-byte Poly1305 tag, so the largest
// standard plaintext is 3954 bytes. An 882-byte plaintext still encodes to
// 1024 bytes. The header stays 126 bytes. Protocol ID 0x02 is reserved; this
// package does not implement a PSK envelope.
//
//	Byte 0:       Version (0x01)
//	Byte 1:       Protocol ID (0x01 = standard, 0x02 = PSK reserved)
//	Bytes 2-33:   Sender's X25519 public key (32 bytes)
//	Bytes 34-65:  Ephemeral X25519 public key (32 bytes)
//	Bytes 66-77:  Nonce (12 bytes)
//	Bytes 78-125: Encrypted sender key (48 bytes = 32 key + 16 auth tag)
//	Bytes 126+:   Ciphertext (plaintext plus a 16-byte tag; max 3954-byte plaintext)
//
// # Payment Fee
//
// PaymentFee prices an allowed note. The first 1024 bytes cost one minimum
// fee. Each byte past 1024 adds one ten-thousandth of the minimum fee, rounded
// up once. There is no Falcon signer, so the fee is one minimum fee plus that
// note surcharge. At a minimum fee of 1000 microAlgos, 1024 bytes cost 1000,
// 2000 bytes cost 1098, and 4096 bytes cost 1308. A 4097-byte note is rejected.
package algochat
