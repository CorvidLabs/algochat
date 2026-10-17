package algochat

import (
	"bytes"
	"testing"
)

func TestEncodeDecodeEnvelope(t *testing.T) {
	senderKP, _ := GenerateEphemeralKeyPair()
	recipientKP, _ := GenerateEphemeralKeyPair()

	original, err := EncryptMessage("test encode decode", senderKP.PublicKey, recipientKP.PublicKey)
	if err != nil {
		t.Fatalf("EncryptMessage failed: %v", err)
	}

	// Encode
	encoded := EncodeEnvelope(original)

	// Check minimum size
	if len(encoded) < HeaderSize+TagSize {
		t.Errorf("encoded too short: %d bytes", len(encoded))
	}

	// Header bytes
	if encoded[0] != ProtocolVersion {
		t.Errorf("version byte: expected %d, got %d", ProtocolVersion, encoded[0])
	}
	if encoded[1] != ProtocolIDStandard {
		t.Errorf("protocol byte: expected %d, got %d", ProtocolIDStandard, encoded[1])
	}

	// Decode
	decoded, err := DecodeEnvelope(encoded)
	if err != nil {
		t.Fatalf("DecodeEnvelope failed: %v", err)
	}

	// Verify all fields match
	if decoded.Version != original.Version {
		t.Error("version mismatch")
	}
	if decoded.ProtocolID != original.ProtocolID {
		t.Error("protocol ID mismatch")
	}
	if decoded.SenderPublicKey != original.SenderPublicKey {
		t.Error("sender public key mismatch")
	}
	if decoded.EphemeralPublicKey != original.EphemeralPublicKey {
		t.Error("ephemeral public key mismatch")
	}
	if decoded.Nonce != original.Nonce {
		t.Error("nonce mismatch")
	}
	if decoded.EncryptedSenderKey != original.EncryptedSenderKey {
		t.Error("encrypted sender key mismatch")
	}
	if !bytes.Equal(decoded.Ciphertext, original.Ciphertext) {
		t.Error("ciphertext mismatch")
	}

	// Verify decoded envelope can decrypt
	content, err := DecryptMessage(decoded, recipientKP.PrivateKey, recipientKP.PublicKey)
	if err != nil {
		t.Fatalf("DecryptMessage after decode failed: %v", err)
	}
	if content.Text != "test encode decode" {
		t.Errorf("expected 'test encode decode', got %q", content.Text)
	}
}

func TestDecodeEnvelopeTooShort(t *testing.T) {
	_, err := DecodeEnvelope([]byte{})
	if err == nil {
		t.Error("expected error for empty data")
	}

	_, err = DecodeEnvelope([]byte{0x01})
	if err == nil {
		t.Error("expected error for 1-byte data")
	}
}

func TestDecodeEnvelopeWrongVersion(t *testing.T) {
	data := make([]byte, HeaderSize+TagSize)
	data[0] = 0x02 // wrong version
	data[1] = ProtocolIDStandard

	_, err := DecodeEnvelope(data)
	if err == nil {
		t.Error("expected error for wrong version")
	}
}

func TestDecodeEnvelopeWrongProtocol(t *testing.T) {
	data := make([]byte, HeaderSize+TagSize)
	data[0] = ProtocolVersion
	data[1] = 0xFF // wrong protocol

	_, err := DecodeEnvelope(data)
	if err == nil {
		t.Error("expected error for wrong protocol")
	}
}

func TestDecodeEnvelopeTooShortForHeader(t *testing.T) {
	data := make([]byte, HeaderSize) // just under minimum (needs header + tag)
	data[0] = ProtocolVersion
	data[1] = ProtocolIDStandard

	_, err := DecodeEnvelope(data)
	if err == nil {
		t.Error("expected error for data shorter than header + tag")
	}
}

func TestIsChatMessage(t *testing.T) {
	tests := []struct {
		name     string
		data     []byte
		expected bool
	}{
		{"valid header", []byte{ProtocolVersion, ProtocolIDStandard, 0, 0}, true},
		{"empty", []byte{}, false},
		{"too short", []byte{ProtocolVersion}, false},
		{"wrong version", []byte{0x02, ProtocolIDStandard}, false},
		{"wrong protocol", []byte{ProtocolVersion, 0xFF}, false},
		{"random data", []byte{0xDE, 0xAD, 0xBE, 0xEF}, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := IsChatMessage(tt.data)
			if got != tt.expected {
				t.Errorf("IsChatMessage(%v) = %v, want %v", tt.data, got, tt.expected)
			}
		})
	}
}

func TestEncodedEnvelopeSize(t *testing.T) {
	senderKP, _ := GenerateEphemeralKeyPair()
	recipientKP, _ := GenerateEphemeralKeyPair()

	envelope, _ := EncryptMessage("hello", senderKP.PublicKey, recipientKP.PublicKey)
	encoded := EncodeEnvelope(envelope)

	expectedSize := HeaderSize + len(envelope.Ciphertext)
	if len(encoded) != expectedSize {
		t.Errorf("encoded size: expected %d, got %d", expectedSize, len(encoded))
	}
}
