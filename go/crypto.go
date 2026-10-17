package algochat

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"

	"golang.org/x/crypto/chacha20poly1305"
	"golang.org/x/crypto/curve25519"
	"golang.org/x/crypto/hkdf"
)

var (
	keyDerivationSalt = []byte("AlgoChat-v1-encryption")
	keyDerivationInfo = []byte("x25519-key")
	encryptionPrefix  = []byte("AlgoChatV1")
	senderKeyPrefix   = []byte("AlgoChatV1-SenderKey")
)

var (
	ErrInvalidSeedLength = errors.New("seed must be 32 bytes")
	ErrMessageTooLarge   = errors.New("message exceeds maximum payload size")
	ErrDecryptionFailed  = errors.New("decryption failed")
	ErrInvalidEnvelope   = errors.New("invalid envelope")
)

// X25519KeyPair holds an X25519 key pair for encryption.
type X25519KeyPair struct {
	PrivateKey [KeySize]byte
	PublicKey  [KeySize]byte
}

// DeriveEncryptionKeys derives X25519 encryption keys from an Algorand account seed.
func DeriveEncryptionKeys(seed [KeySize]byte) (X25519KeyPair, error) {
	// HKDF-SHA256 to derive encryption seed
	hkdfReader := hkdf.New(sha256.New, seed[:], keyDerivationSalt, keyDerivationInfo)
	var encryptionSeed [KeySize]byte
	if _, err := io.ReadFull(hkdfReader, encryptionSeed[:]); err != nil {
		return X25519KeyPair{}, fmt.Errorf("hkdf derivation failed: %w", err)
	}

	// Derive X25519 public key from private key
	pub, err := curve25519.X25519(encryptionSeed[:], curve25519.Basepoint)
	if err != nil {
		return X25519KeyPair{}, fmt.Errorf("x25519 public key derivation failed: %w", err)
	}

	var kp X25519KeyPair
	kp.PrivateKey = encryptionSeed
	copy(kp.PublicKey[:], pub)
	return kp, nil
}

// GenerateEphemeralKeyPair generates a random X25519 key pair.
func GenerateEphemeralKeyPair() (X25519KeyPair, error) {
	var priv [KeySize]byte
	if _, err := rand.Read(priv[:]); err != nil {
		return X25519KeyPair{}, fmt.Errorf("random key generation failed: %w", err)
	}

	pub, err := curve25519.X25519(priv[:], curve25519.Basepoint)
	if err != nil {
		return X25519KeyPair{}, fmt.Errorf("x25519 public key derivation failed: %w", err)
	}

	var kp X25519KeyPair
	kp.PrivateKey = priv
	copy(kp.PublicKey[:], pub)
	return kp, nil
}

// x25519ECDH performs X25519 Diffie-Hellman key agreement.
func x25519ECDH(privateKey, publicKey [KeySize]byte) ([]byte, error) {
	return curve25519.X25519(privateKey[:], publicKey[:])
}

// deriveSymmetricKey derives a symmetric key using HKDF.
func deriveSymmetricKey(ikm, salt, info []byte) ([]byte, error) {
	hkdfReader := hkdf.New(sha256.New, ikm, salt, info)
	key := make([]byte, KeySize)
	if _, err := io.ReadFull(hkdfReader, key); err != nil {
		return nil, fmt.Errorf("hkdf derivation failed: %w", err)
	}
	return key, nil
}

// concatBytes concatenates multiple byte slices.
func concatBytes(slices ...[]byte) []byte {
	total := 0
	for _, s := range slices {
		total += len(s)
	}
	result := make([]byte, 0, total)
	for _, s := range slices {
		result = append(result, s...)
	}
	return result
}

