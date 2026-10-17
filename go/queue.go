package algochat

import (
	"errors"
	"fmt"
	"sync"
	"time"
)

var ErrQueueFull = errors.New("send queue is full")

// SendQueue manages offline message queuing and retry logic.
type SendQueue struct {
	mu           sync.Mutex
	messages     []PendingMessage
	maxQueueSize int
	idCounter    int
}

// NewSendQueue creates a new send queue with the given maximum size.
func NewSendQueue(maxQueueSize int) *SendQueue {
	if maxQueueSize <= 0 {
		maxQueueSize = 100
	}
	return &SendQueue{
		maxQueueSize: maxQueueSize,
	}
}

// Enqueue adds a message to the queue. Returns the pending message ID.
func (q *SendQueue) Enqueue(recipient, content string, replyContext *ReplyContext, maxRetries int) (PendingMessage, error) {
	q.mu.Lock()
	defer q.mu.Unlock()

	if len(q.messages) >= q.maxQueueSize {
		return PendingMessage{}, ErrQueueFull
	}

	if maxRetries <= 0 {
		maxRetries = 3
	}

	q.idCounter++
	msg := PendingMessage{
		ID:           fmt.Sprintf("pending-%d", q.idCounter),
		Recipient:    recipient,
		Content:      content,
		ReplyContext:  replyContext,
		CreatedAt:    time.Now(),
		MaxRetries:   maxRetries,
		Status:       StatusPending,
	}

	q.messages = append(q.messages, msg)
	return msg, nil
}

// Dequeue returns the next pending message, or nil if none available.
func (q *SendQueue) Dequeue() *PendingMessage {
	q.mu.Lock()
	defer q.mu.Unlock()

	for i := range q.messages {
		if q.messages[i].Status == StatusPending {
			return &q.messages[i]
		}
	}
	return nil
}

// Get returns a message by ID, or nil if not found.
func (q *SendQueue) Get(id string) *PendingMessage {
	q.mu.Lock()
	defer q.mu.Unlock()

	for i := range q.messages {
		if q.messages[i].ID == id {
			return &q.messages[i]
		}
	}
	return nil
}

// MarkSending marks a message as currently being sent.
func (q *SendQueue) MarkSending(id string) {
	q.mu.Lock()
	defer q.mu.Unlock()

	for i := range q.messages {
		if q.messages[i].ID == id {
			q.messages[i].Status = StatusSending
			now := time.Now()
			q.messages[i].LastAttempt = &now
			q.messages[i].RetryCount++
			return
		}
	}
}

// MarkSent marks a message as successfully sent.
func (q *SendQueue) MarkSent(id, txid string) {
	q.mu.Lock()
	defer q.mu.Unlock()

	for i := range q.messages {
		if q.messages[i].ID == id {
			q.messages[i].Status = StatusSent
			q.messages[i].TxID = txid
			q.messages[i].LastError = ""
			return
		}
	}
}

// MarkFailed marks a message as failed. If max retries exceeded, it stays failed;
// otherwise it goes back to pending for retry.
func (q *SendQueue) MarkFailed(id, errMsg string) {
	q.mu.Lock()
	defer q.mu.Unlock()

	for i := range q.messages {
		if q.messages[i].ID == id {
			q.messages[i].LastError = errMsg
			if q.messages[i].RetryCount >= q.messages[i].MaxRetries {
				q.messages[i].Status = StatusFailed
			} else {
				q.messages[i].Status = StatusPending
			}
			return
		}
	}
}

// Remove removes a message from the queue. Returns true if removed.
func (q *SendQueue) Remove(id string) bool {
	q.mu.Lock()
	defer q.mu.Unlock()

	for i := range q.messages {
		if q.messages[i].ID == id {
			q.messages = append(q.messages[:i], q.messages[i+1:]...)
			return true
		}
	}
	return false
}

// PurgeSent removes all sent messages. Returns the number removed.
func (q *SendQueue) PurgeSent() int {
	q.mu.Lock()
	defer q.mu.Unlock()

	before := len(q.messages)
	filtered := q.messages[:0]
	for _, m := range q.messages {
		if m.Status != StatusSent {
			filtered = append(filtered, m)
		}
	}
	q.messages = filtered
	return before - len(q.messages)
}

// PurgeFailed removes all failed messages. Returns the number removed.
func (q *SendQueue) PurgeFailed() int {
	q.mu.Lock()
	defer q.mu.Unlock()

	before := len(q.messages)
	filtered := q.messages[:0]
	for _, m := range q.messages {
		if m.Status != StatusFailed {
			filtered = append(filtered, m)
		}
	}
	q.messages = filtered
	return before - len(q.messages)
}

// RetryFailed resets all failed messages back to pending. Returns the count reset.
func (q *SendQueue) RetryFailed() int {
	q.mu.Lock()
	defer q.mu.Unlock()

	count := 0
	for i := range q.messages {
		if q.messages[i].Status == StatusFailed && q.messages[i].RetryCount < q.messages[i].MaxRetries {
			q.messages[i].Status = StatusPending
			count++
		}
	}
	return count
}

// Clear removes all messages from the queue.
func (q *SendQueue) Clear() {
	q.mu.Lock()
	defer q.mu.Unlock()
	q.messages = nil
}

// Size returns the total number of messages in the queue.
func (q *SendQueue) Size() int {
	q.mu.Lock()
	defer q.mu.Unlock()
	return len(q.messages)
}

// QueuedCount returns the number of pending messages.
func (q *SendQueue) QueuedCount() int {
	q.mu.Lock()
	defer q.mu.Unlock()
	count := 0
	for _, m := range q.messages {
		if m.Status == StatusPending {
			count++
		}
	}
	return count
}

// HasPending returns true if there are messages to process.
func (q *SendQueue) HasPending() bool {
	q.mu.Lock()
	defer q.mu.Unlock()
	for _, m := range q.messages {
		if m.Status == StatusPending || m.Status == StatusSending {
			return true
		}
	}
	return false
}

// IsEmpty returns true if the queue has no messages.
func (q *SendQueue) IsEmpty() bool {
	return q.Size() == 0
}

// IsFull returns true if the queue is at capacity.
func (q *SendQueue) IsFull() bool {
	q.mu.Lock()
	defer q.mu.Unlock()
	return len(q.messages) >= q.maxQueueSize
}

// All returns a copy of all messages.
func (q *SendQueue) All() []PendingMessage {
	q.mu.Lock()
	defer q.mu.Unlock()
	result := make([]PendingMessage, len(q.messages))
	copy(result, q.messages)
	return result
}
