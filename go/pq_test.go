package algochat

import (
	"crypto/ed25519"
	"crypto/sha256"
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
		EncapsKey           string `json:"encaps_key"`
		Ciphertext          string `json:"ciphertext"`
		SS                  string `json:"mlkem_shared_secret"`
		Combiner            string `json:"combiner_session_key"`
		HandshakeNote       string `json:"handshake_note"`
		HandshakeSessionKey string `json:"handshake_session_key"`
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
	aliceDK, err := DeriveMLKEM768(aliceSeed)
	if err != nil {
		t.Fatal(err)
	}
	note, session, err := InitiatePQHandshake(alice, bob.PublicKey, dk.EncapsulationKey().Bytes(), aliceDK.EncapsulationKey().Bytes())
	if err != nil {
		t.Fatal(err)
	}
	if len(note) != pqHandshakeSize {
		t.Fatalf("handshake %d", len(note))
	}
	accepted, err := AcceptPQHandshake(note, bob, dk)
	if err != nil {
		t.Fatal(err)
	}
	if hex.EncodeToString(accepted.SessionKey) != hex.EncodeToString(session.SessionKey) {
		t.Fatal("recipient session mismatch")
	}
	reopened, err := OpenPQHandshakeAsSender(note, alice, aliceDK)
	if err != nil {
		t.Fatal(err)
	}
	if hex.EncodeToString(reopened.SessionKey) != hex.EncodeToString(session.SessionKey) {
		t.Fatal("sender reopen mismatch")
	}
	if _, err := OpenPQHandshakeAsSender(note, alice, dk); err == nil {
		t.Fatal("recipient decapsulation key must not open the sender wrap")
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
		t.Fatal("tag tamper should fail")
	}
	body := append([]byte(nil), out...)
	body[len(body)-1] ^= 1
	body[pqDataHeaderSize] ^= 1
	if _, err := DecryptPQMessage(body, session); err == nil {
		t.Fatal("ciphertext byte 78 should fail")
	}
	if !IsPQAnnouncement(append([]byte("ACPQ"), 0x01)) {
		t.Fatal("ACPQ not recognized")
	}
	unsigned := append([]byte("ACPQ"), 0x01)
	unsigned = append(unsigned, bytesRepeat(0x07, mlkemEKSize)...)
	encaps, verified, ok := ParsePQAnnouncement(unsigned, nil)
	if !ok || verified || len(encaps) != mlkemEKSize {
		t.Fatal("unsigned announcement")
	}
	bad := append(unsigned, bytesRepeat(0, 64)...)
	if _, _, ok := ParsePQAnnouncement(bad, bytesRepeat(0x11, 32)); ok {
		t.Fatal("bad signature accepted")
	}
	pub, priv, genErr := ed25519.GenerateKey(nil)
	if genErr != nil {
		t.Fatal(genErr)
	}
	sum := sha256.Sum256(append(append([]byte("AlgoChat-pq-ek-v1"), 0x01), unsigned[5:]...))
	signed := append(append([]byte{}, unsigned...), ed25519.Sign(priv, sum[:])...)
	got, isVerified, parsedOK := ParsePQAnnouncement(signed, pub)
	if !parsedOK || !isVerified || hex.EncodeToString(got) != hex.EncodeToString(unsigned[5:]) {
		t.Fatal("valid signature rejected")
	}
}

func TestLiveLocalnetNote(t *testing.T) {
	raw, err := os.ReadFile("/tmp/pq-live.json")
	if err != nil {
		t.Skip(err)
	}
	var v struct {
		AliceSeed  string `json:"aliceSeed"`
		BobSeed    string `json:"bobSeed"`
		Handshake  string `json:"handshake"`
		Message    string `json:"message"`
		SessionKey string `json:"sessionKey"`
		Text       string `json:"text"`
	}
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}
	aliceSeed, _ := hex.DecodeString(v.AliceSeed)
	bobSeed, _ := hex.DecodeString(v.BobSeed)
	note, _ := hex.DecodeString(v.Handshake)
	if len(note) != pqHandshakeSize {
		t.Skip("live note is not the current handshake")
	}
	msg, _ := hex.DecodeString(v.Message)
	var a, b [KeySize]byte
	copy(a[:], aliceSeed)
	copy(b[:], bobSeed)
	alice, err := DeriveEncryptionKeys(a)
	if err != nil {
		t.Fatal(err)
	}
	bob, err := DeriveEncryptionKeys(b)
	if err != nil {
		t.Fatal(err)
	}
	dk, err := DeriveMLKEM768(b)
	if err != nil {
		t.Fatal(err)
	}
	session, err := AcceptPQHandshake(note, bob, dk)
	if err != nil {
		t.Fatal(err)
	}
	if hex.EncodeToString(session.SessionKey) != v.SessionKey {
		t.Fatalf("session %x", session.SessionKey)
	}
	plain, err := DecryptPQMessage(msg, session)
	if err != nil || plain != v.Text {
		t.Fatalf("bob %q %v", plain, err)
	}
	aliceDK, err := DeriveMLKEM768(a)
	if err != nil {
		t.Fatal(err)
	}
	reopened, err := OpenPQHandshakeAsSender(note, alice, aliceDK)
	if err != nil {
		t.Fatal(err)
	}
	senderPlain, err := DecryptPQMessage(msg, reopened)
	if err != nil || senderPlain != v.Text {
		t.Fatalf("alice %q %v", senderPlain, err)
	}
}

func bytesRepeat(b byte, n int) []byte {
	out := make([]byte, n)
	for i := range out {
		out[i] = b
	}
	return out
}
