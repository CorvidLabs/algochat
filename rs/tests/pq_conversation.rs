//! REQ-protocol-13 (#70b): Rust reads a long two-way Hybrid conversation that
//! TypeScript wrote.
//!
//! `vectors/pq-conversation-v1.json` is a byte-identical copy of the file that
//! `ts/scripts/emit-conversation-vectors.ts` writes. It ships in the crate, so
//! this test also runs from the package. Every field, handshake, message and
//! case is checked; an unknown field, result or a missing file fails.

use algochat::{
    accept_pq_handshake, decrypt_pq_message, derive_keys_from_seed, derive_mlkem768,
    open_pq_handshake_as_sender, PqSession,
};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};

const FILE: &str = "pq-conversation-v1.json";

const FIELDS: &[&str] = &[
    "description",
    "generated_by",
    "handshake_size",
    "message_header_size",
    "max_plaintext",
    "accounts",
    "handshakes",
    "messages",
    "cases",
];
const ACCOUNT_FIELDS: &[&str] = &["seed", "x25519_public", "encaps_key"];
const HANDSHAKE_FIELDS: &[&str] = &[
    "name",
    "sender",
    "recipient",
    "note",
    "handshake_id",
    "session_key",
];
const MESSAGE_FIELDS: &[&str] = &["index", "handshake", "plaintext", "note"];
const CASE_FIELDS: &[&str] = &["name", "op", "account", "handshake", "note", "expect"];

fn vector() -> Value {
    let path = format!("{}/vectors/{FILE}", env!("CARGO_MANIFEST_DIR"));
    let text = std::fs::read_to_string(&path).unwrap_or_else(|error| {
        panic!("required vector {path} is missing: {error} (copy it with: cp vectors/{FILE} rs/vectors/)")
    });
    serde_json::from_str(&text).unwrap_or_else(|error| panic!("{path}: {error}"))
}

fn keys(object: &Value, expected: &[&str], context: &str) {
    let actual: BTreeSet<&str> = object
        .as_object()
        .unwrap_or_else(|| panic!("{context}: not an object"))
        .keys()
        .map(String::as_str)
        .collect();
    let expected: BTreeSet<&str> = expected.iter().copied().collect();
    assert_eq!(
        actual, expected,
        "{context}: fields differ; check each new field"
    );
}

fn text<'a>(value: &'a Value, context: &str) -> &'a str {
    value
        .as_str()
        .unwrap_or_else(|| panic!("{context}: not a string"))
}

fn bytes(value: &Value, context: &str) -> Vec<u8> {
    hex::decode(text(value, context)).unwrap_or_else(|error| panic!("{context}: {error}"))
}

fn array<'a>(value: &'a Value, context: &str) -> &'a Vec<Value> {
    let items = value
        .as_array()
        .unwrap_or_else(|| panic!("{context}: not an array"));
    assert!(!items.is_empty(), "{context}: empty");
    items
}

struct Handshake {
    sender: String,
    recipient: String,
    note: Vec<u8>,
    handshake_id: Vec<u8>,
    session_key: Vec<u8>,
}

struct Conversation {
    seeds: BTreeMap<String, Vec<u8>>,
    handshakes: BTreeMap<String, Handshake>,
}

impl Conversation {
    fn load(v: &Value) -> Self {
        keys(v, FIELDS, FILE);
        let mut seeds = BTreeMap::new();
        let accounts = v["accounts"].as_object().expect("accounts: not an object");
        let names: BTreeSet<&str> = accounts.keys().map(String::as_str).collect();
        assert_eq!(names, BTreeSet::from(["alice", "bob"]), "accounts");
        // Messages here stay static: they never include an account's name or bytes.
        for (name, account) in accounts {
            keys(account, ACCOUNT_FIELDS, "an account");
            let seed = bytes(&account["seed"], "an account seed");
            let (_, public) = derive_keys_from_seed(&seed).expect("X25519 keys");
            assert_eq!(
                public.as_bytes().to_vec(),
                bytes(&account["x25519_public"], "an account X25519 key"),
                "an account's X25519 key does not come from its seed"
            );
            let mlkem = derive_mlkem768(&seed).expect("ML-KEM keys");
            assert_eq!(
                mlkem.encaps_key,
                bytes(&account["encaps_key"], "an account ML-KEM key"),
                "an account's ML-KEM key does not come from its seed"
            );
            seeds.insert(name.clone(), seed);
        }
        let mut handshakes = BTreeMap::new();
        for item in array(&v["handshakes"], "handshakes") {
            let name = text(&item["name"], "handshake name").to_string();
            keys(item, HANDSHAKE_FIELDS, &name);
            let handshake = Handshake {
                sender: text(&item["sender"], &name).to_string(),
                recipient: text(&item["recipient"], &name).to_string(),
                note: bytes(&item["note"], &name),
                handshake_id: bytes(&item["handshake_id"], &name),
                session_key: bytes(&item["session_key"], &name),
            };
            assert!(
                seeds.contains_key(&handshake.sender) && seeds.contains_key(&handshake.recipient),
                "{name}: unknown account"
            );
            assert!(
                handshakes.insert(name.clone(), handshake).is_none(),
                "{name}: duplicate handshake"
            );
        }
        Conversation { seeds, handshakes }
    }

    fn seed(&self, name: &str) -> &[u8] {
        self.seeds
            .get(name)
            .unwrap_or_else(|| panic!("a handshake or case names an unknown account"))
    }

