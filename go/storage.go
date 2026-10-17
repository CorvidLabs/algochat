package algochat

import (
	"errors"
	"sort"
	"sync"
	"time"
)

var ErrKeyNotFound = errors.New("key not found")

// MessageCache defines the interface for storing and retrieving messages.
type MessageCache interface {
	Store(messages []Message, participant string) error
	Retrieve(participant string, afterRound *uint64) ([]Message, error)
	GetLastSyncRound(participant string) (uint64, bool)
	SetLastSyncRound(round uint64, participant string) error
	GetCachedConversations() ([]string, error)
	Clear() error
	ClearFor(participant string) error
}

// InMemoryMessageCache is an in-memory implementation of MessageCache.
type InMemoryMessageCache struct {
	mu         sync.RWMutex
	messages   map[string][]Message
	syncRounds map[string]uint64
}

// NewInMemoryMessageCache creates a new in-memory message cache.
func NewInMemoryMessageCache() *InMemoryMessageCache {
	return &InMemoryMessageCache{
		messages:   make(map[string][]Message),
		syncRounds: make(map[string]uint64),
	}
}

func (c *InMemoryMessageCache) Store(messages []Message, participant string) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	existing := c.messages[participant]
	existingIDs := make(map[string]bool, len(existing))
	for _, m := range existing {
		existingIDs[m.ID] = true
	}

	for _, msg := range messages {
		if !existingIDs[msg.ID] {
			existing = append(existing, msg)
			existingIDs[msg.ID] = true
		}
	}

	sort.Slice(existing, func(i, j int) bool {
		return existing[i].Timestamp.Before(existing[j].Timestamp)
	})
	c.messages[participant] = existing
	return nil
}

func (c *InMemoryMessageCache) Retrieve(participant string, afterRound *uint64) ([]Message, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	msgs := c.messages[participant]
	if afterRound != nil {
		var filtered []Message
		for _, m := range msgs {
			if m.ConfirmedRound > *afterRound {
				filtered = append(filtered, m)
			}
		}
		return filtered, nil
	}

	result := make([]Message, len(msgs))
	copy(result, msgs)
	return result, nil
}

func (c *InMemoryMessageCache) GetLastSyncRound(participant string) (uint64, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	round, ok := c.syncRounds[participant]
	return round, ok
}

func (c *InMemoryMessageCache) SetLastSyncRound(round uint64, participant string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.syncRounds[participant] = round
	return nil
}

func (c *InMemoryMessageCache) GetCachedConversations() ([]string, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	result := make([]string, 0, len(c.messages))
	for k := range c.messages {
		result = append(result, k)
	}
	return result, nil
}

func (c *InMemoryMessageCache) Clear() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.messages = make(map[string][]Message)
	c.syncRounds = make(map[string]uint64)
	return nil
}

func (c *InMemoryMessageCache) ClearFor(participant string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.messages, participant)
	delete(c.syncRounds, participant)
	return nil
}

// EncryptionKeyStorage defines the interface for storing encryption private keys.
type EncryptionKeyStorage interface {
	Store(privateKey [KeySize]byte, address string) error
	Retrieve(address string) ([KeySize]byte, error)
	HasKey(address string) bool
	Delete(address string) error
	ListAddresses() []string
}

// InMemoryKeyStorage is an in-memory implementation of EncryptionKeyStorage.
type InMemoryKeyStorage struct {
	mu   sync.RWMutex
	keys map[string][KeySize]byte
}

// NewInMemoryKeyStorage creates a new in-memory key storage.
func NewInMemoryKeyStorage() *InMemoryKeyStorage {
	return &InMemoryKeyStorage{
		keys: make(map[string][KeySize]byte),
	}
}

func (s *InMemoryKeyStorage) Store(privateKey [KeySize]byte, address string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.keys[address] = privateKey
	return nil
}

func (s *InMemoryKeyStorage) Retrieve(address string) ([KeySize]byte, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	key, ok := s.keys[address]
	if !ok {
		return [KeySize]byte{}, ErrKeyNotFound
	}
	return key, nil
}

func (s *InMemoryKeyStorage) HasKey(address string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	_, ok := s.keys[address]
	return ok
}

func (s *InMemoryKeyStorage) Delete(address string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.keys, address)
	return nil
}

func (s *InMemoryKeyStorage) ListAddresses() []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]string, 0, len(s.keys))
	for k := range s.keys {
		result = append(result, k)
	}
	return result
}

// PublicKeyCache is an in-memory TTL cache for public keys.
type PublicKeyCache struct {
	mu    sync.RWMutex
	cache map[string]publicKeyCacheEntry
	ttl   time.Duration
}

type publicKeyCacheEntry struct {
	key       [KeySize]byte
	expiresAt time.Time
}

const DefaultPublicKeyTTL = 24 * time.Hour

// NewPublicKeyCache creates a new public key cache with the given TTL.
func NewPublicKeyCache(ttl time.Duration) *PublicKeyCache {
	return &PublicKeyCache{
		cache: make(map[string]publicKeyCacheEntry),
		ttl:   ttl,
	}
}

// Store adds a public key to the cache.
func (c *PublicKeyCache) Store(address string, key [KeySize]byte) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.cache[address] = publicKeyCacheEntry{
		key:       key,
		expiresAt: time.Now().Add(c.ttl),
	}
}

// Retrieve gets a public key from the cache. Returns the key and true if found and not expired.
func (c *PublicKeyCache) Retrieve(address string) ([KeySize]byte, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	entry, ok := c.cache[address]
	if !ok {
		return [KeySize]byte{}, false
	}
	if time.Now().After(entry.expiresAt) {
		delete(c.cache, address)
		return [KeySize]byte{}, false
	}
	return entry.key, true
}

// Invalidate removes a cached key for an address.
func (c *PublicKeyCache) Invalidate(address string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.cache, address)
}

// Clear removes all cached keys.
func (c *PublicKeyCache) Clear() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.cache = make(map[string]publicKeyCacheEntry)
}

// PruneExpired removes all expired entries.
func (c *PublicKeyCache) PruneExpired() {
	c.mu.Lock()
	defer c.mu.Unlock()
	now := time.Now()
	for addr, entry := range c.cache {
		if now.After(entry.expiresAt) {
			delete(c.cache, addr)
		}
	}
}
