package algochat

// Room administration is public protocol 0x03. Action 5 of protocol 0x06
// delivers the room key and cites one accepted administration record.
// Legacy 0x06 actions 1–4 stay in group.go: 101-byte plaintexts and 195-byte notes.

import (
	"bytes"
	"crypto/rand"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	"sort"
	"unicode/utf8"

	"golang.org/x/crypto/chacha20poly1305"
)

const (
	protocolIDGroupAdmin  = 0x03
	groupDeliverAction    = 5
	groupNameMax          = 64
	groupAdminMax         = 16
	groupMemberMax        = 100
	groupDeliverPlainSize = 133
	groupDeliverNoteSize  = pqDataHeaderSize + groupDeliverPlainSize + TagSize
	groupAdminNoteMin     = 141
	joiningInvite         = 1
	joiningAsk            = 2
	adminOpCreate         = 1
	adminOpSetName        = 2
	adminOpSetPolicy      = 3
	adminOpAppoint        = 4
	adminOpDismiss        = 5
	adminOpTransfer       = 6
	adminOpAdd            = 7
	adminOpRequest        = 8
	adminOpAccept         = 9
	adminOpDecline        = 10
	adminOpRemove         = 11
	adminOpRekey          = 12
)

// RoomState is the derived roster. Pending join requests are not written in the note.
type RoomState struct {
	GroupID  []byte
	Mailbox  []byte
	Owner    []byte
	Admins   [][]byte
	Members  [][]byte
	Pending  [][]byte
	Policy   int
	Name     []byte
	Epoch    uint32
	HeadTxID []byte
}

// AdminEvent is one confirmed administration payment.
type AdminEvent struct {
	Note   []byte
	Sender []byte
	TxID   []byte
	Round  int
	Offset int
}

// AcceptedAdmin is one applied administration record.
type AcceptedAdmin struct {
	TxID    []byte
	Sender  []byte
	Op      int
	Epoch   uint32
	Subject []byte
	Members [][]byte
}

// RejectedAdmin is one record that was not applied.
type RejectedAdmin struct {
	TxID   []byte
	Reason string
}

// ReduceAdminResult is the roster after every event has been considered.
type ReduceAdminResult struct {
	State    *RoomState
	Accepted []AcceptedAdmin
	Rejected []RejectedAdmin
}

// AdminDraft is the change to encode.
// HasName and HasPolicy select optional overrides. A nil Subject means 32 zero bytes.
// Nil GroupID and Mailbox keep the current room, or 32 zero bytes when there is no room.
type AdminDraft struct {
	Op        int
	Sender    []byte
	Subject   []byte
	Name      []byte
	HasName   bool
	Policy    int
	HasPolicy bool
	GroupID   []byte
	Mailbox   []byte
}

// GroupKeyDelivery is the plaintext of one 0x06 action-5 note.
type GroupKeyDelivery struct {
	Epoch     uint32
	GroupID   [KeySize]byte
	Mailbox   [KeySize]byte
	GroupKey  [KeySize]byte
	AdminTxID [KeySize]byte
}

type decodedAdmin struct {
	parent  []byte
	groupID []byte
	mailbox []byte
	epoch   uint32
	op      int
	name    []byte
	policy  int
	owner   []byte
	admins  [][]byte
	members [][]byte
	subject []byte
}

type roomBody struct {
	groupID []byte
	mailbox []byte
	owner   []byte
	admins  [][]byte
	members [][]byte
	pending [][]byte
	policy  int
	name    []byte
	epoch   uint32
}

