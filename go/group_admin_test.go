package algochat

import (
	"bytes"
	"encoding/hex"
	"encoding/json"
	"os"
	"reflect"
	"strings"
	"testing"

	"golang.org/x/crypto/chacha20poly1305"
)

func TestGroupAdminVector(t *testing.T) {
	raw, err := os.ReadFile("../vectors/group-admin-v1.json")
	if err != nil {
		t.Fatal(err)
	}
	var v struct {
		Drafts []struct {
			Name       string      `json:"name"`
			BasisState *adminBasis `json:"basis_state"`
			Op         int         `json:"op"`
			Sender     string      `json:"sender"`
			Subject    string      `json:"subject"`
			NameUTF8   *string     `json:"name_utf8"`
			Policy     *int        `json:"policy"`
			GroupID    *string     `json:"group_id"`
			Mailbox    *string     `json:"mailbox"`
			Note       string      `json:"note"`
		} `json:"drafts"`
		DraftErrors []struct {
			Name          string      `json:"name"`
			BasisState    *adminBasis `json:"basis_state"`
			Op            int         `json:"op"`
			Sender        string      `json:"sender"`
			Subject       string      `json:"subject"`
			NameUTF8      *string     `json:"name_utf8"`
			Policy        *int        `json:"policy"`
			ErrorIncludes string      `json:"error_includes"`
		} `json:"draft_errors"`
		Reductions map[string]struct {
			Events []struct {
				Note   string `json:"note"`
				Sender string `json:"sender"`
				TxID   string `json:"tx_id"`
				Round  int    `json:"round"`
				Offset int    `json:"offset"`
			} `json:"events"`
			Accepted []struct {
				TxID    string   `json:"tx_id"`
				Sender  string   `json:"sender"`
				Op      int      `json:"op"`
				Epoch   uint32   `json:"epoch"`
				Subject string   `json:"subject"`
				Members []string `json:"members"`
			} `json:"accepted"`
			Rejected []struct {
				TxID   string `json:"tx_id"`
				Reason string `json:"reason"`
			} `json:"rejected"`
			State *adminBasis `json:"state"`
		} `json:"reductions"`
		Checks struct {
			DeliveryAuthorized []struct {
				Reduction string `json:"reduction"`
				AdminTxID string `json:"admin_tx_id"`
				Sender    string `json:"sender"`
				Recipient string `json:"recipient"`
				Epoch     uint32 `json:"epoch"`
				Allowed   bool   `json:"allowed"`
			} `json:"delivery_authorized"`
			MayPost []struct {
				Reduction string `json:"reduction"`
				Sender    string `json:"sender"`
				Epoch     uint32 `json:"epoch"`
				Allowed   bool   `json:"allowed"`
			} `json:"may_post"`
		} `json:"checks"`
		Delivery struct {
			SessionKey   string `json:"session_key"`
			SenderX25519 string `json:"sender_x25519"`
			HandshakeID  string `json:"handshake_id"`
			Nonce        string `json:"nonce"`
			Epoch        uint32 `json:"epoch"`
			GroupID      string `json:"group_id"`
			Mailbox      string `json:"mailbox"`
			GroupKey     string `json:"group_key"`
			AdminTxID    string `json:"admin_tx_id"`
			Note         string `json:"note"`
		} `json:"delivery"`
	}
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}

	for _, item := range v.Drafts {
		state, err := basisRoom(item.BasisState)
		if err != nil {
			t.Fatal(err)
		}
		draft, err := draftFromVector(item.Op, item.Sender, item.Subject, item.NameUTF8, item.Policy, item.GroupID, item.Mailbox)
		if err != nil {
			t.Fatal(err)
		}
		note, err := DraftAdmin(state, draft)
		if err != nil {
			t.Fatalf("%s: %v", item.Name, err)
		}
		if hex.EncodeToString(note) != item.Note {
			t.Fatalf("%s note mismatch: got %d bytes", item.Name, len(note))
		}
	}

	for _, item := range v.DraftErrors {
		state, err := basisRoom(item.BasisState)
		if err != nil {
			t.Fatal(err)
		}
		draft, err := draftFromVector(item.Op, item.Sender, item.Subject, item.NameUTF8, item.Policy, nil, nil)
		if err != nil {
			t.Fatal(err)
		}
		_, err = DraftAdmin(state, draft)
		if err == nil || !strings.Contains(err.Error(), item.ErrorIncludes) {
			t.Fatalf("%s: %v", item.Name, err)
		}
	}

	reduced := map[string]ReduceAdminResult{}
	for name, item := range v.Reductions {
		events := make([]AdminEvent, len(item.Events))
		for i, event := range item.Events {
			events[i] = AdminEvent{
				Note:   mustHex(t, event.Note),
				Sender: mustHex(t, event.Sender),
				TxID:   mustHex(t, event.TxID),
				Round:  event.Round,
				Offset: event.Offset,
			}
		}
		got := ReduceAdmin(events)
		reduced[name] = got
		if len(got.Rejected) != len(item.Rejected) {
			t.Fatalf("%s rejected %d want %d", name, len(got.Rejected), len(item.Rejected))
		}
		for i := range item.Rejected {
			if got.Rejected[i].Reason != item.Rejected[i].Reason {
				t.Fatalf("%s rejected %d %q", name, i, got.Rejected[i].Reason)
			}
		}
		if len(got.Accepted) != len(item.Accepted) {
			t.Fatalf("%s accepted %d want %d", name, len(got.Accepted), len(item.Accepted))
		}
		for i := range item.Accepted {
			if got.Accepted[i].Op != item.Accepted[i].Op {
				t.Fatalf("%s accepted op %d got %d", name, i, got.Accepted[i].Op)
			}
		}
		if err := sameBasis(got.State, item.State); err != nil {
			t.Fatalf("%s state: %v", name, err)
		}
	}

	for _, check := range v.Checks.DeliveryAuthorized {
		result, ok := reduced[check.Reduction]
		if !ok {
			t.Fatalf("missing reduction %s", check.Reduction)
		}
		allowed := DeliveryAuthorized(result.Accepted, mustHex(t, check.AdminTxID), mustHex(t, check.Sender), mustHex(t, check.Recipient), check.Epoch)
		if allowed != check.Allowed {
			t.Fatalf("%s delivery %s allowed %v", check.Reduction, check.AdminTxID[:8], allowed)
		}
	}
	for _, check := range v.Checks.MayPost {
		result, ok := reduced[check.Reduction]
		if !ok || result.State == nil {
			t.Fatalf("missing room %s", check.Reduction)
		}
		allowed, err := SenderMayPost(*result.State, mustHex(t, check.Sender), check.Epoch)
		if err != nil {
			t.Fatal(err)
		}
		if allowed != check.Allowed {
			t.Fatalf("%s may post epoch %d allowed %v", check.Reduction, check.Epoch, allowed)
		}
	}

	session := PQSession{SessionKey: mustHex(t, v.Delivery.SessionKey)}
	copy(session.SenderPublicKey[:], mustHex(t, v.Delivery.SenderX25519))
	copy(session.HandshakeID[:], mustHex(t, v.Delivery.HandshakeID))
	note, err := SealGroupKeyDelivery(session, v.Delivery.Epoch, mustHex(t, v.Delivery.GroupID), mustHex(t, v.Delivery.Mailbox), mustHex(t, v.Delivery.GroupKey), mustHex(t, v.Delivery.AdminTxID), mustHex(t, v.Delivery.Nonce))
	if err != nil {
		t.Fatal(err)
	}
	if hex.EncodeToString(note) != v.Delivery.Note {
		t.Fatalf("delivery note mismatch: got %d bytes", len(note))
	}
	if len(note) != 227 {
		t.Fatalf("delivery note is %d bytes", len(note))
	}
	opened, err := OpenGroupKeyDelivery(note, session)
	if err != nil {
		t.Fatal(err)
	}
	if hex.EncodeToString(opened.GroupKey[:]) != v.Delivery.GroupKey {
		t.Fatal("opened group key mismatch")
	}
	if _, err := OpenGroupMembership(note, session); err == nil {
		t.Fatal("action 5 note opened as membership")
	}
}

