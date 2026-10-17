package algochat

import (
	"bytes"
	"errors"
	"strings"
	"testing"
)

func TestDeriveEncryptionKeys(t *testing.T) {
	seed := [KeySize]byte{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
		17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32}

	kp, err := DeriveEncryptionKeys(seed)
	if err != nil {
		t.Fatalf("DeriveEncryptionKeys failed: %v", err)
	}

	// Keys should be non-zero
	if kp.PrivateKey == [KeySize]byte{} {
		t.Error("private key should not be zero")
	}
	if kp.PublicKey == [KeySize]byte{} {
		t.Error("public key should not be zero")
	}

	// Same seed should produce same keys
	kp2, err := DeriveEncryptionKeys(seed)
	if err != nil {
		t.Fatalf("second DeriveEncryptionKeys failed: %v", err)
	}
	if kp.PrivateKey != kp2.PrivateKey {
		t.Error("same seed should produce same private key")
	}
	if kp.PublicKey != kp2.PublicKey {
		t.Error("same seed should produce same public key")
	}

	// Different seed should produce different keys
	seed2 := [KeySize]byte{32, 31, 30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17,
		16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1}
	kp3, err := DeriveEncryptionKeys(seed2)
	if err != nil {
		t.Fatalf("third DeriveEncryptionKeys failed: %v", err)
	}
	if kp.PrivateKey == kp3.PrivateKey {
		t.Error("different seeds should produce different private keys")
	}
}

func TestGenerateEphemeralKeyPair(t *testing.T) {
	kp1, err := GenerateEphemeralKeyPair()
	if err != nil {
		t.Fatalf("GenerateEphemeralKeyPair failed: %v", err)
	}
	if kp1.PrivateKey == [KeySize]byte{} {
		t.Error("private key should not be zero")
	}
	if kp1.PublicKey == [KeySize]byte{} {
		t.Error("public key should not be zero")
	}

	// Two calls should produce different keys
	kp2, err := GenerateEphemeralKeyPair()
	if err != nil {
		t.Fatalf("second GenerateEphemeralKeyPair failed: %v", err)
	}
	if kp1.PrivateKey == kp2.PrivateKey {
		t.Error("two ephemeral key pairs should differ")
	}
}

func TestEncryptDecryptMessage(t *testing.T) {
	senderSeed := [KeySize]byte{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
		17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32}
	recipientSeed := [KeySize]byte{32, 31, 30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17,
		16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1}

	senderKP, _ := DeriveEncryptionKeys(senderSeed)
	recipientKP, _ := DeriveEncryptionKeys(recipientSeed)

	plaintext := "Hello, AlgoChat!"
	envelope, err := EncryptMessage(plaintext, senderKP.PublicKey, recipientKP.PublicKey)
	if err != nil {
		t.Fatalf("EncryptMessage failed: %v", err)
	}

	// Recipient should be able to decrypt
	content, err := DecryptMessage(envelope, recipientKP.PrivateKey, recipientKP.PublicKey)
	if err != nil {
		t.Fatalf("DecryptMessage (recipient) failed: %v", err)
	}
	if content == nil {
		t.Fatal("DecryptMessage returned nil content")
	}
	if content.Text != plaintext {
		t.Errorf("expected %q, got %q", plaintext, content.Text)
	}

	// Sender should also be able to decrypt (bidirectional)
	content2, err := DecryptMessage(envelope, senderKP.PrivateKey, senderKP.PublicKey)
	if err != nil {
		t.Fatalf("DecryptMessage (sender) failed: %v", err)
	}
	if content2 == nil {
		t.Fatal("DecryptMessage (sender) returned nil content")
	}
	if content2.Text != plaintext {
		t.Errorf("sender decryption expected %q, got %q", plaintext, content2.Text)
	}
}

func TestEncryptDecryptEmptyMessage(t *testing.T) {
	senderKP, _ := GenerateEphemeralKeyPair()
	recipientKP, _ := GenerateEphemeralKeyPair()

	envelope, err := EncryptMessage("", senderKP.PublicKey, recipientKP.PublicKey)
	if err != nil {
		t.Fatalf("EncryptMessage empty failed: %v", err)
	}

	content, err := DecryptMessage(envelope, recipientKP.PrivateKey, recipientKP.PublicKey)
	if err != nil {
		t.Fatalf("DecryptMessage empty failed: %v", err)
	}
	if content.Text != "" {
		t.Errorf("expected empty string, got %q", content.Text)
	}
}

func TestEncryptDecryptUnicode(t *testing.T) {
	senderKP, _ := GenerateEphemeralKeyPair()
	recipientKP, _ := GenerateEphemeralKeyPair()

	plaintext := "Hello 🌍! Привет мир! こんにちは世界!"
	envelope, err := EncryptMessage(plaintext, senderKP.PublicKey, recipientKP.PublicKey)
	if err != nil {
		t.Fatalf("EncryptMessage unicode failed: %v", err)
	}

	content, err := DecryptMessage(envelope, recipientKP.PrivateKey, recipientKP.PublicKey)
	if err != nil {
		t.Fatalf("DecryptMessage unicode failed: %v", err)
	}
	if content.Text != plaintext {
		t.Errorf("expected %q, got %q", plaintext, content.Text)
	}
}

