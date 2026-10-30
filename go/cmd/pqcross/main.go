// Command pqcross is the LocalNet mesh tool. One JSON object per stdin line.
package main

import (
	"bufio"
	"bytes"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"

	algochat "github.com/CorvidLabs/algochat/go"
)

type request struct {
	ID               int            `json:"id"`
	Op               string         `json:"op"`
	Seed             string         `json:"seed"`
	AliceSeed        string         `json:"aliceSeed"`
	BobSeed          string         `json:"bobSeed"`
	Text             string         `json:"text"`
	Handshake        string         `json:"handshake"`
	Message          string         `json:"message"`
	Note             string         `json:"note"`
	PSK              string         `json:"psk"`
	Counter          uint32         `json:"counter"`
	Texts            []string       `json:"texts"`
	SessionKey       string         `json:"sessionKey"`
	SenderPublicKey  string         `json:"senderPublicKey"`
	HandshakeID      string         `json:"handshakeId"`
	Action           int            `json:"action"`
	Epoch            uint32         `json:"epoch"`
	GroupID          string         `json:"groupId"`
	Mailbox          flexString     `json:"mailbox"`
	GroupKey         string         `json:"groupKey"`
	Nonce            string         `json:"nonce"`
	SenderAddress    string         `json:"senderAddress"`
	Seen             []seenCounter  `json:"seen"`
	BasisState       *basisWire     `json:"basis_state"`
	AdminOp          *int           `json:"admin_op"`
	Subject          flexString     `json:"subject"`
	NameUTF8         *string        `json:"name_utf8"`
	Policy           *int           `json:"policy"`
	GroupIDSnake     flexString     `json:"group_id"`
	SessionKeySnake  flexString     `json:"session_key"`
	SenderX25519     flexString     `json:"sender_x25519"`
	HandshakeIDSnake flexString     `json:"handshake_id"`
	GroupKeySnake    flexString     `json:"group_key"`
	AdminTxID        flexString     `json:"admin_tx_id"`
	Sender           flexString     `json:"sender"`
	Recipient        flexString     `json:"recipient"`
	Events           []eventWire    `json:"events"`
	ParentEvents     []eventWire    `json:"parent_events"`
	Accepted         []acceptedWire `json:"accepted"`
	State            *basisWire     `json:"state"`
	ParentRoom       *basisWire     `json:"parent_room"`
	Bot              *botWire       `json:"bot"`
}

// flexString accepts a JSON string or null. Null is the same as an omitted field.
type flexString string

func (f *flexString) UnmarshalJSON(data []byte) error {
	if bytes.Equal(data, []byte("null")) {
		*f = ""
		return nil
	}
	var text string
	if err := json.Unmarshal(data, &text); err != nil {
		return err
	}
	*f = flexString(text)
	return nil
}

// basisWire is the public room roster. admin_op is the room operation because op is the command.
type basisWire struct {
	GroupID       string    `json:"group_id"`
	Mailbox       string    `json:"mailbox"`
	Owner         string    `json:"owner"`
	Admins        []string  `json:"admins"`
	Members       []string  `json:"members"`
	Pending       []string  `json:"pending"`
	Policy        int       `json:"policy"`
	NameHex       string    `json:"name_hex"`
	Epoch         uint32    `json:"epoch"`
	HeadTxID      string    `json:"head_tx_id"`
	ParentGroupID string    `json:"parent_group_id"`
	Bots          []botWire `json:"bots"`
}

// botWire is a bot's reply mode and rate limit. Account is set only inside a room state.
type botWire struct {
	Account string `json:"account,omitempty"`
	Mode    int    `json:"mode"`
	Replies int    `json:"replies"`
	Seconds int    `json:"seconds"`
}

type eventWire struct {
	Note   string `json:"note"`
	Sender string `json:"sender"`
	TxID   string `json:"tx_id"`
	Round  int    `json:"round"`
	Offset int    `json:"offset"`
}

