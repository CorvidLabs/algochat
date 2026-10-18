package algochat

import (
	"encoding/hex"
	"encoding/json"
	"os"
	"strings"
	"testing"
)

func TestGroupVector(t *testing.T) {
	raw, err := os.ReadFile("../vectors/group-v1.json")
	if err != nil {
		t.Fatal(err)
	}
	var v struct {
		SessionKey      string `json:"session_key"`
		SenderX25519    string `json:"sender_x25519"`
		HandshakeID     string `json:"handshake_id"`
		MembershipNonce string `json:"membership_nonce"`
		Action          int    `json:"action"`
		Epoch           uint32 `json:"epoch"`
		GroupID         string `json:"group_id"`
		Mailbox         string `json:"mailbox"`
		GroupKey        string `json:"group_key"`
		MembershipNote  string `json:"membership_note"`
		MessageNonce    string `json:"message_nonce"`
		Counter         uint32 `json:"counter"`
		SenderAddress   string `json:"sender_address"`
		Plaintext       string `json:"plaintext_utf8"`
		MessageKey      string `json:"message_key"`
		MessageNote     string `json:"message_note"`
	}
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}

	session := PQSession{SessionKey: mustHex(t, v.SessionKey)}
	copy(session.SenderPublicKey[:], mustHex(t, v.SenderX25519))
	copy(session.HandshakeID[:], mustHex(t, v.HandshakeID))
	var membership GroupMembership
	membership.Action = byte(v.Action)
	membership.Epoch = v.Epoch
	copy(membership.GroupID[:], mustHex(t, v.GroupID))
	copy(membership.Mailbox[:], mustHex(t, v.Mailbox))
	copy(membership.GroupKey[:], mustHex(t, v.GroupKey))

	note, err := SealGroupMembership(session, membership, mustHex(t, v.MembershipNonce))
	if err != nil {
		t.Fatal(err)
	}
	if hex.EncodeToString(note) != v.MembershipNote {
		t.Fatalf("membership note mismatch: got %d bytes", len(note))
	}
	if len(note) != 195 || note[0] != 0x02 || note[1] != 0x06 {
		t.Fatalf("membership note header %d bytes", len(note))
	}
	opened, err := OpenGroupMembership(note, session)
	if err != nil {
		t.Fatal(err)
	}
	if opened.Action != membership.Action || opened.Epoch != membership.Epoch || opened.GroupKey != membership.GroupKey {
		t.Fatal("opened membership mismatch")
	}

	groupKey := mustHex(t, v.GroupKey)
	groupID := mustHex(t, v.GroupID)
	sender := mustHex(t, v.SenderAddress)
	key, err := DeriveGroupMessageKey(groupKey, v.Epoch, v.Counter, groupID, sender)
	if err != nil {
		t.Fatal(err)
	}
	if hex.EncodeToString(key) != v.MessageKey {
		t.Fatal("message key mismatch")
	}
	msg, err := SealGroupMessage([]byte(v.Plaintext), groupKey, groupID, v.Epoch, v.Counter, sender, mustHex(t, v.MessageNonce))
	if err != nil {
		t.Fatal(err)
	}
	if hex.EncodeToString(msg) != v.MessageNote {
		t.Fatalf("message note mismatch: got %d bytes", len(msg))
	}
	if msg[0] != 0x02 || msg[1] != 0x07 {
		t.Fatal("message note protocol mismatch")
	}
	plain, err := OpenGroupMessage(msg, groupKey, sender, nil)
	if err != nil {
		t.Fatal(err)
	}
	if string(plain.Plaintext) != v.Plaintext || plain.Epoch != v.Epoch || plain.Counter != v.Counter {
		t.Fatal("opened message mismatch")
	}

	_, err = OpenGroupMessage(msg, groupKey, sender, []GroupCounter{{Epoch: v.Epoch, Counter: v.Counter}})
	if err == nil || !strings.Contains(err.Error(), "repeated") {
		t.Fatalf("repeated counter: %v", err)
	}
	_, err = OpenGroupMessage(msg, bytesRepeat(0x98, KeySize), sender, nil)
	if err == nil || !strings.Contains(err.Error(), "authentication") {
		t.Fatalf("wrong group key: %v", err)
	}
}

func mustHex(t *testing.T, text string) []byte {
	t.Helper()
	raw, err := hex.DecodeString(text)
	if err != nil {
		t.Fatal(err)
	}
	return raw
}