    fn handshake(&self, name: &str) -> &Handshake {
        self.handshakes
            .get(name)
            .unwrap_or_else(|| panic!("unknown handshake {name}"))
    }

    /// The session `account` gets from a handshake: recovered as its sender, or accepted as its recipient.
    fn session(&self, account: &str, handshake: &str) -> PqSession {
        let item = self.handshake(handshake);
        let seed = self.seed(account);
        if account == item.sender {
            open_pq_handshake_as_sender(&item.note, seed).expect("sender recovery")
        } else {
            accept_pq_handshake(&item.note, seed).expect("recipient accept")
        }
    }
}

#[test]
fn both_sides_derive_every_session_from_the_note() {
    let v = vector();
    let conversation = Conversation::load(&v);
    assert_eq!(v["handshake_size"].as_u64(), Some(2366));
    assert_eq!(v["message_header_size"].as_u64(), Some(78));
    assert_eq!(v["max_plaintext"].as_u64(), Some(4002));
    let directions: BTreeSet<(&str, &str)> = conversation
        .handshakes
        .values()
        .map(|item| (item.sender.as_str(), item.recipient.as_str()))
        .collect();
    assert_eq!(
        directions,
        BTreeSet::from([("alice", "bob"), ("bob", "alice")]),
        "one handshake each way"
    );
    for (name, item) in &conversation.handshakes {
        assert_eq!(item.note.len(), 2366, "{name}: handshake size");
        assert_eq!(
            Sha256::digest(&item.note).to_vec(),
            item.handshake_id,
            "{name}: handshake id"
        );
        for (side, account) in [("recipient", &item.recipient), ("sender", &item.sender)] {
            let session = conversation.session(account, name);
            assert_eq!(
                session.session_key.to_vec(),
                item.session_key,
                "{name}: the {side}'s session key"
            );
            assert_eq!(
                session.handshake_id.to_vec(),
                item.handshake_id,
                "{name}: the {side}'s handshake id"
            );
        }
    }
}

#[test]
fn both_sides_read_every_message_in_order() {
    let v = vector();
    let conversation = Conversation::load(&v);
    let mut sessions = BTreeMap::new();
    for (name, item) in &conversation.handshakes {
        for account in [&item.recipient, &item.sender] {
            sessions.insert(
                (name.clone(), account.clone()),
                conversation.session(account, name),
            );
        }
    }
    let messages = array(&v["messages"], "messages");
    let mut per_handshake: BTreeMap<String, usize> = BTreeMap::new();
    let mut longest = 0;
    for (position, message) in messages.iter().enumerate() {
        let context = format!("message {position}");
        keys(message, MESSAGE_FIELDS, &context);
        assert_eq!(
            message["index"].as_u64(),
            Some(position as u64),
            "{context}: index"
        );
        let handshake = text(&message["handshake"], &context);
        let item = conversation.handshake(handshake);
        let note = bytes(&message["note"], &context);
        let plaintext = text(&message["plaintext"], &context);
        assert_eq!(
            note.len(),
            78 + plaintext.len() + 16,
            "{context}: note size"
        );
        longest = longest.max(note.len());
        for (side, account) in [("recipient", &item.recipient), ("sender", &item.sender)] {
            let session = &sessions[&(handshake.to_string(), account.clone())];
            let read = decrypt_pq_message(&note, session)
                .unwrap_or_else(|error| panic!("{context}: the {side} cannot read it: {error}"));
            assert_eq!(
                read, plaintext,
                "{context}: the {side} reads different text"
            );
        }
        *per_handshake.entry(handshake.to_string()).or_default() += 1;
    }
    assert_eq!(per_handshake.len(), 2, "messages in both directions");
    assert!(
        per_handshake.values().all(|count| *count >= 32),
        "at least 32 messages each way: {per_handshake:?}"
    );
    assert_eq!(longest, 4096, "a message at the note ceiling");
}

#[test]
fn every_case_matches_typescript() {
    let v = vector();
    let conversation = Conversation::load(&v);
    let mut names = BTreeSet::new();
    let mut seen = BTreeSet::new();
    for case in array(&v["cases"], "cases") {
        let name = text(&case["name"], "case name");
        keys(case, CASE_FIELDS, name);
        assert!(names.insert(name), "{name}: duplicate case name");
        let account = text(&case["account"], name);
        let handshake = text(&case["handshake"], name);
        let note = bytes(&case["note"], name);
        let op = text(&case["op"], name);
        let seed = conversation.seed(account);
        let accepted = match op {
            "accept" => match accept_pq_handshake(&note, seed) {
                Ok(session) => {
                    assert_eq!(
                        session.session_key.to_vec(),
                        conversation.handshake(handshake).session_key,
                        "{name}: session key"
                    );
                    true
                }
                Err(_) => false,
            },
            "open_as_sender" => open_pq_handshake_as_sender(&note, seed).is_ok(),
            "decrypt" => {
                decrypt_pq_message(&note, &conversation.session(account, handshake)).is_ok()
            }
            other => panic!("{name}: unknown op {other:?}"),
        };
        let expect = text(&case["expect"], name);
        match expect {
            "accepted" => assert!(accepted, "{name}: rejected"),
            "rejected" => assert!(!accepted, "{name}: accepted"),
            other => panic!("{name}: unknown result {other:?}"),
        }
        seen.insert((op, expect));
    }
    for op in ["accept", "open_as_sender", "decrypt"] {
        assert!(seen.contains(&(op, "rejected")), "no rejected {op} case");
    }
}