type acceptedWire struct {
	TxID    string   `json:"tx_id"`
	Sender  string   `json:"sender"`
	Op      int      `json:"op"`
	Epoch   uint32   `json:"epoch"`
	Subject string   `json:"subject"`
	Members []string `json:"members"`
}

type seenCounter struct {
	Epoch   uint32 `json:"epoch"`
	Counter uint32 `json:"counter"`
}

func main() {
	in := bufio.NewScanner(os.Stdin)
	in.Buffer(make([]byte, 1024*1024), 1024*1024)
	for in.Scan() {
		line := in.Bytes()
		if len(line) == 0 {
			continue
		}
		var req request
		if err := json.Unmarshal(line, &req); err != nil {
			write(map[string]any{"id": 0, "ok": false, "error": err.Error()})
			continue
		}
		body, err := dispatch(req)
		if err != nil {
			write(map[string]any{"id": req.ID, "ok": false, "error": err.Error()})
			continue
		}
		body["id"] = req.ID
		body["ok"] = true
		write(body)
	}
}

func dispatch(req request) (map[string]any, error) {
	switch req.Op {
	case "identity":
		seed, err := seed32(req.Seed)
		if err != nil {
			return nil, err
		}
		return identity(seed)
	case "write":
		alice, err := seed32(req.AliceSeed)
		if err != nil {
			return nil, err
		}
		bob, err := seed32(req.BobSeed)
		if err != nil {
			return nil, err
		}
		return writeNote(alice, bob, req.Text)
	case "read":
		alice, err := seed32(req.AliceSeed)
		if err != nil {
			return nil, err
		}
		bob, err := seed32(req.BobSeed)
		if err != nil {
			return nil, err
		}
		handshake, err := hex.DecodeString(req.Handshake)
		if err != nil {
			return nil, err
		}
		message, err := hex.DecodeString(req.Message)
		if err != nil {
			return nil, err
		}
		return readNote(alice, bob, handshake, message, req.Text)
	case "write01":
		return writeClassical(req, false)
	case "read01":
		return readClassical(req, false)
	case "write02":
		return writeClassical(req, true)
	case "read02":
		return readClassical(req, true)
	case "write05s":
		alice, err := seed32(req.AliceSeed)
		if err != nil {
			return nil, err
		}
		bob, err := seed32(req.BobSeed)
		if err != nil {
			return nil, err
		}
		return writeMany(alice, bob, req.Texts)
	case "groupSeal":
		return groupSeal(req)
	case "groupOpen":
		return groupOpen(req)
	case "groupWrite":
		return groupWrite(req)
	case "groupRead":
		return groupRead(req)
	case "adminDraft":
		return adminDraft(req)
	case "adminReduce":
		return adminReduce(req)
	case "deliverSeal":
		return deliverSeal(req)
	case "deliverOpen":
		return deliverOpen(req)
	case "senderMayPost":
		return senderMayPost(req)
	case "deliveryAuthorized":
		return deliveryAuthorized(req)
	default:
		return nil, fmt.Errorf("unknown op %s", req.Op)
	}
}

func identity(seed [32]byte) (map[string]any, error) {
	keys, err := algochat.DeriveEncryptionKeys(seed)
	if err != nil {
		return nil, err
	}
	dk, err := algochat.DeriveMLKEM768(seed)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"x25519":    hex.EncodeToString(keys.PublicKey[:]),
		"encapsKey": hex.EncodeToString(dk.EncapsulationKey().Bytes()),
	}, nil
}

func writeNote(aliceSeed, bobSeed [32]byte, text string) (map[string]any, error) {
	alice, err := algochat.DeriveEncryptionKeys(aliceSeed)
	if err != nil {
		return nil, err
	}
	bob, err := algochat.DeriveEncryptionKeys(bobSeed)
	if err != nil {
		return nil, err
	}
	dk, err := algochat.DeriveMLKEM768(bobSeed)
	if err != nil {
		return nil, err
	}
	aliceDK, err := algochat.DeriveMLKEM768(aliceSeed)
	if err != nil {
		return nil, err
	}
	note, session, err := algochat.InitiatePQHandshake(alice, bob.PublicKey, dk.EncapsulationKey().Bytes(), aliceDK.EncapsulationKey().Bytes())
	if err != nil {
		return nil, err
	}
	message, err := algochat.EncryptPQMessage(text, session)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"handshake":  hex.EncodeToString(note),
		"message":    hex.EncodeToString(message),
		"sessionKey": hex.EncodeToString(session.SessionKey),
	}, nil
}

