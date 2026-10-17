// Command pqcross is the LocalNet mesh tool. One JSON object per stdin line.
package main

import (
	"bufio"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"

	algochat "github.com/CorvidLabs/go-algochat"
)

type request struct {
	ID        int    `json:"id"`
	Op        string `json:"op"`
	Seed      string `json:"seed"`
	AliceSeed string `json:"aliceSeed"`
	BobSeed   string `json:"bobSeed"`
	Text      string `json:"text"`
	Handshake string `json:"handshake"`
	Message   string `json:"message"`
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
	note, session, err := algochat.InitiatePQHandshake(alice, bob.PublicKey, dk.EncapsulationKey().Bytes())
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
	sender, err := algochat.OpenPQHandshakeAsSender(handshake, alice)
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
