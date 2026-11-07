//! REQ-protocol-14 (#70c-1): a Rust app joins a room the way Raven web does. It recovers
//! its session from the owner's handshake with its own seed, opens its room
//! key, checks the delivery against the accepted records and reads every
//! message, and ignores a note from someone who is not a member.
//!
//! `vectors/room-session-v1.json` is a byte-identical copy of the file that
//! `ts/scripts/emit-room-session-vector.ts` writes. It ships in the crate, so
//! this test also runs from the package. Rust only reads these notes here.

use algochat::{
    accept_pq_handshake, delivery_authorized, derive_keys_from_seed, derive_mlkem768,
    open_group_key_delivery, open_group_message, open_pq_handshake_as_sender, reduce_admin,
    sender_may_post, AdminEvent, PqSession, ReduceAdminResult,
};
use ed25519_dalek::SigningKey;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

const FILE: &str = "room-session-v1.json";

const FIELDS: &[&str] = &[
    "description",
    "generated_by",
    "accounts",
    "room",
    "admin",
    "state",
    "handshakes",
    "deliveries",
    "messages",
    "outsider_note",
    "cases",
];
const ACCOUNT_FIELDS: &[&str] = &["seed", "address", "x25519_public", "encaps_key"];
const ROOM_FIELDS: &[&str] = &["group_id", "mailbox", "name", "epoch", "group_key"];
const ADMIN_FIELDS: &[&str] = &["name", "sender", "tx_id", "round", "offset", "note"];
const STATE_FIELDS: &[&str] = &["owner", "admins", "members", "epoch", "head_tx_id"];
const HANDSHAKE_FIELDS: &[&str] = &[
    "name",
    "sender",
    "recipient",
    "note",
    "handshake_id",
    "session_key",
];
const DELIVERY_FIELDS: &[&str] = &["name", "recipient", "handshake", "admin_tx_id", "note"];
const MESSAGE_FIELDS: &[&str] = &["index", "sender", "epoch", "counter", "plaintext", "note"];
const OPEN_DELIVERY_FIELDS: &[&str] = &["name", "op", "account", "handshake", "note", "expect"];
const AUTHORIZE_FIELDS: &[&str] = &[
    "name",
    "op",
    "admin_tx_id",
    "sender",
    "recipient",
    "epoch",
    "expect",
];
const OPEN_MESSAGE_FIELDS: &[&str] = &["name", "op", "sender", "accepted", "note", "expect"];

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

fn array32(value: &Value, context: &str) -> [u8; 32] {
    bytes(value, context)
        .try_into()
        .unwrap_or_else(|_| panic!("{context}: not 32 bytes"))
}

fn number(value: &Value, context: &str) -> u64 {
    value
        .as_u64()
        .unwrap_or_else(|| panic!("{context}: not a number"))
}

fn u32_of(value: &Value, context: &str) -> u32 {
    u32::try_from(number(value, context)).unwrap_or_else(|_| panic!("{context}: not 32-bit"))
}

fn array<'a>(value: &'a Value, context: &str) -> &'a Vec<Value> {
    let items = value
        .as_array()
        .unwrap_or_else(|| panic!("{context}: not an array"));
    assert!(!items.is_empty(), "{context}: empty");
    items
}

struct Account {
    seed: Vec<u8>,
    address: [u8; 32],
}

struct Room {
    accounts: BTreeMap<String, Account>,
    group_id: [u8; 32],
    mailbox: [u8; 32],
    epoch: u32,
    group_key: [u8; 32],
    reduced: ReduceAdminResult,
    handshakes: BTreeMap<String, (String, String, Vec<u8>)>,
}