// EncryptMessage encrypts a message for a recipient with forward secrecy.
func EncryptMessage(plaintext string, senderPublicKey, recipientPublicKey [KeySize]byte) (*ChatEnvelope, error) {
	messageBytes := []byte(plaintext)
	if len(messageBytes) > MaxPayloadSize {
		return nil, fmt.Errorf("%w: %d bytes, max %d", ErrMessageTooLarge, len(messageBytes), MaxPayloadSize)
	}

	// Step 1: Generate ephemeral key pair
	ephemeral, err := GenerateEphemeralKeyPair()
	if err != nil {
		return nil, err
	}

	// Step 2: Derive symmetric key for recipient
	sharedSecret, err := x25519ECDH(ephemeral.PrivateKey, recipientPublicKey)
	if err != nil {
		return nil, fmt.Errorf("ecdh failed: %w", err)
	}

	info := concatBytes(encryptionPrefix, senderPublicKey[:], recipientPublicKey[:])
	symmetricKey, err := deriveSymmetricKey(sharedSecret, ephemeral.PublicKey[:], info)
	if err != nil {
		return nil, err
	}

	// Step 3: Generate random nonce
	var nonce [NonceSize]byte
	if _, err := rand.Read(nonce[:]); err != nil {
		return nil, fmt.Errorf("nonce generation failed: %w", err)
	}

	// Step 4: Encrypt message
	aead, err := chacha20poly1305.New(symmetricKey)
	if err != nil {
		return nil, fmt.Errorf("cipher creation failed: %w", err)
	}
	ciphertext := aead.Seal(nil, nonce[:], messageBytes, nil)

	// Step 5: Encrypt symmetric key for sender (bidirectional decryption)
	senderSharedSecret, err := x25519ECDH(ephemeral.PrivateKey, senderPublicKey)
	if err != nil {
		return nil, fmt.Errorf("sender ecdh failed: %w", err)
	}

	senderInfo := concatBytes(senderKeyPrefix, senderPublicKey[:])
	senderEncryptionKey, err := deriveSymmetricKey(senderSharedSecret, ephemeral.PublicKey[:], senderInfo)
	if err != nil {
		return nil, err
	}

	senderAEAD, err := chacha20poly1305.New(senderEncryptionKey)
	if err != nil {
		return nil, fmt.Errorf("sender cipher creation failed: %w", err)
	}
	encryptedSenderKey := senderAEAD.Seal(nil, nonce[:], symmetricKey, nil)

	env := &ChatEnvelope{
		Version:            ProtocolVersion,
		ProtocolID:         ProtocolIDStandard,
		SenderPublicKey:    senderPublicKey,
		EphemeralPublicKey: ephemeral.PublicKey,
		Nonce:              nonce,
		Ciphertext:         ciphertext,
	}
	copy(env.EncryptedSenderKey[:], encryptedSenderKey)

	return env, nil
}

// EncryptReply encrypts a reply message with reply context.
func EncryptReply(text, replyToTxid, replyToPreview string, senderPublicKey, recipientPublicKey [KeySize]byte) (*ChatEnvelope, error) {
	preview := replyToPreview
	if len(preview) > 80 {
		preview = preview[:77] + "..."
	}

	payload := struct {
		Text    string `json:"text"`
		ReplyTo struct {
			TxID    string `json:"txid"`
			Preview string `json:"preview"`
		} `json:"replyTo"`
	}{
		Text: text,
	}
	payload.ReplyTo.TxID = replyToTxid
	payload.ReplyTo.Preview = preview

	data, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("marshal reply payload: %w", err)
	}

	return EncryptMessage(string(data), senderPublicKey, recipientPublicKey)
}

// DecryptMessage decrypts a message envelope. Returns nil if the message is not for us.
func DecryptMessage(envelope *ChatEnvelope, myPrivateKey, myPublicKey [KeySize]byte) (*DecryptedContent, error) {
	weAreSender := myPublicKey == envelope.SenderPublicKey

	var plaintext []byte
	var err error

	if weAreSender {
		plaintext, err = decryptAsSender(envelope, myPrivateKey, myPublicKey)
	} else {
		plaintext, err = decryptAsRecipient(envelope, myPrivateKey, myPublicKey)
	}

	if err != nil {
		return nil, err
	}

	// Check for key-publish payload
	if isKeyPublishPayload(plaintext) {
		return nil, nil
	}

	return parseMessagePayload(plaintext), nil
}