// DraftAdmin encodes the only legal next public administration record.
func DraftAdmin(state *RoomState, in AdminDraft) ([]byte, error) {
	subject := in.Subject
	if subject == nil {
		subject = make([]byte, KeySize)
	}
	name := []byte{}
	switch {
	case in.HasName:
		name = in.Name
	case state != nil:
		name = state.Name
	}
	policy := joiningInvite
	switch {
	case in.HasPolicy:
		policy = in.Policy
	case state != nil:
		policy = state.Policy
	}
	groupID := in.GroupID
	if groupID == nil {
		if state != nil {
			groupID = state.GroupID
		} else {
			groupID = make([]byte, KeySize)
		}
	}
	mailbox := in.Mailbox
	if mailbox == nil {
		if state != nil {
			mailbox = state.Mailbox
		} else {
			mailbox = make([]byte, KeySize)
		}
	}
	parent := make([]byte, KeySize)
	if state != nil {
		parent = state.HeadTxID
	}
	owner := in.Sender
	admins := [][]byte{}
	members := [][]byte{}
	if state != nil {
		owner = state.Owner
		admins = cloneList(state.Admins)
		members = cloneList(state.Members)
	}
	decoded := decodedAdmin{
		parent:  parent,
		groupID: groupID,
		mailbox: mailbox,
		epoch:   0,
		op:      in.Op,
		name:    name,
		policy:  policy,
		owner:   owner,
		admins:  admins,
		members: members,
		subject: subject,
	}
	var next roomBody
	if in.Op == adminOpCreate {
		next = roomBody{
			groupID: cloneBytes(decoded.groupID),
			mailbox: cloneBytes(decoded.mailbox),
			owner:   cloneBytes(in.Sender),
			admins:  [][]byte{},
			members: [][]byte{cloneBytes(in.Sender)},
			pending: [][]byte{},
			policy:  decoded.policy,
			name:    decoded.name,
			epoch:   1,
		}
	} else {
		if state != nil {
			decoded.epoch = state.Epoch
		} else {
			decoded.epoch = 1
		}
		var err error
		next, err = expectNext(state, decoded, in.Sender)
		if err != nil {
			return nil, err
		}
	}
	return encodeAdminRecord(decodedAdmin{
		parent:  decoded.parent,
		groupID: next.groupID,
		mailbox: next.mailbox,
		epoch:   next.epoch,
		op:      in.Op,
		name:    next.name,
		policy:  next.policy,
		owner:   next.owner,
		admins:  next.admins,
		members: next.members,
		subject: subject,
	})
}

// ReduceAdmin applies events in confirmed order: round, then offset, then transaction id.
// A transaction id that was already accepted is rejected with reason "replay".
// A join request does not advance the head. Its parent must be an already accepted
// non-request transaction id. That set starts as 32 zero bytes.
func ReduceAdmin(events []AdminEvent) ReduceAdminResult {
	ordered := make([]AdminEvent, len(events))
	copy(ordered, events)
	sort.SliceStable(ordered, func(i, j int) bool {
		if ordered[i].Round != ordered[j].Round {
			return ordered[i].Round < ordered[j].Round
		}
		if ordered[i].Offset != ordered[j].Offset {
			return ordered[i].Offset < ordered[j].Offset
		}
		return bytes.Compare(ordered[i].TxID, ordered[j].TxID) < 0
	})
	var state *RoomState
	accepted := []AcceptedAdmin{}
	rejected := []RejectedAdmin{}
	seen := map[string]struct{}{}
	known := map[string]struct{}{hex.EncodeToString(make([]byte, KeySize)): {}}
	for _, event := range ordered {
		key := hex.EncodeToString(event.TxID)
		if _, ok := seen[key]; ok {
			rejected = append(rejected, RejectedAdmin{TxID: cloneBytes(event.TxID), Reason: "replay"})
			continue
		}
		next, acc, advance, err := applyAdmin(state, event, known)
		if err != nil {
			rejected = append(rejected, RejectedAdmin{TxID: cloneBytes(event.TxID), Reason: err.Error()})
			continue
		}
		seen[key] = struct{}{}
		if advance {
			known[hex.EncodeToString(event.TxID)] = struct{}{}
		}
		state = next
		accepted = append(accepted, acc)
	}
	return ReduceAdminResult{State: state, Accepted: accepted, Rejected: rejected}
}

