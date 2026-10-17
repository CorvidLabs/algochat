package algochat

import (
	"errors"
	"testing"
)

func TestPaymentFeeNoteSurcharge(t *testing.T) {
	cases := []struct {
		noteBytes int
		want      uint64
	}{
		{1024, 1000},
		{2000, 1098},
		{4096, 1308},
	}

	for _, tc := range cases {
		got, err := PaymentFee(tc.noteBytes, 1000)
		if err != nil {
			t.Fatalf("PaymentFee(%d, 1000): %v", tc.noteBytes, err)
		}
		if got != tc.want {
			t.Errorf("PaymentFee(%d, 1000) = %d, want %d", tc.noteBytes, got, tc.want)
		}
	}

	if _, err := PaymentFee(4097, 1000); !errors.Is(err, ErrNoteTooLarge) {
		t.Fatalf("expected ErrNoteTooLarge for 4097 bytes, got %v", err)
	}
}

func TestNewChatAccountFromSeed(t *testing.T) {
	seed := [KeySize]byte{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
		17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32}
	ed25519Pub := [Ed25519PublicKeySize]byte{10, 20, 30, 40}

	account, err := NewChatAccountFromSeed("ALGO_ADDRESS", seed, ed25519Pub)
	if err != nil {
		t.Fatalf("NewChatAccountFromSeed failed: %v", err)
	}
	if account.Address != "ALGO_ADDRESS" {
		t.Errorf("expected ALGO_ADDRESS, got %s", account.Address)
	}
	if account.Ed25519PublicKey != ed25519Pub {
		t.Error("ed25519 public key mismatch")
	}
	if account.EncryptionPrivateKey == [KeySize]byte{} {
		t.Error("encryption private key should not be zero")
	}
	if account.EncryptionPublicKey == [KeySize]byte{} {
		t.Error("encryption public key should not be zero")
	}
}

func TestNewChatAccountFromSecretKey(t *testing.T) {
	var secretKey [64]byte
	for i := range secretKey {
		secretKey[i] = byte(i + 1)
	}

	account, err := NewChatAccountFromSecretKey("ALGO_ADDRESS", secretKey)
	if err != nil {
		t.Fatalf("NewChatAccountFromSecretKey failed: %v", err)
	}
	if account.Address != "ALGO_ADDRESS" {
		t.Errorf("expected ALGO_ADDRESS, got %s", account.Address)
	}

	// Verify the seed and pubkey are split correctly
	var expectedSeed [KeySize]byte
	copy(expectedSeed[:], secretKey[:32])

	account2, _ := NewChatAccountFromSeed("ALGO_ADDRESS", expectedSeed, account.Ed25519PublicKey)
	if account.EncryptionPublicKey != account2.EncryptionPublicKey {
		t.Error("FromSecretKey and FromSeed should produce same encryption keys")
	}
}

func TestChatAccountDeterministic(t *testing.T) {
	seed := [KeySize]byte{42}
	pub := [Ed25519PublicKeySize]byte{99}

	a1, _ := NewChatAccountFromSeed("ADDR", seed, pub)
	a2, _ := NewChatAccountFromSeed("ADDR", seed, pub)

	if a1.EncryptionPrivateKey != a2.EncryptionPrivateKey {
		t.Error("same seed should produce same encryption private key")
	}
	if a1.EncryptionPublicKey != a2.EncryptionPublicKey {
		t.Error("same seed should produce same encryption public key")
	}
}

func TestChatAccountEndToEnd(t *testing.T) {
	seed1 := [KeySize]byte{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
		17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32}
	seed2 := [KeySize]byte{32, 31, 30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17,
		16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1}

	sender, _ := NewChatAccountFromSeed("SENDER", seed1, [Ed25519PublicKeySize]byte{})
	recipient, _ := NewChatAccountFromSeed("RECIPIENT", seed2, [Ed25519PublicKeySize]byte{})

	// Encrypt with sender's public key and recipient's public key
	envelope, err := EncryptMessage("Hello via ChatAccount", sender.EncryptionPublicKey, recipient.EncryptionPublicKey)
	if err != nil {
		t.Fatalf("EncryptMessage failed: %v", err)
	}

	// Decode round-trip
	encoded := EncodeEnvelope(envelope)
	decoded, err := DecodeEnvelope(encoded)
	if err != nil {
		t.Fatalf("DecodeEnvelope failed: %v", err)
	}

	// Recipient decrypts
	content, err := DecryptMessage(decoded, recipient.EncryptionPrivateKey, recipient.EncryptionPublicKey)
	if err != nil {
		t.Fatalf("recipient DecryptMessage failed: %v", err)
	}
	if content.Text != "Hello via ChatAccount" {
		t.Errorf("expected 'Hello via ChatAccount', got %q", content.Text)
	}

	// Sender decrypts (bidirectional)
	content2, err := DecryptMessage(decoded, sender.EncryptionPrivateKey, sender.EncryptionPublicKey)
	if err != nil {
		t.Fatalf("sender DecryptMessage failed: %v", err)
	}
	if content2.Text != "Hello via ChatAccount" {
		t.Errorf("sender got %q", content2.Text)
	}
}
