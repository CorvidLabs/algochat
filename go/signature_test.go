package algochat

import (
	"crypto/ed25519"
	"testing"
)

func TestSignAndVerifyEncryptionKey(t *testing.T) {
	// Generate Ed25519 key pair
	pub, priv, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatalf("ed25519.GenerateKey failed: %v", err)
	}

	// Generate encryption key pair
	encKP, _ := GenerateEphemeralKeyPair()

	// Sign
	sig, err := SignEncryptionKey(encKP.PublicKey, priv)
	if err != nil {
		t.Fatalf("SignEncryptionKey failed: %v", err)
	}
	if len(sig) != Ed25519SignatureSize {
		t.Errorf("signature length: expected %d, got %d", Ed25519SignatureSize, len(sig))
	}

	// Verify
	valid, err := VerifyEncryptionKey(encKP.PublicKey, pub, sig)
	if err != nil {
		t.Fatalf("VerifyEncryptionKey failed: %v", err)
	}
	if !valid {
		t.Error("signature should be valid")
	}
}

func TestVerifyWrongKey(t *testing.T) {
	_, priv1, _ := ed25519.GenerateKey(nil)
	pub2, _, _ := ed25519.GenerateKey(nil)

	encKP, _ := GenerateEphemeralKeyPair()

	sig, _ := SignEncryptionKey(encKP.PublicKey, priv1)

	// Verify with wrong public key
	valid, err := VerifyEncryptionKey(encKP.PublicKey, pub2, sig)
	if err != nil {
		t.Fatalf("VerifyEncryptionKey failed: %v", err)
	}
	if valid {
		t.Error("signature should be invalid with wrong key")
	}
}

func TestVerifyWrongEncryptionKey(t *testing.T) {
	pub, priv, _ := ed25519.GenerateKey(nil)

	encKP1, _ := GenerateEphemeralKeyPair()
	encKP2, _ := GenerateEphemeralKeyPair()

	sig, _ := SignEncryptionKey(encKP1.PublicKey, priv)

	// Verify with wrong encryption key
	valid, err := VerifyEncryptionKey(encKP2.PublicKey, pub, sig)
	if err != nil {
		t.Fatalf("VerifyEncryptionKey failed: %v", err)
	}
	if valid {
		t.Error("signature should be invalid for wrong encryption key")
	}
}

func TestVerifyInvalidSignatureLength(t *testing.T) {
	pub, _, _ := ed25519.GenerateKey(nil)
	encKP, _ := GenerateEphemeralKeyPair()

	_, err := VerifyEncryptionKey(encKP.PublicKey, pub, []byte{1, 2, 3})
	if err == nil {
		t.Error("expected error for invalid signature length")
	}
}

func TestVerifyInvalidKeyLength(t *testing.T) {
	encKP, _ := GenerateEphemeralKeyPair()
	sig := make([]byte, Ed25519SignatureSize)

	_, err := VerifyEncryptionKey(encKP.PublicKey, []byte{1, 2, 3}, sig)
	if err == nil {
		t.Error("expected error for invalid verifying key length")
	}
}

func TestKeyFingerprint(t *testing.T) {
	key := [KeySize]byte{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
		17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32}

	fp := KeyFingerprint(key)
	if fp == "" {
		t.Error("fingerprint should not be empty")
	}

	// Consistent with Fingerprint function
	fp2 := Fingerprint(key)
	if fp != fp2 {
		t.Errorf("KeyFingerprint and Fingerprint should match: %q vs %q", fp, fp2)
	}
}