// SenderMayPost is true only when epoch is the room epoch and sender is a current member.
func SenderMayPost(state RoomState, sender []byte, epoch uint32) (bool, error) {
	if err := requireLen("sender", sender, KeySize); err != nil {
		return false, err
	}
	return epoch == state.Epoch && containsKey(state.Members, sender), nil
}

// DeliveryAuthorized reports whether recipient may receive the room key cited by adminTxID.
// Add and accept authorize only the subject. Remove authorizes every remaining member
// except the subject. Rekey and transfer authorize every remaining member.
func DeliveryAuthorized(accepted []AcceptedAdmin, adminTxID, sender, recipient []byte, epoch uint32) bool {
	var record *AcceptedAdmin
	for i := range accepted {
		if bytes.Equal(accepted[i].TxID, adminTxID) {
			record = &accepted[i]
			break
		}
	}
	if record == nil || !bytes.Equal(record.Sender, sender) || record.Epoch != epoch {
		return false
	}
	if !containsKey(record.Members, recipient) {
		return false
	}
	switch record.Op {
	case adminOpAdd, adminOpAccept:
		return bytes.Equal(record.Subject, recipient)
	case adminOpRemove:
		return !bytes.Equal(record.Subject, recipient)
	case adminOpRekey, adminOpTransfer:
		return true
	default:
		return false
	}
}

// SealGroupKeyDelivery seals a 133-byte action-5 plaintext under the hybrid session key.
// The note is 227 bytes. A nil or empty nonce is filled at random.
// Associated data is the 78-byte header.
func SealGroupKeyDelivery(session PQSession, epoch uint32, groupID, mailbox, groupKey, adminTxID, nonce []byte) ([]byte, error) {
	if err := requireLen("session key", session.SessionKey, KeySize); err != nil {
		return nil, err
	}
	var err error
	nonce, err = deliveryNonce(nonce)
	if err != nil {
		return nil, err
	}
	plain, err := encodeDelivery(epoch, groupID, mailbox, groupKey, adminTxID)
	if err != nil {
		return nil, err
	}
	header := make([]byte, pqDataHeaderSize)
	header[0] = protocolVersionAAD
	header[1] = protocolIDGroupMembership
	copy(header[2:34], session.SenderPublicKey[:])
	copy(header[34:66], session.HandshakeID[:])
	copy(header[66:78], nonce)
	aead, err := chacha20poly1305.New(session.SessionKey)
	if err != nil {
		return nil, err
	}
	note := append(header, aead.Seal(nil, nonce, plain, header)...)
	if len(note) != groupDeliverNoteSize {
		return nil, errors.New("Not a group key delivery")
	}
	return note, nil
}

// OpenGroupKeyDelivery opens a 227-byte action-5 note.
// A legacy 195-byte membership note is not a group key delivery.
func OpenGroupKeyDelivery(note []byte, session PQSession) (GroupKeyDelivery, error) {
	if len(note) != groupDeliverNoteSize || note[1] != protocolIDGroupMembership {
		return GroupKeyDelivery{}, errors.New("Not a group key delivery")
	}
	if err := requireLen("session key", session.SessionKey, KeySize); err != nil {
		return GroupKeyDelivery{}, err
	}
	aead, err := chacha20poly1305.New(session.SessionKey)
	if err != nil {
		return GroupKeyDelivery{}, err
	}
	plain, err := aead.Open(nil, note[66:78], note[pqDataHeaderSize:], note[:pqDataHeaderSize])
	if err != nil {
		return GroupKeyDelivery{}, errors.New("Group key delivery authentication failed")
	}
	if len(plain) != groupDeliverPlainSize || plain[0] != groupDeliverAction {
		return GroupKeyDelivery{}, errors.New("Group key delivery plaintext is not action 5")
	}
	var out GroupKeyDelivery
	out.Epoch = binary.BigEndian.Uint32(plain[1:5])
	copy(out.GroupID[:], plain[5:37])
	copy(out.Mailbox[:], plain[37:69])
	copy(out.GroupKey[:], plain[69:101])
	copy(out.AdminTxID[:], plain[101:133])
	return out, nil
}

