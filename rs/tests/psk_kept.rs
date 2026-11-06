//! REQ-protocol-13 (#70b): Rust reads kept Extra lock (`0x02`) notes that
//! TypeScript wrote, and its counter window survives a restart.
//!
//! `vectors/psk-kept-v1.json` is a byte-identical copy of the file that
//! `ts/scripts/emit-conversation-vectors.ts` writes. It ships in the crate, so
//! this test also runs from the package. Rust only reads these notes here.

use algochat::{decode_psk_envelope, decrypt_psk_message, derive_keys_from_seed, PSKState};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet, HashSet};

const FILE: &str = "psk-kept-v1.json";

const FIELDS: &[&str] = &[
    "description",
    "generated_by",
    "header_size",
    "session_size",
    "counter_window",
    "kept_psk",
    "accounts",
    "notes",
    "cases",
    "receive",
];
const ACCOUNT_FIELDS: &[&str] = &["seed", "x25519_public"];
const NOTE_FIELDS: &[&str] = &["name", "from", "to", "counter", "plaintext", "note"];
const CASE_FIELDS: &[&str] = &["name", "account", "psk", "note", "expect"];
const RECEIVE_FIELDS: &[&str] = &[
    "account",
    "peer",
    "steps",
    "restart_after",
    "state_at_restart",
    "final_state",
];
const STEP_FIELDS: &[&str] = &["counter", "expect"];
const STATE_FIELDS: &[&str] = &["send_counter", "peer_last_counter", "seen_counters"];

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

fn counter(value: &Value, context: &str) -> u32 {
    value
        .as_u64()
        .and_then(|number| u32::try_from(number).ok())
        .unwrap_or_else(|| panic!("{context}: not a 32-bit counter"))
}

fn array<'a>(value: &'a Value, context: &str) -> &'a Vec<Value> {
    let items = value
        .as_array()
        .unwrap_or_else(|| panic!("{context}: not an array"));
    assert!(!items.is_empty(), "{context}: empty");
    items
}

fn seeds(v: &Value) -> BTreeMap<String, Vec<u8>> {
    keys(v, FIELDS, FILE);
    let accounts = v["accounts"].as_object().expect("accounts: not an object");
    let mut seeds = BTreeMap::new();
    for (name, account) in accounts {
        keys(account, ACCOUNT_FIELDS, name);
        let seed = bytes(&account["seed"], name);
        let (_, public) = derive_keys_from_seed(&seed).expect("X25519 keys");
        assert_eq!(
            public.as_bytes().to_vec(),
            bytes(&account["x25519_public"], name),
            "{name}: X25519 key from the seed"
        );
        seeds.insert(name.clone(), seed);
    }
    assert_eq!(
        seeds.keys().map(String::as_str).collect::<BTreeSet<_>>(),
        BTreeSet::from(["alice", "bob"])
    );
    seeds
}

fn read(seed: &[u8], note: &[u8], psk: &[u8]) -> Option<String> {
    let envelope = decode_psk_envelope(note).ok()?;
    let (private, public) = derive_keys_from_seed(seed).ok()?;
    decrypt_psk_message(&envelope, &private, &public, psk).ok()
}

#[test]
fn recipient_and_sender_read_every_kept_note() {
    let v = vector();
    let seeds = seeds(&v);
    assert_eq!(v["header_size"].as_u64(), Some(130));
    assert_eq!(v["session_size"].as_u64(), Some(100));
    assert_eq!(v["counter_window"].as_u64(), Some(200));
    let psk = bytes(&v["kept_psk"], "kept_psk");
    let mut counters = BTreeSet::new();
    let mut longest = 0;
    for item in array(&v["notes"], "notes") {
        let name = text(&item["name"], "note name");
        keys(item, NOTE_FIELDS, name);
        let note = bytes(&item["note"], name);
        let plaintext = text(&item["plaintext"], name);
        let envelope = decode_psk_envelope(&note).unwrap_or_else(|error| panic!("{name}: {error}"));
        assert_eq!(envelope.version, 0x02, "{name}: version");
        assert_eq!(
            envelope.ratchet_counter,
            counter(&item["counter"], name),
            "{name}: counter"
        );
        let from = text(&item["from"], name);
        let to = text(&item["to"], name);
        assert_ne!(from, to, "{name}: sender and recipient");
        for reader in [to, from] {
            let read = read(&seeds[reader], &note, &psk)
                .unwrap_or_else(|| panic!("{name}: {reader} cannot read it"));
            assert_eq!(read, plaintext, "{name}: {reader} reads different text");
        }
        counters.insert(envelope.ratchet_counter);
        longest = longest.max(note.len());
    }
    for required in [0, 99, 100, 199, 200, u32::MAX] {
        assert!(
            counters.contains(&required),
            "no note at counter {required}"
        );
    }
    assert_eq!(longest, 4096, "a note at the note ceiling");
}

