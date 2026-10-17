// Package algochat implements the AlgoChat protocol for encrypted messaging on Algorand.
package algochat

import (
	"sort"
	"sync"
	"time"
)

// Protocol constants matching AlgoChat protocol revision 1.2.1.
// The envelope version byte stays 0x01. Protocol ID 0x02 is reserved;
// this package does not implement PSK envelopes.
const (
	ProtocolVersion    = 0x01
	ProtocolIDStandard = 0x01
	ProtocolIDPSK      = 0x02
	HeaderSize         = 126 // version(1) + protocolId(1) + senderKey(32) + ephemeralKey(32) + nonce(12) + encryptedSenderKey(48)
	TagSize            = 16  // ChaCha20-Poly1305 authentication tag
	EncryptedKeySize   = 48  // 32 bytes key + 16 bytes auth tag
	MaxNoteSize        = 4096
	MaxPayloadSize     = MaxNoteSize - HeaderSize - TagSize // 3954
	MinPayment         = 1000                               // microAlgos
	NonceSize          = 12
	KeySize            = 32
)

// MessageDirection indicates whether a message was sent or received.
type MessageDirection string

const (
	DirectionSent     MessageDirection = "sent"
	DirectionReceived MessageDirection = "received"
)

// ChatEnvelope represents an encrypted message envelope from a transaction note.
type ChatEnvelope struct {
	Version            byte
	ProtocolID         byte
	SenderPublicKey    [KeySize]byte
	EphemeralPublicKey [KeySize]byte
	Nonce              [NonceSize]byte
	EncryptedSenderKey [EncryptedKeySize]byte
	Ciphertext         []byte
}

// DecryptedContent contains the decrypted message payload.
type DecryptedContent struct {
	Text           string
	ReplyToID      string
	ReplyToPreview string
}

// ReplyContext holds a reference to the message being replied to.
type ReplyContext struct {
	MessageID string `json:"messageId"`
	Preview   string `json:"preview"`
}

// Message represents a decrypted chat message.
type Message struct {
	ID               string
	Sender           string
	Recipient        string
	Content          string
	Timestamp        time.Time
	ConfirmedRound   uint64
	Direction        MessageDirection
	ReplyContext     *ReplyContext
	Amount           uint64
	Fee              uint64
	IntraRoundOffset int
}

// PendingStatus tracks the lifecycle of a queued message.
type PendingStatus string

const (
	StatusPending PendingStatus = "pending"
	StatusSending PendingStatus = "sending"
	StatusSent    PendingStatus = "sent"
	StatusFailed  PendingStatus = "failed"
)

// PendingMessage represents a message queued for sending.
type PendingMessage struct {
	ID           string
	Recipient    string
	Content      string
	ReplyContext *ReplyContext
	CreatedAt    time.Time
	RetryCount   int
	MaxRetries   int
	LastAttempt  *time.Time
	Status       PendingStatus
	LastError    string
	TxID         string
}

// DiscoveredKey holds a public key discovered from on-chain data.
type DiscoveredKey struct {
	PublicKey         [KeySize]byte
	IsVerified        bool
	Address           string
	DiscoveredInTx    string
	DiscoveredAtRound uint64
	DiscoveredAt      *time.Time
}

// SendResult contains the result of sending a message.
type SendResult struct {
	TxID           string
	Message        Message
	ConfirmedRound uint64
	Fee            uint64
}

// SendOptions controls how a message is sent.
type SendOptions struct {
	WaitForConfirmation bool
	Timeout             uint64 // rounds
	WaitForIndexer      bool
	IndexerTimeout      time.Duration
	ReplyContext        *ReplyContext
	Amount              uint64 // microAlgos
}

// DefaultSendOptions returns fire-and-forget send options.
func DefaultSendOptions() SendOptions {
	return SendOptions{Timeout: 10, IndexerTimeout: 30 * time.Second}
}

// ConfirmedSendOptions returns options that wait for confirmation.
func ConfirmedSendOptions() SendOptions {
	o := DefaultSendOptions()
	o.WaitForConfirmation = true
	return o
}

// IndexedSendOptions returns options that wait for both confirmation and indexer.
func IndexedSendOptions() SendOptions {
	o := ConfirmedSendOptions()
	o.WaitForIndexer = true
	return o
}

// Conversation manages messages with another participant.
type Conversation struct {
	mu                   sync.RWMutex
	Participant          string
	ParticipantPublicKey *[KeySize]byte
	messages             []Message
	LastFetchedRound     uint64
}