func applyAdmin(state *RoomState, event AdminEvent, known map[string]struct{}) (*RoomState, AcceptedAdmin, bool, error) {
	if err := requireLen("sender", event.Sender, KeySize); err != nil {
		return nil, AcceptedAdmin{}, false, err
	}
	if err := requireLen("transaction id", event.TxID, KeySize); err != nil {
		return nil, AcceptedAdmin{}, false, err
	}
	decoded, err := decodeAdmin(event.Note)
	if err != nil {
		return nil, AcceptedAdmin{}, false, err
	}
	if bytes.Equal(decoded.mailbox, event.Sender) {
		return nil, AcceptedAdmin{}, false, errors.New("Mailbox key does not own the room")
	}
	parent := make([]byte, KeySize)
	if state != nil {
		parent = state.HeadTxID
	}
	request := decoded.op == adminOpRequest
	if request {
		if state == nil {
			return nil, AcceptedAdmin{}, false, errors.New("Join request does not cite this room")
		}
		if _, ok := known[hex.EncodeToString(decoded.parent)]; !ok {
			return nil, AcceptedAdmin{}, false, errors.New("Join request does not cite this room")
		}
	} else if !bytes.Equal(decoded.parent, parent) {
		return nil, AcceptedAdmin{}, false, errors.New("Stale administration parent")
	}
	next, err := expectNext(state, decoded, event.Sender)
	if err != nil {
		return nil, AcceptedAdmin{}, false, err
	}
	if !sameState(decoded, next) {
		return nil, AcceptedAdmin{}, false, errors.New("Administration record does not match the authorized next state")
	}
	head := cloneBytes(event.TxID)
	if request {
		head = cloneBytes(state.HeadTxID)
	}
	room := &RoomState{
		GroupID:  next.groupID,
		Mailbox:  next.mailbox,
		Owner:    next.owner,
		Admins:   next.admins,
		Members:  next.members,
		Pending:  next.pending,
		Policy:   next.policy,
		Name:     next.name,
		Epoch:    next.epoch,
		HeadTxID: head,
	}
	if room.Admins == nil {
		room.Admins = [][]byte{}
	}
	if room.Members == nil {
		room.Members = [][]byte{}
	}
	if room.Pending == nil {
		room.Pending = [][]byte{}
	}
	if room.Name == nil {
		room.Name = []byte{}
	}
	return room, AcceptedAdmin{
		TxID:    cloneBytes(event.TxID),
		Sender:  cloneBytes(event.Sender),
		Op:      decoded.op,
		Epoch:   room.Epoch,
		Subject: cloneBytes(decoded.subject),
		Members: cloneList(room.Members),
	}, !request, nil
}