func readNote(aliceSeed, bobSeed [32]byte, handshake, message []byte, text string) (map[string]any, error) {
	alice, err := algochat.DeriveEncryptionKeys(aliceSeed)
	if err != nil {
		return nil, err
	}
	bob, err := algochat.DeriveEncryptionKeys(bobSeed)
	if err != nil {
		return nil, err
	}
	dk, err := algochat.DeriveMLKEM768(bobSeed)
	if err != nil {
		return nil, err
	}
	session, err := algochat.AcceptPQHandshake(handshake, bob, dk)
	if err != nil {
		return nil, err
	}
	opened, err := algochat.DecryptPQMessage(message, session)
	if err != nil {
		return nil, err
	}
	aliceDK, err := algochat.DeriveMLKEM768(aliceSeed)
	if err != nil {
		return nil, err
	}
	sender, err := algochat.OpenPQHandshakeAsSender(handshake, alice, aliceDK)
	if err != nil {
		return nil, err
	}
	senderPlain, err := algochat.DecryptPQMessage(message, sender)
	if err != nil {
		return nil, err
	}
	if opened != text || senderPlain != text {
		return nil, fmt.Errorf("plaintext %q / %q", opened, senderPlain)
	}
	if hex.EncodeToString(session.SessionKey) != hex.EncodeToString(sender.SessionKey) {
		return nil, fmt.Errorf("sender and recipient session keys differ")
	}
	return map[string]any{
		"sessionKey": hex.EncodeToString(session.SessionKey),
		"recipient":  opened,
		"sender":     senderPlain,
	}, nil
}

func writeClassical(req request, extra bool) (map[string]any, error) {
	aliceSeed, err := seed32(req.AliceSeed)
	if err != nil {
		return nil, err
	}
	bobSeed, err := seed32(req.BobSeed)
	if err != nil {
		return nil, err
	}
	alice, err := algochat.DeriveEncryptionKeys(aliceSeed)
	if err != nil {
		return nil, err
	}
	bob, err := algochat.DeriveEncryptionKeys(bobSeed)
	if err != nil {
		return nil, err
	}
	var note []byte
	if extra {
		psk, err := hex.DecodeString(req.PSK)
		if err != nil {
			return nil, err
		}
		note, err = algochat.EncryptPSKMessage(req.Text, alice, bob.PublicKey, psk, req.Counter)
		if err != nil {
			return nil, err
		}
	} else {
		env, err := algochat.EncryptMessage(req.Text, alice.PublicKey, bob.PublicKey)
		if err != nil {
			return nil, err
		}
		note = algochat.EncodeEnvelope(env)
	}
	return map[string]any{"note": hex.EncodeToString(note)}, nil
}

func readClassical(req request, extra bool) (map[string]any, error) {
	aliceSeed, err := seed32(req.AliceSeed)
	if err != nil {
		return nil, err
	}
	bobSeed, err := seed32(req.BobSeed)
	if err != nil {
		return nil, err
	}
	alice, err := algochat.DeriveEncryptionKeys(aliceSeed)
	if err != nil {
		return nil, err
	}
	bob, err := algochat.DeriveEncryptionKeys(bobSeed)
	if err != nil {
		return nil, err
	}
	raw, err := hex.DecodeString(req.Note)
	if err != nil {
		return nil, err
	}
	var recipient, sender string
	if extra {
		psk, err := hex.DecodeString(req.PSK)
		if err != nil {
			return nil, err
		}
		recipient, err = algochat.DecryptPSKMessage(raw, bob, psk)
		if err != nil {
			return nil, err
		}
		sender, err = algochat.DecryptPSKMessage(raw, alice, psk)
		if err != nil {
			return nil, err
		}
	} else {
		env, err := algochat.DecodeEnvelope(raw)
		if err != nil {
			return nil, err
		}
		got, err := algochat.DecryptMessage(env, bob.PrivateKey, bob.PublicKey)
		if err != nil || got == nil {
			return nil, fmt.Errorf("bob %v", err)
		}
		recipient = got.Text
		sent, err := algochat.DecryptMessage(env, alice.PrivateKey, alice.PublicKey)
		if err != nil || sent == nil {
			return nil, fmt.Errorf("alice %v", err)
		}
		sender = sent.Text
	}
	if recipient != req.Text || sender != req.Text {
		return nil, fmt.Errorf("plaintext %q / %q", recipient, sender)
	}
	return map[string]any{"recipient": recipient, "sender": sender}, nil
}

