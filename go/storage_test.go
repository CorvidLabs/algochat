package algochat

import (
	"testing"
	"time"
)

// --- InMemoryMessageCache Tests ---

func TestMessageCacheStoreRetrieve(t *testing.T) {
	cache := NewInMemoryMessageCache()

	msgs := []Message{
		{ID: "tx1", Timestamp: time.Now(), Content: "hello", ConfirmedRound: 100},
		{ID: "tx2", Timestamp: time.Now().Add(time.Minute), Content: "world", ConfirmedRound: 200},
	}

	err := cache.Store(msgs, "ALICE")
	if err != nil {
		t.Fatalf("Store failed: %v", err)
	}

	retrieved, err := cache.Retrieve("ALICE", nil)
	if err != nil {
		t.Fatalf("Retrieve failed: %v", err)
	}
	if len(retrieved) != 2 {
		t.Errorf("expected 2, got %d", len(retrieved))
	}
}

func TestMessageCacheDedup(t *testing.T) {
	cache := NewInMemoryMessageCache()

	msgs := []Message{
		{ID: "tx1", Timestamp: time.Now(), Content: "hello"},
	}
	cache.Store(msgs, "ALICE")
	cache.Store(msgs, "ALICE") // duplicate

	retrieved, _ := cache.Retrieve("ALICE", nil)
	if len(retrieved) != 1 {
		t.Errorf("expected 1 after dedup, got %d", len(retrieved))
	}
}

func TestMessageCacheAfterRound(t *testing.T) {
	cache := NewInMemoryMessageCache()

	now := time.Now()
	cache.Store([]Message{
		{ID: "tx1", Timestamp: now, ConfirmedRound: 100},
		{ID: "tx2", Timestamp: now.Add(time.Minute), ConfirmedRound: 200},
		{ID: "tx3", Timestamp: now.Add(2 * time.Minute), ConfirmedRound: 300},
	}, "ALICE")

	round := uint64(150)
	retrieved, _ := cache.Retrieve("ALICE", &round)
	if len(retrieved) != 2 {
		t.Errorf("expected 2 after round 150, got %d", len(retrieved))
	}
}

func TestMessageCacheSyncRound(t *testing.T) {
	cache := NewInMemoryMessageCache()

	_, ok := cache.GetLastSyncRound("ALICE")
	if ok {
		t.Error("should not have sync round initially")
	}

	cache.SetLastSyncRound(500, "ALICE")
	round, ok := cache.GetLastSyncRound("ALICE")
	if !ok || round != 500 {
		t.Errorf("expected 500, got %d (ok=%v)", round, ok)
	}
}

func TestMessageCacheConversations(t *testing.T) {
	cache := NewInMemoryMessageCache()

	cache.Store([]Message{{ID: "tx1", Timestamp: time.Now()}}, "ALICE")
	cache.Store([]Message{{ID: "tx2", Timestamp: time.Now()}}, "BOB")

	convos, _ := cache.GetCachedConversations()
	if len(convos) != 2 {
		t.Errorf("expected 2 conversations, got %d", len(convos))
	}
}

func TestMessageCacheClear(t *testing.T) {
	cache := NewInMemoryMessageCache()

	cache.Store([]Message{{ID: "tx1", Timestamp: time.Now()}}, "ALICE")
	cache.SetLastSyncRound(100, "ALICE")
	cache.Clear()

	retrieved, _ := cache.Retrieve("ALICE", nil)
	if len(retrieved) != 0 {
		t.Error("cache should be empty after clear")
	}
	_, ok := cache.GetLastSyncRound("ALICE")
	if ok {
		t.Error("sync round should be cleared")
	}
}

func TestMessageCacheClearFor(t *testing.T) {
	cache := NewInMemoryMessageCache()

	cache.Store([]Message{{ID: "tx1", Timestamp: time.Now()}}, "ALICE")
	cache.Store([]Message{{ID: "tx2", Timestamp: time.Now()}}, "BOB")
	cache.SetLastSyncRound(100, "ALICE")

	cache.ClearFor("ALICE")

	retrieved, _ := cache.Retrieve("ALICE", nil)
	if len(retrieved) != 0 {
		t.Error("ALICE cache should be empty")
	}
	retrieved, _ = cache.Retrieve("BOB", nil)
	if len(retrieved) != 1 {
		t.Error("BOB cache should still have messages")
	}
}

func TestMessageCacheOrdering(t *testing.T) {
	cache := NewInMemoryMessageCache()

	now := time.Now()
	cache.Store([]Message{
		{ID: "tx3", Timestamp: now.Add(2 * time.Minute), Content: "third"},
		{ID: "tx1", Timestamp: now, Content: "first"},
		{ID: "tx2", Timestamp: now.Add(time.Minute), Content: "second"},
	}, "ALICE")

	retrieved, _ := cache.Retrieve("ALICE", nil)
	if retrieved[0].Content != "first" || retrieved[1].Content != "second" || retrieved[2].Content != "third" {
		t.Error("messages should be sorted chronologically")
	}
}