type adminBasis struct {
	GroupID  string   `json:"group_id"`
	Mailbox  string   `json:"mailbox"`
	Owner    string   `json:"owner"`
	Admins   []string `json:"admins"`
	Members  []string `json:"members"`
	Pending  []string `json:"pending"`
	Policy   int      `json:"policy"`
	NameHex  string   `json:"name_hex"`
	Epoch    uint32   `json:"epoch"`
	HeadTxID string   `json:"head_tx_id"`
}

func basisRoom(basis *adminBasis) (*RoomState, error) {
	if basis == nil {
		return nil, nil
	}
	groupID, err := hex.DecodeString(basis.GroupID)
	if err != nil {
		return nil, err
	}
	mailbox, err := hex.DecodeString(basis.Mailbox)
	if err != nil {
		return nil, err
	}
	owner, err := hex.DecodeString(basis.Owner)
	if err != nil {
		return nil, err
	}
	admins, err := decodeHexList(basis.Admins)
	if err != nil {
		return nil, err
	}
	members, err := decodeHexList(basis.Members)
	if err != nil {
		return nil, err
	}
	pending, err := decodeHexList(basis.Pending)
	if err != nil {
		return nil, err
	}
	name, err := hex.DecodeString(basis.NameHex)
	if err != nil {
		return nil, err
	}
	head, err := hex.DecodeString(basis.HeadTxID)
	if err != nil {
		return nil, err
	}
	return &RoomState{
		GroupID:  groupID,
		Mailbox:  mailbox,
		Owner:    owner,
		Admins:   admins,
		Members:  members,
		Pending:  pending,
		Policy:   basis.Policy,
		Name:     name,
		Epoch:    basis.Epoch,
		HeadTxID: head,
	}, nil
}

