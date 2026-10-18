//! LocalNet mesh tool. One JSON object per stdin line.

use std::io::{self, BufRead, Write};

use algochat::{
    accept_pq_handshake, decrypt_message, decrypt_pq_message, decrypt_psk_message,
    derive_group_message_key, derive_keys_from_seed, derive_mlkem768, encode_psk_envelope,
    encrypt_message, encrypt_pq_message, encrypt_psk_message, initiate_pq_handshake,
    open_group_membership, open_group_message, open_pq_handshake_as_sender, seal_group_membership,
    seal_group_message, GroupMembership, PqSession,
};
use serde_json::{json, Value};

fn main() {
    let stdin = io::stdin();
    for line in stdin.lock().lines() {
        let line = match line {
            Ok(line) => line,
            Err(error) => {
                reply(json!({"id": 0, "ok": false, "error": error.to_string()}));
                continue;
            }
        };
        if line.trim().is_empty() {
            continue;
        }
        let req: Value = match serde_json::from_str(&line) {
            Ok(value) => value,
            Err(error) => {
                reply(json!({"id": 0, "ok": false, "error": error.to_string()}));
                continue;
            }
        };
        let id = req.get("id").and_then(|value| value.as_i64()).unwrap_or(0);
        match dispatch(&req) {
            Ok(mut body) => {
                body["id"] = json!(id);
                body["ok"] = json!(true);
                reply(body);
            }
            Err(error) => reply(json!({"id": id, "ok": false, "error": error})),
        }
    }
}

fn dispatch(req: &Value) -> Result<Value, String> {
    let op = req.get("op").and_then(|value| value.as_str()).unwrap_or("");
    match op {
        "identity" => identity(field(req, "seed")?),
        "write" => write_note(
            field(req, "aliceSeed")?,
            field(req, "bobSeed")?,
            field(req, "text")?,
        ),
        "read" => read_note(
            field(req, "aliceSeed")?,
            field(req, "bobSeed")?,
            &hex_bytes(&field(req, "handshake")?)?,
            &hex_bytes(&field(req, "message")?)?,
            field(req, "text")?,
        ),
        "write01" => write_classical(req, false),
        "read01" => read_classical(req, false),
        "write02" => write_classical(req, true),
        "read02" => read_classical(req, true),
        "write05s" => write_many(req),
        "groupSeal" => group_seal(req),
        "groupOpen" => group_open(req),
        "groupWrite" => group_write(req),
        "groupRead" => group_read(req),
        _ => Err(format!("unknown op {op}")),
    }
}

fn identity(seed_hex: String) -> Result<Value, String> {
    let seed = hex_bytes(&seed_hex)?;
    let (_, public) = derive_keys_from_seed(&seed).map_err(|error| error.to_string())?;
    let kem = derive_mlkem768(&seed).map_err(|error| error.to_string())?;
    Ok(json!({
        "x25519": hex::encode(public.as_bytes()),
        "encapsKey": hex::encode(kem.encaps_key),
    }))
}

fn write_note(alice_hex: String, bob_hex: String, text: String) -> Result<Value, String> {
    let alice = hex_bytes(&alice_hex)?;
    let bob = hex_bytes(&bob_hex)?;
    let kem = derive_mlkem768(&bob).map_err(|error| error.to_string())?;
    let (_, bob_pub) = derive_keys_from_seed(&bob).map_err(|error| error.to_string())?;
    let (note, session) = initiate_pq_handshake(&alice, bob_pub.as_bytes(), &kem.encaps_key)
        .map_err(|error| error.to_string())?;
    let message = encrypt_pq_message(&text, &session).map_err(|error| error.to_string())?;
    Ok(json!({
        "handshake": hex::encode(note),
        "message": hex::encode(message),
        "sessionKey": hex::encode(session.session_key),
    }))
}

fn read_note(
    alice_hex: String,
    bob_hex: String,
    handshake: &[u8],
    message: &[u8],
    text: String,
) -> Result<Value, String> {
    let alice = hex_bytes(&alice_hex)?;
    let bob = hex_bytes(&bob_hex)?;
    let session = accept_pq_handshake(handshake, &bob).map_err(|error| error.to_string())?;
    let opened = decrypt_pq_message(message, &session).map_err(|error| error.to_string())?;
    let sender =
        open_pq_handshake_as_sender(handshake, &alice).map_err(|error| error.to_string())?;
    let sender_plain = decrypt_pq_message(message, &sender).map_err(|error| error.to_string())?;
    if opened != text || sender_plain != text {
        return Err(format!("plaintext {opened} / {sender_plain}"));
    }
    if session.session_key != sender.session_key {
        return Err("sender and recipient session keys differ".into());
    }
    Ok(json!({
        "sessionKey": hex::encode(session.session_key),
        "recipient": opened,
        "sender": sender_plain,
    }))
}