func decryptAsRecipient(envelope *ChatEnvelope, recipientPrivateKey, recipientPublicKey [KeySize]byte) ([]byte, error) {
	sharedSecret, err := x25519ECDH(recipientPrivateKey, envelope.EphemeralPublicKey)
	if err != nil {
		return nil, fmt.Errorf("ecdh failed: %w", err)
	}

	info := concatBytes(encryptionPrefix, envelope.SenderPublicKey[:], recipientPublicKey[:])
	symmetricKey, err := deriveSymmetricKey(sharedSecret, envelope.EphemeralPublicKey[:], info)
	if err != nil {
		return nil, err
	}

	aead, err := chacha20poly1305.New(symmetricKey)
	if err != nil {
		return nil, fmt.Errorf("cipher creation failed: %w", err)
	}

	plaintext, err := aead.Open(nil, envelope.Nonce[:], envelope.Ciphertext, nil)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrDecryptionFailed, err)
	}

	return plaintext, nil
}

func decryptAsSender(envelope *ChatEnvelope, senderPrivateKey, senderPublicKey [KeySize]byte) ([]byte, error) {
	// Step 1: Derive key to decrypt the symmetric key
	sharedSecret, err := x25519ECDH(senderPrivateKey, envelope.EphemeralPublicKey)
	if err != nil {
		return nil, fmt.Errorf("ecdh failed: %w", err)
	}

	senderInfo := concatBytes(senderKeyPrefix, senderPublicKey[:])
	senderDecryptionKey, err := deriveSymmetricKey(sharedSecret, envelope.EphemeralPublicKey[:], senderInfo)
	if err != nil {
		return nil, err
	}

	// Step 2: Decrypt the symmetric key
	senderAEAD, err := chacha20poly1305.New(senderDecryptionKey)
	if err != nil {
		return nil, fmt.Errorf("sender cipher creation failed: %w", err)
	}

	symmetricKey, err := senderAEAD.Open(nil, envelope.Nonce[:], envelope.EncryptedSenderKey[:], nil)
	if err != nil {
		return nil, fmt.Errorf("%w: could not recover symmetric key: %v", ErrDecryptionFailed, err)
	}

	// Step 3: Decrypt message using recovered symmetric key
	aead, err := chacha20poly1305.New(symmetricKey)
	if err != nil {
		return nil, fmt.Errorf("cipher creation failed: %w", err)
	}

	plaintext, err := aead.Open(nil, envelope.Nonce[:], envelope.Ciphertext, nil)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrDecryptionFailed, err)
	}

	return plaintext, nil
}

func isKeyPublishPayload(data []byte) bool {
	if len(data) == 0 || data[0] != '{' {
		return false
	}
	var obj struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(data, &obj); err != nil {
		return false
	}
	return obj.Type == "key-publish"
}

func parseMessagePayload(data []byte) *DecryptedContent {
	text := string(data)

	if strings.HasPrefix(text, "{") {
		var obj struct {
			Text    string `json:"text"`
			ReplyTo *struct {
				TxID    string `json:"txid"`
				Preview string `json:"preview"`
			} `json:"replyTo"`
		}
		if err := json.Unmarshal(data, &obj); err == nil && obj.Text != "" {
			dc := &DecryptedContent{Text: obj.Text}
			if obj.ReplyTo != nil {
				dc.ReplyToID = obj.ReplyTo.TxID
				dc.ReplyToPreview = obj.ReplyTo.Preview
			}
			return dc
		}
	}

	return &DecryptedContent{Text: text}
}

// Fingerprint returns a human-readable fingerprint for a public key.
func Fingerprint(publicKey [KeySize]byte) string {
	hash := sha256.Sum256(publicKey[:])
	groups := make([]string, 4)
	for i := 0; i < 4; i++ {
		groups[i] = fmt.Sprintf("%02X%02X", hash[i*2], hash[i*2+1])
	}
	return strings.Join(groups, " ")
}