func TestEncryptMessageTooLarge(t *testing.T) {
	senderKP, _ := GenerateEphemeralKeyPair()
	recipientKP, _ := GenerateEphemeralKeyPair()

	largeMessage := strings.Repeat("x", MaxPayloadSize+1)
	_, err := EncryptMessage(largeMessage, senderKP.PublicKey, recipientKP.PublicKey)
	if !errors.Is(err, ErrMessageTooLarge) {
		t.Fatalf("expected ErrMessageTooLarge, got %v", err)
	}
}

func TestLegacy882ByteMessage(t *testing.T) {
	senderKP, _ := GenerateEphemeralKeyPair()
	recipientKP, _ := GenerateEphemeralKeyPair()

	message := strings.Repeat("x", 882)
	envelope, err := EncryptMessage(message, senderKP.PublicKey, recipientKP.PublicKey)
	if err != nil {
		t.Fatalf("EncryptMessage 882 failed: %v", err)
	}

	encoded := EncodeEnvelope(envelope)
	if len(encoded) != 1024 {
		t.Fatalf("882-byte plaintext encoded to %d bytes, want 1024", len(encoded))
	}

	content, err := DecryptMessage(envelope, recipientKP.PrivateKey, recipientKP.PublicKey)
	if err != nil {
		t.Fatalf("DecryptMessage 882 failed: %v", err)
	}
	if content.Text != message {
		t.Fatal("882-byte message round-trip failed")
	}
}

func TestMaxPlaintextEncodesToNoteLimit(t *testing.T) {
	if HeaderSize != 126 || TagSize != 16 || MaxNoteSize != 4096 || MaxPayloadSize != 3954 {
		t.Fatalf("capacity constants header=%d tag=%d note=%d payload=%d", HeaderSize, TagSize, MaxNoteSize, MaxPayloadSize)
	}

	senderKP, _ := GenerateEphemeralKeyPair()
	recipientKP, _ := GenerateEphemeralKeyPair()

	message := strings.Repeat("x", MaxPayloadSize)
	envelope, err := EncryptMessage(message, senderKP.PublicKey, recipientKP.PublicKey)
	if err != nil {
		t.Fatalf("EncryptMessage max plaintext failed: %v", err)
	}

	encoded := EncodeEnvelope(envelope)
	if len(encoded) != 4096 {
		t.Fatalf("max plaintext encoded to %d bytes, want 4096", len(encoded))
	}

	content, err := DecryptMessage(envelope, recipientKP.PrivateKey, recipientKP.PublicKey)
	if err != nil {
		t.Fatalf("DecryptMessage max plaintext failed: %v", err)
	}
	if content.Text != message {
		t.Fatal("max plaintext round-trip failed")
	}
}

func TestEncryptMaxSizeMessage(t *testing.T) {
	senderKP, _ := GenerateEphemeralKeyPair()
	recipientKP, _ := GenerateEphemeralKeyPair()

	maxMessage := strings.Repeat("x", MaxPayloadSize)
	envelope, err := EncryptMessage(maxMessage, senderKP.PublicKey, recipientKP.PublicKey)
	if err != nil {
		t.Fatalf("EncryptMessage max size failed: %v", err)
	}

	content, err := DecryptMessage(envelope, recipientKP.PrivateKey, recipientKP.PublicKey)
	if err != nil {
		t.Fatalf("DecryptMessage max size failed: %v", err)
	}
	if content.Text != maxMessage {
		t.Error("max size message round-trip failed")
	}
}

func TestDecryptWrongKey(t *testing.T) {
	senderKP, _ := GenerateEphemeralKeyPair()
	recipientKP, _ := GenerateEphemeralKeyPair()
	wrongKP, _ := GenerateEphemeralKeyPair()

	envelope, err := EncryptMessage("secret", senderKP.PublicKey, recipientKP.PublicKey)
	if err != nil {
		t.Fatalf("EncryptMessage failed: %v", err)
	}

	_, err = DecryptMessage(envelope, wrongKP.PrivateKey, wrongKP.PublicKey)
	if err == nil {
		t.Error("expected error when decrypting with wrong key")
	}
}