fn write_classical(req: &Value, extra: bool) -> Result<Value, String> {
    let alice_seed = hex_bytes(&field(req, "aliceSeed")?)?;
    let bob_seed = hex_bytes(&field(req, "bobSeed")?)?;
    let text = field(req, "text")?;
    let (alice_private, alice_public) =
        derive_keys_from_seed(&alice_seed).map_err(|error| error.to_string())?;
    let (_, bob_public) = derive_keys_from_seed(&bob_seed).map_err(|error| error.to_string())?;
    let note = if extra {
        let psk = hex_bytes(&field(req, "psk")?)?;
        let counter = req
            .get("counter")
            .and_then(|value| value.as_u64())
            .unwrap_or(0) as u32;
        let envelope = encrypt_psk_message(
            &text,
            &alice_private,
            &alice_public,
            &bob_public,
            &psk,
            counter,
        )
        .map_err(|error| error.to_string())?;
        encode_psk_envelope(&envelope)
    } else {
        encrypt_message(&text, &alice_private, &alice_public, &bob_public)
            .map_err(|error| error.to_string())?
            .encode()
    };
    Ok(json!({ "note": hex::encode(note) }))
}

fn read_classical(req: &Value, extra: bool) -> Result<Value, String> {
    let alice_seed = hex_bytes(&field(req, "aliceSeed")?)?;
    let bob_seed = hex_bytes(&field(req, "bobSeed")?)?;
    let text = field(req, "text")?;
    let note = hex_bytes(&field(req, "note")?)?;
    let (alice_private, alice_public) =
        derive_keys_from_seed(&alice_seed).map_err(|error| error.to_string())?;
    let (bob_private, bob_public) =
        derive_keys_from_seed(&bob_seed).map_err(|error| error.to_string())?;
    let (recipient, sender) = if extra {
        let psk = hex_bytes(&field(req, "psk")?)?;
        let envelope = algochat::decode_psk_envelope(&note).map_err(|error| error.to_string())?;
        let recipient = decrypt_psk_message(&envelope, &bob_private, &bob_public, &psk)
            .map_err(|error| error.to_string())?;
        let sender = decrypt_psk_message(&envelope, &alice_private, &alice_public, &psk)
            .map_err(|error| error.to_string())?;
        (recipient, sender)
    } else {
        let envelope = algochat::ChatEnvelope::decode(&note).map_err(|error| error.to_string())?;
        let recipient = decrypt_message(&envelope, &bob_private, &bob_public)
            .map_err(|error| error.to_string())?
            .ok_or("bob saw a key publish")?
            .text;
        let sender = decrypt_message(&envelope, &alice_private, &alice_public)
            .map_err(|error| error.to_string())?
            .ok_or("alice saw a key publish")?
            .text;
        (recipient, sender)
    };
    if recipient != text || sender != text {
        return Err(format!("plaintext {recipient} / {sender}"));
    }
    Ok(json!({ "recipient": recipient, "sender": sender }))
}

fn write_many(req: &Value) -> Result<Value, String> {
    let alice_seed = hex_bytes(&field(req, "aliceSeed")?)?;
    let bob_seed = hex_bytes(&field(req, "bobSeed")?)?;
    let texts = req
        .get("texts")
        .and_then(|value| value.as_array())
        .ok_or("missing texts")?;
    let kem = derive_mlkem768(&bob_seed).map_err(|error| error.to_string())?;
    let (_, bob_pub) = derive_keys_from_seed(&bob_seed).map_err(|error| error.to_string())?;
    let (note, session) = initiate_pq_handshake(&alice_seed, bob_pub.as_bytes(), &kem.encaps_key)
        .map_err(|error| error.to_string())?;
    let mut messages = Vec::new();
    for text in texts {
        let text = text.as_str().ok_or("text")?;
        let message = encrypt_pq_message(text, &session).map_err(|error| error.to_string())?;
        messages.push(hex::encode(message));
    }
    Ok(json!({
        "handshake": hex::encode(note),
        "messages": messages,
        "sessionKey": hex::encode(session.session_key),
    }))
}

fn group_session(req: &Value) -> Result<PqSession, String> {
    Ok(PqSession {
        session_key: bytes32(req, "sessionKey")?,
        sender_public: bytes32(req, "senderPublicKey")?,
        recipient_public: [0u8; 32],
        handshake_id: bytes32(req, "handshakeId")?,
    })
}