func writeMany(aliceSeed, bobSeed [32]byte, texts []string) (map[string]any, error) {
	alice, err := algochat.DeriveEncryptionKeys(aliceSeed)
	if err != nil {
		return nil, err
	}
	bob, err := algochat.DeriveEncryptionKeys(bobSeed)
	if err != nil {
		return nil, err
	}
	dk, err := algochat.DeriveMLKEM768(bobSeed)
	if err != nil {
		return nil, err
	}
	aliceDK, err := algochat.DeriveMLKEM768(aliceSeed)
	if err != nil {
		return nil, err
	}
	note, session, err := algochat.InitiatePQHandshake(alice, bob.PublicKey, dk.EncapsulationKey().Bytes(), aliceDK.EncapsulationKey().Bytes())
	if err != nil {
		return nil, err
	}
	messages := make([]string, 0, len(texts))
	for _, text := range texts {
		message, err := algochat.EncryptPQMessage(text, session)
		if err != nil {
			return nil, err
		}
		messages = append(messages, hex.EncodeToString(message))
	}
	return map[string]any{
		"handshake":  hex.EncodeToString(note),
		"messages":   messages,
		"sessionKey": hex.EncodeToString(session.SessionKey),
	}, nil
}

func groupSeal(req request) (map[string]any, error) {
	session, membership, nonce, err := groupMembershipInputs(req)
	if err != nil {
		return nil, err
	}
	note, err := algochat.SealGroupMembership(session, membership, nonce)
	if err != nil {
		return nil, err
	}
	return map[string]any{"note": hex.EncodeToString(note)}, nil
}

func groupOpen(req request) (map[string]any, error) {
	session, _, _, err := groupMembershipInputs(req)
	if err != nil {
		return nil, err
	}
	raw, err := hex.DecodeString(req.Note)
	if err != nil {
		return nil, err
	}
	opened, err := algochat.OpenGroupMembership(raw, session)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"action":   int(opened.Action),
		"epoch":    opened.Epoch,
		"groupId":  hex.EncodeToString(opened.GroupID[:]),
		"mailbox":  hex.EncodeToString(opened.Mailbox[:]),
		"groupKey": hex.EncodeToString(opened.GroupKey[:]),
	}, nil
}

func groupWrite(req request) (map[string]any, error) {
	groupKey, err := hexN("group key", req.GroupKey, 32)
	if err != nil {
		return nil, err
	}
	groupID, err := hexN("group id", req.GroupID, 32)
	if err != nil {
		return nil, err
	}
	sender, err := hexN("sender address", req.SenderAddress, 32)
	if err != nil {
		return nil, err
	}
	nonce, err := hexN("nonce", req.Nonce, algochat.NonceSize)
	if err != nil {
		return nil, err
	}
	note, err := algochat.SealGroupMessage([]byte(req.Text), groupKey, groupID, req.Epoch, req.Counter, sender, nonce)
	if err != nil {
		return nil, err
	}
	messageKey, err := algochat.DeriveGroupMessageKey(groupKey, req.Epoch, req.Counter, groupID, sender)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"note":       hex.EncodeToString(note),
		"messageKey": hex.EncodeToString(messageKey),
	}, nil
}

