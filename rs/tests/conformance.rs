//! REQ-protocol-10 (#70a): Rust checks every section and case of the
//! TypeScript-generated conformance vectors.
//!
//! The vectors are byte-identical copies, in `rs/vectors/`, of
//! `ts/conformance/vectors/00-06` and the shared `vectors/*.json`. They ship
//! in the crate, so these tests also run from the package. A missing file,
//! a missing or unexpected section, or an unknown case fails. Nothing here
//! is skipped because a file is absent. The only unchecked fields are in
//! `PENDING`, each with the issue that adds them.

use algochat::{
    decode_psk_envelope, decrypt_message, decrypt_psk_message, derive_hybrid_symmetric_key,
    derive_keys_from_seed, derive_position_psk, derive_psk_at_counter, derive_session_psk,
    encode_psk_envelope, fingerprint, is_chat_message, is_psk_message, verify_encryption_key_bytes,
    x25519_ecdh, ChatEnvelope, PSKEnvelope, PSKExchangeURI, PSKState, ED25519_SIGNATURE_SIZE,
    ENCRYPTED_SENDER_KEY_SIZE, HEADER_SIZE, MAX_PAYLOAD_SIZE, MINIMUM_PAYMENT, PROTOCOL_ID,
    PROTOCOL_VERSION, PROTOCOL_VERSION_V2, PSK_COUNTER_WINDOW, PSK_ENCRYPTED_SENDER_KEY_SIZE,
    PSK_HEADER_SIZE, PSK_MAX_PAYLOAD_SIZE, PSK_PROTOCOL_ID, PSK_SESSION_SIZE, PSK_TAG_SIZE,
    PSK_VERSION, PSK_VERSION_V2, PUBLIC_KEY_SIZE, TAG_SIZE,
};
use ed25519_dalek::SigningKey;
use serde_json::Value;
use std::collections::BTreeSet;
use x25519_dalek::{PublicKey, StaticSecret};

/// Fields Rust cannot check yet. Each entry names the issue that removes it.
/// Release 0.7.0 ships only with this list empty (#73 is in the same release).
const PENDING: &[(&str, &str, &str)] = &[
    ("01-key-derivation.json", "accounts[].mnemonic", "#73"),
    (
        "01-key-derivation.json",
        "accounts[].algorandAddress",
        "#73",
    ),
];

/// Every vector file Rust reads. The release check keeps this directory equal
/// to the canonical sources.
const SHARED: &[&str] = &[
    "group-admin-bots-v1.json",
    "group-admin-delta-v1.json",
    "group-admin-v1.json",
    "group-v1.json",
    "pq-conversation-v1.json",
    "pq-mlkem768.json",
    "psk-kept-v1.json",
    "room-rekey-v1.json",
    "room-session-v1.json",
];

const METADATA: &[&str] = &[
    "description",
    "file",
    "generatedBy",
    "libraryVersion",
    "note",
    "tool",
];

fn vector(name: &str) -> Value {
    let path = format!("{}/vectors/{}", env!("CARGO_MANIFEST_DIR"), name);
    let text = std::fs::read_to_string(&path)
        .unwrap_or_else(|error| panic!("required vector {path} is missing: {error}"));
    serde_json::from_str(&text).unwrap_or_else(|error| panic!("{path}: {error}"))
}

/// Loads a TypeScript conformance file and asserts its exact section set.
fn conformance(name: &str, sections: &[&str]) -> Value {
    let value = vector(name);
    let actual: BTreeSet<&str> = value
        .as_object()
        .unwrap_or_else(|| panic!("{name}: not an object"))
        .keys()
        .map(String::as_str)
        .collect();
    let expected: BTreeSet<&str> = sections.iter().chain(METADATA).copied().collect();
    assert_eq!(
        actual, expected,
        "{name}: sections differ; add or remove a check for each one"
    );
    assert_eq!(
        value["file"],
        name.trim_end_matches(".json"),
        "{name}: file field"
    );
    value
}

fn keys(object: &Value, expected: &[&str], context: &str) {
    let actual: BTreeSet<&str> = object
        .as_object()
        .unwrap_or_else(|| panic!("{context}: not an object"))
        .keys()
        .map(String::as_str)
        .collect();
    let expected: BTreeSet<&str> = expected.iter().copied().collect();
    assert_eq!(actual, expected, "{context}: fields differ");
}