func TestEncryptReply(t *testing.T) {
	senderKP, _ := GenerateEphemeralKeyPair()
	recipientKP, _ := GenerateEphemeralKeyPair()

	envelope, err := EncryptReply(
		"This is a reply",
		"TXID123",
		"Original message preview",
		senderKP.PublicKey,
		recipientKP.PublicKey,
	)
	if err != nil {
		t.Fatalf("EncryptReply failed: %v", err)
	}

	content, err := DecryptMessage(envelope, recipientKP.PrivateKey, recipientKP.PublicKey)
	if err != nil {
		t.Fatalf("DecryptMessage reply failed: %v", err)
	}
	if content.Text != "This is a reply" {
		t.Errorf("expected reply text, got %q", content.Text)
	}
	if content.ReplyToID != "TXID123" {
		t.Errorf("expected reply txid, got %q", content.ReplyToID)
	}
	if content.ReplyToPreview != "Original message preview" {
		t.Errorf("expected reply preview, got %q", content.ReplyToPreview)
	}
}

func TestEncryptReplyLongPreview(t *testing.T) {
	senderKP, _ := GenerateEphemeralKeyPair()
	recipientKP, _ := GenerateEphemeralKeyPair()

	longPreview := strings.Repeat("a", 200)
	envelope, err := EncryptReply("reply", "tx1", longPreview, senderKP.PublicKey, recipientKP.PublicKey)
	if err != nil {
		t.Fatalf("EncryptReply long preview failed: %v", err)
	}

	content, err := DecryptMessage(envelope, recipientKP.PrivateKey, recipientKP.PublicKey)
	if err != nil {
		t.Fatalf("DecryptMessage long preview failed: %v", err)
	}
	if len(content.ReplyToPreview) > 80 {
		t.Errorf("preview should be truncated to 80 chars, got %d", len(content.ReplyToPreview))
	}
}

func TestKeyPublishPayloadFiltered(t *testing.T) {
	senderKP, _ := GenerateEphemeralKeyPair()
	recipientKP, _ := GenerateEphemeralKeyPair()

	envelope, err := EncryptMessage(`{"type":"key-publish","key":"abc"}`, senderKP.PublicKey, recipientKP.PublicKey)
	if err != nil {
		t.Fatalf("EncryptMessage key-publish failed: %v", err)
	}

	content, err := DecryptMessage(envelope, recipientKP.PrivateKey, recipientKP.PublicKey)
	if err != nil {
		t.Fatalf("DecryptMessage key-publish failed: %v", err)
	}
	if content != nil {
		t.Error("key-publish payload should return nil content")
	}
}

func TestFingerprint(t *testing.T) {
	key := [KeySize]byte{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
		17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32}

	fp := Fingerprint(key)
	parts := strings.Split(fp, " ")
	if len(parts) != 4 {
		t.Errorf("expected 4 groups, got %d: %q", len(parts), fp)
	}
	for _, p := range parts {
		if len(p) != 4 {
			t.Errorf("each group should be 4 hex chars, got %q", p)
		}
	}

	// Same key should produce same fingerprint
	fp2 := Fingerprint(key)
	if fp != fp2 {
		t.Error("same key should produce same fingerprint")
	}

	// Different key should produce different fingerprint
	key2 := [KeySize]byte{32, 31, 30, 29}
	fp3 := Fingerprint(key2)
	if fp == fp3 {
		t.Error("different keys should produce different fingerprints")
	}
}

func TestEnvelopeRoundTrip(t *testing.T) {
	senderKP, _ := GenerateEphemeralKeyPair()
	recipientKP, _ := GenerateEphemeralKeyPair()

	envelope, err := EncryptMessage("round trip test", senderKP.PublicKey, recipientKP.PublicKey)
	if err != nil {
		t.Fatalf("EncryptMessage failed: %v", err)
	}

	// Check envelope fields
	if envelope.Version != ProtocolVersion {
		t.Errorf("version: expected %d, got %d", ProtocolVersion, envelope.Version)
	}
	if envelope.ProtocolID != ProtocolIDStandard {
		t.Errorf("protocol: expected %d, got %d", ProtocolIDStandard, envelope.ProtocolID)
	}
	if envelope.SenderPublicKey != senderKP.PublicKey {
		t.Error("sender public key mismatch")
	}
	if envelope.EphemeralPublicKey == [KeySize]byte{} {
		t.Error("ephemeral key should not be zero")
	}
	if envelope.Nonce == [NonceSize]byte{} {
		t.Error("nonce should not be zero")
	}
	if len(envelope.Ciphertext) == 0 {
		t.Error("ciphertext should not be empty")
	}
}

func TestMultipleEncryptionsProduceDifferentCiphertexts(t *testing.T) {
	senderKP, _ := GenerateEphemeralKeyPair()
	recipientKP, _ := GenerateEphemeralKeyPair()

	e1, _ := EncryptMessage("same message", senderKP.PublicKey, recipientKP.PublicKey)
	e2, _ := EncryptMessage("same message", senderKP.PublicKey, recipientKP.PublicKey)

	if bytes.Equal(e1.Ciphertext, e2.Ciphertext) {
		t.Error("same plaintext should produce different ciphertexts (different ephemeral keys)")
	}
	if e1.EphemeralPublicKey == e2.EphemeralPublicKey {
		t.Error("each encryption should use a different ephemeral key")
	}
}
