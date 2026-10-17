package algochat

import (
	"encoding/hex"
	"encoding/json"
	"os"
	"testing"
)

func TestPQParityFixture(t *testing.T) {
	raw, err := os.ReadFile("../vectors/pq-mlkem768.json")
	if err != nil {
		t.Fatal(err)
	}
	var v struct {
		EncapsKey            string `json:"encaps_key"`
		Ciphertext           string `json:"ciphertext"`
		SS                   string `json:"mlkem_shared_secret"`
		Combiner             string `json:"combiner_session_key"`
		HandshakeNote        string `json:"handshake_note"`
		HandshakeSessionKey  string `json:"handshake_session_key"`
	}
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}
	var seed [KeySize]byte
	for i := range seed {
		seed[i] = 0x22
	}
	dk, err := DeriveMLKEM768(seed)
	if err != nil {
		t.Fatal(err)
	}
	if hex.EncodeToString(dk.EncapsulationKey().Bytes()) != v.EncapsKey {
		t.Fatal("encapsulation key mismatch")
	}
	ct, _ := hex.DecodeString(v.Ciphertext)
	ss, err := dk.Decapsulate(ct)
	if err != nil {
		t.Fatal(err)
	}
	if hex.EncodeToString(ss) != v.SS {
		t.Fatal("shared secret mismatch")
	}
	ek := bytesRepeat(1, 32)
	ctFill := bytesRepeat(2, mlkemCTSize)
	sender := bytesRepeat(3, 32)
	recip := bytesRepeat(4, 32)
	ec := bytesRepeat(5, 32)
	pq := bytesRepeat(6, 32)
	got := DeriveHybridPQKey(ec, pq, ek, ctFill, sender, recip, dk.EncapsulationKey().Bytes())
	if hex.EncodeToString(got) != v.Combiner {
		t.Fatalf("combiner %x", got)
	}

	var aliceSeed, bobSeed [KeySize]byte
	for i := range aliceSeed {
		aliceSeed[i] = 0x11
		bobSeed[i] = 0x22
	}
	alice, err := DeriveEncryptionKeys(aliceSeed)
	if err != nil {
		t.Fatal(err)
	}
	bob, err := DeriveEncryptionKeys(bobSeed)
	if err != nil {
		t.Fatal(err)
	}
	note, _ := hex.DecodeString(v.HandshakeNote)
	session, err := AcceptPQHandshake(note, bob, dk)
	if err != nil {
		t.Fatal(err)
	}
	if hex.EncodeToString(session.SessionKey) != v.HandshakeSessionKey {
		t.Fatalf("handshake session %x", session.SessionKey)
	}
	reopened, err := OpenPQHandshakeAsSender(note, alice)
	if err != nil {
		t.Fatal(err)
	}
	if hex.EncodeToString(reopened.SessionKey) != v.HandshakeSessionKey {
		t.Fatal("sender reopen mismatch")
	}
	out, err := EncryptPQMessage("parity", session)
	if err != nil {
		t.Fatal(err)
	}
	plain, err := DecryptPQMessage(out, reopened)
	if err != nil || plain != "parity" {
		t.Fatalf("round trip %q %v", plain, err)
	}
	out[len(out)-1] ^= 1
	if _, err := DecryptPQMessage(out, session); err == nil {
		t.Fatal("tamper should fail")
	}
	if !IsPQAnnouncement(append([]byte("ACPQ"), 0x01)) {
		t.Fatal("ACPQ not recognized")
	}
}

func bytesRepeat(b byte, n int) []byte {
	out := make([]byte, n)
	for i := range out {
		out[i] = b
	}
	return out
}