impl Room {
    fn load(v: &Value) -> Room {
        keys(v, FIELDS, FILE);
        let mut accounts = BTreeMap::new();
        for (name, item) in v["accounts"].as_object().expect("accounts: not an object") {
            // Messages here stay static: they never include an account's name or bytes.
            keys(item, ACCOUNT_FIELDS, "an account");
            let seed = bytes(&item["seed"], "an account seed");
            let seed32: [u8; 32] = seed.clone().try_into().expect("32-byte seed");
            let address = SigningKey::from_bytes(&seed32).verifying_key().to_bytes();
            assert_eq!(
                address,
                array32(&item["address"], "an account address"),
                "an account's address does not come from its seed"
            );
            let (_, public) = derive_keys_from_seed(&seed).expect("X25519 keys");
            assert_eq!(
                public.as_bytes().to_vec(),
                bytes(&item["x25519_public"], "an account X25519 key"),
                "an account's X25519 key does not come from its seed"
            );
            let mlkem = derive_mlkem768(&seed).expect("ML-KEM keys");
            assert_eq!(
                mlkem.encaps_key,
                bytes(&item["encaps_key"], "an account ML-KEM key"),
                "an account's ML-KEM key does not come from its seed"
            );
            accounts.insert(name.clone(), Account { seed, address });
        }
        assert!(
            accounts.keys().map(String::as_str).collect::<BTreeSet<_>>()
                == BTreeSet::from(["member_a", "member_b", "outsider", "owner"]),
            "the accounts are not owner, member_a, member_b and outsider"
        );
        let room = &v["room"];
        keys(room, ROOM_FIELDS, "room");
        let mut events = Vec::new();
        for item in array(&v["admin"], "admin") {
            let name = text(&item["name"], "admin name");
            keys(item, ADMIN_FIELDS, name);
            let sender = text(&item["sender"], name);
            events.push(AdminEvent {
                note: bytes(&item["note"], name),
                sender: accounts[sender].address,
                tx_id: array32(&item["tx_id"], name),
                round: number(&item["round"], name),
                offset: number(&item["offset"], name),
            });
        }
        let reduced = reduce_admin(&events);
        assert!(
            reduced.rejected.is_empty(),
            "every administration record is accepted: {:?}",
            reduced.rejected
        );
        let mut handshakes = BTreeMap::new();
        for item in array(&v["handshakes"], "handshakes") {
            let name = text(&item["name"], "handshake name").to_string();
            keys(item, HANDSHAKE_FIELDS, &name);
            handshakes.insert(
                name.clone(),
                (
                    text(&item["sender"], &name).to_string(),
                    text(&item["recipient"], &name).to_string(),
                    bytes(&item["note"], &name),
                ),
            );
        }
        Room {
            group_id: array32(&room["group_id"], "group_id"),
            mailbox: array32(&room["mailbox"], "mailbox"),
            epoch: u32_of(&room["epoch"], "epoch"),
            group_key: array32(&room["group_key"], "group_key"),
            accounts,
            reduced,
            handshakes,
        }
    }

    fn account(&self, name: &str) -> &Account {
        self.accounts
            .get(name)
            .unwrap_or_else(|| panic!("the vector names an unknown account"))
    }

    fn name_of(&self, address: &[u8; 32]) -> &str {
        self.accounts
            .iter()
            .find(|(_, account)| account.address == *address)
            .map(|(name, _)| name.as_str())
            .unwrap_or("unknown")
    }

    /// The session `account` gets from a handshake: recovered as its sender, or accepted as its recipient.
    fn session(&self, account: &str, handshake: &str) -> algochat::Result<PqSession> {
        let (sender, _, note) = self
            .handshakes
            .get(handshake)
            .unwrap_or_else(|| panic!("unknown handshake {handshake}"));
        let seed = &self.account(account).seed;
        if account == sender {
            open_pq_handshake_as_sender(note, seed)
        } else {
            accept_pq_handshake(note, seed)
        }
    }
}