// --- InMemoryKeyStorage Tests ---

func TestKeyStorageStoreRetrieve(t *testing.T) {
	store := NewInMemoryKeyStorage()

	key := [KeySize]byte{1, 2, 3, 4}
	store.Store(key, "ALICE")

	retrieved, err := store.Retrieve("ALICE")
	if err != nil {
		t.Fatalf("Retrieve failed: %v", err)
	}
	if retrieved != key {
		t.Error("retrieved key should match stored key")
	}
}

func TestKeyStorageNotFound(t *testing.T) {
	store := NewInMemoryKeyStorage()

	_, err := store.Retrieve("NOBODY")
	if err != ErrKeyNotFound {
		t.Errorf("expected ErrKeyNotFound, got %v", err)
	}
}

func TestKeyStorageHasKey(t *testing.T) {
	store := NewInMemoryKeyStorage()

	if store.HasKey("ALICE") {
		t.Error("should not have key initially")
	}

	store.Store([KeySize]byte{1}, "ALICE")
	if !store.HasKey("ALICE") {
		t.Error("should have key after store")
	}
}

func TestKeyStorageDelete(t *testing.T) {
	store := NewInMemoryKeyStorage()

	store.Store([KeySize]byte{1}, "ALICE")
	store.Delete("ALICE")

	if store.HasKey("ALICE") {
		t.Error("should not have key after delete")
	}
}

func TestKeyStorageListAddresses(t *testing.T) {
	store := NewInMemoryKeyStorage()

	store.Store([KeySize]byte{1}, "ALICE")
	store.Store([KeySize]byte{2}, "BOB")

	addrs := store.ListAddresses()
	if len(addrs) != 2 {
		t.Errorf("expected 2 addresses, got %d", len(addrs))
	}
}

func TestKeyStorageOverwrite(t *testing.T) {
	store := NewInMemoryKeyStorage()

	store.Store([KeySize]byte{1}, "ALICE")
	store.Store([KeySize]byte{2}, "ALICE")

	key, _ := store.Retrieve("ALICE")
	if key[0] != 2 {
		t.Error("overwritten key should be the latest")
	}
}

// --- PublicKeyCache Tests ---

func TestPublicKeyCacheStoreRetrieve(t *testing.T) {
	cache := NewPublicKeyCache(time.Hour)

	key := [KeySize]byte{1, 2, 3}
	cache.Store("ALICE", key)

	retrieved, ok := cache.Retrieve("ALICE")
	if !ok {
		t.Error("should find cached key")
	}
	if retrieved != key {
		t.Error("retrieved key should match")
	}
}

func TestPublicKeyCacheNotFound(t *testing.T) {
	cache := NewPublicKeyCache(time.Hour)

	_, ok := cache.Retrieve("NOBODY")
	if ok {
		t.Error("should not find uncached key")
	}
}

func TestPublicKeyCacheExpiry(t *testing.T) {
	cache := NewPublicKeyCache(time.Millisecond) // very short TTL

	cache.Store("ALICE", [KeySize]byte{1})
	time.Sleep(5 * time.Millisecond)

	_, ok := cache.Retrieve("ALICE")
	if ok {
		t.Error("expired key should not be retrieved")
	}
}

func TestPublicKeyCacheInvalidate(t *testing.T) {
	cache := NewPublicKeyCache(time.Hour)

	cache.Store("ALICE", [KeySize]byte{1})
	cache.Invalidate("ALICE")

	_, ok := cache.Retrieve("ALICE")
	if ok {
		t.Error("invalidated key should not be retrieved")
	}
}

func TestPublicKeyCacheClear(t *testing.T) {
	cache := NewPublicKeyCache(time.Hour)

	cache.Store("ALICE", [KeySize]byte{1})
	cache.Store("BOB", [KeySize]byte{2})
	cache.Clear()

	_, ok := cache.Retrieve("ALICE")
	if ok {
		t.Error("should be empty after clear")
	}
}

func TestPublicKeyCachePruneExpired(t *testing.T) {
	cache := NewPublicKeyCache(time.Millisecond)

	cache.Store("ALICE", [KeySize]byte{1})
	cache.Store("BOB", [KeySize]byte{2})
	time.Sleep(5 * time.Millisecond)

	// Add fresh entry
	cache2 := NewPublicKeyCache(time.Hour)
	cache2.Store("CHARLIE", [KeySize]byte{3})

	cache.PruneExpired()
	// Expired entries should be gone (we test by trying to retrieve)
	_, ok := cache.Retrieve("ALICE")
	if ok {
		t.Error("pruned key should not be retrieved")
	}
}