#[test]
fn every_case_matches_typescript() {
    let v = vector();
    let seeds = seeds(&v);
    let mut names = BTreeSet::new();
    let mut results = BTreeSet::new();
    for case in array(&v["cases"], "cases") {
        let name = text(&case["name"], "case name");
        keys(case, CASE_FIELDS, name);
        assert!(names.insert(name), "{name}: duplicate case name");
        let account = text(&case["account"], name);
        let seed = seeds
            .get(account)
            .unwrap_or_else(|| panic!("{name}: unknown account {account}"));
        let accepted = read(
            seed,
            &bytes(&case["note"], name),
            &bytes(&case["psk"], name),
        )
        .is_some();
        let expect = text(&case["expect"], name);
        match expect {
            "accepted" => assert!(accepted, "{name}: rejected"),
            "rejected" => assert!(!accepted, "{name}: accepted"),
            other => panic!("{name}: unknown result {other:?}"),
        }
        results.insert(expect);
    }
    assert_eq!(
        results,
        BTreeSet::from(["accepted", "rejected"]),
        "cases cover both results"
    );
}

fn state_matches(state: &PSKState, expected: &Value, context: &str) {
    keys(expected, STATE_FIELDS, context);
    assert_eq!(
        state.send_counter,
        counter(&expected["send_counter"], context),
        "{context}: send counter"
    );
    assert_eq!(
        state.peer_last_counter,
        counter(&expected["peer_last_counter"], context),
        "{context}: last counter"
    );
    let seen: HashSet<u32> = expected["seen_counters"]
        .as_array()
        .unwrap_or_else(|| panic!("{context}: seen_counters is not an array"))
        .iter()
        .map(|value| counter(value, context))
        .collect();
    assert_eq!(state.seen_counters, seen, "{context}: seen counters");
}

#[test]
fn the_counter_window_matches_typescript_across_a_restart() {
    let v = vector();
    let receive = &v["receive"];
    keys(receive, RECEIVE_FIELDS, "receive");
    let steps = array(&receive["steps"], "receive steps");
    let restart_after = receive["restart_after"]
        .as_u64()
        .expect("restart_after: not a number") as usize;
    assert!(
        restart_after > 0 && restart_after < steps.len(),
        "restart_after inside the steps"
    );
    let mut state = PSKState::new();
    let mut results = BTreeSet::new();
    for (index, step) in steps.iter().enumerate() {
        let context = format!("step {index}");
        keys(step, STEP_FIELDS, &context);
        if index == restart_after {
            state_matches(&state, &receive["state_at_restart"], "state_at_restart");
            let saved = serde_json::to_string(&state).expect("save state");
            state = serde_json::from_str(&saved).expect("restore state");
            state_matches(&state, &receive["state_at_restart"], "restored state");
        }
        let value = counter(&step["counter"], &context);
        let valid = state.validate_counter(value).is_ok();
        let expect = text(&step["expect"], &context);
        match expect {
            "accepted" => assert!(valid, "{context}: counter {value} rejected"),
            "rejected" => assert!(!valid, "{context}: counter {value} accepted"),
            other => panic!("{context}: unknown result {other:?}"),
        }
        if valid {
            state.record_receive(value);
        }
        results.insert((index >= restart_after, expect));
    }
    state_matches(&state, &receive["final_state"], "final_state");
    for after_restart in [false, true] {
        for expect in ["accepted", "rejected"] {
            assert!(
                results.contains(&(after_restart, expect)),
                "no {expect} step {} the restart",
                if after_restart { "after" } else { "before" }
            );
        }
    }
}