func draftFromVector(op int, sender, subject string, name *string, policy *int, groupID, mailbox *string) (AdminDraft, error) {
	rawSender, err := hex.DecodeString(sender)
	if err != nil {
		return AdminDraft{}, err
	}
	var rawSubject []byte
	if subject != "" {
		rawSubject, err = hex.DecodeString(subject)
		if err != nil {
			return AdminDraft{}, err
		}
	}
	draft := AdminDraft{Op: op, Sender: rawSender, Subject: rawSubject, Policy: 0}
	if name != nil {
		draft.Name = []byte(*name)
		draft.HasName = true
	}
	if policy != nil {
		draft.Policy = *policy
		draft.HasPolicy = true
	}
	if groupID != nil && *groupID != "" {
		draft.GroupID, err = hex.DecodeString(*groupID)
		if err != nil {
			return AdminDraft{}, err
		}
	}
	if mailbox != nil && *mailbox != "" {
		draft.Mailbox, err = hex.DecodeString(*mailbox)
		if err != nil {
			return AdminDraft{}, err
		}
	}
	return draft, nil
}

func sameBasis(state *RoomState, want *adminBasis) error {
	got, err := roomBasis(state)
	if err != nil {
		return err
	}
	if !reflect.DeepEqual(got, want) {
		return errBasisMismatch{got: got, want: want}
	}
	return nil
}

type errBasisMismatch struct {
	got  *adminBasis
	want *adminBasis
}

func (e errBasisMismatch) Error() string {
	gb, _ := json.Marshal(e.got)
	wb, _ := json.Marshal(e.want)
	return "got " + string(gb) + " want " + string(wb)
}

func roomBasis(state *RoomState) (*adminBasis, error) {
	if state == nil {
		return nil, nil
	}
	admins, err := encodeHexList(state.Admins)
	if err != nil {
		return nil, err
	}
	members, err := encodeHexList(state.Members)
	if err != nil {
		return nil, err
	}
	pending, err := encodeHexList(state.Pending)
	if err != nil {
		return nil, err
	}
	return &adminBasis{
		GroupID:  hex.EncodeToString(state.GroupID),
		Mailbox:  hex.EncodeToString(state.Mailbox),
		Owner:    hex.EncodeToString(state.Owner),
		Admins:   admins,
		Members:  members,
		Pending:  pending,
		Policy:   state.Policy,
		NameHex:  hex.EncodeToString(state.Name),
		Epoch:    state.Epoch,
		HeadTxID: hex.EncodeToString(state.HeadTxID),
	}, nil
}

func decodeHexList(items []string) ([][]byte, error) {
	out := make([][]byte, len(items))
	for i, item := range items {
		raw, err := hex.DecodeString(item)
		if err != nil {
			return nil, err
		}
		out[i] = raw
	}
	return out, nil
}

func encodeHexList(items [][]byte) ([]string, error) {
	out := make([]string, len(items))
	for i, item := range items {
		out[i] = hex.EncodeToString(item)
	}
	return out, nil
}