fn text<'a>(value: &'a Value, context: &str) -> &'a str {
    value
        .as_str()
        .unwrap_or_else(|| panic!("{context}: not a string"))
}

fn bytes(value: &Value, context: &str) -> Vec<u8> {
    hex::decode(text(value, context)).unwrap_or_else(|error| panic!("{context}: {error}"))
}

fn array<const N: usize>(value: &Value, context: &str) -> [u8; N] {
    bytes(value, context)
        .try_into()
        .unwrap_or_else(|_| panic!("{context}: expected {N} bytes"))
}

fn number(value: &Value, context: &str) -> u64 {
    value
        .as_u64()
        .unwrap_or_else(|| panic!("{context}: not a number"))
}

fn secret(value: &Value, context: &str) -> (StaticSecret, PublicKey) {
    let private = StaticSecret::from(array::<32>(value, context));
    let public = PublicKey::from(&private);
    (private, public)
}

fn standard_envelope(value: &Value, context: &str) -> ChatEnvelope {
    keys(
        value,
        &[
            "version",
            "protocolId",
            "senderPublicKey",
            "ephemeralPublicKey",
            "nonce",
            "encryptedSenderKey",
            "ciphertext",
        ],
        context,
    );
    ChatEnvelope {
        version: number(&value["version"], context) as u8,
        protocol_id: number(&value["protocolId"], context) as u8,
        sender_public_key: array(&value["senderPublicKey"], context),
        ephemeral_public_key: array(&value["ephemeralPublicKey"], context),
        nonce: array(&value["nonce"], context),
        encrypted_sender_key: bytes(&value["encryptedSenderKey"], context),
        ciphertext: bytes(&value["ciphertext"], context),
    }
}

fn psk_envelope(value: &Value, context: &str) -> PSKEnvelope {
    keys(
        value,
        &[
            "version",
            "protocolId",
            "ratchetCounter",
            "senderPublicKey",
            "ephemeralPublicKey",
            "nonce",
            "encryptedSenderKey",
            "ciphertext",
        ],
        context,
    );
    assert_eq!(
        number(&value["protocolId"], context),
        PSK_PROTOCOL_ID as u64,
        "{context}: protocolId"
    );
    PSKEnvelope {
        version: number(&value["version"], context) as u8,
        ratchet_counter: number(&value["ratchetCounter"], context) as u32,
        sender_public_key: array(&value["senderPublicKey"], context),
        ephemeral_public_key: array(&value["ephemeralPublicKey"], context),
        nonce: array(&value["nonce"], context),
        encrypted_sender_key: bytes(&value["encryptedSenderKey"], context),
        ciphertext: bytes(&value["ciphertext"], context),
    }
}

#[test]
fn every_vector_file_is_present() {
    for name in SHARED {
        assert!(vector(name).is_object(), "{name}: not an object");
    }
    for (file, field, issue) in PENDING {
        assert!(
            issue.starts_with('#'),
            "{file} {field}: pending entry must name its issue"
        );
    }
}

