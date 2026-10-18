package algochat

import (
	"crypto/rand"
	"encoding/binary"
	"errors"
	"fmt"

	"golang.org/x/crypto/chacha20poly1305"
)

const (
	protocolIDGroupMembership = 0x06
	protocolIDGroupMessage    = 0x07
	groupMembershipPlainSize  = 101
	groupMembershipNoteSize   = pqDataHeaderSize + groupMembershipPlainSize + TagSize
	groupMessageHeaderSize    = 54
	groupMaxPayloadSize       = MaxNoteSize - groupMessageHeaderSize - TagSize
	groupInfoLabel            = "AlgoChat-group-v1"
)

var (
	errGroupRepeated = errors.New("repeated group counter")
	errGroupAuth     = errors.New("group message authentication failed")
)

// GroupMembership is the plaintext of one 0x06 note.
type GroupMembership struct {
	Action   byte
	Epoch    uint32
	GroupID  [KeySize]byte
	Mailbox  [KeySize]byte
	GroupKey [KeySize]byte
}

// GroupCounter is one accepted epoch and counter for a sender.
type GroupCounter struct {
	Epoch   uint32
	Counter uint32
}

// OpenedGroupMessage is one decrypted 0x07 note.
type OpenedGroupMessage struct {
	Plaintext []byte
	GroupID   [KeySize]byte
	Epoch     uint32
	Counter   uint32
}

// SealGroupMembership seals a 101-byte membership record under the hybrid session key.
// The note is protocol 0x06 and is 195 bytes. A nil or empty nonce is filled at random.
func SealGroupMembership(session PQSession, membership GroupMembership, nonce []byte) ([]byte, error) {
	if err := requireGroupSession(session); err != nil {
		return nil, err
	}
	plain, err := encodeMembership(membership)
	if err != nil {
		return nil, err
	}
	nonce, err = groupNonce(nonce)
	if err != nil {
		return nil, err
	}
	header := membershipHeader(session.SenderPublicKey, session.HandshakeID, nonce)
	aead, err := chacha20poly1305.New(session.SessionKey)
	if err != nil {
		return nil, err
	}
	note := append(header, aead.Seal(nil, nonce, plain, header)...)
	if len(note) != groupMembershipNoteSize {
		return nil, fmt.Errorf("group membership note is %d bytes", len(note))
	}
	return note, nil
}

// OpenGroupMembership opens a 0x06 note.
// The session sender and handshake id must match the header.
func OpenGroupMembership(note []byte, session PQSession) (GroupMembership, error) {
	if err := requireGroupSession(session); err != nil {
		return GroupMembership{}, err
	}
	if len(note) != groupMembershipNoteSize || note[0] != protocolVersionAAD || note[1] != protocolIDGroupMembership {
		return GroupMembership{}, errors.New("not a group membership note")
	}
	var sender, hid [KeySize]byte
	copy(sender[:], note[2:34])
	copy(hid[:], note[34:66])
	if sender != session.SenderPublicKey {
		return GroupMembership{}, errors.New("membership sender does not match the handshake")
	}
	if hid != session.HandshakeID {
		return GroupMembership{}, errors.New("membership is for a different handshake")
	}
	aead, err := chacha20poly1305.New(session.SessionKey)
	if err != nil {
		return GroupMembership{}, err
	}
	header := note[:pqDataHeaderSize]
	plain, err := aead.Open(nil, note[66:78], note[pqDataHeaderSize:], header)
	if err != nil {
		return GroupMembership{}, errors.New("group membership authentication failed")
	}
	return decodeMembership(plain)
}

// DeriveGroupMessageKey derives the 32-byte 0x07 message key.
// Salt is the epoch and counter as big-endian uint32 values.
// Info is "AlgoChat-group-v1", the group id, and the sender address.
func DeriveGroupMessageKey(groupKey []byte, epoch, counter uint32, groupID, senderAddress []byte) ([]byte, error) {
	if len(groupKey) != KeySize {
		return nil, fmt.Errorf("group key is %d bytes", len(groupKey))
	}
	if len(groupID) != KeySize {
		return nil, fmt.Errorf("group id is %d bytes", len(groupID))
	}
	if len(senderAddress) != KeySize {
		return nil, fmt.Errorf("sender address is %d bytes", len(senderAddress))
	}
	if epoch < 1 {
		return nil, errors.New("group epoch must be from 1 through 4294967295")
	}
	salt := make([]byte, 8)
	binary.BigEndian.PutUint32(salt[0:4], epoch)
	binary.BigEndian.PutUint32(salt[4:8], counter)
	info := make([]byte, 0, len(groupInfoLabel)+KeySize+KeySize)
	info = append(info, groupInfoLabel...)
	info = append(info, groupID...)
	info = append(info, senderAddress...)
	return expandHKDF(groupKey, salt, info), nil
}