func TestGroupAdminRejectsUnboundDeliveryUndefinedPolicyAndZeroJoinParent(t *testing.T) {
	owner := bytes.Repeat([]byte{1}, KeySize)
	friend := bytes.Repeat([]byte{2}, KeySize)
	groupID := bytes.Repeat([]byte{7}, KeySize)
	mailbox := bytes.Repeat([]byte{9}, KeySize)
	createNote, err := DraftAdmin(nil, AdminDraft{
		Op:        adminOpCreate,
		Sender:    owner,
		HasName:   true,
		Name:      []byte("team"),
		HasPolicy: true,
		Policy:    joiningInvite,
		GroupID:   groupID,
		Mailbox:   mailbox,
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, policy := range []byte{0, 3, 255} {
		got := ReduceAdmin([]AdminEvent{{Note: withPolicy(createNote, policy), Sender: owner, TxID: bytes.Repeat([]byte{10}, KeySize), Round: 1}})
		if got.State != nil || len(got.Accepted) != 0 || len(got.Rejected) != 1 || !strings.Contains(got.Rejected[0].Reason, "invite-only or ask-to-join") {
			t.Fatalf("create policy %d: %+v", policy, got.Rejected)
		}
	}
	created := ReduceAdmin([]AdminEvent{{Note: createNote, Sender: owner, TxID: bytes.Repeat([]byte{10}, KeySize), Round: 1}})
	if created.State == nil {
		t.Fatal(created.Rejected)
	}
	setPolicy, err := DraftAdmin(created.State, AdminDraft{Op: adminOpSetPolicy, Sender: owner, HasPolicy: true, Policy: joiningAsk})
	if err != nil {
		t.Fatal(err)
	}
	for _, policy := range []byte{0, 3, 255} {
		got := ReduceAdmin([]AdminEvent{
			{Note: createNote, Sender: owner, TxID: bytes.Repeat([]byte{10}, KeySize), Round: 1},
			{Note: withPolicy(setPolicy, policy), Sender: owner, TxID: bytes.Repeat([]byte{11}, KeySize), Round: 1, Offset: 1},
		})
		if got.State == nil || got.State.Policy != joiningInvite || !bytes.Equal(got.State.HeadTxID, bytes.Repeat([]byte{10}, KeySize)) || len(got.Rejected) != 1 {
			t.Fatalf("set policy %d left %+v", policy, got.State)
		}
		if !strings.Contains(got.Rejected[0].Reason, "invite-only or ask-to-join") {
			t.Fatal(got.Rejected[0].Reason)
		}
	}

	askNote, err := DraftAdmin(nil, AdminDraft{
		Op:        adminOpCreate,
		Sender:    owner,
		HasName:   true,
		Name:      []byte("general"),
		HasPolicy: true,
		Policy:    joiningAsk,
		GroupID:   groupID,
		Mailbox:   mailbox,
	})
	if err != nil {
		t.Fatal(err)
	}
	asked := ReduceAdmin([]AdminEvent{{Note: askNote, Sender: owner, TxID: bytes.Repeat([]byte{10}, KeySize), Round: 1}})
	if asked.State == nil {
		t.Fatal(asked.Rejected)
	}
	real, err := DraftAdmin(asked.State, AdminDraft{Op: adminOpRequest, Sender: friend, Subject: friend})
	if err != nil {
		t.Fatal(err)
	}
	zero := append([]byte(nil), real...)
	copy(zero[2:34], make([]byte, KeySize))
	unknown := append([]byte(nil), real...)
	copy(unknown[2:34], bytes.Repeat([]byte{0x99}, KeySize))
	base := AdminEvent{Note: askNote, Sender: owner, TxID: bytes.Repeat([]byte{10}, KeySize), Round: 1}
	zeroed := ReduceAdmin([]AdminEvent{base, {Note: zero, Sender: friend, TxID: bytes.Repeat([]byte{11}, KeySize), Round: 1, Offset: 1}})
	if zeroed.State == nil || len(zeroed.State.Pending) != 0 || !bytes.Equal(zeroed.State.HeadTxID, bytes.Repeat([]byte{10}, KeySize)) || !strings.Contains(zeroed.Rejected[0].Reason, "cite") {
		t.Fatalf("zero parent %+v %v", zeroed.State, zeroed.Rejected)
	}
	missed := ReduceAdmin([]AdminEvent{base, {Note: unknown, Sender: friend, TxID: bytes.Repeat([]byte{11}, KeySize), Round: 1, Offset: 1}})
	if missed.State == nil || len(missed.State.Pending) != 0 || missed.State.Policy != joiningAsk || !strings.Contains(missed.Rejected[0].Reason, "cite") {
		t.Fatalf("unknown parent %+v %v", missed.State, missed.Rejected)
	}
	accepted := ReduceAdmin([]AdminEvent{base, {Note: real, Sender: friend, TxID: bytes.Repeat([]byte{11}, KeySize), Round: 1, Offset: 1}})
	if len(accepted.Rejected) != 0 || accepted.State == nil || len(accepted.State.Pending) != 1 || !bytes.Equal(accepted.State.HeadTxID, bytes.Repeat([]byte{10}, KeySize)) {
		t.Fatalf("real parent %+v %v", accepted.State, accepted.Rejected)
	}

	session := PQSession{SessionKey: bytes.Repeat([]byte{0x42}, KeySize)}
	copy(session.SenderPublicKey[:], bytes.Repeat([]byte{0x11}, KeySize))
	copy(session.HandshakeID[:], bytes.Repeat([]byte{0x43}, KeySize))
	nonce := bytes.Repeat([]byte{0x55}, 12)
	note, err := SealGroupKeyDelivery(session, 1, groupID, mailbox, bytes.Repeat([]byte{4}, KeySize), bytes.Repeat([]byte{10}, KeySize), nonce)
	if err != nil {
		t.Fatal(err)
	}
	opened, err := OpenGroupKeyDelivery(note, session)
	if err != nil || opened.Epoch != 1 {
		t.Fatal(err)
	}
	otherSender := session
	copy(otherSender.SenderPublicKey[:], bytes.Repeat([]byte{0x22}, KeySize))
	if _, err := OpenGroupKeyDelivery(note, otherSender); err == nil || !strings.Contains(err.Error(), "sender") {
		t.Fatal(err)
	}
	otherHandshake := session
	copy(otherHandshake.HandshakeID[:], bytes.Repeat([]byte{0x44}, KeySize))
	if _, err := OpenGroupKeyDelivery(note, otherHandshake); err == nil || !strings.Contains(err.Error(), "handshake") {
		t.Fatal(err)
	}
	flipped := append([]byte(nil), note...)
	flipped[len(flipped)-1] ^= 1
	if _, err := OpenGroupKeyDelivery(flipped, session); err == nil || !strings.Contains(err.Error(), "authentication") {
		t.Fatal(err)
	}
	plain := make([]byte, groupDeliverPlainSize)
	plain[0] = groupDeliverAction
	copy(plain[5:37], groupID)
	copy(plain[37:69], mailbox)
	copy(plain[69:101], bytes.Repeat([]byte{4}, KeySize))
	copy(plain[101:133], bytes.Repeat([]byte{10}, KeySize))
	for _, version := range []byte{0, 1, 3, 255} {
		bad := sealDeliveryRaw(t, session, plain, version)
		if _, err := OpenGroupKeyDelivery(bad, session); err == nil || !strings.Contains(err.Error(), "Not a group key delivery") {
			t.Fatalf("version %d: %v", version, err)
		}
	}
	if _, err := OpenGroupKeyDelivery(sealDeliveryRaw(t, session, plain, protocolVersionAAD), session); err == nil || !strings.Contains(err.Error(), "epoch") {
		t.Fatal(err)
	}
}

func withPolicy(note []byte, policy byte) []byte {
	out := append([]byte(nil), note...)
	nameLen := int(out[103])
	out[104+nameLen] = policy
	return out
}

func sealDeliveryRaw(t *testing.T, session PQSession, plain []byte, version byte) []byte {
	t.Helper()
	nonce := bytes.Repeat([]byte{0x55}, 12)
	header := make([]byte, pqDataHeaderSize)
	header[0] = version
	header[1] = protocolIDGroupMembership
	copy(header[2:34], session.SenderPublicKey[:])
	copy(header[34:66], session.HandshakeID[:])
	copy(header[66:78], nonce)
	aead, err := chacha20poly1305.New(session.SessionKey)
	if err != nil {
		t.Fatal(err)
	}
	return append(header, aead.Seal(nil, nonce, plain, header)...)
}
