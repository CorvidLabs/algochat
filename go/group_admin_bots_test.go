package algochat

import (
	"bytes"
	"encoding/hex"
	"encoding/json"
	"os"
	"reflect"
	"sort"
	"strings"
	"testing"
)

type botsWireEvent struct {
	Note   string `json:"note"`
	Sender string `json:"sender"`
	TxID   string `json:"tx_id"`
	Round  int    `json:"round"`
	Offset int    `json:"offset"`
}

type botsWireBot struct {
	Mode    int `json:"mode"`
	Replies int `json:"replies"`
	Seconds int `json:"seconds"`
}

type botsWireState struct {
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
	Bots          []struct {
		Account string `json:"account"`
		botsWireBot
	} `json:"bots"`
}

type botsWireDraft struct {
	Name          string         `json:"name"`
	BasisState    *botsWireState `json:"basis_state"`
	ParentRoom    *botsWireState `json:"parent_room"`
	Op            int            `json:"op"`
	Sender        string         `json:"sender"`
	Subject       string         `json:"subject"`
	NameUTF8      *string        `json:"name_utf8"`
	Policy        *int           `json:"policy"`
	GroupID       *string        `json:"group_id"`
	Mailbox       *string        `json:"mailbox"`
	Bot           *botsWireBot   `json:"bot"`
	Note          string         `json:"note"`
	ErrorIncludes string         `json:"error_includes"`
}

type botsVector struct {
	Constants   map[string]int  `json:"constants"`
	Drafts      []botsWireDraft `json:"drafts"`
	DraftErrors []botsWireDraft `json:"draft_errors"`
	Reductions  map[string]struct {
		ParentEvents []botsWireEvent `json:"parent_events"`
		Events       []botsWireEvent `json:"events"`
		Accepted     []struct {
			Op int `json:"op"`
		} `json:"accepted"`
		Rejected []struct {
			TxID   string `json:"tx_id"`
			Reason string `json:"reason"`
		} `json:"rejected"`
		State json.RawMessage `json:"state"`
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
		RoomBot []struct {
			Reduction string       `json:"reduction"`
			Account   string       `json:"account"`
			Bot       *botsWireBot `json:"bot"`
		} `json:"room_bot"`
	} `json:"checks"`
}

func loadBotsVector(t *testing.T) botsVector {
	t.Helper()
	raw, err := os.ReadFile("../vectors/group-admin-bots-v1.json")
	if err != nil {
		t.Fatal(err)
	}
	var v botsVector
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}
	return v
}

func botsHex(t *testing.T, value string) []byte {
	t.Helper()
	out, err := hex.DecodeString(value)
	if err != nil {
		t.Fatal(err)
	}
	return out
}

func botsHexList(t *testing.T, items []string) [][]byte {
	out := make([][]byte, len(items))
	for i, item := range items {
		out[i] = botsHex(t, item)
	}
	return out
}

func botsRevive(t *testing.T, s *botsWireState) *RoomState {
	if s == nil {
		return nil
	}
	state := &RoomState{
		GroupID:       botsHex(t, s.GroupID),
		Mailbox:       botsHex(t, s.Mailbox),
		ParentGroupID: botsHex(t, s.ParentGroupID),
		Owner:         botsHex(t, s.Owner),
		Admins:        botsHexList(t, s.Admins),
		Members:       botsHexList(t, s.Members),
		Pending:       botsHexList(t, s.Pending),
		Policy:        s.Policy,
		Name:          botsHex(t, s.NameHex),
		Epoch:         s.Epoch,
		HeadTxID:      botsHex(t, s.HeadTxID),
	}
	for _, item := range s.Bots {
		state.Bots = append(state.Bots, RoomBot{
			Account:     botsHex(t, item.Account),
			BotSettings: BotSettings{Mode: item.Mode, Replies: item.Replies, Seconds: item.Seconds},
		})
	}
	return state
}