#[test]
fn protocol_constants_00() {
    let v = conformance("00-protocol-constants.json", &["constants"]);
    let c = &v["constants"];
    keys(
        c,
        &[
            "PROTOCOL",
            "PSK_PROTOCOL",
            "ED25519_SIGNATURE_SIZE",
            "ED25519_PUBLIC_KEY_SIZE",
            "X25519_PUBLIC_KEY_SIZE",
        ],
        "00",
    );
    let standard = &c["PROTOCOL"];
    keys(
        standard,
        &[
            "VERSION",
            "VERSION_AAD",
            "PROTOCOL_ID",
            "HEADER_SIZE",
            "TAG_SIZE",
            "ENCRYPTED_SENDER_KEY_SIZE",
            "MAX_PAYLOAD_SIZE",
            "MIN_PAYMENT",
        ],
        "00 PROTOCOL",
    );
    let expected = [
        ("VERSION", PROTOCOL_VERSION as u64),
        ("VERSION_AAD", PROTOCOL_VERSION_V2 as u64),
        ("PROTOCOL_ID", PROTOCOL_ID as u64),
        ("HEADER_SIZE", HEADER_SIZE as u64),
        ("TAG_SIZE", TAG_SIZE as u64),
        (
            "ENCRYPTED_SENDER_KEY_SIZE",
            ENCRYPTED_SENDER_KEY_SIZE as u64,
        ),
        ("MAX_PAYLOAD_SIZE", MAX_PAYLOAD_SIZE as u64),
        ("MIN_PAYMENT", MINIMUM_PAYMENT),
    ];
    for (name, value) in expected {
        assert_eq!(number(&standard[name], name), value, "00 PROTOCOL.{name}");
    }
    let psk = &c["PSK_PROTOCOL"];
    keys(
        psk,
        &[
            "VERSION",
            "VERSION_AAD",
            "PROTOCOL_ID",
            "HEADER_SIZE",
            "TAG_SIZE",
            "ENCRYPTED_SENDER_KEY_SIZE",
            "MAX_PAYLOAD_SIZE",
            "SESSION_SIZE",
            "COUNTER_WINDOW",
        ],
        "00 PSK_PROTOCOL",
    );
    let expected = [
        ("VERSION", PSK_VERSION as u64),
        ("VERSION_AAD", PSK_VERSION_V2 as u64),
        ("PROTOCOL_ID", PSK_PROTOCOL_ID as u64),
        ("HEADER_SIZE", PSK_HEADER_SIZE as u64),
        ("TAG_SIZE", PSK_TAG_SIZE as u64),
        (
            "ENCRYPTED_SENDER_KEY_SIZE",
            PSK_ENCRYPTED_SENDER_KEY_SIZE as u64,
        ),
        ("MAX_PAYLOAD_SIZE", PSK_MAX_PAYLOAD_SIZE as u64),
        ("SESSION_SIZE", PSK_SESSION_SIZE as u64),
        ("COUNTER_WINDOW", PSK_COUNTER_WINDOW as u64),
    ];
    for (name, value) in expected {
        assert_eq!(number(&psk[name], name), value, "00 PSK_PROTOCOL.{name}");
    }
    assert_eq!(
        number(&c["ED25519_SIGNATURE_SIZE"], "00"),
        ED25519_SIGNATURE_SIZE as u64
    );
    assert_eq!(
        number(&c["ED25519_PUBLIC_KEY_SIZE"], "00"),
        PUBLIC_KEY_SIZE as u64
    );
    assert_eq!(
        number(&c["X25519_PUBLIC_KEY_SIZE"], "00"),
        PUBLIC_KEY_SIZE as u64
    );
}