func groupRead(req request) (map[string]any, error) {
	raw, err := hex.DecodeString(req.Note)
	if err != nil {
		return nil, err
	}
	groupKey, err := hexN("group key", req.GroupKey, 32)
	if err != nil {
		return nil, err
	}
	sender, err := hexN("sender address", req.SenderAddress, 32)
	if err != nil {
		return nil, err
	}
	seen := make([]algochat.GroupCounter, len(req.Seen))
	for i, item := range req.Seen {
		seen[i] = algochat.GroupCounter{Epoch: item.Epoch, Counter: item.Counter}
	}
	opened, err := algochat.OpenGroupMessage(raw, groupKey, sender, seen)
	if err != nil {
		return nil, err
	}
	text := string(opened.Plaintext)
	if req.Text != "" && text != req.Text {
		return nil, fmt.Errorf("plaintext %q", text)
	}
	return map[string]any{
		"text":    text,
		"epoch":   opened.Epoch,
		"counter": opened.Counter,
		"groupId": hex.EncodeToString(opened.GroupID[:]),
	}, nil
}

func groupMembershipInputs(req request) (algochat.PQSession, algochat.GroupMembership, []byte, error) {
	sessionKey, err := hexN("session key", req.SessionKey, 32)
	if err != nil {
		return algochat.PQSession{}, algochat.GroupMembership{}, nil, err
	}
	sender, err := hexN("sender public key", req.SenderPublicKey, 32)
	if err != nil {
		return algochat.PQSession{}, algochat.GroupMembership{}, nil, err
	}
	hid, err := hexN("handshake id", req.HandshakeID, 32)
	if err != nil {
		return algochat.PQSession{}, algochat.GroupMembership{}, nil, err
	}
	var nonce []byte
	if req.Op == "groupSeal" {
		nonce, err = hexN("nonce", req.Nonce, algochat.NonceSize)
		if err != nil {
			return algochat.PQSession{}, algochat.GroupMembership{}, nil, err
		}
	}
	var membership algochat.GroupMembership
	if req.Op == "groupSeal" {
		groupID, err := hexN("group id", req.GroupID, 32)
		if err != nil {
			return algochat.PQSession{}, algochat.GroupMembership{}, nil, err
		}
		mailbox, err := hexN("mailbox", string(req.Mailbox), 32)
		if err != nil {
			return algochat.PQSession{}, algochat.GroupMembership{}, nil, err
		}
		groupKey, err := hexN("group key", req.GroupKey, 32)
		if err != nil {
			return algochat.PQSession{}, algochat.GroupMembership{}, nil, err
		}
		if req.Action < 1 || req.Action > 4 {
			return algochat.PQSession{}, algochat.GroupMembership{}, nil, fmt.Errorf("group action is not create, add, remove, or rekey")
		}
		membership.Action = byte(req.Action)
		membership.Epoch = req.Epoch
		copy(membership.GroupID[:], groupID)
		copy(membership.Mailbox[:], mailbox)
		copy(membership.GroupKey[:], groupKey)
	}
	session := algochat.PQSession{SessionKey: sessionKey}
	copy(session.SenderPublicKey[:], sender)
	copy(session.HandshakeID[:], hid)
	return session, membership, nonce, nil
}

