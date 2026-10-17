package algochat

import (
	"crypto/mlkem"
	"crypto/sha256"
	"crypto/rand"
	"errors"
	"io"

	"golang.org/x/crypto/chacha20poly1305"
	"golang.org/x/crypto/curve25519"
	"golang.org/x/crypto/hkdf"
)

const (
	protocolVersionAAD = 0x02
	protocolIDPQHandshake = 0x04
	protocolIDPQData      = 0x05
	mlkemCTSize           = 1088
	mlkemEKSize           = 1184
	pqHandshakeSize       = 1278
	pqDataHeaderSize      = 78
	pqWrappedKeySize      = 48
	pqMaxPayloadSize      = MaxNoteSize - pqDataHeaderSize - TagSize
)

var (
	errPQHandshake = errors.New("invalid PQ handshake")
	errPQMessage   = errors.New("invalid PQ message")
	announceMagic  = []byte("ACPQ")
)

// PQSession is the hybrid session key shared by a 0x04 handshake.
type PQSession struct {
	SessionKey           []byte
	SenderPublicKey      [KeySize]byte
	RecipientPublicKey   [KeySize]byte
	HandshakeID          [KeySize]byte
}

// DeriveMLKEM768 derives an ML-KEM-768 key from the 32-byte account seed.
func DeriveMLKEM768(seed [KeySize]byte) (*mlkem.DecapsulationKey768, error) {
	d := expandHKDF(seed[:], []byte("AlgoChat-v1-mlkem768"), []byte("mlkem768-d"))
	z := expandHKDF(seed[:], []byte("AlgoChat-v1-mlkem768"), []byte("mlkem768-z"))
	dz := append(append([]byte{}, d...), z...)
	return mlkem.NewDecapsulationKey768(dz)
}

// DeriveHybridPQKey is the section 5.7 combiner.
func DeriveHybridPQKey(ecSS, pqSS, ephPub, kemCT, senderX, recipX, encapsKey []byte) []byte {
	info := append([]byte("algochat-pq-v1"), ephPub...)
	info = append(info, kemCT...)
	info = append(info, senderX...)
	info = append(info, recipX...)
	sum := sha256.Sum256(encapsKey)
	info = append(info, sum[:]...)
	ikm := append(append([]byte{}, ecSS...), pqSS...)
	return expandHKDF(ikm, []byte("algochat-pq-v1"), info)
}

// AcceptPQHandshake opens a 0x04 note with the recipient's long-term keys.
func AcceptPQHandshake(note []byte, recipient X25519KeyPair, decap *mlkem.DecapsulationKey768) (PQSession, error) {
	f, err := parseHandshake(note)
	if err != nil {
		return PQSession{}, err
	}
	if f.recipientPublic != recipient.PublicKey {
		return PQSession{}, errPQHandshake
	}
	ek := decap.EncapsulationKey().Bytes()
	sum := sha256.Sum256(ek)
	if f.encapsHash != sum {
		return PQSession{}, errPQHandshake
	}
	ec, err := x25519ECDH(recipient.PrivateKey, f.ephemeralPublic)
	if err != nil {
		return PQSession{}, err
	}
	pq, err := decap.Decapsulate(f.kemCT)
	if err != nil {
		return PQSession{}, err
	}
	key := DeriveHybridPQKey(ec, pq, f.ephemeralPublic[:], f.kemCT, f.senderPublic[:], f.recipientPublic[:], ek)
	return sessionFrom(note, key, f.senderPublic, f.recipientPublic), nil
}

// OpenPQHandshakeAsSender recovers the session from the sender wrap.
func OpenPQHandshakeAsSender(note []byte, sender X25519KeyPair) (PQSession, error) {
	f, err := parseHandshake(note)
	if err != nil {
		return PQSession{}, err
	}
	if f.senderPublic != sender.PublicKey {
		return PQSession{}, errPQHandshake
	}
	wrapKey, err := senderWrapKey(sender.PrivateKey, f.ephemeralPublic, sender.PublicKey, f.ephemeralPublic)
	if err != nil {
		return PQSession{}, err
	}
	aead, err := chacha20poly1305.New(wrapKey)
	if err != nil {
		return PQSession{}, err
	}
	prefix := note[:len(note)-pqWrappedKeySize]
	key, err := aead.Open(nil, f.nonce[:], f.wrapped, prefix)
	if err != nil {
		return PQSession{}, errPQHandshake
	}
	return sessionFrom(note, key, f.senderPublic, f.recipientPublic), nil
}

// InitiatePQHandshake builds a 0x04 note. Encapsulation coins are random.
func InitiatePQHandshake(sender X25519KeyPair, recipientPublic [KeySize]byte, encapsKey []byte) ([]byte, PQSession, error) {
	eph, err := GenerateEphemeralKeyPair()
	if err != nil {
		return nil, PQSession{}, err
	}
	ec, err := x25519ECDH(eph.PrivateKey, recipientPublic)
	if err != nil {
		return nil, PQSession{}, err
	}
	ek, err := mlkem.NewEncapsulationKey768(encapsKey)
	if err != nil {
		return nil, PQSession{}, err
	}
	pq, ct := ek.Encapsulate()
	key := DeriveHybridPQKey(ec, pq, eph.PublicKey[:], ct, sender.PublicKey[:], recipientPublic[:], encapsKey)
	nonce := make([]byte, NonceSize)
	if _, err := rand.Read(nonce); err != nil {
		return nil, PQSession{}, err
	}
	prefix := handshakePrefix(sender.PublicKey, recipientPublic, eph.PublicKey, ct, encapsKey, nonce)
	wrapKey, err := senderWrapKey(eph.PrivateKey, sender.PublicKey, sender.PublicKey, eph.PublicKey)
	if err != nil {
		return nil, PQSession{}, err
	}
	aead, err := chacha20poly1305.New(wrapKey)
	if err != nil {
		return nil, PQSession{}, err
	}
	wrapped := aead.Seal(nil, nonce, key, prefix)
	note := append(prefix, wrapped...)
	if len(note) != pqHandshakeSize {
		return nil, PQSession{}, errPQHandshake
	}
	return note, sessionFrom(note, key, sender.PublicKey, recipientPublic), nil
}

