package algochat

import (
	"crypto/rand"
	"encoding/binary"
	"fmt"

	"golang.org/x/crypto/chacha20poly1305"
)

const (
	pskHeaderSize   = 130
	pskMaxPlaintext = MaxNoteSize - pskHeaderSize - TagSize
	pskSessionSize  = 100
)

// EncryptPSKMessage seals plaintext under Extra lock. The note version is 0x01.
func EncryptPSKMessage(plaintext string, sender X25519KeyPair, recipientPublic [KeySize]byte, initialPSK []byte, counter uint32) ([]byte, error) {
	message := []byte(plaintext)
	if len(message) > pskMaxPlaintext {
		return nil, fmt.Errorf("%w: %d bytes", ErrMessageTooLarge, len(message))
	}
	if len(initialPSK) != KeySize {
		return nil, fmt.Errorf("psk must be 32 bytes")
	}
	current, err := derivePSKAtCounter(initialPSK, counter)
	if err != nil {
		return nil, err
	}
	ephemeral, err := GenerateEphemeralKeyPair()
	if err != nil {
		return nil, err
	}
	shared, err := x25519ECDH(ephemeral.PrivateKey, recipientPublic)
	if err != nil {
		return nil, err
	}
	symmetric, err := deriveSymmetricKey(
		concatBytes(shared, current),
		ephemeral.PublicKey[:],
		concatBytes([]byte("AlgoChatV1-PSK"), sender.PublicKey[:], recipientPublic[:]),
	)
	if err != nil {
		return nil, err
	}
	var nonce [NonceSize]byte
	if _, err := rand.Read(nonce[:]); err != nil {
		return nil, err
	}
	senderShared, err := x25519ECDH(ephemeral.PrivateKey, sender.PublicKey)
	if err != nil {
		return nil, err
	}
	senderKey, err := deriveSymmetricKey(
		concatBytes(senderShared, current),
		ephemeral.PublicKey[:],
		concatBytes([]byte("AlgoChatV1-PSK-SenderKey"), sender.PublicKey[:]),
	)
	if err != nil {
		return nil, err
	}
	wrap, err := chacha20poly1305.New(senderKey)
	if err != nil {
		return nil, err
	}
	encryptedSenderKey := wrap.Seal(nil, nonce[:], symmetric, nil)
	header := pskHeader(ProtocolVersion, counter, sender.PublicKey, ephemeral.PublicKey, nonce[:], encryptedSenderKey)
	payload, err := chacha20poly1305.New(symmetric)
	if err != nil {
		return nil, err
	}
	ciphertext := payload.Seal(nil, nonce[:], message, nil)
	return append(header, ciphertext...), nil
}

// DecryptPSKMessage opens an Extra lock note. Version 0x02 binds the 130-byte header.
func DecryptPSKMessage(note []byte, mine X25519KeyPair, initialPSK []byte) (string, error) {
	if len(note) < pskHeaderSize+TagSize || note[1] != ProtocolIDPSK {
		return "", ErrDecryptionFailed
	}
	if note[0] != ProtocolVersion && note[0] != protocolVersionAAD {
		return "", ErrDecryptionFailed
	}
	counter := binary.BigEndian.Uint32(note[2:6])
	var senderPub, ephemeral [KeySize]byte
	copy(senderPub[:], note[6:38])
	copy(ephemeral[:], note[38:70])
	nonce := note[70:82]
	wrapped := note[82:130]
	ciphertext := note[130:]
	current, err := derivePSKAtCounter(initialPSK, counter)
	if err != nil {
		return "", err
	}
	var aad []byte
	if note[0] == protocolVersionAAD {
		aad = note[:pskHeaderSize]
	}
	weAreSender := mine.PublicKey == senderPub
	var other [KeySize]byte
	if weAreSender {
		other = ephemeral
	} else {
		other = ephemeral
	}
	shared, err := x25519ECDH(mine.PrivateKey, other)
	if err != nil {
		return "", err
	}
	var symmetric []byte
	if weAreSender {
		senderKey, err := deriveSymmetricKey(concatBytes(shared, current), ephemeral[:], concatBytes([]byte("AlgoChatV1-PSK-SenderKey"), senderPub[:]))
		if err != nil {
			return "", err
		}
		aead, err := chacha20poly1305.New(senderKey)
		if err != nil {
			return "", err
		}
		symmetric, err = aead.Open(nil, nonce, wrapped, nil)
		if err != nil {
			return "", ErrDecryptionFailed
		}
	} else {
		info := concatBytes([]byte("AlgoChatV1-PSK"), senderPub[:], mine.PublicKey[:])
		symmetric, err = deriveSymmetricKey(concatBytes(shared, current), ephemeral[:], info)
		if err != nil {
			return "", err
		}
	}
	aead, err := chacha20poly1305.New(symmetric)
	if err != nil {
		return "", err
	}
	plain, err := aead.Open(nil, nonce, ciphertext, aad)
	if err != nil {
		return "", ErrDecryptionFailed
	}
	return string(plain), nil
}

func derivePSKAtCounter(initial []byte, counter uint32) ([]byte, error) {
	session := counter / pskSessionSize
	position := counter % pskSessionSize
	sessionPSK, err := deriveSymmetricKey(initial, []byte("AlgoChat-PSK-Session"), uint32Bytes(session))
	if err != nil {
		return nil, err
	}
	return deriveSymmetricKey(sessionPSK, []byte("AlgoChat-PSK-Position"), uint32Bytes(position))
}

func uint32Bytes(value uint32) []byte {
	var out [4]byte
	binary.BigEndian.PutUint32(out[:], value)
	return out[:]
}

func pskHeader(version byte, counter uint32, sender, ephemeral [KeySize]byte, nonce, wrapped []byte) []byte {
	header := make([]byte, 0, pskHeaderSize)
	header = append(header, version, ProtocolIDPSK)
	header = append(header, uint32Bytes(counter)...)
	header = append(header, sender[:]...)
	header = append(header, ephemeral[:]...)
	header = append(header, nonce...)
	header = append(header, wrapped...)
	return header
}