func expectNext(state *RoomState, decoded decodedAdmin, sender []byte) (roomBody, error) {
	if decoded.op == adminOpCreate {
		if state != nil {
			return roomBody{}, errors.New("Create requires an empty parent")
		}
		if !isZero(decoded.parent) || !isZero(decoded.subject) {
			return roomBody{}, errors.New("Create parent and subject must be zero")
		}
		if !bytes.Equal(decoded.owner, sender) {
			return roomBody{}, errors.New("Create sender is not the owner")
		}
		if decoded.epoch != 1 || len(decoded.admins) != 0 {
			return roomBody{}, errors.New("Create starts at epoch 1 with no admins")
		}
		if len(decoded.members) != 1 || !bytes.Equal(decoded.members[0], sender) {
			return roomBody{}, errors.New("Create membership is the owner alone")
		}
		if err := rejectMailboxOverlap(decoded.mailbox, decoded.members, decoded.admins, decoded.owner); err != nil {
			return roomBody{}, err
		}
		return bodyFrom(decoded, [][]byte{}), nil
	}
	if state == nil {
		return roomBody{}, errors.New("Administration parent is missing")
	}
	if !bytes.Equal(decoded.groupID, state.GroupID) || !bytes.Equal(decoded.mailbox, state.Mailbox) {
		return roomBody{}, errors.New("Administration record is for a different room")
	}
	privileged := bytes.Equal(sender, state.Owner) || containsKey(state.Admins, sender)
	members := cloneList(state.Members)
	admins := cloneList(state.Admins)
	pending := cloneList(state.Pending)
	owner := cloneBytes(state.Owner)
	epoch := state.Epoch
	name := cloneBytes(state.Name)
	policy := state.Policy
	subject := decoded.subject
	switch decoded.op {
	case adminOpSetName:
		if !privileged || !isZero(subject) {
			return roomBody{}, errors.New("Sender cannot rename the room")
		}
		name = cloneBytes(decoded.name)
	case adminOpSetPolicy:
		if !privileged || !isZero(subject) {
			return roomBody{}, errors.New("Sender cannot change the joining rule")
		}
		policy = decoded.policy
	case adminOpAppoint:
		if !bytes.Equal(sender, state.Owner) {
			return roomBody{}, errors.New("Only the owner appoints an admin")
		}
		if !containsKey(members, subject) || bytes.Equal(subject, owner) || containsKey(admins, subject) {
			return roomBody{}, errors.New("That person cannot be appointed")
		}
		var err error
		admins, err = canonicalSet(append(admins, subject), "admins", groupAdminMax)
		if err != nil {
			return roomBody{}, err
		}
	case adminOpDismiss:
		if !bytes.Equal(sender, state.Owner) || !containsKey(admins, subject) {
			return roomBody{}, errors.New("Only the owner dismisses an admin")
		}
		admins = filterOut(admins, subject)
	case adminOpTransfer:
		if !bytes.Equal(sender, state.Owner) || !containsKey(members, subject) || bytes.Equal(subject, owner) {
			return roomBody{}, errors.New("Ownership can move only from the owner to another member")
		}
		owner = cloneBytes(subject)
		admins = filterOut(admins, subject)
		var err error
		epoch, err = bumpEpoch(epoch)
		if err != nil {
			return roomBody{}, err
		}
	case adminOpAdd:
		if !privileged || containsKey(members, subject) || bytes.Equal(subject, state.Mailbox) {
			return roomBody{}, errors.New("Sender cannot add that member")
		}
		var err error
		members, err = canonicalSet(append(members, subject), "members", groupMemberMax)
		if err != nil {
			return roomBody{}, err
		}
		pending = filterOut(pending, subject)
	case adminOpRequest:
		if state.Policy != joiningAsk || !bytes.Equal(sender, subject) || containsKey(members, subject) || containsKey(pending, subject) {
			return roomBody{}, errors.New("That join request is not allowed")
		}
		var err error
		pending, err = canonicalSet(append(pending, subject), "pending", groupMemberMax)
		if err != nil {
			return roomBody{}, err
		}
	case adminOpAccept:
		if !privileged || !containsKey(pending, subject) {
			return roomBody{}, errors.New("No join request to accept")
		}
		var err error
		members, err = canonicalSet(append(members, subject), "members", groupMemberMax)
		if err != nil {
			return roomBody{}, err
		}
		pending = filterOut(pending, subject)
	case adminOpDecline:
		if !privileged || !containsKey(pending, subject) {
			return roomBody{}, errors.New("No join request to decline")
		}
		pending = filterOut(pending, subject)
	case adminOpRemove:
		if !privileged || !containsKey(members, subject) || bytes.Equal(subject, owner) {
			return roomBody{}, errors.New("Sender cannot remove that member")
		}
		members = filterOut(members, subject)
		admins = filterOut(admins, subject)
		pending = filterOut(pending, subject)
		var err error
		epoch, err = bumpEpoch(epoch)
		if err != nil {
			return roomBody{}, err
		}
	case adminOpRekey:
		if !privileged || !isZero(subject) {
			return roomBody{}, errors.New("Sender cannot rotate the room key")
		}
		var err error
		epoch, err = bumpEpoch(epoch)
		if err != nil {
			return roomBody{}, err
		}
	default:
		return roomBody{}, errors.New("Unknown room administration operation")
	}
	if err := rejectMailboxOverlap(state.Mailbox, members, admins, owner); err != nil {
		return roomBody{}, err
	}
	if !containsKey(members, owner) {
		return roomBody{}, errors.New("The owner must remain a member")
	}
	return roomBody{
		groupID: cloneBytes(state.GroupID),
		mailbox: cloneBytes(state.Mailbox),
		owner:   owner,
		admins:  admins,
		members: members,
		pending: pending,
		policy:  policy,
		name:    name,
		epoch:   epoch,
	}, nil
}