func botsSnap(state *RoomState) any {
	if state == nil {
		return nil
	}
	list := func(items [][]byte) []any {
		out := []any{}
		for _, item := range items {
			out = append(out, hex.EncodeToString(item))
		}
		return out
	}
	bots := []any{}
	for _, item := range state.Bots {
		bots = append(bots, map[string]any{
			"account": hex.EncodeToString(item.Account),
			"mode":    float64(item.Mode),
			"replies": float64(item.Replies),
			"seconds": float64(item.Seconds),
		})
	}
	return map[string]any{
		"group_id":        hex.EncodeToString(state.GroupID),
		"mailbox":         hex.EncodeToString(state.Mailbox),
		"owner":           hex.EncodeToString(state.Owner),
		"admins":          list(state.Admins),
		"members":         list(state.Members),
		"pending":         list(state.Pending),
		"policy":          float64(state.Policy),
		"name_hex":        hex.EncodeToString(state.Name),
		"epoch":           float64(state.Epoch),
		"head_tx_id":      hex.EncodeToString(state.HeadTxID),
		"parent_group_id": hex.EncodeToString(state.ParentGroupID),
		"bots":            bots,
	}
}

func botsDraft(t *testing.T, item botsWireDraft) ([]byte, error) {
	in := AdminDraft{
		Op:         item.Op,
		Sender:     botsHex(t, item.Sender),
		Subject:    botsHex(t, item.Subject),
		ParentRoom: botsRevive(t, item.ParentRoom),
	}
	if item.NameUTF8 != nil {
		in.Name, in.HasName = []byte(*item.NameUTF8), true
	}
	if item.Policy != nil {
		in.Policy, in.HasPolicy = *item.Policy, true
	}
	if item.GroupID != nil {
		in.GroupID = botsHex(t, *item.GroupID)
	}
	if item.Mailbox != nil {
		in.Mailbox = botsHex(t, *item.Mailbox)
	}
	if item.Bot != nil {
		in.Bot = &BotSettings{Mode: item.Bot.Mode, Replies: item.Bot.Replies, Seconds: item.Bot.Seconds}
	}
	return DraftAdmin(botsRevive(t, item.BasisState), in)
}

func botsEvents(t *testing.T, items []botsWireEvent) []AdminEvent {
	out := make([]AdminEvent, len(items))
	for i, item := range items {
		out[i] = AdminEvent{Note: botsHex(t, item.Note), Sender: botsHex(t, item.Sender), TxID: botsHex(t, item.TxID), Round: item.Round, Offset: item.Offset}
	}
	return out
}

func botsReduce(t *testing.T, v botsVector, name string) ReduceAdminResult {
	item := v.Reductions[name]
	if item.ParentEvents != nil {
		return ReduceAdmin(botsEvents(t, item.Events), botsEvents(t, item.ParentEvents))
	}
	return ReduceAdmin(botsEvents(t, item.Events))
}