fn group_seal(req: &Value) -> Result<Value, String> {
    let membership = GroupMembership {
        action: u8_field(req, "action")?,
        epoch: u32_field(req, "epoch")?,
        group_id: bytes32(req, "groupId")?,
        mailbox: bytes32(req, "mailbox")?,
        group_key: bytes32(req, "groupKey")?,
    };
    let note = seal_group_membership(&group_session(req)?, &membership, &bytes12(req, "nonce")?)
        .map_err(|error| error.to_string())?;
    Ok(json!({ "note": hex::encode(note) }))
}

fn group_open(req: &Value) -> Result<Value, String> {
    let note = hex_bytes(&field(req, "note")?)?;
    let opened =
        open_group_membership(&note, &group_session(req)?).map_err(|error| error.to_string())?;
    Ok(json!({
        "action": opened.action,
        "epoch": opened.epoch,
        "groupId": hex::encode(opened.group_id),
        "mailbox": hex::encode(opened.mailbox),
        "groupKey": hex::encode(opened.group_key),
    }))
}

fn group_write(req: &Value) -> Result<Value, String> {
    let group_key = bytes32(req, "groupKey")?;
    let group_id = bytes32(req, "groupId")?;
    let epoch = u32_field(req, "epoch")?;
    let counter = u32_field(req, "counter")?;
    let sender = bytes32(req, "senderAddress")?;
    let text = field(req, "text")?;
    let nonce = bytes12(req, "nonce")?;
    let note = seal_group_message(
        text.as_bytes(),
        &group_key,
        &group_id,
        epoch,
        counter,
        &sender,
        &nonce,
    )
    .map_err(|error| error.to_string())?;
    let message_key = derive_group_message_key(&group_key, epoch, counter, &group_id, &sender)
        .map_err(|error| error.to_string())?;
    Ok(json!({
        "note": hex::encode(note),
        "messageKey": hex::encode(message_key),
    }))
}

fn group_read(req: &Value) -> Result<Value, String> {
    let note = hex_bytes(&field(req, "note")?)?;
    let group_key = bytes32(req, "groupKey")?;
    let sender = bytes32(req, "senderAddress")?;
    let opened = open_group_message(&note, &group_key, &sender, &seen_pairs(req)?)
        .map_err(|error| error.to_string())?;
    let text = String::from_utf8(opened.plaintext).map_err(|error| error.to_string())?;
    let expected = field(req, "text")?;
    if text != expected {
        return Err(format!("plaintext {text}"));
    }
    Ok(json!({
        "text": text,
        "epoch": opened.epoch,
        "counter": opened.counter,
        "groupId": hex::encode(opened.group_id),
    }))
}

fn seen_pairs(req: &Value) -> Result<Vec<(u32, u32)>, String> {
    let Some(value) = req.get("seen") else {
        return Ok(Vec::new());
    };
    if value.is_null() {
        return Ok(Vec::new());
    }
    let items = value.as_array().ok_or("bad seen")?;
    let mut pairs = Vec::with_capacity(items.len());
    for item in items {
        let epoch = item
            .get("epoch")
            .and_then(|entry| entry.as_u64())
            .ok_or("bad seen")?;
        let counter = item
            .get("counter")
            .and_then(|entry| entry.as_u64())
            .ok_or("bad seen")?;
        pairs.push((
            u32::try_from(epoch).map_err(|_| "bad seen".to_string())?,
            u32::try_from(counter).map_err(|_| "bad seen".to_string())?,
        ));
    }
    Ok(pairs)
}

fn u32_field(req: &Value, name: &str) -> Result<u32, String> {
    let value = req.get(name).ok_or_else(|| format!("missing {name}"))?;
    let number = value.as_u64().ok_or_else(|| format!("bad {name}"))?;
    u32::try_from(number).map_err(|_| format!("bad {name}"))
}

fn u8_field(req: &Value, name: &str) -> Result<u8, String> {
    let number = u32_field(req, name)?;
    u8::try_from(number).map_err(|_| format!("bad {name}"))
}

fn bytes32(req: &Value, name: &str) -> Result<[u8; 32], String> {
    let raw = hex_bytes(&field(req, name)?)?;
    raw.as_slice().try_into().map_err(|_| format!("bad {name}"))
}

fn bytes12(req: &Value, name: &str) -> Result<[u8; 12], String> {
    let raw = hex_bytes(&field(req, name)?)?;
    raw.as_slice().try_into().map_err(|_| format!("bad {name}"))
}

fn field(req: &Value, name: &str) -> Result<String, String> {
    req.get(name)
        .and_then(|value| value.as_str())
        .map(|value| value.to_string())
        .ok_or_else(|| format!("missing {name}"))
}

fn hex_bytes(text: &str) -> Result<Vec<u8>, String> {
    hex::decode(text).map_err(|error| error.to_string())
}

fn reply(body: Value) {
    let mut out = io::stdout().lock();
    let _ = writeln!(out, "{body}");
    let _ = out.flush();
}
