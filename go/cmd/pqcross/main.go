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
	Handshake string   `json:"handshake"`
	Message   string   `json:"message"`
	Note      string   `json:"note"`
	PSK       string   `json:"psk"`
	Counter   uint32   `json:"counter"`
	Texts     []string `json:"texts"`
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
	note, session, err := algochat.InitiatePQHandshake(alice, bob.PublicKey, dk.EncapsulationKey().Bytes())
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