// SealGroupMessage seals a group mailbox note under the derived message key.
// Plaintext is at most 4026 bytes. A nil or empty nonce is filled at random.
func SealGroupMessage(plaintext, groupKey, groupID []byte, epoch, counter uint32, senderAddress, nonce []byte) ([]byte, error) {
	if len(plaintext) > groupMaxPayloadSize {
		return nil, fmt.Errorf("%w: %d bytes, max %d", ErrMessageTooLarge, len(plaintext), groupMaxPayloadSize)
	}
	key, err := DeriveGroupMessageKey(groupKey, epoch, counter, groupID, senderAddress)
	if err != nil {
		return nil, err
	}
	nonce, err = groupNonce(nonce)
	if err != nil {
		return nil, err
	}
	var gid [KeySize]byte
	copy(gid[:], groupID)
	header := groupMessageHeader(gid, epoch, counter, nonce)
	aead, err := chacha20poly1305.New(key)
	if err != nil {
		return nil, err
	}
	note := append(header, aead.Seal(nil, nonce, plaintext, header)...)
	if len(note) > MaxNoteSize {
		return nil, fmt.Errorf("group message note is %d bytes", len(note))
	}
	return note, nil
}

// OpenGroupMessage opens a 0x07 note.
// An accepted pair with the same epoch and counter returns an error containing "repeated".
// An AEAD failure returns an error containing "authentication".
func OpenGroupMessage(note, groupKey, senderAddress []byte, accepted []GroupCounter) (OpenedGroupMessage, error) {
	if len(note) < groupMessageHeaderSize+TagSize || len(note) > MaxNoteSize || note[0] != protocolVersionAAD || note[1] != protocolIDGroupMessage {
		return OpenedGroupMessage{}, errors.New("not a group message")
	}
	var groupID [KeySize]byte
	copy(groupID[:], note[2:34])
	epoch := binary.BigEndian.Uint32(note[34:38])
	counter := binary.BigEndian.Uint32(note[38:42])
	if epoch < 1 {
		return OpenedGroupMessage{}, errors.New("group epoch must be from 1 through 4294967295")
	}
	for _, item := range accepted {
		if item.Epoch == epoch && item.Counter == counter {
			return OpenedGroupMessage{}, errGroupRepeated
		}
	}
	key, err := DeriveGroupMessageKey(groupKey, epoch, counter, groupID[:], senderAddress)
	if err != nil {
		return OpenedGroupMessage{}, err
	}
	aead, err := chacha20poly1305.New(key)
	if err != nil {
		return OpenedGroupMessage{}, err
	}
	header := note[:groupMessageHeaderSize]
	plain, err := aead.Open(nil, note[42:54], note[groupMessageHeaderSize:], header)
	if err != nil {
		return OpenedGroupMessage{}, errGroupAuth
	}
	return OpenedGroupMessage{Plaintext: plain, GroupID: groupID, Epoch: epoch, Counter: counter}, nil
}

func requireGroupSession(session PQSession) error {
	if len(session.SessionKey) != KeySize {
		return fmt.Errorf("session key is %d bytes", len(session.SessionKey))
	}
	return nil
}

func encodeMembership(m GroupMembership) ([]byte, error) {
	if m.Action < 1 || m.Action > 4 {
		return nil, errors.New("group action is not create, add, remove, or rekey")
	}
	if m.Epoch < 1 {
		return nil, errors.New("group epoch must be from 1 through 4294967295")
	}
	out := make([]byte, groupMembershipPlainSize)
	out[0] = m.Action
	binary.BigEndian.PutUint32(out[1:5], m.Epoch)
	copy(out[5:37], m.GroupID[:])
	copy(out[37:69], m.Mailbox[:])
	copy(out[69:101], m.GroupKey[:])
	return out, nil
}

func decodeMembership(plain []byte) (GroupMembership, error) {
	if len(plain) != groupMembershipPlainSize {
		return GroupMembership{}, errors.New("group membership plaintext is the wrong length")
	}
	var m GroupMembership
	m.Action = plain[0]
	m.Epoch = binary.BigEndian.Uint32(plain[1:5])
	copy(m.GroupID[:], plain[5:37])
	copy(m.Mailbox[:], plain[37:69])
	copy(m.GroupKey[:], plain[69:101])
	if _, err := encodeMembership(m); err != nil {
		return GroupMembership{}, err
	}
	return m, nil
}

func membershipHeader(sender, hid [KeySize]byte, nonce []byte) []byte {
	h := make([]byte, pqDataHeaderSize)
	h[0] = protocolVersionAAD
	h[1] = protocolIDGroupMembership
	copy(h[2:34], sender[:])
	copy(h[34:66], hid[:])
	copy(h[66:78], nonce)
	return h
}

func groupMessageHeader(groupID [KeySize]byte, epoch, counter uint32, nonce []byte) []byte {
	h := make([]byte, groupMessageHeaderSize)
	h[0] = protocolVersionAAD
	h[1] = protocolIDGroupMessage
	copy(h[2:34], groupID[:])
	binary.BigEndian.PutUint32(h[34:38], epoch)
	binary.BigEndian.PutUint32(h[38:42], counter)
	copy(h[42:54], nonce)
	return h
}

func groupNonce(nonce []byte) ([]byte, error) {
	if len(nonce) == 0 {
		out := make([]byte, NonceSize)
		if _, err := rand.Read(out); err != nil {
			return nil, err
		}
		return out, nil
	}
	if len(nonce) != NonceSize {
		return nil, fmt.Errorf("nonce is %d bytes", len(nonce))
	}
	out := make([]byte, NonceSize)
	copy(out, nonce)
	return out, nil
}