// EncryptPQMessage seals plaintext under the session key.
func EncryptPQMessage(plaintext string, session PQSession) ([]byte, error) {
	msg := []byte(plaintext)
	if len(msg) > pqMaxPayloadSize {
		return nil, ErrMessageTooLarge
	}
	nonce := make([]byte, NonceSize)
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}
	header := dataHeader(session.SenderPublicKey, session.HandshakeID, nonce)
	aead, err := chacha20poly1305.New(session.SessionKey)
	if err != nil {
		return nil, err
	}
	return append(header, aead.Seal(nil, nonce, msg, header)...), nil
}

// DecryptPQMessage opens a 0x05 note.
func DecryptPQMessage(note []byte, session PQSession) (string, error) {
	if len(note) < pqDataHeaderSize+TagSize || note[0] != protocolVersionAAD || note[1] != protocolIDPQData {
		return "", errPQMessage
	}
	var sender [KeySize]byte
	var hid [KeySize]byte
	copy(sender[:], note[2:34])
	copy(hid[:], note[34:66])
	if sender != session.SenderPublicKey || hid != session.HandshakeID {
		return "", errPQMessage
	}
	header := note[:pqDataHeaderSize]
	aead, err := chacha20poly1305.New(session.SessionKey)
	if err != nil {
		return "", err
	}
	plain, err := aead.Open(nil, note[66:78], note[78:], header)
	if err != nil {
		return "", errPQMessage
	}
	return string(plain), nil
}

// IsPQAnnouncement reports an ACPQ encapsulation-key note.
func IsPQAnnouncement(note []byte) bool {
	return len(note) >= len(announceMagic) && string(note[:4]) == "ACPQ"
}

type handshakeFields struct {
	senderPublic, recipientPublic, ephemeralPublic [KeySize]byte
	kemCT                                          []byte
	encapsHash                                     [KeySize]byte
	nonce                                          [NonceSize]byte
	wrapped                                        []byte
}

func parseHandshake(note []byte) (handshakeFields, error) {
	var f handshakeFields
	if len(note) != pqHandshakeSize || note[0] != protocolVersionAAD || note[1] != protocolIDPQHandshake {
		return f, errPQHandshake
	}
	off := 2
	copy(f.senderPublic[:], note[off:off+32])
	off += 32
	copy(f.recipientPublic[:], note[off:off+32])
	off += 32
	copy(f.ephemeralPublic[:], note[off:off+32])
	off += 32
	f.kemCT = append([]byte{}, note[off:off+mlkemCTSize]...)
	off += mlkemCTSize
	copy(f.encapsHash[:], note[off:off+32])
	off += 32
	copy(f.nonce[:], note[off:off+12])
	off += 12
	f.wrapped = append([]byte{}, note[off:off+pqWrappedKeySize]...)
	return f, nil
}

func handshakePrefix(sender, recip, eph [KeySize]byte, ct, ek, nonce []byte) []byte {
	prefix := make([]byte, pqHandshakeSize-pqWrappedKeySize)
	prefix[0] = protocolVersionAAD
	prefix[1] = protocolIDPQHandshake
	off := 2
	copy(prefix[off:], sender[:])
	off += 32
	copy(prefix[off:], recip[:])
	off += 32
	copy(prefix[off:], eph[:])
	off += 32
	copy(prefix[off:], ct)
	off += len(ct)
	sum := sha256.Sum256(ek)
	copy(prefix[off:], sum[:])
	off += 32
	copy(prefix[off:], nonce)
	return prefix
}

func dataHeader(sender [KeySize]byte, hid [KeySize]byte, nonce []byte) []byte {
	h := make([]byte, pqDataHeaderSize)
	h[0] = protocolVersionAAD
	h[1] = protocolIDPQData
	copy(h[2:], sender[:])
	copy(h[34:], hid[:])
	copy(h[66:], nonce)
	return h
}

func sessionFrom(note, key []byte, sender, recip [KeySize]byte) PQSession {
	id := sha256.Sum256(note)
	return PQSession{SessionKey: key, SenderPublicKey: sender, RecipientPublicKey: recip, HandshakeID: id}
}

func senderWrapKey(priv, other, sender, eph [KeySize]byte) ([]byte, error) {
	agreed, err := curve25519.X25519(priv[:], other[:])
	if err != nil {
		return nil, err
	}
	info := append([]byte("AlgoChatPQ-SenderKey"), sender[:]...)
	return expandHKDF(agreed, eph[:], info), nil
}

func expandHKDF(ikm, salt, info []byte) []byte {
	r := hkdf.New(sha256.New, ikm, salt, info)
	out := make([]byte, 32)
	_, _ = io.ReadFull(r, out)
	return out
}