#[test]
fn the_room_reduces_the_way_typescript_does() {
    let v = vector();
    let room = Room::load(&v);
    let state = room.reduced.state.as_ref().expect("a room");
    let expected = &v["state"];
    keys(expected, STATE_FIELDS, "state");
    assert!(
        room.name_of(&state.owner) == text(&expected["owner"], "owner"),
        "the owner differs from TypeScript's"
    );
    assert!(
        state.admins.is_empty() && array_is_empty(&expected["admins"]),
        "admins"
    );
    let mut members: Vec<&str> = state
        .members
        .iter()
        .map(|member| room.name_of(member))
        .collect();
    members.sort_unstable();
    let expected_members: Vec<&str> = array(&expected["members"], "members")
        .iter()
        .map(|item| text(item, "member"))
        .collect();
    assert!(
        members == expected_members,
        "members differ from TypeScript's"
    );
    assert_eq!(state.epoch, u32_of(&expected["epoch"], "state epoch"));
    assert_eq!(state.epoch, room.epoch, "room epoch");
    assert_eq!(state.group_id, room.group_id, "group id");
    assert_eq!(state.mailbox, room.mailbox, "mailbox");
    assert_eq!(
        state.head_tx_id,
        array32(&expected["head_tx_id"], "head_tx_id")
    );
}

fn array_is_empty(value: &Value) -> bool {
    value.as_array().is_some_and(Vec::is_empty)
}

#[test]
fn each_member_joins_over_its_own_session() {
    let v = vector();
    let room = Room::load(&v);
    for item in array(&v["handshakes"], "handshakes") {
        let name = text(&item["name"], "handshake name");
        let note = bytes(&item["note"], name);
        assert_eq!(note.len(), 2366, "{name}: handshake size");
        for (side, account) in [
            ("recipient", text(&item["recipient"], name)),
            ("sender", text(&item["sender"], name)),
        ] {
            let session = room
                .session(account, name)
                .unwrap_or_else(|error| panic!("{name}: the {side}: {error}"));
            assert_eq!(
                session.session_key.to_vec(),
                bytes(&item["session_key"], name),
                "{name}: the {side}'s session key"
            );
            assert_eq!(
                session.handshake_id.to_vec(),
                bytes(&item["handshake_id"], name),
                "{name}: handshake id"
            );
        }
    }
    let owner = room.account("owner").address;
    let mut joined = BTreeSet::new();
    for item in array(&v["deliveries"], "deliveries") {
        let name = text(&item["name"], "delivery name");
        keys(item, DELIVERY_FIELDS, name);
        let recipient = text(&item["recipient"], name);
        let note = bytes(&item["note"], name);
        assert_eq!(note.len(), 227, "{name}: delivery size");
        let session = room
            .session(recipient, text(&item["handshake"], name))
            .unwrap_or_else(|error| panic!("{name}: {error}"));
        let delivery = open_group_key_delivery(&note, &session)
            .unwrap_or_else(|error| panic!("{name}: {error}"));
        assert_eq!(delivery.group_key, room.group_key, "{name}: room key");
        assert_eq!(delivery.group_id, room.group_id, "{name}: group id");
        assert_eq!(delivery.mailbox, room.mailbox, "{name}: mailbox");
        assert_eq!(delivery.epoch, room.epoch, "{name}: epoch");
        assert_eq!(
            delivery.admin_tx_id,
            array32(&item["admin_tx_id"], name),
            "{name}: record"
        );
        assert!(
            delivery_authorized(
                &room.reduced.accepted,
                &delivery.admin_tx_id,
                &owner,
                &room.account(recipient).address,
                delivery.epoch
            ),
            "{name}: not authorized"
        );
        joined.insert(recipient);
    }
    assert!(
        joined == BTreeSet::from(["member_a", "member_b"]),
        "both members join"
    );
}