#[test]
fn key_derivation_01() {
    let v = conformance(
        "01-key-derivation.json",
        &["hkdf", "accounts", "ecdh", "keyAnnouncement"],
    );
    keys(&v["hkdf"], &["hash", "salt", "info", "length"], "01 hkdf");
    assert_eq!(v["hkdf"]["hash"], "SHA-256");
    assert_eq!(
        text(&v["hkdf"]["salt"], "salt").as_bytes(),
        algochat::KEY_DERIVATION_SALT
    );
    assert_eq!(
        text(&v["hkdf"]["info"], "info").as_bytes(),
        algochat::KEY_DERIVATION_INFO
    );
    assert_eq!(number(&v["hkdf"]["length"], "length"), 32);

    let accounts = v["accounts"].as_array().expect("01 accounts");
    assert_eq!(
        accounts.len(),
        2,
        "01: two accounts (A sender, B recipient)"
    );
    let mut derived = Vec::new();
    for account in accounts {
        let name = text(&account["name"], "01 account name");
        // Only account A carries a mnemonic (the TypeScript generator's choice).
        let mut fields = vec![
            "name",
            "seed",
            "algorandAddress",
            "ed25519PublicKey",
            "x25519PrivateKey",
            "x25519PublicKey",
            "fingerprint",
        ];
        if name.starts_with("A ") {
            fields.push("mnemonic");
        }
        keys(account, &fields, name);
        let seed = bytes(&account["seed"], name);
        let (private, public) = derive_keys_from_seed(&seed).expect("derive");
        assert_eq!(
            hex::encode(private.to_bytes()),
            text(&account["x25519PrivateKey"], name),
            "01 {name} x25519 private"
        );
        assert_eq!(
            hex::encode(public.as_bytes()),
            text(&account["x25519PublicKey"], name),
            "01 {name} x25519 public"
        );
        let signing = SigningKey::from_bytes(&array::<32>(&account["seed"], name));
        assert_eq!(
            hex::encode(signing.verifying_key().as_bytes()),
            text(&account["ed25519PublicKey"], name),
            "01 {name} ed25519 public"
        );
        assert_eq!(
            fingerprint(public.as_bytes()),
            text(&account["fingerprint"], name),
            "01 {name} fingerprint"
        );
        derived.push((private, public));
    }

    keys(&v["ecdh"], &["description", "sharedSecret"], "01 ecdh");
    let ab = x25519_ecdh(&derived[0].0, &derived[1].1);
    let ba = x25519_ecdh(&derived[1].0, &derived[0].1);
    assert_eq!(
        hex::encode(ab),
        text(&v["ecdh"]["sharedSecret"], "ecdh"),
        "01 ECDH matches vector"
    );
    assert_eq!(ab, ba, "01 ECDH symmetric");

    let k = &v["keyAnnouncement"];
    keys(
        k,
        &[
            "description",
            "encryptionPublicKey",
            "signingSeed",
            "verifyingKey",
            "signature",
            "verifies",
            "wrongVerifyingKey",
            "verifiesUnderWrongKey",
        ],
        "01 keyAnnouncement",
    );
    let encryption = bytes(&k["encryptionPublicKey"], "announcement");
    let signature = bytes(&k["signature"], "announcement");
    let signing = SigningKey::from_bytes(&array::<32>(&k["signingSeed"], "signingSeed"));
    assert_eq!(
        hex::encode(signing.verifying_key().as_bytes()),
        text(&k["verifyingKey"], "verifyingKey")
    );
    let signed = algochat::sign_encryption_key(&encryption, &signing).expect("sign");
    assert_eq!(
        hex::encode(signed),
        text(&k["signature"], "signature"),
        "01 Ed25519 signature is deterministic"
    );
    let good =
        verify_encryption_key_bytes(&encryption, &bytes(&k["verifyingKey"], "vk"), &signature)
            .expect("verify");
    let bad = verify_encryption_key_bytes(
        &encryption,
        &bytes(&k["wrongVerifyingKey"], "wvk"),
        &signature,
    )
    .expect("verify");
    assert_eq!(Some(good), k["verifies"].as_bool(), "01 signature verifies");
    assert_eq!(
        Some(bad),
        k["verifiesUnderWrongKey"].as_bool(),
        "01 signature rejected under wrong key"
    );
}

#[test]
fn standard_envelope_02() {
    let v = conformance(
        "02-standard-envelope.json",
        &["wireFormat", "encodingVector", "capturedEnvelope"],
    );
    keys(&v["wireFormat"], &["headerSize", "layout"], "02 wireFormat");
    assert_eq!(
        number(&v["wireFormat"]["headerSize"], "headerSize"),
        HEADER_SIZE as u64
    );

    let e = &v["encodingVector"];
    keys(
        e,
        &[
            "description",
            "envelope",
            "encodedBytes",
            "isChatMessage",
            "isPSKMessage",
        ],
        "02 encodingVector",
    );
    let envelope = standard_envelope(&e["envelope"], "02 encodingVector.envelope");
    let encoded = envelope.encode();
    assert_eq!(
        hex::encode(&encoded),
        text(&e["encodedBytes"], "encodedBytes"),
        "02 encoding byte-exact"
    );
    assert_eq!(
        ChatEnvelope::decode(&encoded).expect("decode"),
        envelope,
        "02 decode round-trip"
    );
    assert_eq!(
        Some(is_chat_message(&encoded)),
        e["isChatMessage"].as_bool(),
        "02 isChatMessage"
    );
    assert_eq!(
        Some(is_psk_message(&encoded)),
        e["isPSKMessage"].as_bool(),
        "02 isPSKMessage"
    );

    let c = &v["capturedEnvelope"];
    keys(
        c,
        &[
            "description",
            "plaintext",
            "envelope",
            "encodedBytes",
            "decrypt",
        ],
        "02 capturedEnvelope",
    );
    let captured = standard_envelope(&c["envelope"], "02 capturedEnvelope.envelope");
    assert_eq!(
        hex::encode(captured.encode()),
        text(&c["encodedBytes"], "encodedBytes"),
        "02 captured re-encodes"
    );
    assert_eq!(
        ChatEnvelope::decode(&bytes(&c["encodedBytes"], "encodedBytes")).expect("decode"),
        captured
    );
    keys(
        &c["decrypt"],
        &["recipientPath", "senderPath"],
        "02 decrypt",
    );
    for path in ["recipientPath", "senderPath"] {
        let p = &c["decrypt"][path];
        keys(p, &["privateKey", "publicKey", "plaintext"], path);
        let (private, public) = secret(&p["privateKey"], path);
        assert_eq!(
            hex::encode(public.as_bytes()),
            text(&p["publicKey"], path),
            "02 {path} public key"
        );
        let opened = decrypt_message(&captured, &private, &public)
            .expect("decrypt")
            .expect("for us");
        assert_eq!(
            opened.text,
            text(&p["plaintext"], path),
            "02 {path} plaintext"
        );
        assert_eq!(opened.text, text(&c["plaintext"], "plaintext"));
    }
}

