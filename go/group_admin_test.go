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
		stored := mustHex(t, item.Note)
		if stored[0] != protocolVersionAAD || stored[1] != protocolIDGroupAdmin {
			t.Fatalf("%s is not an administration note", item.Name)
		}
		storedCount, ok := noteMemberCount(stored)
		if !ok || storedCount == groupMembersOmitted || storedCount > 100 {
			t.Fatalf("%s stored member count %d", item.Name, storedCount)
		}
		state, err := basisRoom(item.BasisState)
		if err != nil {
			t.Fatal(err)
		}
		draft, err := draftFromVector(item.Op, item.Sender, item.Subject, item.NameUTF8, item.Policy, item.GroupID, item.Mailbox, nil)
		if err != nil {
			t.Fatal(err)
		}
		note, err := DraftAdmin(state, draft)
		if err != nil {
			t.Fatalf("%s: %v", item.Name, err)
		}
		if len(note) > MaxNoteSize {
			t.Fatalf("%s draft is %d bytes", item.Name, len(note))
		}
		draftCount, ok := noteMemberCount(note)
		if !ok || draftCount != groupMembersOmitted {
			t.Fatalf("%s draft member count %d", item.Name, draftCount)
		}
	}

	for _, item := range v.DraftErrors {
		state, err := basisRoom(item.BasisState)
		if err != nil {
			t.Fatal(err)
		}
		draft, err := draftFromVector(item.Op, item.Sender, item.Subject, item.NameUTF8, item.Policy, nil, nil, nil)
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
	GroupID       string   `json:"group_id"`
	Mailbox       string   `json:"mailbox"`
	Owner         string   `json:"owner"`
	Admins        []string `json:"admins"`
	Members       []string `json:"members"`
	Pending       []string `json:"pending"`
	Policy        int      `json:"policy"`
	NameHex       string   `json:"name_hex"`
	Epoch         uint32   `json:"epoch"`
	HeadTxID      string   `json:"head_tx_id"`
	ParentGroupID string   `json:"parent_group_id,omitempty"`
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
	var parentGroup []byte
	if basis.ParentGroupID != "" {
		parentGroup, err = hex.DecodeString(basis.ParentGroupID)
		if err != nil {
			return nil, err
		}
	}
	return &RoomState{
		GroupID:       groupID,
		Mailbox:       mailbox,
		ParentGroupID: parentGroup,
		Owner:         owner,
		Admins:        admins,
		Members:       members,
		Pending:       pending,
		Policy:        basis.Policy,
		Name:          name,
		Epoch:         basis.Epoch,
		HeadTxID:      head,
	}, nil
}

func draftFromVector(op int, sender, subject string, name *string, policy *int, groupID, mailbox *string, parent *adminBasis) (AdminDraft, error) {
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
	draft.ParentRoom, err = basisRoom(parent)
	if err != nil {
		return AdminDraft{}, err
	}
	return draft, nil
}

