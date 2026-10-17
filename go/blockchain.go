package algochat

import (
	"errors"
	"fmt"
)

// ErrNoteTooLarge is returned when a note length is outside the allowed range.
var ErrNoteTooLarge = errors.New("note exceeds maximum size")

// noteFeeIncludedBytes is the note prefix that costs one minimum fee.
const noteFeeIncludedBytes = 1024

// PaymentFee returns the microAlgo fee for an allowed note at the given minimum fee.
// The first 1024 bytes cost one minimum fee. Each later byte adds one ten-thousandth
// of the minimum fee, rounded up once. This package has no Falcon signer, so the
// scheme component is one minimum fee.
func PaymentFee(noteBytes int, minFee uint64) (uint64, error) {
	if noteBytes < 0 || noteBytes > MaxNoteSize {
		return 0, fmt.Errorf("%w: %d bytes, max %d", ErrNoteTooLarge, noteBytes, MaxNoteSize)
	}

	over := noteBytes - noteFeeIncludedBytes
	if over < 0 {
		over = 0
	}
	surcharge := (uint64(over)*minFee + 9999) / 10000
	return minFee + surcharge, nil
}

// SuggestedParams contains blockchain transaction parameters.
type SuggestedParams struct {
	Fee         uint64
	MinFee      uint64
	FirstValid  uint64
	LastValid   uint64
	GenesisID   string
	GenesisHash [KeySize]byte
}

// AccountInfo contains basic account information.
type AccountInfo struct {
	Address    string
	Amount     uint64
	MinBalance uint64
}

// TransactionInfo contains transaction confirmation details.
type TransactionInfo struct {
	TxID           string
	ConfirmedRound uint64
}

// NoteTransaction represents a transaction with note data from the indexer.
type NoteTransaction struct {
	TxID           string
	Sender         string
	Receiver       string
	Note           []byte
	ConfirmedRound uint64
	RoundTime      uint64 // Unix timestamp
}

// AlgodClient defines the interface for Algorand node interactions.
type AlgodClient interface {
	GetSuggestedParams() (*SuggestedParams, error)
	GetAccountInfo(address string) (*AccountInfo, error)
	SubmitTransaction(signedTxn []byte) (string, error)
	WaitForConfirmation(txid string, rounds uint64) (*TransactionInfo, error)
	GetCurrentRound() (uint64, error)
}

// IndexerClient defines the interface for Algorand indexer queries.
type IndexerClient interface {
	SearchTransactions(address string, afterRound *uint64, limit *uint32) ([]NoteTransaction, error)
	SearchTransactionsBetween(address1, address2 string, afterRound *uint64, limit *uint32) ([]NoteTransaction, error)
	GetTransaction(txid string) (*NoteTransaction, error)
	WaitForIndexer(txid string, timeoutSecs uint32) (*NoteTransaction, error)
}

// ChatAccount represents an AlgoChat-enabled Algorand account.
type ChatAccount struct {
	Address              string
	Ed25519PublicKey     [Ed25519PublicKeySize]byte
	EncryptionPrivateKey [KeySize]byte
	EncryptionPublicKey  [KeySize]byte
}

// NewChatAccountFromSeed creates a ChatAccount from an Algorand account seed and Ed25519 public key.
func NewChatAccountFromSeed(address string, seed [KeySize]byte, ed25519PubKey [Ed25519PublicKeySize]byte) (*ChatAccount, error) {
	kp, err := DeriveEncryptionKeys(seed)
	if err != nil {
		return nil, err
	}

	return &ChatAccount{
		Address:              address,
		Ed25519PublicKey:     ed25519PubKey,
		EncryptionPrivateKey: kp.PrivateKey,
		EncryptionPublicKey:  kp.PublicKey,
	}, nil
}

// NewChatAccountFromSecretKey creates a ChatAccount from an Algorand secret key (64 bytes: 32-byte seed + 32-byte Ed25519 pubkey).
func NewChatAccountFromSecretKey(address string, secretKey [64]byte) (*ChatAccount, error) {
	var seed [KeySize]byte
	var pubKey [Ed25519PublicKeySize]byte
	copy(seed[:], secretKey[:32])
	copy(pubKey[:], secretKey[32:])

	return NewChatAccountFromSeed(address, seed, pubKey)
}