#[test]
fn psk_ratchet_03() {
    let v = conformance(
        "03-psk-ratchet.json",
        &[
            "initialPSK",
            "constants",
            "derivationVectors",
            "hybridKeyVector",
            "stateTranscript",
        ],
    );
    let initial = bytes(&v["initialPSK"], "initialPSK");
    keys(
        &v["constants"],
        &["sessionSize", "counterWindow"],
        "03 constants",
    );
    assert_eq!(
        number(&v["constants"]["sessionSize"], "sessionSize"),
        PSK_SESSION_SIZE as u64
    );
    assert_eq!(
        number(&v["constants"]["counterWindow"], "counterWindow"),
        PSK_COUNTER_WINDOW as u64
    );

    let vectors = v["derivationVectors"]
        .as_array()
        .expect("derivationVectors");
    assert!(!vectors.is_empty());
    for d in vectors {
        keys(
            d,
            &[
                "counter",
                "sessionIndex",
                "sessionPSK",
                "positionPSK",
                "pskAtCounter",
            ],
            "03 derivation",
        );
        let counter = number(&d["counter"], "counter") as u32;
        let session_index = number(&d["sessionIndex"], "sessionIndex") as u32;
        assert_eq!(
            session_index,
            counter / PSK_SESSION_SIZE,
            "03 c={counter} session index"
        );
        let session = derive_session_psk(&initial, session_index).expect("session");
        assert_eq!(
            hex::encode(session),
            text(&d["sessionPSK"], "sessionPSK"),
            "03 sessionPSK c={counter}"
        );
        let position = derive_position_psk(&session, counter % PSK_SESSION_SIZE).expect("position");
        assert_eq!(
            hex::encode(position),
            text(&d["positionPSK"], "positionPSK"),
            "03 positionPSK c={counter}"
        );
        let at = derive_psk_at_counter(&initial, counter).expect("at counter");
        assert_eq!(
            hex::encode(at),
            text(&d["pskAtCounter"], "pskAtCounter"),
            "03 pskAtCounter c={counter}"
        );
    }

    let h = &v["hybridKeyVector"];
    keys(
        h,
        &[
            "description",
            "sharedSecret",
            "psk",
            "ephemeralPublicKey",
            "senderPublicKey",
            "recipientPublicKey",
            "derivedKey",
        ],
        "03 hybridKeyVector",
    );
    let derived = derive_hybrid_symmetric_key(
        &bytes(&h["sharedSecret"], "sharedSecret"),
        &bytes(&h["psk"], "psk"),
        &bytes(&h["ephemeralPublicKey"], "ephemeralPublicKey"),
        &bytes(&h["senderPublicKey"], "senderPublicKey"),
        &bytes(&h["recipientPublicKey"], "recipientPublicKey"),
    )
    .expect("hybrid");
    assert_eq!(
        hex::encode(derived),
        text(&h["derivedKey"], "derivedKey"),
        "03 hybrid key"
    );

    let mut state = PSKState::new();
    let check_state = |state: &PSKState, expected: &Value, context: &str| {
        keys(
            expected,
            &["sendCounter", "peerLastCounter", "seenCounters"],
            context,
        );
        assert_eq!(
            state.send_counter as u64,
            number(&expected["sendCounter"], context),
            "{context} sendCounter"
        );
        assert_eq!(
            state.peer_last_counter as u64,
            number(&expected["peerLastCounter"], context),
            "{context} peerLastCounter"
        );
        let seen: BTreeSet<u64> = state.seen_counters.iter().map(|c| *c as u64).collect();
        let want: BTreeSet<u64> = expected["seenCounters"]
            .as_array()
            .expect("seenCounters")
            .iter()
            .map(|c| number(c, context))
            .collect();
        assert_eq!(seen, want, "{context} seenCounters");
    };
    for (index, op) in v["stateTranscript"]
        .as_array()
        .expect("stateTranscript")
        .iter()
        .enumerate()
    {
        let context = format!("03 transcript[{index}]");
        match text(&op["op"], &context) {
            "createPSKState" => {
                keys(op, &["op", "result"], &context);
                check_state(&state, &op["result"], &context);
            }
            "advanceSendCounter" => {
                keys(op, &["op", "counter", "result"], &context);
                let counter = state.advance_send_counter().expect("advance");
                assert_eq!(
                    counter as u64,
                    number(&op["counter"], &context),
                    "{context} counter"
                );
                check_state(&state, &op["result"], &context);
            }
            "validateCounter" => {
                keys(
                    op,
                    &["op", "counter", "valid", "stateBefore", "stateAfter"],
                    &context,
                );
                check_state(&state, &op["stateBefore"], &context);
                let counter = number(&op["counter"], &context) as u32;
                let valid = state.validate_counter(counter).unwrap_or(false);
                assert_eq!(
                    Some(valid),
                    op["valid"].as_bool(),
                    "{context} validate({counter})"
                );
                if valid {
                    state.record_receive(counter);
                }
                check_state(&state, &op["stateAfter"], &context);
            }
            other => panic!("{context}: unknown op {other:?}; add a handler"),
        }
    }
}