func adminDraft(req request) (map[string]any, error) {
	state, err := reviveRoom(req.BasisState)
	if err != nil {
		return nil, err
	}
	sender, err := hex.DecodeString(string(req.Sender))
	if err != nil {
		return nil, err
	}
	var subject []byte
	if req.Subject != "" {
		subject, err = hex.DecodeString(string(req.Subject))
		if err != nil {
			return nil, err
		}
	}
	var groupID []byte
	if req.GroupIDSnake != "" {
		groupID, err = hex.DecodeString(string(req.GroupIDSnake))
		if err != nil {
			return nil, err
		}
	}
	var mailbox []byte
	if req.Mailbox != "" {
		mailbox, err = hex.DecodeString(string(req.Mailbox))
		if err != nil {
			return nil, err
		}
	}
	op := 0
	if req.AdminOp != nil {
		op = *req.AdminOp
	}
	draft := algochat.AdminDraft{
		Op:      op,
		Sender:  sender,
		Subject: subject,
		GroupID: groupID,
		Mailbox: mailbox,
	}
	if req.Bot != nil {
		draft.Bot = &algochat.BotSettings{Mode: req.Bot.Mode, Replies: req.Bot.Replies, Seconds: req.Bot.Seconds}
	}
	if req.NameUTF8 != nil {
		draft.Name = []byte(*req.NameUTF8)
		draft.HasName = true
	}
	if req.Policy != nil {
		draft.Policy = *req.Policy
		draft.HasPolicy = true
	}
	if req.ParentRoom != nil {
		parent, err := reviveRoom(req.ParentRoom)
		if err != nil {
			return nil, err
		}
		draft.ParentRoom = parent
	}
	note, err := algochat.DraftAdmin(state, draft)
	if err != nil {
		return nil, err
	}
	return map[string]any{"note": hex.EncodeToString(note)}, nil
}

func adminReduce(req request) (map[string]any, error) {
	events := make([]algochat.AdminEvent, len(req.Events))
	for i, item := range req.Events {
		note, err := hex.DecodeString(item.Note)
		if err != nil {
			return nil, err
		}
		sender, err := hex.DecodeString(item.Sender)
		if err != nil {
			return nil, err
		}
		txID, err := hex.DecodeString(item.TxID)
		if err != nil {
			return nil, err
		}
		events[i] = algochat.AdminEvent{Note: note, Sender: sender, TxID: txID, Round: item.Round, Offset: item.Offset}
	}
	var parent []algochat.AdminEvent
	if req.ParentEvents != nil {
		parent = make([]algochat.AdminEvent, len(req.ParentEvents))
		for i, item := range req.ParentEvents {
			note, err := hex.DecodeString(item.Note)
			if err != nil {
				return nil, err
			}
			sender, err := hex.DecodeString(item.Sender)
			if err != nil {
				return nil, err
			}
			txID, err := hex.DecodeString(item.TxID)
			if err != nil {
				return nil, err
			}
			parent[i] = algochat.AdminEvent{Note: note, Sender: sender, TxID: txID, Round: item.Round, Offset: item.Offset}
		}
	}
	reduced := algochat.ReduceAdmin(events, parent)
	accepted := make([]acceptedWire, len(reduced.Accepted))
	for i, item := range reduced.Accepted {
		accepted[i] = acceptedWire{
			TxID:    hex.EncodeToString(item.TxID),
			Sender:  hex.EncodeToString(item.Sender),
			Op:      item.Op,
			Epoch:   item.Epoch,
			Subject: hex.EncodeToString(item.Subject),
			Members: encodeHexList(item.Members),
		}
	}
	rejected := make([]map[string]any, len(reduced.Rejected))
	for i, item := range reduced.Rejected {
		rejected[i] = map[string]any{"tx_id": hex.EncodeToString(item.TxID), "reason": item.Reason}
	}
	var state any
	if reduced.State != nil {
		state = snapRoom(reduced.State)
	}
	return map[string]any{"state": state, "accepted": accepted, "rejected": rejected}, nil
}

func deliverSeal(req request) (map[string]any, error) {
	session, err := deliverSession(req)
	if err != nil {
		return nil, err
	}
	groupID, err := hex.DecodeString(firstNonEmpty(string(req.GroupIDSnake), req.GroupID))
	if err != nil {
		return nil, err
	}
	mailbox, err := hex.DecodeString(string(req.Mailbox))
	if err != nil {
		return nil, err
	}
	groupKey, err := hex.DecodeString(firstNonEmpty(string(req.GroupKeySnake), req.GroupKey))
	if err != nil {
		return nil, err
	}
	adminTx, err := hex.DecodeString(string(req.AdminTxID))
	if err != nil {
		return nil, err
	}
	var nonce []byte
	if req.Nonce != "" {
		nonce, err = hex.DecodeString(req.Nonce)
		if err != nil {
			return nil, err
		}
	}
	note, err := algochat.SealGroupKeyDelivery(session, req.Epoch, groupID, mailbox, groupKey, adminTx, nonce)
	if err != nil {
		return nil, err
	}
	return map[string]any{"note": hex.EncodeToString(note)}, nil
}