func bodyFrom(decoded decodedAdmin, pending [][]byte) roomBody {
	return roomBody{
		groupID: cloneBytes(decoded.groupID),
		mailbox: cloneBytes(decoded.mailbox),
		owner:   cloneBytes(decoded.owner),
		admins:  cloneList(decoded.admins),
		members: cloneList(decoded.members),
		pending: pending,
		policy:  decoded.policy,
		name:    cloneBytes(decoded.name),
		epoch:   decoded.epoch,
	}
}

func sameState(decoded decodedAdmin, next roomBody) bool {
	return bytes.Equal(decoded.owner, next.owner) &&
		decoded.epoch == next.epoch &&
		decoded.policy == next.policy &&
		bytes.Equal(decoded.name, next.name) &&
		sameSet(decoded.admins, next.admins) &&
		sameSet(decoded.members, next.members)
}

func encodeAdminRecord(fields decodedAdmin) ([]byte, error) {
	name, err := canonicalName(fields.name)
	if err != nil {
		return nil, err
	}
	admins, err := canonicalSet(fields.admins, "admins", groupAdminMax)
	if err != nil {
		return nil, err
	}
	members, err := canonicalSet(fields.members, "members", groupMemberMax)
	if err != nil {
		return nil, err
	}
	if err := requireLen("parent", fields.parent, KeySize); err != nil {
		return nil, err
	}
	if err := requireLen("group id", fields.groupID, KeySize); err != nil {
		return nil, err
	}
	if err := requireLen("mailbox", fields.mailbox, KeySize); err != nil {
		return nil, err
	}
	if err := requireLen("owner", fields.owner, KeySize); err != nil {
		return nil, err
	}
	if err := requireLen("subject", fields.subject, KeySize); err != nil {
		return nil, err
	}
	if fields.policy != joiningInvite && fields.policy != joiningAsk {
		return nil, errors.New("Joining rule must be invite-only or ask-to-join")
	}
	if !knownAdminOp(fields.op) {
		return nil, errors.New("Unknown room administration operation")
	}
	out := make([]byte, 0, 173+len(name)+KeySize*len(admins)+KeySize*len(members))
	out = append(out, protocolVersionAAD, protocolIDGroupAdmin)
	out = append(out, fields.parent...)
	out = append(out, fields.groupID...)
	out = append(out, fields.mailbox...)
	var epoch [4]byte
	binary.BigEndian.PutUint32(epoch[:], fields.epoch)
	out = append(out, epoch[:]...)
	out = append(out, byte(fields.op), byte(len(name)))
	out = append(out, name...)
	out = append(out, byte(fields.policy))
	out = append(out, fields.owner...)
	var count [2]byte
	binary.BigEndian.PutUint16(count[:], uint16(len(admins)))
	out = append(out, count[:]...)
	for _, admin := range admins {
		out = append(out, admin...)
	}
	binary.BigEndian.PutUint16(count[:], uint16(len(members)))
	out = append(out, count[:]...)
	for _, member := range members {
		out = append(out, member...)
	}
	out = append(out, fields.subject...)
	if len(out) > MaxNoteSize {
		return nil, errors.New("Administration record exceeds 4096 bytes")
	}
	return out, nil
}

