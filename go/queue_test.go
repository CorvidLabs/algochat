package algochat

import (
	"testing"
)

func TestSendQueueEnqueue(t *testing.T) {
	q := NewSendQueue(100)

	msg, err := q.Enqueue("ALICE", "hello", nil, 3)
	if err != nil {
		t.Fatalf("Enqueue failed: %v", err)
	}
	if msg.Recipient != "ALICE" {
		t.Errorf("expected ALICE, got %s", msg.Recipient)
	}
	if msg.Status != StatusPending {
		t.Errorf("expected pending, got %s", msg.Status)
	}
	if q.Size() != 1 {
		t.Errorf("expected size 1, got %d", q.Size())
	}
}

func TestSendQueueFull(t *testing.T) {
	q := NewSendQueue(2)

	q.Enqueue("ALICE", "msg1", nil, 3)
	q.Enqueue("BOB", "msg2", nil, 3)
	_, err := q.Enqueue("CHARLIE", "msg3", nil, 3)
	if err != ErrQueueFull {
		t.Errorf("expected ErrQueueFull, got %v", err)
	}
}

func TestSendQueueDequeue(t *testing.T) {
	q := NewSendQueue(100)

	q.Enqueue("ALICE", "first", nil, 3)
	q.Enqueue("BOB", "second", nil, 3)

	msg := q.Dequeue()
	if msg == nil {
		t.Fatal("Dequeue returned nil")
	}
	if msg.Content != "first" {
		t.Errorf("expected 'first', got %q", msg.Content)
	}
}

func TestSendQueueDequeueEmpty(t *testing.T) {
	q := NewSendQueue(100)

	msg := q.Dequeue()
	if msg != nil {
		t.Error("Dequeue on empty queue should return nil")
	}
}

func TestSendQueueGet(t *testing.T) {
	q := NewSendQueue(100)

	enqueued, _ := q.Enqueue("ALICE", "hello", nil, 3)
	got := q.Get(enqueued.ID)
	if got == nil {
		t.Fatal("Get returned nil")
	}
	if got.Content != "hello" {
		t.Errorf("expected 'hello', got %q", got.Content)
	}

	if q.Get("nonexistent") != nil {
		t.Error("Get nonexistent should return nil")
	}
}

func TestSendQueueMarkSending(t *testing.T) {
	q := NewSendQueue(100)

	msg, _ := q.Enqueue("ALICE", "hello", nil, 3)
	q.MarkSending(msg.ID)

	got := q.Get(msg.ID)
	if got.Status != StatusSending {
		t.Errorf("expected sending, got %s", got.Status)
	}
	if got.RetryCount != 1 {
		t.Errorf("expected retry count 1, got %d", got.RetryCount)
	}
	if got.LastAttempt == nil {
		t.Error("last attempt should be set")
	}
}

func TestSendQueueMarkSent(t *testing.T) {
	q := NewSendQueue(100)

	msg, _ := q.Enqueue("ALICE", "hello", nil, 3)
	q.MarkSending(msg.ID)
	q.MarkSent(msg.ID, "TXID123")

	got := q.Get(msg.ID)
	if got.Status != StatusSent {
		t.Errorf("expected sent, got %s", got.Status)
	}
	if got.TxID != "TXID123" {
		t.Errorf("expected TXID123, got %s", got.TxID)
	}
}

func TestSendQueueMarkFailedRetry(t *testing.T) {
	q := NewSendQueue(100)

	msg, _ := q.Enqueue("ALICE", "hello", nil, 3)
	q.MarkSending(msg.ID) // retry_count = 1
	q.MarkFailed(msg.ID, "network error")

	got := q.Get(msg.ID)
	// Should go back to pending (retry count < max retries)
	if got.Status != StatusPending {
		t.Errorf("expected pending (retry), got %s", got.Status)
	}
	if got.LastError != "network error" {
		t.Errorf("expected 'network error', got %q", got.LastError)
	}
}

func TestSendQueueMarkFailedExhausted(t *testing.T) {
	q := NewSendQueue(100)

	msg, _ := q.Enqueue("ALICE", "hello", nil, 1)
	q.MarkSending(msg.ID) // retry_count = 1 (equals max_retries)
	q.MarkFailed(msg.ID, "final error")

	got := q.Get(msg.ID)
	if got.Status != StatusFailed {
		t.Errorf("expected failed (exhausted), got %s", got.Status)
	}
}

func TestSendQueueRemove(t *testing.T) {
	q := NewSendQueue(100)

	msg, _ := q.Enqueue("ALICE", "hello", nil, 3)
	removed := q.Remove(msg.ID)
	if !removed {
		t.Error("Remove should return true")
	}
	if q.Size() != 0 {
		t.Error("queue should be empty after remove")
	}

	removed = q.Remove("nonexistent")
	if removed {
		t.Error("Remove nonexistent should return false")
	}
}