func deliverOpen(req request) (map[string]any, error) {
	session, err := deliverSession(req)
	if err != nil {
		return nil, err
	}
	note, err := hex.DecodeString(req.Note)
	if err != nil {
		return nil, err
	}
	opened, err := algochat.OpenGroupKeyDelivery(note, session)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"epoch":       opened.Epoch,
		"group_id":    hex.EncodeToString(opened.GroupID[:]),
		"mailbox":     hex.EncodeToString(opened.Mailbox[:]),
		"group_key":   hex.EncodeToString(opened.GroupKey[:]),
		"admin_tx_id": hex.EncodeToString(opened.AdminTxID[:]),
	}, nil
}

func senderMayPost(req request) (map[string]any, error) {
	if req.State == nil {
		return nil, fmt.Errorf("missing room")
	}
	state, err := reviveRoom(req.State)
	if err != nil {
		return nil, err
	}
	sender, err := hex.DecodeString(string(req.Sender))
	if err != nil {
		return nil, err
	}
	allowed, err := algochat.SenderMayPost(*state, sender, req.Epoch)
	if err != nil {
		return nil, err
	}
	return map[string]any{"allowed": allowed}, nil
}

func deliveryAuthorized(req request) (map[string]any, error) {
	accepted := make([]algochat.AcceptedAdmin, len(req.Accepted))
	for i, item := range req.Accepted {
		txID, err := hex.DecodeString(item.TxID)
		if err != nil {
			return nil, err
		}
		sender, err := hex.DecodeString(item.Sender)
		if err != nil {
			return nil, err
		}
		subject, err := hex.DecodeString(item.Subject)
		if err != nil {
			return nil, err
		}
		members, err := decodeHexList(item.Members)
		if err != nil {
			return nil, err
		}
		accepted[i] = algochat.AcceptedAdmin{
			TxID:    txID,
			Sender:  sender,
			Op:      item.Op,
			Epoch:   item.Epoch,
			Subject: subject,
			Members: members,
		}
	}
	adminTx, err := hex.DecodeString(string(req.AdminTxID))
	if err != nil {
		return nil, err
	}
	sender, err := hex.DecodeString(string(req.Sender))
	if err != nil {
		return nil, err
	}
	recipient, err := hex.DecodeString(string(req.Recipient))
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"allowed": algochat.DeliveryAuthorized(accepted, adminTx, sender, recipient, req.Epoch),
	}, nil
}

func deliverSession(req request) (algochat.PQSession, error) {
	sessionKey, err := hex.DecodeString(firstNonEmpty(string(req.SessionKeySnake), req.SessionKey))
	if err != nil {
		return algochat.PQSession{}, err
	}
	sender, err := hex.DecodeString(firstNonEmpty(string(req.SenderX25519), req.SenderPublicKey))
	if err != nil {
		return algochat.PQSession{}, err
	}
	hid, err := hex.DecodeString(firstNonEmpty(string(req.HandshakeIDSnake), req.HandshakeID))
	if err != nil {
		return algochat.PQSession{}, err
	}
	if len(sender) != algochat.KeySize {
		return algochat.PQSession{}, fmt.Errorf("sender public key must be %d bytes, got %d", algochat.KeySize, len(sender))
	}
	if len(hid) != algochat.KeySize {
		return algochat.PQSession{}, fmt.Errorf("handshake id must be %d bytes, got %d", algochat.KeySize, len(hid))
	}
	session := algochat.PQSession{SessionKey: sessionKey}
	copy(session.SenderPublicKey[:], sender)
	copy(session.HandshakeID[:], hid)
	return session, nil
}

