package algochat

import (
	"testing"
	"time"
)

func TestConversationNew(t *testing.T) {
	c := NewConversation("ALICE123")
	if c.Participant != "ALICE123" {
		t.Errorf("expected ALICE123, got %s", c.Participant)
	}
	if !c.IsEmpty() {
		t.Error("new conversation should be empty")
	}
	if c.MessageCount() != 0 {
		t.Errorf("expected 0 messages, got %d", c.MessageCount())
	}
}

func TestConversationAppend(t *testing.T) {
	c := NewConversation("ALICE123")

	msg := Message{
		ID:        "tx1",
		Sender:    "BOB",
		Recipient: "ALICE123",
		Content:   "Hello",
		Timestamp: time.Now(),
		Direction: DirectionReceived,
	}

	added := c.Append(msg)
	if !added {
		t.Error("first append should return true")
	}
	if c.MessageCount() != 1 {
		t.Errorf("expected 1 message, got %d", c.MessageCount())
	}

	// Duplicate should be rejected
	added = c.Append(msg)
	if added {
		t.Error("duplicate append should return false")
	}
	if c.MessageCount() != 1 {
		t.Errorf("expected 1 message after dup, got %d", c.MessageCount())
	}
}

func TestConversationMerge(t *testing.T) {
	c := NewConversation("ALICE123")

	now := time.Now()
	msgs := []Message{
		{ID: "tx1", Timestamp: now.Add(-2 * time.Minute), Direction: DirectionReceived, Content: "first"},
		{ID: "tx2", Timestamp: now.Add(-1 * time.Minute), Direction: DirectionSent, Content: "second"},
		{ID: "tx3", Timestamp: now, Direction: DirectionReceived, Content: "third"},
	}

	added := c.Merge(msgs)
	if added != 3 {
		t.Errorf("expected 3 added, got %d", added)
	}

	// Merge with overlap
	moreMsgs := []Message{
		{ID: "tx2", Content: "dup"},
		{ID: "tx4", Timestamp: now.Add(1 * time.Minute), Direction: DirectionSent, Content: "fourth"},
	}
	added = c.Merge(moreMsgs)
	if added != 1 {
		t.Errorf("expected 1 new, got %d", added)
	}
	if c.MessageCount() != 4 {
		t.Errorf("expected 4 messages, got %d", c.MessageCount())
	}
}

func TestConversationOrdering(t *testing.T) {
	c := NewConversation("ALICE123")

	now := time.Now()
	// Add out of order
	c.Append(Message{ID: "tx3", Timestamp: now.Add(2 * time.Minute), Content: "third"})
	c.Append(Message{ID: "tx1", Timestamp: now, Content: "first"})
	c.Append(Message{ID: "tx2", Timestamp: now.Add(1 * time.Minute), Content: "second"})

	msgs := c.Messages()
	if msgs[0].Content != "first" || msgs[1].Content != "second" || msgs[2].Content != "third" {
		t.Error("messages should be sorted chronologically")
	}
}

func TestConversationLastMessage(t *testing.T) {
	c := NewConversation("ALICE123")

	if c.LastMessage() != nil {
		t.Error("empty conversation should have nil last message")
	}

	now := time.Now()
	c.Append(Message{ID: "tx1", Timestamp: now, Content: "first", Direction: DirectionReceived})
	c.Append(Message{ID: "tx2", Timestamp: now.Add(time.Minute), Content: "second", Direction: DirectionSent})

	last := c.LastMessage()
	if last == nil || last.Content != "second" {
		t.Error("last message should be 'second'")
	}
}

func TestConversationLastReceivedSent(t *testing.T) {
	c := NewConversation("ALICE123")

	if c.LastReceived() != nil {
		t.Error("empty conversation should have nil last received")
	}
	if c.LastSent() != nil {
		t.Error("empty conversation should have nil last sent")
	}

	now := time.Now()
	c.Append(Message{ID: "tx1", Timestamp: now, Content: "recv1", Direction: DirectionReceived})
	c.Append(Message{ID: "tx2", Timestamp: now.Add(time.Minute), Content: "sent1", Direction: DirectionSent})
	c.Append(Message{ID: "tx3", Timestamp: now.Add(2 * time.Minute), Content: "recv2", Direction: DirectionReceived})

	lastRecv := c.LastReceived()
	if lastRecv == nil || lastRecv.Content != "recv2" {
		t.Error("last received should be 'recv2'")
	}

	lastSent := c.LastSent()
	if lastSent == nil || lastSent.Content != "sent1" {
		t.Error("last sent should be 'sent1'")
	}
}