func decodeAdmin(note []byte) (decodedAdmin, error) {
	if len(note) < groupAdminNoteMin || note[0] != protocolVersionAAD || note[1] != protocolIDGroupAdmin {
		return decodedAdmin{}, errors.New("Not a room administration record")
	}
	cursor := 2
	take := func(n int) ([]byte, error) {
		if n < 0 || cursor > len(note) || n > len(note)-cursor {
			return nil, errors.New("Administration record is truncated")
		}
		out := cloneBytes(note[cursor : cursor+n])
		cursor += n
		return out, nil
	}
	parent, err := take(KeySize)
	if err != nil {
		return decodedAdmin{}, err
	}
	groupID, err := take(KeySize)
	if err != nil {
		return decodedAdmin{}, err
	}
	mailbox, err := take(KeySize)
	if err != nil {
		return decodedAdmin{}, err
	}
	epochBytes, err := take(4)
	if err != nil {
		return decodedAdmin{}, err
	}
	epoch := binary.BigEndian.Uint32(epochBytes)
	opBytes, err := take(1)
	if err != nil {
		return decodedAdmin{}, err
	}
	nameLenBytes, err := take(1)
	if err != nil {
		return decodedAdmin{}, err
	}
	nameLen := int(nameLenBytes[0])
	if nameLen > groupNameMax {
		return decodedAdmin{}, errors.New("Room name is longer than 64 bytes")
	}
	name, err := take(nameLen)
	if err != nil {
		return decodedAdmin{}, err
	}
	if _, err := canonicalName(name); err != nil {
		return decodedAdmin{}, err
	}
	policyBytes, err := take(1)
	if err != nil {
		return decodedAdmin{}, err
	}
	owner, err := take(KeySize)
	if err != nil {
		return decodedAdmin{}, err
	}
	adminCountBytes, err := take(2)
	if err != nil {
		return decodedAdmin{}, err
	}
	adminCount := int(binary.BigEndian.Uint16(adminCountBytes))
	admins := make([][]byte, 0, adminCount)
	for i := 0; i < adminCount; i++ {
		item, err := take(KeySize)
		if err != nil {
			return decodedAdmin{}, err
		}
		admins = append(admins, item)
	}
	memberCountBytes, err := take(2)
	if err != nil {
		return decodedAdmin{}, err
	}
	memberCount := int(binary.BigEndian.Uint16(memberCountBytes))
	members := make([][]byte, 0, memberCount)
	for i := 0; i < memberCount; i++ {
		item, err := take(KeySize)
		if err != nil {
			return decodedAdmin{}, err
		}
		members = append(members, item)
	}
	subject, err := take(KeySize)
	if err != nil {
		return decodedAdmin{}, err
	}
	if cursor != len(note) {
		return decodedAdmin{}, errors.New("Administration record has trailing bytes")
	}
	if _, err := canonicalSet(admins, "admins", groupAdminMax); err != nil {
		return decodedAdmin{}, err
	}
	if _, err := canonicalSet(members, "members", groupMemberMax); err != nil {
		return decodedAdmin{}, err
	}
	if !strictlyIncreasing(admins) || !strictlyIncreasing(members) {
		return decodedAdmin{}, errors.New("Administration sets must be strictly sorted")
	}
	return decodedAdmin{
		parent:  parent,
		groupID: groupID,
		mailbox: mailbox,
		epoch:   epoch,
		op:      int(opBytes[0]),
		name:    name,
		policy:  int(policyBytes[0]),
		owner:   owner,
		admins:  admins,
		members: members,
		subject: subject,
	}, nil
}

func encodeDelivery(epoch uint32, groupID, mailbox, groupKey, adminTxID []byte) ([]byte, error) {
	if epoch < 1 {
		return nil, errors.New("Group epoch must be from 1 through 4294967295")
	}
	if err := requireLen("group id", groupID, KeySize); err != nil {
		return nil, err
	}
	if err := requireLen("mailbox", mailbox, KeySize); err != nil {
		return nil, err
	}
	if err := requireLen("group key", groupKey, KeySize); err != nil {
		return nil, err
	}
	if err := requireLen("administration id", adminTxID, KeySize); err != nil {
		return nil, err
	}
	out := make([]byte, groupDeliverPlainSize)
	out[0] = groupDeliverAction
	binary.BigEndian.PutUint32(out[1:5], epoch)
	copy(out[5:37], groupID)
	copy(out[37:69], mailbox)
	copy(out[69:101], groupKey)
	copy(out[101:133], adminTxID)
	return out, nil
}