#[test]
fn psk_envelope_04() {
    let v = conformance(
        "04-psk-envelope.json",
        &["wireFormat", "encodingVector", "capturedEnvelope"],
    );
    keys(&v["wireFormat"], &["headerSize", "layout"], "04 wireFormat");
    assert_eq!(
        number(&v["wireFormat"]["headerSize"], "headerSize"),
        PSK_HEADER_SIZE as u64
    );

    let e = &v["encodingVector"];
    keys(
        e,
        &["envelope", "encodedBytes", "isChatMessage", "isPSKMessage"],
        "04 encodingVector",
    );
    let envelope = psk_envelope(&e["envelope"], "04 encodingVector.envelope");
    let encoded = encode_psk_envelope(&envelope);
    assert_eq!(
        hex::encode(&encoded),
        text(&e["encodedBytes"], "encodedBytes"),
        "04 encoding byte-exact"
    );
    assert_eq!(
        decode_psk_envelope(&encoded).expect("decode"),
        envelope,
        "04 decode round-trip + counter"
    );
    assert_eq!(
        Some(is_psk_message(&encoded)),
        e["isPSKMessage"].as_bool(),
        "04 isPSKMessage"
    );
    assert_eq!(
        Some(is_chat_message(&encoded)),
        e["isChatMessage"].as_bool(),
        "04 isChatMessage"
    );

    let c = &v["capturedEnvelope"];
    keys(
        c,
        &[
            "plaintext",
            "initialPSK",
            "ratchetCounter",
            "pskAtCounter",
            "envelope",
            "encodedBytes",
            "decrypt",
        ],
        "04 capturedEnvelope",
    );
    let captured = psk_envelope(&c["envelope"], "04 capturedEnvelope.envelope");
    assert_eq!(
        hex::encode(encode_psk_envelope(&captured)),
        text(&c["encodedBytes"], "encodedBytes"),
        "04 captured re-encodes"
    );
    let initial = bytes(&c["initialPSK"], "initialPSK");
    let counter = number(&c["ratchetCounter"], "ratchetCounter") as u32;
    assert_eq!(counter, captured.ratchet_counter);
    assert_eq!(
        hex::encode(derive_psk_at_counter(&initial, counter).expect("psk")),
        text(&c["pskAtCounter"], "pskAtCounter"),
        "04 pskAtCounter"
    );
    let d = &c["decrypt"];
    keys(d, &["privateKey", "publicKey", "plaintext"], "04 decrypt");
    let (private, public) = secret(&d["privateKey"], "04 decrypt");
    assert_eq!(
        hex::encode(public.as_bytes()),
        text(&d["publicKey"], "publicKey")
    );
    let opened = decrypt_psk_message(&captured, &private, &public, &initial).expect("decrypt");
    assert_eq!(
        opened,
        text(&d["plaintext"], "plaintext"),
        "04 PSK decrypt plaintext"
    );
    assert_eq!(opened, text(&c["plaintext"], "plaintext"));
}

