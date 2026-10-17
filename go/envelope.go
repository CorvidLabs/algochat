package algochat

import (
	"fmt"
)

// EncodeEnvelope serializes a ChatEnvelope to bytes for a transaction note.
func EncodeEnvelope(env *ChatEnvelope) []byte {
	totalSize := 2 + KeySize + KeySize + NonceSize + EncryptedKeySize + len(env.Ciphertext)
	result := make([]byte, 0, totalSize)

	result = append(result, env.Version)
	result = append(result, env.ProtocolID)
	result = append(result, env.SenderPublicKey[:]...)
	result = append(result, env.EphemeralPublicKey[:]...)
	result = append(result, env.Nonce[:]...)
	result = append(result, env.EncryptedSenderKey[:]...)
	result = append(result, env.Ciphertext...)

	return result
}

// DecodeEnvelope deserializes bytes from a transaction note to a ChatEnvelope.
func DecodeEnvelope(data []byte) (*ChatEnvelope, error) {
	if len(data) < 2 {
		return nil, fmt.Errorf("%w: data too short (%d bytes)", ErrInvalidEnvelope, len(data))
	}

	version := data[0]
	protocolID := data[1]

	if version != ProtocolVersion {
		return nil, fmt.Errorf("%w: unsupported version %d", ErrInvalidEnvelope, version)
	}

	if protocolID != ProtocolIDStandard {
		return nil, fmt.Errorf("%w: unsupported protocol ID %d", ErrInvalidEnvelope, protocolID)
	}

	minSize := HeaderSize + TagSize
	if len(data) < minSize {
		return nil, fmt.Errorf("%w: data too short (%d bytes, need %d)", ErrInvalidEnvelope, len(data), minSize)
	}

	env := &ChatEnvelope{
		Version:    version,
		ProtocolID: protocolID,
	}

	copy(env.SenderPublicKey[:], data[2:34])
	copy(env.EphemeralPublicKey[:], data[34:66])
	copy(env.Nonce[:], data[66:78])
	copy(env.EncryptedSenderKey[:], data[78:126])
	env.Ciphertext = make([]byte, len(data)-126)
	copy(env.Ciphertext, data[126:])

	return env, nil
}

// IsChatMessage checks if data is an AlgoChat message by examining the header bytes.
func IsChatMessage(data []byte) bool {
	return len(data) >= 2 && data[0] == ProtocolVersion && data[1] == ProtocolIDStandard
}
