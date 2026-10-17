package algochat

import (
	"crypto/ed25519"
	"crypto/sha256"
	"errors"
	"fmt"
	"strings"
)

const (
	Ed25519SignatureSize = 64
	Ed25519PublicKeySize = 32
)

var (
	ErrInvalidKeyLength       = errors.New("invalid key length")
	ErrInvalidSignatureLength = errors.New("invalid signature length")
)

// SignEncryptionKey signs an X25519 encryption public key with an Ed25519 signing key.
// This creates a proof that the encryption key belongs to the holder of the Ed25519 private key.
func SignEncryptionKey(encryptionPublicKey [KeySize]byte, signingKey ed25519.PrivateKey) ([]byte, error) {
	if len(signingKey) != ed25519.PrivateKeySize {
		return nil, fmt.Errorf("%w: signing key must be %d bytes, got %d", ErrInvalidKeyLength, ed25519.PrivateKeySize, len(signingKey))
	}
	return ed25519.Sign(signingKey, encryptionPublicKey[:]), nil
}

// VerifyEncryptionKey verifies that an encryption public key was signed by an Ed25519 key.
func VerifyEncryptionKey(encryptionPublicKey [KeySize]byte, verifyingKey ed25519.PublicKey, signature []byte) (bool, error) {
	if len(verifyingKey) != Ed25519PublicKeySize {
		return false, fmt.Errorf("%w: verifying key must be %d bytes, got %d", ErrInvalidKeyLength, Ed25519PublicKeySize, len(verifyingKey))
	}
	if len(signature) != Ed25519SignatureSize {
		return false, fmt.Errorf("%w: signature must be %d bytes, got %d", ErrInvalidSignatureLength, Ed25519SignatureSize, len(signature))
	}
	return ed25519.Verify(verifyingKey, encryptionPublicKey[:], signature), nil
}

// KeyFingerprint returns a human-readable SHA-256 fingerprint of a public key.
func KeyFingerprint(publicKey [KeySize]byte) string {
	hash := sha256.Sum256(publicKey[:])
	groups := make([]string, 4)
	for i := 0; i < 4; i++ {
		groups[i] = fmt.Sprintf("%02X%02X", hash[i*2], hash[i*2+1])
	}
	return strings.Join(groups, " ")
}
