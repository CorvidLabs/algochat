//! REQ-protocol-12 (#68): Rust writes the `ACPQ` Hybrid key announcement
//! byte for byte the way TypeScript does.
//!
//! `vectors/pq-announcement-v1.json` is a byte-identical copy of the file that
//! `ts/scripts/emit-pq-announcement-vector.ts` writes. It ships in the crate,
//! so this test also runs from the package. Every field and every parse case
//! is checked; an unknown field, case result or missing file fails.

use algochat::{
    derive_mlkem768, encode_pq_announcement, is_pq_announcement, parse_pq_announcement,
    pq_announcement_signing_input,
};
use ed25519_dalek::SigningKey;
use serde_json::Value;
use std::collections::BTreeSet;

const FILE: &str = "pq-announcement-v1.json";

const FIELDS: &[&str] = &[
    "description",
    "generated_by",
    "announcement_version",
    "signature_label",
    "unsigned_size",
    "signed_size",
    "account_seed",
    "encaps_key",
    "ed25519_public_key",
    "other_signer_seed",
    "other_signer_public_key",
    "signing_input",
    "unsigned_note",
    "signed_note",
    "parse_cases",
    "bad_encaps_key_lengths",
];

const CASE_FIELDS: &[&str] = &["name", "note", "verifying_key", "is_announcement", "expect"];

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

fn number(value: &Value, context: &str) -> u64 {
    value
        .as_u64()
        .unwrap_or_else(|| panic!("{context}: not a number"))
}

fn signer(value: &Value, context: &str) -> SigningKey {
    let seed: [u8; 32] = bytes(value, context)
        .try_into()
        .unwrap_or_else(|_| panic!("{context}: expected 32 bytes"));
    SigningKey::from_bytes(&seed)
}

#[test]
fn encodes_the_typescript_announcement_from_the_account_seed() {
    let v = vector();
    keys(&v, FIELDS, FILE);
    assert_eq!(
        text(&v["signature_label"], "signature_label"),
        "AlgoChat-pq-ek-v1"
    );
    assert_eq!(
        number(&v["announcement_version"], "announcement_version"),
        1
    );

    let seed = bytes(&v["account_seed"], "account_seed");
    let encaps_key = derive_mlkem768(&seed).expect("derive").encaps_key;
    assert_eq!(
        encaps_key,
        bytes(&v["encaps_key"], "encaps_key"),
        "ML-KEM key from the seed"
    );

    let signing = signer(&v["account_seed"], "account_seed");
    assert_eq!(
        signing.verifying_key().as_bytes().to_vec(),
        bytes(&v["ed25519_public_key"], "ed25519_public_key")
    );
    let other = signer(&v["other_signer_seed"], "other_signer_seed");
    assert_eq!(
        other.verifying_key().as_bytes().to_vec(),
        bytes(&v["other_signer_public_key"], "other_signer_public_key")
    );

    let input = pq_announcement_signing_input(&encaps_key).expect("signing input");
    assert_eq!(input.to_vec(), bytes(&v["signing_input"], "signing_input"));

    let unsigned = encode_pq_announcement(&encaps_key, None).expect("unsigned");
    assert_eq!(unsigned, bytes(&v["unsigned_note"], "unsigned_note"));
    assert_eq!(
        unsigned.len() as u64,
        number(&v["unsigned_size"], "unsigned_size")
    );
    assert_eq!(unsigned.len(), 1189);

    let signed = encode_pq_announcement(&encaps_key, Some(&signing)).expect("signed");
    assert_eq!(signed, bytes(&v["signed_note"], "signed_note"));
    assert_eq!(
        signed.len() as u64,
        number(&v["signed_size"], "signed_size")
    );
    assert_eq!(signed.len(), 1253);
}

#[test]
fn round_trips_through_the_parser() {
    let v = vector();
    let encaps_key = bytes(&v["encaps_key"], "encaps_key");
    let signing = signer(&v["account_seed"], "account_seed");
    let public = signing.verifying_key().to_bytes();

    let unsigned = encode_pq_announcement(&encaps_key, None).expect("unsigned");
    let parsed = parse_pq_announcement(&unsigned, None).expect("unsigned parses");
    assert!(!parsed.verified);
    assert_eq!(parsed.encaps_key, encaps_key);

    let signed = encode_pq_announcement(&encaps_key, Some(&signing)).expect("signed");
    let parsed = parse_pq_announcement(&signed, Some(&public)).expect("signed parses");
    assert!(parsed.verified);
    assert_eq!(parsed.encaps_key, encaps_key);
}

#[test]
fn every_parse_case_matches_typescript() {
    let v = vector();
    let encaps_key = bytes(&v["encaps_key"], "encaps_key");
    let cases = v["parse_cases"]
        .as_array()
        .expect("parse_cases: not an array");
    assert!(!cases.is_empty(), "parse_cases: empty");
    let mut names = BTreeSet::new();
    let mut results = BTreeSet::new();
    for case in cases {
        let name = text(&case["name"], "parse case name");
        keys(case, CASE_FIELDS, name);
        assert!(names.insert(name), "{name}: duplicate case name");
        let note = bytes(&case["note"], name);
        let key = match &case["verifying_key"] {
            Value::Null => None,
            value => Some(bytes(value, name)),
        };
        let is_announcement = case["is_announcement"]
            .as_bool()
            .unwrap_or_else(|| panic!("{name}: is_announcement is not a boolean"));
        assert_eq!(
            is_pq_announcement(&note),
            is_announcement,
            "{name}: is_pq_announcement"
        );
        let parsed = parse_pq_announcement(&note, key.as_deref());
        let expect = text(&case["expect"], name);
        results.insert(expect);
        match expect {
            "rejected" => assert!(parsed.is_none(), "{name}: accepted"),
            "unverified" | "verified" => {
                let parsed = parsed.unwrap_or_else(|| panic!("{name}: rejected"));
                assert_eq!(parsed.verified, expect == "verified", "{name}: verified");
                assert_eq!(parsed.encaps_key, encaps_key, "{name}: encapsulation key");
            }
            other => panic!("{name}: unknown result {other:?}"),
        }
    }
    let all: BTreeSet<&str> = ["rejected", "unverified", "verified"].into_iter().collect();
    assert_eq!(results, all, "parse_cases must cover every result");
}

#[test]
fn rejects_every_bad_encapsulation_key_length() {
    let v = vector();
    let signing = signer(&v["account_seed"], "account_seed");
    let lengths = v["bad_encaps_key_lengths"]
        .as_array()
        .expect("bad_encaps_key_lengths: not an array");
    assert!(!lengths.is_empty(), "bad_encaps_key_lengths: empty");
    for length in lengths {
        let length = number(length, "bad_encaps_key_lengths") as usize;
        let key = vec![0x07u8; length];
        assert!(
            encode_pq_announcement(&key, None).is_err(),
            "{length}: unsigned accepted"
        );
        assert!(
            encode_pq_announcement(&key, Some(&signing)).is_err(),
            "{length}: signed accepted"
        );
        assert!(
            pq_announcement_signing_input(&key).is_err(),
            "{length}: signing input accepted"
        );
    }
}