// NewConversation creates a new conversation with the given participant.
func NewConversation(participant string) *Conversation {
	return &Conversation{Participant: participant}
}

// Messages returns a copy of all messages sorted chronologically.
func (c *Conversation) Messages() []Message {
	c.mu.RLock()
	defer c.mu.RUnlock()
	msgs := make([]Message, len(c.messages))
	copy(msgs, c.messages)
	return msgs
}

// MessageCount returns the total number of messages.
func (c *Conversation) MessageCount() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return len(c.messages)
}

// IsEmpty returns true if the conversation has no messages.
func (c *Conversation) IsEmpty() bool {
	return c.MessageCount() == 0
}

// LastMessage returns the most recent message, or nil if empty.
func (c *Conversation) LastMessage() *Message {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if len(c.messages) == 0 {
		return nil
	}
	m := c.messages[len(c.messages)-1]
	return &m
}

// LastReceived returns the most recent received message, or nil.
func (c *Conversation) LastReceived() *Message {
	c.mu.RLock()
	defer c.mu.RUnlock()
	for i := len(c.messages) - 1; i >= 0; i-- {
		if c.messages[i].Direction == DirectionReceived {
			m := c.messages[i]
			return &m
		}
	}
	return nil
}

// LastSent returns the most recent sent message, or nil.
func (c *Conversation) LastSent() *Message {
	c.mu.RLock()
	defer c.mu.RUnlock()
	for i := len(c.messages) - 1; i >= 0; i-- {
		if c.messages[i].Direction == DirectionSent {
			m := c.messages[i]
			return &m
		}
	}
	return nil
}

// Append adds a message to the conversation. Returns false if the message already exists.
func (c *Conversation) Append(msg Message) bool {
	c.mu.Lock()
	defer c.mu.Unlock()

	for _, m := range c.messages {
		if m.ID == msg.ID {
			return false
		}
	}

	c.messages = append(c.messages, msg)
	sort.Slice(c.messages, func(i, j int) bool {
		return c.messages[i].Timestamp.Before(c.messages[j].Timestamp)
	})
	return true
}

// Merge adds multiple messages, ignoring duplicates. Returns number of new messages added.
func (c *Conversation) Merge(msgs []Message) int {
	c.mu.Lock()
	defer c.mu.Unlock()

	existing := make(map[string]bool, len(c.messages))
	for _, m := range c.messages {
		existing[m.ID] = true
	}

	added := 0
	for _, msg := range msgs {
		if !existing[msg.ID] {
			c.messages = append(c.messages, msg)
			existing[msg.ID] = true
			added++
		}
	}

	if added > 0 {
		sort.Slice(c.messages, func(i, j int) bool {
			return c.messages[i].Timestamp.Before(c.messages[j].Timestamp)
		})
	}
	return added
}

// HasMessage checks if a message with the given ID exists.
func (c *Conversation) HasMessage(id string) bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	for _, m := range c.messages {
		if m.ID == id {
			return true
		}
	}
	return false
}

// GetMessage returns a message by ID, or nil if not found.
func (c *Conversation) GetMessage(id string) *Message {
	c.mu.RLock()
	defer c.mu.RUnlock()
	for _, m := range c.messages {
		if m.ID == id {
			return &m
		}
	}
	return nil
}

// MessagesAfterRound returns messages after the given round.
func (c *Conversation) MessagesAfterRound(round uint64) []Message {
	c.mu.RLock()
	defer c.mu.RUnlock()
	var result []Message
	for _, m := range c.messages {
		if m.ConfirmedRound > round {
			result = append(result, m)
		}
	}
	return result
}

// MessagesInDirection returns messages matching the given direction.
func (c *Conversation) MessagesInDirection(dir MessageDirection) []Message {
	c.mu.RLock()
	defer c.mu.RUnlock()
	var result []Message
	for _, m := range c.messages {
		if m.Direction == dir {
			result = append(result, m)
		}
	}
	return result
}

// HighestRound returns the highest confirmed round across all messages.
func (c *Conversation) HighestRound() uint64 {
	c.mu.RLock()
	defer c.mu.RUnlock()
	var max uint64
	for _, m := range c.messages {
		if m.ConfirmedRound > max {
			max = m.ConfirmedRound
		}
	}
	return max
}

// Clear removes all messages from the conversation.
func (c *Conversation) Clear() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.messages = nil
}
