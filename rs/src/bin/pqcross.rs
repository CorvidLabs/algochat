//! LocalNet mesh tool. One JSON object per stdin line.

use std::io::{self, BufRead, Write};

use algochat::{
    accept_pq_handshake, decrypt_pq_message, derive_keys_from_seed, derive_mlkem768, encrypt_pq_message,
    initiate_pq_handshake, open_pq_handshake_as_sender,
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
        "write" => write_note(field(req, "aliceSeed")?, field(req, "bobSeed")?, field(req, "text")?),
        "read" => read_note(
            field(req, "aliceSeed")?,
            field(req, "bobSeed")?,
            &hex_bytes(&field(req, "handshake")?)?,
            &hex_bytes(&field(req, "message")?)?,
            field(req, "text")?,
        ),
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
    let (note, session) = initiate_pq_handshake(&alice, &bob).map_err(|error| error.to_string())?;
    let message = encrypt_pq_message(&text, &session).map_err(|error| error.to_string())?;
    Ok(json!({
        "handshake": hex::encode(note),
        "message": hex::encode(message),
        "sessionKey": hex::encode(session.session_key),
    }))
}

fn read_note(alice_hex: String, bob_hex: String, handshake: &[u8], message: &[u8], text: String) -> Result<Value, String> {
    let alice = hex_bytes(&alice_hex)?;
    let bob = hex_bytes(&bob_hex)?;
    let session = accept_pq_handshake(handshake, &bob).map_err(|error| error.to_string())?;
    let opened = decrypt_pq_message(message, &session).map_err(|error| error.to_string())?;
    let sender = open_pq_handshake_as_sender(handshake, &alice).map_err(|error| error.to_string())?;
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