func rejectMailboxOverlap(mailbox []byte, members, admins [][]byte, owner []byte) error {
	if bytes.Equal(mailbox, owner) || containsKey(members, mailbox) || containsKey(admins, mailbox) {
		return errors.New("Mailbox key does not own the room")
	}
	return nil
}

func canonicalName(name []byte) ([]byte, error) {
	if len(name) > groupNameMax {
		return nil, errors.New("Room name is longer than 64 bytes")
	}
	if !utf8.Valid(name) {
		return nil, errors.New("Room name is not UTF-8")
	}
	return name, nil
}

func canonicalSet(values [][]byte, label string, max int) ([][]byte, error) {
	sorted := make([][]byte, len(values))
	for i, value := range values {
		sorted[i] = cloneBytes(value)
	}
	sort.Slice(sorted, func(i, j int) bool {
		return bytes.Compare(sorted[i], sorted[j]) < 0
	})
	for i := 1; i < len(sorted); i++ {
		if bytes.Equal(sorted[i], sorted[i-1]) {
			return nil, errors.New("Duplicate " + label)
		}
	}
	if len(sorted) > max {
		return nil, errors.New("Too many " + label)
	}
	for _, value := range sorted {
		if err := requireLen(label, value, KeySize); err != nil {
			return nil, err
		}
	}
	return sorted, nil
}

func strictlyIncreasing(values [][]byte) bool {
	for i := 1; i < len(values); i++ {
		if bytes.Compare(values[i-1], values[i]) >= 0 {
			return false
		}
	}
	return true
}

func containsKey(values [][]byte, target []byte) bool {
	for _, item := range values {
		if bytes.Equal(item, target) {
			return true
		}
	}
	return false
}

func sameSet(left, right [][]byte) bool {
	if len(left) != len(right) {
		return false
	}
	for i := range left {
		if !bytes.Equal(left[i], right[i]) {
			return false
		}
	}
	return true
}

func filterOut(values [][]byte, subject []byte) [][]byte {
	out := make([][]byte, 0, len(values))
	for _, item := range values {
		if !bytes.Equal(item, subject) {
			out = append(out, item)
		}
	}
	return out
}

func bumpEpoch(epoch uint32) (uint32, error) {
	if epoch == 0xffffffff {
		return 0, errors.New("Group epoch is exhausted")
	}
	return epoch + 1, nil
}

func isZero(value []byte) bool {
	for _, b := range value {
		if b != 0 {
			return false
		}
	}
	return true
}

func knownAdminOp(op int) bool {
	return op >= adminOpCreate && op <= adminOpRekey
}

func cloneBytes(value []byte) []byte {
	if value == nil {
		return nil
	}
	out := make([]byte, len(value))
	copy(out, value)
	return out
}

func cloneList(values [][]byte) [][]byte {
	out := make([][]byte, len(values))
	for i, value := range values {
		out[i] = cloneBytes(value)
	}
	return out
}

func requireLen(name string, value []byte, n int) error {
	if len(value) != n {
		return fmt.Errorf("%s must be %d bytes, got %d", name, n, len(value))
	}
	return nil
}

func deliveryNonce(nonce []byte) ([]byte, error) {
	if len(nonce) == 0 {
		out := make([]byte, NonceSize)
		if _, err := rand.Read(out); err != nil {
			return nil, err
		}
		return out, nil
	}
	if len(nonce) != NonceSize {
		return nil, fmt.Errorf("nonce must be 12 bytes, got %d", len(nonce))
	}
	out := make([]byte, NonceSize)
	copy(out, nonce)
	return out, nil
}