func TestSendQueuePurgeSent(t *testing.T) {
	q := NewSendQueue(100)

	msg1, _ := q.Enqueue("ALICE", "msg1", nil, 3)
	q.Enqueue("BOB", "msg2", nil, 3)

	q.MarkSending(msg1.ID)
	q.MarkSent(msg1.ID, "TX1")

	purged := q.PurgeSent()
	if purged != 1 {
		t.Errorf("expected 1 purged, got %d", purged)
	}
	if q.Size() != 1 {
		t.Errorf("expected 1 remaining, got %d", q.Size())
	}
}

func TestSendQueuePurgeFailed(t *testing.T) {
	q := NewSendQueue(100)

	msg1, _ := q.Enqueue("ALICE", "msg1", nil, 1)
	q.Enqueue("BOB", "msg2", nil, 3)

	q.MarkSending(msg1.ID)
	q.MarkFailed(msg1.ID, "error")

	purged := q.PurgeFailed()
	if purged != 1 {
		t.Errorf("expected 1 purged, got %d", purged)
	}
	if q.Size() != 1 {
		t.Errorf("expected 1 remaining, got %d", q.Size())
	}
}

func TestSendQueueRetryFailed(t *testing.T) {
	q := NewSendQueue(100)

	msg1, _ := q.Enqueue("ALICE", "msg1", nil, 3)
	q.MarkSending(msg1.ID)
	q.MarkFailed(msg1.ID, "error")

	// Make msg1 fail permanently
	msg2, _ := q.Enqueue("BOB", "msg2", nil, 1)
	q.MarkSending(msg2.ID)
	q.MarkFailed(msg2.ID, "error")

	retried := q.RetryFailed()
	// msg1 is already pending (went back via markfailed), msg2 is failed with retries exhausted
	if retried != 0 {
		t.Errorf("expected 0 retried (msg1 already pending, msg2 exhausted), got %d", retried)
	}
}

func TestSendQueueClear(t *testing.T) {
	q := NewSendQueue(100)

	q.Enqueue("ALICE", "msg1", nil, 3)
	q.Enqueue("BOB", "msg2", nil, 3)
	q.Clear()

	if !q.IsEmpty() {
		t.Error("queue should be empty after clear")
	}
}

func TestSendQueueQueuedCount(t *testing.T) {
	q := NewSendQueue(100)

	q.Enqueue("ALICE", "msg1", nil, 3)
	msg2, _ := q.Enqueue("BOB", "msg2", nil, 3)
	q.MarkSending(msg2.ID)

	if q.QueuedCount() != 1 {
		t.Errorf("expected 1 queued, got %d", q.QueuedCount())
	}
}

func TestSendQueueHasPending(t *testing.T) {
	q := NewSendQueue(100)

	if q.HasPending() {
		t.Error("empty queue should not have pending")
	}

	q.Enqueue("ALICE", "msg1", nil, 3)
	if !q.HasPending() {
		t.Error("queue with pending should return true")
	}
}

func TestSendQueueIsFull(t *testing.T) {
	q := NewSendQueue(2)

	if q.IsFull() {
		t.Error("empty queue should not be full")
	}

	q.Enqueue("ALICE", "msg1", nil, 3)
	q.Enqueue("BOB", "msg2", nil, 3)

	if !q.IsFull() {
		t.Error("queue at capacity should be full")
	}
}

func TestSendQueueAll(t *testing.T) {
	q := NewSendQueue(100)

	q.Enqueue("ALICE", "msg1", nil, 3)
	q.Enqueue("BOB", "msg2", nil, 3)

	all := q.All()
	if len(all) != 2 {
		t.Errorf("expected 2 messages, got %d", len(all))
	}
}

func TestSendQueueDefaultMaxRetries(t *testing.T) {
	q := NewSendQueue(100)

	msg, _ := q.Enqueue("ALICE", "hello", nil, 0) // 0 should default to 3
	if msg.MaxRetries != 3 {
		t.Errorf("expected default max retries 3, got %d", msg.MaxRetries)
	}
}

func TestSendQueueWithReplyContext(t *testing.T) {
	q := NewSendQueue(100)

	rc := &ReplyContext{MessageID: "tx1", Preview: "original"}
	msg, _ := q.Enqueue("ALICE", "reply", rc, 3)

	if msg.ReplyContext == nil {
		t.Fatal("reply context should not be nil")
	}
	if msg.ReplyContext.MessageID != "tx1" {
		t.Errorf("expected tx1, got %s", msg.ReplyContext.MessageID)
	}
}

func TestSendQueueDefaultSize(t *testing.T) {
	q := NewSendQueue(0) // 0 should default to 100
	// Should be able to enqueue up to 100
	for i := 0; i < 100; i++ {
		_, err := q.Enqueue("ALICE", "msg", nil, 3)
		if err != nil {
			t.Fatalf("Enqueue %d failed: %v", i, err)
		}
	}
	_, err := q.Enqueue("ALICE", "overflow", nil, 3)
	if err != ErrQueueFull {
		t.Error("101st enqueue should fail")
	}
}