func noteMemberCount(note []byte) (int, bool) {
	if len(note) < groupAdminNoteMin {
		return 0, false
	}
	nameLen := int(note[103])
	adminAt := 137 + nameLen
	if adminAt+1 >= len(note) {
		return 0, false
	}
	adminCount := int(note[adminAt])<<8 | int(note[adminAt+1])
	memberAt := 139 + nameLen + 32*adminCount
	if memberAt+1 >= len(note) {
		return 0, false
	}
	return int(note[memberAt])<<8 | int(note[memberAt+1]), true
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

func TestFullListOf256IsTooLargeAndDeltaFoldsThrough256(t *testing.T) {
	owner := bytes.Repeat([]byte{1}, KeySize)
	friend := bytes.Repeat([]byte{2}, KeySize)
	groupID := bytes.Repeat([]byte{7}, KeySize)
	mailbox := bytes.Repeat([]byte{9}, KeySize)
	roster := make([][]byte, 256)
	for i := 0; i < len(roster); i++ {
		roster[i] = personID(i + 1)
	}
	admins := make([][]byte, groupAdminMax)
	for i := 0; i < len(admins); i++ {
		admins[i] = personID(1000 + i)
	}
	if groupMemberMax != 256 || groupNameMax != 64 || groupAdminMax != 16 {
		t.Fatalf("caps member=%d name=%d admin=%d", groupMemberMax, groupNameMax, groupAdminMax)
	}
	_, err := encodeAdminRecord(decodedAdmin{
		parent:         make([]byte, KeySize),
		groupID:        groupID,
		mailbox:        mailbox,
		epoch:          1,
		op:             adminOpCreate,
		name:           make([]byte, groupNameMax),
		policy:         joiningInvite,
		owner:          roster[0],
		admins:         admins,
		members:        roster,
		subject:        make([]byte, KeySize),
		membersOmitted: false,
	})
	if err == nil || !strings.Contains(err.Error(), "too large") {
		t.Fatal(err)
	}

	legacy, err := encodeAdminRecord(decodedAdmin{
		parent:         make([]byte, KeySize),
		groupID:        groupID,
		mailbox:        mailbox,
		epoch:          1,
		op:             adminOpCreate,
		name:           []byte("team"),
		policy:         joiningInvite,
		owner:          owner,
		admins:         [][]byte{},
		members:        [][]byte{owner},
		subject:        make([]byte, KeySize),
		membersOmitted: false,
	})
	if err != nil {
		t.Fatal(err)
	}
	legacyRoom := ReduceAdmin([]AdminEvent{adminEvent(legacy, owner, 10, 1, 0)})
	if len(legacyRoom.Rejected) != 0 || legacyRoom.State == nil || len(legacyRoom.State.Members) != 1 {
		t.Fatalf("legacy create %+v", legacyRoom.Rejected)
	}
	legacyAdd, err := DraftAdmin(legacyRoom.State, AdminDraft{Op: adminOpAdd, Sender: owner, Subject: friend})
	if err != nil {
		t.Fatal(err)
	}
	legacyGrown := ReduceAdmin([]AdminEvent{
		adminEvent(legacy, owner, 10, 1, 0),
		adminEvent(legacyAdd, owner, 11, 2, 0),
	})
	if len(legacyGrown.Rejected) != 0 || legacyGrown.State == nil || len(legacyGrown.State.Members) != 2 {
		t.Fatalf("legacy add %+v members %d", legacyGrown.Rejected, memberLen(legacyGrown.State))
	}

	hallOwner := personID(1)
	events := []AdminEvent{}
	createdNote, err := DraftAdmin(nil, AdminDraft{
		Op:        adminOpCreate,
		Sender:    hallOwner,
		HasName:   true,
		Name:      []byte("hall"),
		HasPolicy: true,
		Policy:    joiningInvite,
		GroupID:   personID(900),
		Mailbox:   personID(901),
	})
	if err != nil {
		t.Fatal(err)
	}
	events = append(events, markedEvent(createdNote, hallOwner, 1))
	reduced := ReduceAdmin(events)
	if len(reduced.Rejected) != 0 || reduced.State == nil || len(reduced.State.Members) != 1 {
		t.Fatalf("hall create %+v", reduced.Rejected)
	}
	for count := 2; count <= 256; count++ {
		note, err := DraftAdmin(reduced.State, AdminDraft{Op: adminOpAdd, Sender: hallOwner, Subject: personID(count)})
		if err != nil {
			t.Fatalf("add %d: %v", count, err)
		}
		if len(note) > MaxNoteSize {
			t.Fatalf("add %d is %d bytes", count, len(note))
		}
		got, ok := noteMemberCount(note)
		if !ok || got != groupMembersOmitted {
			t.Fatalf("add %d member count %d", count, got)
		}
		events = append(events, markedEvent(note, hallOwner, count))
		reduced = ReduceAdmin(events)
		if len(reduced.Rejected) != 0 {
			t.Fatalf("add %d rejected %s", count, reduced.Rejected[0].Reason)
		}
		if count == 101 && (reduced.State == nil || len(reduced.State.Members) != 101) {
			t.Fatalf("count 101 has %d members", memberLen(reduced.State))
		}
	}
	if reduced.State == nil || len(reduced.State.Members) != 256 || reduced.State.Epoch != 1 {
		t.Fatalf("hall ended with %d members epoch %d", memberLen(reduced.State), epochOf(reduced.State))
	}
}

func TestChannelRosterAndMissedKeyResume(t *testing.T) {
	owner := bytes.Repeat([]byte{1}, KeySize)
	parentID := personID(700)
	parentMail := personID(701)
	channelID := personID(702)
	channelMail := personID(703)
	alice := personID(2)
	bob := personID(3)
	cara := personID(4)
	extra := make([][]byte, 16)
	for i := range extra {
		extra[i] = personID(20 + i)
	}
	parentCreate, err := DraftAdmin(nil, AdminDraft{
		Op: adminOpCreate, Sender: owner, HasName: true, Name: []byte("hall"), HasPolicy: true, Policy: joiningInvite,
		GroupID: parentID, Mailbox: parentMail,
	})
	if err != nil {
		t.Fatal(err)
	}
	parentEvents := []AdminEvent{adminEvent(parentCreate, owner, 10, 1, 0)}
	parent := ReduceAdmin(parentEvents)
	added := append([][]byte{alice, bob, cara}, extra...)
	for index, member := range added {
		note, err := DraftAdmin(parent.State, AdminDraft{Op: adminOpAdd, Sender: owner, Subject: member})
		if err != nil {
			t.Fatal(err)
		}
		parentEvents = append(parentEvents, adminEvent(note, owner, 11+index, index+2, 0))
		parent = ReduceAdmin(parentEvents)
	}
	if len(parent.Rejected) != 0 || parent.State == nil || len(parent.State.Members) != 1+3+len(extra) {
		t.Fatalf("parent roster %+v len %d", parent.Rejected, memberLen(parent.State))
	}
	_, err = DraftAdmin(nil, AdminDraft{
		Op: adminOpCreate, Sender: alice, HasName: true, Name: []byte("ops"), HasPolicy: true, Policy: joiningInvite,
		GroupID: channelID, Mailbox: channelMail, ParentRoom: parent.State,
	})
	if err == nil || !strings.Contains(err.Error(), "group owner") {
		t.Fatal(err)
	}
	channelCreate, err := DraftAdmin(nil, AdminDraft{
		Op: adminOpCreate, Sender: owner, HasName: true, Name: []byte("ops"), HasPolicy: true, Policy: joiningInvite,
		GroupID: channelID, Mailbox: channelMail, ParentRoom: parent.State,
	})
	if err != nil {
		t.Fatal(err)
	}
	channelEvents := []AdminEvent{adminEvent(channelCreate, owner, 80, 30, 0)}
	channel := ReduceAdmin(channelEvents, parentEvents)
	if len(channel.Rejected) != 0 || channel.State == nil || len(channel.State.Members) != 1 {
		t.Fatalf("channel create %+v", channel.Rejected)
	}
	if !bytes.Equal(channel.State.ParentGroupID, parentID) || !bytes.Equal(channel.State.GroupID, channelID) || !bytes.Equal(channel.State.Mailbox, channelMail) {
		t.Fatal("channel identity")
	}
	if bytes.Equal(channel.State.GroupID, parent.State.GroupID) {
		t.Fatal("channel reused the parent group id")
	}
	channelAdded := append([][]byte{alice, bob}, extra...)
	for index, member := range channelAdded {
		note, err := DraftAdmin(channel.State, AdminDraft{
			Op: adminOpAdd, Sender: owner, Subject: member, ParentRoom: parent.State,
		})
		if err != nil {
			t.Fatal(err)
		}
		channelEvents = append(channelEvents, adminEvent(note, owner, 81+index, 31+index, 0))
		channel = ReduceAdmin(channelEvents, parentEvents)
	}
	if len(channel.Rejected) != 0 || channel.State == nil {
		t.Fatalf("channel adds %+v", channel.Rejected)
	}
	if containsKey(channel.State.Members, cara) || !containsKey(channel.State.Members, alice) {
		t.Fatal("channel roster copied the parent or dropped alice")
	}
	_, err = DraftAdmin(channel.State, AdminDraft{
		Op: adminOpAdd, Sender: owner, Subject: personID(500), ParentRoom: parent.State,
	})
	if err == nil || !strings.Contains(err.Error(), "parent room") {
		t.Fatal(err)
	}
	_, err = DraftAdmin(channel.State, AdminDraft{
		Op: adminOpTransfer, Sender: owner, Subject: bob, ParentRoom: parent.State,
	})
	if err == nil || !strings.Contains(err.Error(), "group owner keeps") {
		t.Fatal(err)
	}
	parentRemove, err := DraftAdmin(parent.State, AdminDraft{Op: adminOpRemove, Sender: owner, Subject: alice})
	if err != nil {
		t.Fatal(err)
	}
	parentEvents = append(parentEvents, adminEvent(parentRemove, owner, 60, 80, 0))
	parent = ReduceAdmin(parentEvents)
	if parent.State == nil || parent.State.Epoch != 2 {
		t.Fatalf("parent remove epoch %+v", parent.Rejected)
	}
	may, err := SenderMayPost(*parent.State, alice, 2)
	if err != nil || may {
		t.Fatalf("alice may post: %v %v", may, err)
	}
	stale := ReduceAdmin(channelEvents, parentEvents)
	if stale.State == nil || !containsKey(stale.State.Members, alice) {
		t.Fatal("parent removal copied into the channel")
	}
	departed, err := ChannelDepartures(*stale.State, *parent.State)
	if err != nil {
		t.Fatal(err)
	}
	if len(departed) != 1 || departed[0][3] != alice[3] {
		t.Fatalf("departures %d", len(departed))
	}
	channelRemove, err := DraftAdmin(stale.State, AdminDraft{
		Op: adminOpRemove, Sender: owner, Subject: alice, ParentRoom: parent.State,
	})
	if err != nil {
		t.Fatal(err)
	}
	channelEvents = append(channelEvents, adminEvent(channelRemove, owner, 120, 90, 0))
	channel = ReduceAdmin(channelEvents, parentEvents)
	if len(channel.Rejected) != 0 || channel.State == nil || channel.State.Epoch != 2 || containsKey(channel.State.Members, alice) {
		t.Fatalf("channel remove %+v", channel.Rejected)
	}
	removeTx := channel.Accepted[len(channel.Accepted)-1]
	if DeliveryAuthorized(channel.Accepted, removeTx.TxID, owner, alice, 2) {
		t.Fatal("removed member was authorized")
	}
	if DeliveryAuthorized(channel.Accepted, removeTx.TxID, bob, bob, 2) {
		t.Fatal("bob was treated as the sender")
	}
	recipients := AuthorizedRecipients(channel.Accepted, removeTx.TxID, owner, 2)
	if containsKey(recipients, alice) || !containsKey(recipients, bob) || len(recipients) <= groupDeliverBatch {
		t.Fatalf("recipients %d", len(recipients))
	}
	batch, err := NextDeliveryBatch(recipients)
	if err != nil || len(batch) != groupDeliverBatch {
		t.Fatalf("batch %d %v", len(batch), err)
	}
	missed := batch[len(batch)-1]
	landed := batch[:len(batch)-1]
	pending := PendingKeyDeliveries(recipients, landed)
	if !containsKey(pending, missed) {
		t.Fatal("missed payment was marked landed")
	}
	resumedBatch, err := NextDeliveryBatch(pending)
	if err != nil || len(resumedBatch) == 0 || !bytes.Equal(resumedBatch[0], missed) {
		t.Fatal("resume did not start at the missed recipient")
	}
	resumed := append(append([][]byte{}, landed...), missed)
	left := PendingKeyDeliveries(recipients, resumed)
	if containsKey(left, missed) || len(left) != len(recipients)-len(resumed) {
		t.Fatalf("left %d want %d", len(left), len(recipients)-len(resumed))
	}
}

func TestGroupAdminDeltaVector(t *testing.T) {
	raw, err := os.ReadFile("../vectors/group-admin-delta-v1.json")
	if err != nil {
		t.Fatal(err)
	}
	var v struct {
		Constants struct {
			MemberMax      int `json:"member_max"`
			MembersOmitted int `json:"members_omitted"`
			DeliverBatch   int `json:"deliver_batch"`
		} `json:"constants"`
		Drafts []struct {
			Name       string      `json:"name"`
			BasisState *adminBasis `json:"basis_state"`
			ParentRoom *adminBasis `json:"parent_room"`
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
			ParentRoom    *adminBasis `json:"parent_room"`
			Op            int         `json:"op"`
			Sender        string      `json:"sender"`
			Subject       string      `json:"subject"`
			NameUTF8      *string     `json:"name_utf8"`
			Policy        *int        `json:"policy"`
			GroupID       *string     `json:"group_id"`
			Mailbox       *string     `json:"mailbox"`
			ErrorIncludes string      `json:"error_includes"`
		} `json:"draft_errors"`
		Reductions map[string]struct {
			ParentEvents []struct {
				Note   string `json:"note"`
				Sender string `json:"sender"`
				TxID   string `json:"tx_id"`
				Round  int    `json:"round"`
				Offset int    `json:"offset"`
			} `json:"parent_events"`
			Events []struct {
				Note   string `json:"note"`
				Sender string `json:"sender"`
				TxID   string `json:"tx_id"`
				Round  int    `json:"round"`
				Offset int    `json:"offset"`
			} `json:"events"`
			Accepted []struct {
				Op int `json:"op"`
			} `json:"accepted"`
			Rejected []struct {
				Reason string `json:"reason"`
			} `json:"rejected"`
			State *deltaState `json:"state"`
		} `json:"reductions"`
	}
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}
	if v.Constants.MemberMax != groupMemberMax || v.Constants.MembersOmitted != groupMembersOmitted || v.Constants.DeliverBatch != groupDeliverBatch {
		t.Fatalf("constants %+v", v.Constants)
	}
	for _, item := range v.Drafts {
		state, err := basisRoom(item.BasisState)
		if err != nil {
			t.Fatal(err)
		}
		draft, err := draftFromVector(item.Op, item.Sender, item.Subject, item.NameUTF8, item.Policy, item.GroupID, item.Mailbox, item.ParentRoom)
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
		draft, err := draftFromVector(item.Op, item.Sender, item.Subject, item.NameUTF8, item.Policy, item.GroupID, item.Mailbox, item.ParentRoom)
		if err != nil {
			t.Fatal(err)
		}
		_, err = DraftAdmin(state, draft)
		if err == nil || !strings.Contains(err.Error(), item.ErrorIncludes) {
			t.Fatalf("%s: %v", item.Name, err)
		}
	}
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
		var got ReduceAdminResult
		if item.ParentEvents != nil {
			parentEvents := make([]AdminEvent, len(item.ParentEvents))
			for i, event := range item.ParentEvents {
				parentEvents[i] = AdminEvent{
					Note:   mustHex(t, event.Note),
					Sender: mustHex(t, event.Sender),
					TxID:   mustHex(t, event.TxID),
					Round:  event.Round,
					Offset: event.Offset,
				}
			}
			got = ReduceAdmin(events, parentEvents)
		} else {
			got = ReduceAdmin(events)
		}
		if len(got.Rejected) != len(item.Rejected) {
			t.Fatalf("%s rejected %d want %d (%v)", name, len(got.Rejected), len(item.Rejected), got.Rejected)
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
		if err := sameDeltaState(got.State, item.State); err != nil {
			t.Fatalf("%s state: %v", name, err)
		}
	}
}