func reviveRoom(state *basisWire) (*algochat.RoomState, error) {
	if state == nil {
		return nil, nil
	}
	groupID, err := hex.DecodeString(state.GroupID)
	if err != nil {
		return nil, err
	}
	mailbox, err := hex.DecodeString(state.Mailbox)
	if err != nil {
		return nil, err
	}
	owner, err := hex.DecodeString(state.Owner)
	if err != nil {
		return nil, err
	}
	admins, err := decodeHexList(state.Admins)
	if err != nil {
		return nil, err
	}
	members, err := decodeHexList(state.Members)
	if err != nil {
		return nil, err
	}
	pending, err := decodeHexList(state.Pending)
	if err != nil {
		return nil, err
	}
	name, err := hex.DecodeString(state.NameHex)
	if err != nil {
		return nil, err
	}
	head, err := hex.DecodeString(state.HeadTxID)
	if err != nil {
		return nil, err
	}
	parentGroup := make([]byte, 32)
	if state.ParentGroupID != "" {
		parentGroup, err = hex.DecodeString(state.ParentGroupID)
		if err != nil {
			return nil, err
		}
	}
	var bots []algochat.RoomBot
	for _, item := range state.Bots {
		account, err := hex.DecodeString(item.Account)
		if err != nil {
			return nil, err
		}
		bots = append(bots, algochat.RoomBot{
			Account:     account,
			BotSettings: algochat.BotSettings{Mode: item.Mode, Replies: item.Replies, Seconds: item.Seconds},
		})
	}
	return &algochat.RoomState{
		Bots:          bots,
		GroupID:       groupID,
		Mailbox:       mailbox,
		Owner:         owner,
		Admins:        admins,
		Members:       members,
		Pending:       pending,
		Policy:        state.Policy,
		Name:          name,
		Epoch:         state.Epoch,
		HeadTxID:      head,
		ParentGroupID: parentGroup,
	}, nil
}

func snapRoom(state *algochat.RoomState) basisWire {
	return basisWire{
		GroupID:       hex.EncodeToString(state.GroupID),
		Mailbox:       hex.EncodeToString(state.Mailbox),
		Owner:         hex.EncodeToString(state.Owner),
		Admins:        encodeHexList(state.Admins),
		Members:       encodeHexList(state.Members),
		Pending:       encodeHexList(state.Pending),
		Policy:        state.Policy,
		NameHex:       hex.EncodeToString(state.Name),
		Epoch:         state.Epoch,
		HeadTxID:      hex.EncodeToString(state.HeadTxID),
		ParentGroupID: hex.EncodeToString(parentOrZero(state.ParentGroupID)),
		Bots:          snapBots(state.Bots),
	}
}

func snapBots(bots []algochat.RoomBot) []botWire {
	out := make([]botWire, 0, len(bots))
	for _, item := range bots {
		out = append(out, botWire{
			Account: hex.EncodeToString(item.Account),
			Mode:    item.Mode,
			Replies: item.Replies,
			Seconds: item.Seconds,
		})
	}
	return out
}

func parentOrZero(value []byte) []byte {
	if len(value) == 32 {
		return value
	}
	return make([]byte, 32)
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

func encodeHexList(items [][]byte) []string {
	out := make([]string, len(items))
	for i, item := range items {
		out[i] = hex.EncodeToString(item)
	}
	return out
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func hexN(label, hexText string, n int) ([]byte, error) {
	raw, err := hex.DecodeString(hexText)
	if err != nil {
		return nil, err
	}
	if len(raw) != n {
		return nil, fmt.Errorf("%s is %d bytes", label, len(raw))
	}
	return raw, nil
}

func seed32(hexText string) ([32]byte, error) {
	var out [32]byte
	raw, err := hex.DecodeString(hexText)
	if err != nil {
		return out, err
	}
	if len(raw) != 32 {
		return out, fmt.Errorf("seed is %d bytes", len(raw))
	}
	copy(out[:], raw)
	return out, nil
}

func write(body map[string]any) {
	encoded, err := json.Marshal(body)
	if err != nil {
		fmt.Fprintf(os.Stderr, "marshal: %v\n", err)
		return
	}
	fmt.Println(string(encoded))
	_ = os.Stdout.Sync()
}