#[test]
fn psk_exchange_05() {
    let v = conformance("05-psk-exchange.json", &["exchangeVector", "malformedUris"]);
    let e = &v["exchangeVector"];
    keys(
        e,
        &["address", "psk", "label", "uri", "parsed"],
        "05 exchangeVector",
    );
    let uri = PSKExchangeURI::new(
        text(&e["address"], "address"),
        bytes(&e["psk"], "psk"),
        Some(text(&e["label"], "label").to_string()),
    );
    assert_eq!(uri.encode(), text(&e["uri"], "uri"), "05 URI deterministic");
    let parsed = PSKExchangeURI::parse(text(&e["uri"], "uri")).expect("parse");
    keys(&e["parsed"], &["address", "psk", "label"], "05 parsed");
    assert_eq!(
        parsed.address,
        text(&e["parsed"]["address"], "address"),
        "05 parse address"
    );
    assert_eq!(
        hex::encode(&parsed.psk),
        text(&e["parsed"]["psk"], "psk"),
        "05 parse psk"
    );
    assert_eq!(
        parsed.label.as_deref(),
        e["parsed"]["label"].as_str(),
        "05 parse label"
    );

    let malformed = v["malformedUris"].as_array().expect("malformedUris");
    assert!(!malformed.is_empty());
    for m in malformed {
        keys(m, &["uri", "accepted", "error"], "05 malformed");
        let input = text(&m["uri"], "uri");
        let accepted = PSKExchangeURI::parse(input).is_ok();
        assert_eq!(
            Some(accepted),
            m["accepted"].as_bool(),
            "05 malformed {input:?}"
        );
    }
}

