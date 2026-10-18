package algochat

import (
	"encoding/hex"
	"encoding/json"
	"os"
	"reflect"
	"strings"
	"testing"
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
