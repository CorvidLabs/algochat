package algochat

import (
	"bytes"
	"crypto/rand"
	"encoding/binary"
	"errors"
	"math"
	"testing"

	"golang.org/x/crypto/chacha20poly1305"
)

func TestPSKMaxUint32RoundTripDoesNotWrap(t *testing.T) {
	sender, err := GenerateEphemeralKeyPair()
	if err != nil {
		t.Fatal(err)
	}
	recipient, err := GenerateEphemeralKeyPair()
	if err != nil {
		t.Fatal(err)
	}
	initial := bytes.Repeat([]byte{0xaa}, KeySize)
	note, err := EncryptPSKMessage("max", sender, recipient.PublicKey, initial, math.MaxUint32)
	if err != nil {
		t.Fatal(err)
	}
	if got := binary.BigEndian.Uint32(note[2:6]); got != math.MaxUint32 {
		t.Fatalf("wire counter %#x, want MaxUint32", got)
	}
	opened, err := DecryptPSKMessage(note, recipient, initial)
	if err != nil || opened != "max" {
		t.Fatalf("round trip %q %v", opened, err)
	}
	again, err := DecryptPSKMessage(note, recipient, initial)
	if err != nil || again != "max" {
		t.Fatalf("second open %q %v; library must not keep replay state", again, err)
	}
	zero, err := EncryptPSKMessage("zero", sender, recipient.PublicKey, initial, 0)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Equal(note[2:6], zero[2:6]) {
		t.Fatal("MaxUint32 encoded as counter 0")
	}
}

func TestDecryptPSKRejectsAuthenticatedNoteOver4096(t *testing.T) {
	sender, err := GenerateEphemeralKeyPair()
	if err != nil {
		t.Fatal(err)
	}
	recipient, err := GenerateEphemeralKeyPair()
	if err != nil {
		t.Fatal(err)
	}
	initial := bytes.Repeat([]byte{0xab}, KeySize)
	current, err := derivePSKAtCounter(initial, 0)
	if err != nil {
		t.Fatal(err)
	}
	message := bytes.Repeat([]byte{'B'}, pskMaxPlaintext+1)
	ephemeral, err := GenerateEphemeralKeyPair()
	if err != nil {
		t.Fatal(err)
	}
	shared, err := x25519ECDH(ephemeral.PrivateKey, recipient.PublicKey)
	if err != nil {
		t.Fatal(err)
	}
	info := concatBytes([]byte("AlgoChatV1-PSK"), sender.PublicKey[:], recipient.PublicKey[:])
	symmetric, err := deriveSymmetricKey(concatBytes(shared, current), ephemeral.PublicKey[:], info)
	if err != nil {
		t.Fatal(err)
	}
	var nonce [NonceSize]byte
	if _, err := rand.Read(nonce[:]); err != nil {
		t.Fatal(err)
	}
	senderShared, err := x25519ECDH(ephemeral.PrivateKey, sender.PublicKey)
	if err != nil {
		t.Fatal(err)
	}
	senderKey, err := deriveSymmetricKey(
		concatBytes(senderShared, current),
		ephemeral.PublicKey[:],
		concatBytes([]byte("AlgoChatV1-PSK-SenderKey"), sender.PublicKey[:]),
	)
	if err != nil {
		t.Fatal(err)
	}
	wrap, err := chacha20poly1305.New(senderKey)
	if err != nil {
		t.Fatal(err)
	}
	encryptedSenderKey := wrap.Seal(nil, nonce[:], symmetric, nil)
	header := pskHeader(protocolVersionAAD, 0, sender.PublicKey, ephemeral.PublicKey, nonce[:], encryptedSenderKey)
	payload, err := chacha20poly1305.New(symmetric)
	if err != nil {
		t.Fatal(err)
	}
	ciphertext := payload.Seal(nil, nonce[:], message, header)
	note := append(header, ciphertext...)
	if len(note) != MaxNoteSize+1 {
		t.Fatalf("note length %d", len(note))
	}
	if _, err := payload.Open(nil, nonce[:], ciphertext, header); err != nil {
		t.Fatalf("fixture is not authenticated: %v", err)
	}
	got, err := DecryptPSKMessage(note, recipient, initial)
	if err == nil || got != "" {
		t.Fatalf("oversized note returned plaintext %q", got)
	}
	if !errors.Is(err, ErrNoteTooLarge) {
		t.Fatalf("expected ErrNoteTooLarge, got %v", err)
	}
	if _, err := EncryptPSKMessage(string(message), sender, recipient.PublicKey, initial, 0); !errors.Is(err, ErrMessageTooLarge) {
		t.Fatalf("outbound max+1: %v", err)
	}
}