/// What a 06 case does with its input bytes.
enum Negative {
    /// Classify only.
    Classify,
    /// Decode as a standard envelope; it must fail to decode.
    Decode,
    /// Decode and open as a standard envelope with A (sender path), B, or a wrong key.
    Open(&'static str),
    /// Decode and open as a PSK envelope with B and the captured PSK, or with
    /// the PSK chain shifted by one position.
    OpenPsk { shifted: bool },
}

const NEGATIVE_CASES: &[(&str, Negative)] = &[
    (
        "tampered ciphertext (last byte flipped)",
        Negative::Open("B"),
    ),
    (
        "tampered encryptedSenderKey — recipient path (must fail)",
        Negative::Open("B"),
    ),
    (
        "tampered encryptedSenderKey — sender path (must fail)",
        Negative::Open("A"),
    ),
    (
        "version 0x02→0x01 downgrade (must fail)",
        Negative::Open("B"),
    ),
    ("protocolId flip (must fail)", Negative::Open("B")),
    (
        "wrong private key (A tries to read B’s copy)",
        Negative::Open("wrong"),
    ),
    ("truncated note (40 bytes)", Negative::Decode),
    ("unsupported version byte 0xff", Negative::Decode),
    ("random bytes classification", Negative::Classify),
    (
        "PSK envelope: tampered ciphertext",
        Negative::OpenPsk { shifted: false },
    ),
    (
        "PSK envelope: tampered encryptedSenderKey (must fail)",
        Negative::OpenPsk { shifted: false },
    ),
    (
        "PSK envelope: version 0x02→0x01 downgrade (must fail)",
        Negative::OpenPsk { shifted: false },
    ),
    (
        "PSK envelope: protocolId flip (must fail)",
        Negative::OpenPsk { shifted: false },
    ),
    (
        "PSK envelope: ratchetCounter mutation (must fail)",
        Negative::OpenPsk { shifted: false },
    ),
    (
        "PSK envelope: wrong ratchet position key (counter 1 instead of 0)",
        Negative::OpenPsk { shifted: true },
    ),
];

#[test]
fn negative_cases_06() {
    let v = conformance("06-negative-cases.json", &["invariant", "cases"]);
    let accounts = vector("01-key-derivation.json")["accounts"].clone();
    let a = secret(&accounts[0]["x25519PrivateKey"], "A");
    let b = secret(&accounts[1]["x25519PrivateKey"], "B");
    // The verifier's wrong key: seed bytes 0xe0..0xff.
    let wrong_seed: Vec<u8> = (0..32u8).map(|i| 0xe0 + i).collect();
    let wrong = derive_keys_from_seed(&wrong_seed).expect("wrong key");
    let initial = bytes(
        &vector("04-psk-envelope.json")["capturedEnvelope"]["initialPSK"],
        "initialPSK",
    );

    let cases = v["cases"].as_array().expect("cases");
    let names: BTreeSet<&str> = cases.iter().map(|c| text(&c["name"], "06 name")).collect();
    let known: BTreeSet<&str> = NEGATIVE_CASES.iter().map(|(name, _)| *name).collect();
    assert_eq!(names, known, "06: every case needs exactly one handler");
    assert_eq!(names.len(), cases.len(), "06: duplicate case name");

    for case in cases {
        let name = text(&case["name"], "06 name");
        let allowed: &[&str] = if case.get("note").is_some() {
            &["name", "input", "note", "expect"]
        } else {
            &["name", "input", "expect"]
        };
        keys(case, allowed, name);
        let input = bytes(&case["input"], name);
        let expect = &case["expect"];
        let (_, kind) = NEGATIVE_CASES
            .iter()
            .find(|(known, _)| *known == name)
            .expect("handler");
        match kind {
            Negative::Classify => {
                keys(expect, &["result", "isChatMessage", "isPSKMessage"], name);
                assert_eq!(expect["result"], "classified", "{name}");
                assert_eq!(
                    Some(is_chat_message(&input)),
                    expect["isChatMessage"].as_bool(),
                    "{name}"
                );
                assert_eq!(
                    Some(is_psk_message(&input)),
                    expect["isPSKMessage"].as_bool(),
                    "{name}"
                );
                continue;
            }
            _ => {
                keys(expect, &["result", "error"], name);
                assert_eq!(expect["result"], "throw", "{name}: every 06 case must fail");
            }
        }
        let envelope_error = matches!(
            text(&expect["error"], name),
            "EnvelopeError" | "PSKEnvelopeError"
        );
        match kind {
            Negative::Classify => unreachable!(),
            Negative::Decode => {
                assert!(
                    ChatEnvelope::decode(&input).is_err(),
                    "{name}: must not decode"
                );
            }
            Negative::Open(who) => {
                let decoded = ChatEnvelope::decode(&input);
                if envelope_error {
                    assert!(decoded.is_err(), "{name}: must be rejected while decoding");
                    continue;
                }
                let Ok(envelope) = decoded else { continue };
                let (private, public) = match *who {
                    "A" => (&a.0, &a.1),
                    "B" => (&b.0, &b.1),
                    _ => (&wrong.0, &wrong.1),
                };
                assert!(
                    decrypt_message(&envelope, private, public).is_err(),
                    "{name}: must not open"
                );
            }
            Negative::OpenPsk { shifted } => {
                let decoded = decode_psk_envelope(&input);
                if envelope_error {
                    assert!(decoded.is_err(), "{name}: must be rejected while decoding");
                    continue;
                }
                let Ok(envelope) = decoded else { continue };
                // Rust derives the position key from the initial PSK and the
                // envelope's counter. A chain shifted by one position stands in
                // for TypeScript's "key at counter 1" input.
                let psk = if *shifted {
                    derive_psk_at_counter(&initial, 1).expect("shift").to_vec()
                } else {
                    initial.clone()
                };
                assert!(
                    decrypt_psk_message(&envelope, &b.0, &b.1, &psk).is_err(),
                    "{name}: must not open"
                );
            }
        }
    }
}