#[test]
fn every_member_reads_every_message_once() {
    let v = vector();
    let room = Room::load(&v);
    let state = room.reduced.state.as_ref().expect("a room");
    let mut accepted: BTreeMap<&str, Vec<(u32, u32)>> = BTreeMap::new();
    let mut senders = BTreeSet::new();
    for (position, item) in array(&v["messages"], "messages").iter().enumerate() {
        let context = format!("message {position}");
        keys(item, MESSAGE_FIELDS, &context);
        assert_eq!(
            number(&item["index"], &context),
            position as u64,
            "{context}: index"
        );
        let sender = text(&item["sender"], &context);
        let address = room.account(sender).address;
        let note = bytes(&item["note"], &context);
        let scope = accepted.entry(sender).or_default();
        let message = open_group_message(&note, &room.group_key, &address, scope)
            .unwrap_or_else(|error| panic!("{context}: {error}"));
        assert!(
            sender_may_post(state, &address, message.epoch),
            "{context}: the sender may not post"
        );
        assert_eq!(
            message.plaintext,
            text(&item["plaintext"], &context).as_bytes(),
            "{context}: plaintext"
        );
        assert_eq!(
            message.epoch,
            u32_of(&item["epoch"], &context),
            "{context}: epoch"
        );
        assert_eq!(
            message.counter,
            u32_of(&item["counter"], &context),
            "{context}: counter"
        );
        assert_eq!(message.group_id, room.group_id, "{context}: group id");
        assert!(
            open_group_message(
                &note,
                &room.group_key,
                &address,
                &[(message.epoch, message.counter)]
            )
            .is_err(),
            "{context}: a repeat is rejected"
        );
        scope.push((message.epoch, message.counter));
        senders.insert(sender);
    }
    assert!(
        senders == BTreeSet::from(["member_a", "member_b", "owner"]),
        "all three members post"
    );
    let outsider = room.account("outsider").address;
    let note = bytes(&v["outsider_note"], "outsider_note");
    let opened = open_group_message(&note, &room.group_key, &outsider, &[])
        .expect("the outsider's note opens");
    assert!(
        !sender_may_post(state, &outsider, opened.epoch),
        "the outsider's note is ignored"
    );
}

#[test]
fn every_case_matches_typescript() {
    let v = vector();
    let room = Room::load(&v);
    let state = room.reduced.state.as_ref().expect("a room");
    let mut names = BTreeSet::new();
    let mut seen = BTreeSet::new();
    for case in array(&v["cases"], "cases") {
        let name = text(&case["name"], "case name");
        assert!(names.insert(name), "{name}: duplicate case name");
        let op = text(&case["op"], name);
        let accepted = match op {
            "open_delivery" => {
                keys(case, OPEN_DELIVERY_FIELDS, name);
                room.session(text(&case["account"], name), text(&case["handshake"], name))
                    .ok()
                    .and_then(|session| {
                        open_group_key_delivery(&bytes(&case["note"], name), &session).ok()
                    })
                    .is_some()
            }
            "authorize" => {
                keys(case, AUTHORIZE_FIELDS, name);
                delivery_authorized(
                    &room.reduced.accepted,
                    &array32(&case["admin_tx_id"], name),
                    &room.account(text(&case["sender"], name)).address,
                    &room.account(text(&case["recipient"], name)).address,
                    u32_of(&case["epoch"], name),
                )
            }
            "open_message" => {
                keys(case, OPEN_MESSAGE_FIELDS, name);
                let address = room.account(text(&case["sender"], name)).address;
                let pairs: Vec<(u32, u32)> = case["accepted"]
                    .as_array()
                    .unwrap_or_else(|| panic!("{name}: accepted is not an array"))
                    .iter()
                    .map(|pair| {
                        let pair = pair
                            .as_array()
                            .filter(|items| items.len() == 2)
                            .unwrap_or_else(|| panic!("{name}: a pair"));
                        (u32_of(&pair[0], name), u32_of(&pair[1], name))
                    })
                    .collect();
                open_group_message(
                    &bytes(&case["note"], name),
                    &room.group_key,
                    &address,
                    &pairs,
                )
                .is_ok_and(|message| sender_may_post(state, &address, message.epoch))
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
    for op in ["open_delivery", "authorize", "open_message"] {
        for expect in ["accepted", "rejected"] {
            assert!(seen.contains(&(op, expect)), "no {expect} {op} case");
        }
    }
}