func TestConversationHasMessage(t *testing.T) {
	c := NewConversation("ALICE123")
	c.Append(Message{ID: "tx1", Timestamp: time.Now()})

	if !c.HasMessage("tx1") {
		t.Error("should find tx1")
	}
	if c.HasMessage("tx999") {
		t.Error("should not find tx999")
	}
}

func TestConversationGetMessage(t *testing.T) {
	c := NewConversation("ALICE123")
	c.Append(Message{ID: "tx1", Content: "hello", Timestamp: time.Now()})

	msg := c.GetMessage("tx1")
	if msg == nil || msg.Content != "hello" {
		t.Error("GetMessage should return the message")
	}
	if c.GetMessage("tx999") != nil {
		t.Error("GetMessage should return nil for nonexistent")
	}
}

func TestConversationMessagesAfterRound(t *testing.T) {
	c := NewConversation("ALICE123")
	now := time.Now()

	c.Merge([]Message{
		{ID: "tx1", Timestamp: now, ConfirmedRound: 100, Content: "a"},
		{ID: "tx2", Timestamp: now.Add(time.Minute), ConfirmedRound: 200, Content: "b"},
		{ID: "tx3", Timestamp: now.Add(2 * time.Minute), ConfirmedRound: 300, Content: "c"},
	})

	msgs := c.MessagesAfterRound(150)
	if len(msgs) != 2 {
		t.Errorf("expected 2 messages after round 150, got %d", len(msgs))
	}
}

func TestConversationMessagesInDirection(t *testing.T) {
	c := NewConversation("ALICE123")
	now := time.Now()

	c.Merge([]Message{
		{ID: "tx1", Timestamp: now, Direction: DirectionSent},
		{ID: "tx2", Timestamp: now.Add(time.Minute), Direction: DirectionReceived},
		{ID: "tx3", Timestamp: now.Add(2 * time.Minute), Direction: DirectionSent},
	})

	sent := c.MessagesInDirection(DirectionSent)
	if len(sent) != 2 {
		t.Errorf("expected 2 sent, got %d", len(sent))
	}
	recv := c.MessagesInDirection(DirectionReceived)
	if len(recv) != 1 {
		t.Errorf("expected 1 received, got %d", len(recv))
	}
}

func TestConversationHighestRound(t *testing.T) {
	c := NewConversation("ALICE123")
	if c.HighestRound() != 0 {
		t.Error("empty conversation should have highest round 0")
	}

	now := time.Now()
	c.Merge([]Message{
		{ID: "tx1", Timestamp: now, ConfirmedRound: 100},
		{ID: "tx2", Timestamp: now.Add(time.Minute), ConfirmedRound: 500},
		{ID: "tx3", Timestamp: now.Add(2 * time.Minute), ConfirmedRound: 300},
	})

	if c.HighestRound() != 500 {
		t.Errorf("expected 500, got %d", c.HighestRound())
	}
}

func TestConversationClear(t *testing.T) {
	c := NewConversation("ALICE123")
	c.Append(Message{ID: "tx1", Timestamp: time.Now()})
	c.Clear()

	if !c.IsEmpty() {
		t.Error("conversation should be empty after clear")
	}
}

func TestSendOptions(t *testing.T) {
	def := DefaultSendOptions()
	if def.WaitForConfirmation {
		t.Error("default should not wait for confirmation")
	}
	if def.Timeout != 10 {
		t.Errorf("default timeout should be 10, got %d", def.Timeout)
	}

	confirmed := ConfirmedSendOptions()
	if !confirmed.WaitForConfirmation {
		t.Error("confirmed should wait for confirmation")
	}
	if confirmed.WaitForIndexer {
		t.Error("confirmed should not wait for indexer")
	}

	indexed := IndexedSendOptions()
	if !indexed.WaitForConfirmation {
		t.Error("indexed should wait for confirmation")
	}
	if !indexed.WaitForIndexer {
		t.Error("indexed should wait for indexer")
	}
}