type deltaState struct {
	GroupID       string   `json:"group_id"`
	Mailbox       string   `json:"mailbox"`
	Owner         string   `json:"owner"`
	Admins        []string `json:"admins"`
	Members       []string `json:"members"`
	Pending       []string `json:"pending"`
	Policy        int      `json:"policy"`
	NameHex       string   `json:"name_hex"`
	Epoch         uint32   `json:"epoch"`
	HeadTxID      string   `json:"head_tx_id"`
	ParentGroupID string   `json:"parent_group_id"`
}

func sameDeltaState(state *RoomState, want *deltaState) error {
	got, err := snapDelta(state)
	if err != nil {
		return err
	}
	if !reflect.DeepEqual(got, want) {
		gb, _ := json.Marshal(got)
		wb, _ := json.Marshal(want)
		return errTextMismatch{got: string(gb), want: string(wb)}
	}
	return nil
}

type errTextMismatch struct {
	got  string
	want string
}

func (e errTextMismatch) Error() string {
	return "got " + e.got + " want " + e.want
}

func snapDelta(state *RoomState) (*deltaState, error) {
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
	return &deltaState{
		GroupID:       hex.EncodeToString(state.GroupID),
		Mailbox:       hex.EncodeToString(state.Mailbox),
		Owner:         hex.EncodeToString(state.Owner),
		Admins:        admins,
		Members:       members,
		Pending:       pending,
		Policy:        state.Policy,
		NameHex:       hex.EncodeToString(state.Name),
		Epoch:         state.Epoch,
		HeadTxID:      hex.EncodeToString(state.HeadTxID),
		ParentGroupID: hex.EncodeToString(normalizedParent(state.ParentGroupID)),
	}, nil
}

func adminEvent(note, sender []byte, tx, round, offset int) AdminEvent {
	return AdminEvent{Note: note, Sender: sender, TxID: bytes.Repeat([]byte{byte(tx)}, KeySize), Round: round, Offset: offset}
}

func markedEvent(note, sender []byte, n int) AdminEvent {
	return AdminEvent{Note: note, Sender: sender, TxID: personID(10000 + n), Round: n, Offset: 0}
}

func personID(id int) []byte {
	out := make([]byte, KeySize)
	out[0] = byte(id >> 24)
	out[1] = byte(id >> 16)
	out[2] = byte(id >> 8)
	out[3] = byte(id)
	return out
}

func memberLen(state *RoomState) int {
	if state == nil {
		return -1
	}
	return len(state.Members)
}

func epochOf(state *RoomState) uint32 {
	if state == nil {
		return 0
	}
	return state.Epoch
}