func TestGroupAdminBotsVector(t *testing.T) {
	v := loadBotsVector(t)
	want := map[string]int{
		"op_add_bot": AdminOpAddBot, "op_set_bot": AdminOpSetBot,
		"mode_mentions": BotModeMentions, "mode_every_message": BotModeEveryMessage, "mode_commands": BotModeCommands,
		"settings_size": BotSettingsSize, "preset_replies": BotRatePresetReplies, "preset_seconds": BotRatePresetSeconds,
	}
	if !reflect.DeepEqual(v.Constants, want) {
		t.Fatalf("constants %v want %v", v.Constants, want)
	}
	for _, item := range v.Drafts {
		note, err := botsDraft(t, item)
		if err != nil {
			t.Fatalf("%s: %v", item.Name, err)
		}
		if hex.EncodeToString(note) != item.Note {
			t.Fatalf("%s note mismatch", item.Name)
		}
	}
	for _, item := range v.DraftErrors {
		_, err := botsDraft(t, item)
		if err == nil || !strings.Contains(strings.ToLower(err.Error()), strings.ToLower(item.ErrorIncludes)) {
			t.Fatalf("%s: %v", item.Name, err)
		}
	}
	names := make([]string, 0, len(v.Reductions))
	for name := range v.Reductions {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		item := v.Reductions[name]
		got := botsReduce(t, v, name)
		if len(got.Rejected) != len(item.Rejected) {
			t.Fatalf("%s rejected %+v", name, got.Rejected)
		}
		for i := range got.Rejected {
			if got.Rejected[i].Reason != item.Rejected[i].Reason || hex.EncodeToString(got.Rejected[i].TxID) != item.Rejected[i].TxID {
				t.Fatalf("%s rejected[%d] %q want %q", name, i, got.Rejected[i].Reason, item.Rejected[i].Reason)
			}
		}
		if len(got.Accepted) != len(item.Accepted) {
			t.Fatalf("%s accepted %d want %d", name, len(got.Accepted), len(item.Accepted))
		}
		for i := range got.Accepted {
			if got.Accepted[i].Op != item.Accepted[i].Op {
				t.Fatalf("%s accepted[%d] op %d", name, i, got.Accepted[i].Op)
			}
		}
		var wantState any
		if err := json.Unmarshal(item.State, &wantState); err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(botsSnap(got.State), wantState) {
			gotJSON, _ := json.Marshal(botsSnap(got.State))
			t.Fatalf("%s state\n got %s\nwant %s", name, gotJSON, item.State)
		}
	}
	for _, item := range v.Checks.DeliveryAuthorized {
		got := botsReduce(t, v, item.Reduction)
		allowed := DeliveryAuthorized(got.Accepted, botsHex(t, item.AdminTxID), botsHex(t, item.Sender), botsHex(t, item.Recipient), item.Epoch)
		if allowed != item.Allowed {
			t.Fatalf("delivery %+v got %v", item, allowed)
		}
	}
	for _, item := range v.Checks.RoomBot {
		got := botsReduce(t, v, item.Reduction)
		found, err := RoomBotFor(*got.State, botsHex(t, item.Account))
		if err != nil {
			t.Fatal(err)
		}
		switch {
		case item.Bot == nil && found != nil:
			t.Fatalf("%s: unexpected bot %+v", item.Reduction, found)
		case item.Bot != nil && (found == nil || found.Mode != item.Bot.Mode || found.Replies != item.Bot.Replies || found.Seconds != item.Bot.Seconds):
			t.Fatalf("%s: bot %+v want %+v", item.Reduction, found, item.Bot)
		}
	}
}

func TestBotSettingsOnlyOnBotOps(t *testing.T) {
	preset := &BotSettings{Mode: BotModeMentions, Replies: BotRatePresetReplies, Seconds: BotRatePresetSeconds}
	base := decodedAdmin{
		parent: make([]byte, KeySize), groupID: bytes.Repeat([]byte{7}, KeySize), mailbox: bytes.Repeat([]byte{9}, KeySize),
		epoch: 1, name: []byte{}, policy: joiningInvite, owner: bytes.Repeat([]byte{1}, KeySize),
		subject: bytes.Repeat([]byte{5}, KeySize), membersOmitted: true,
	}
	add := base
	add.op, add.bot = adminOpAdd, preset
	if _, err := encodeAdminRecord(add); err == nil || !strings.Contains(err.Error(), "Only a bot record") {
		t.Fatalf("settings on add: %v", err)
	}
	missing := base
	missing.op = adminOpAddBot
	if _, err := encodeAdminRecord(missing); err == nil || !strings.Contains(err.Error(), "needs a reply mode") {
		t.Fatalf("missing settings: %v", err)
	}
	full := base
	full.op, full.bot, full.membersOmitted = adminOpAddBot, preset, false
	if _, err := encodeAdminRecord(full); err == nil || !strings.Contains(err.Error(), "delta note") {
		t.Fatalf("full list: %v", err)
	}
	ok := base
	ok.op, ok.bot = adminOpAddBot, preset
	note, err := encodeAdminRecord(ok)
	if err != nil {
		t.Fatal(err)
	}
	if len(note) != 205+BotSettingsSize || !bytes.Equal(note[len(note)-BotSettingsSize:], []byte{1, 0, 5, 0, 60}) {
		t.Fatalf("note tail %x", note[len(note)-BotSettingsSize:])
	}
}
