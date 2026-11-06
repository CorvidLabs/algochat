//! REQ-protocol-15 (#70c-2): when a room key changes, a Rust app reads each
//! message with the key for its own epoch, and when a key handout is cut
//! short it resumes only the people who were missed, at most 16 at a time,
//! the way Raven web does. A removed member also leaves the channel, which
//! gets its own new key.
//!
//! `vectors/room-rekey-v1.json` is a byte-identical copy of the file that
//! `ts/scripts/emit-room-rekey-vector.ts` writes. It ships in the crate, so
//! this test also runs from the package. Rust only reads these notes here.
//! Failure messages name a case, an index or a role, never an account.

use algochat::{
    accept_pq_handshake, authorized_recipients, channel_departures, delivery_authorized,
    derive_keys_from_seed, derive_mlkem768, next_delivery_batch, open_group_key_delivery,
    open_group_message, pending_key_deliveries, reduce_admin, reduce_admin_with_parent,
    sender_may_post, AcceptedAdmin, AdminEvent, PqSession, RoomState,
};
use ed25519_dalek::SigningKey;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

const FILE: &str = "room-rekey-v1.json";

const FIELDS: &[&str] = &[
    "description",
    "generated_by",
    "batch_size",
    "accounts",
    "rooms",
    "admin",
    "states",
    "handshakes",
    "deliveries",
    "handouts",
    "channel_departures",
    "messages",
    "cases",
];
const ACCOUNT_FIELDS: &[&str] = &["seed", "address", "x25519_public", "encaps_key"];
const ROOM_FIELDS: &[&str] = &["group_id", "mailbox", "name", "keys"];
const ADMIN_FIELDS: &[&str] = &["name", "room", "sender", "tx_id", "round", "offset", "note"];
const STATE_FIELDS: &[&str] = &[
    "owner",
    "admins",
    "members",
    "epoch",
    "head_tx_id",
    "parent_group_id",
];
const HANDSHAKE_FIELDS: &[&str] = &["name", "recipient", "note", "handshake_id", "session_key"];
const DELIVERY_FIELDS: &[&str] = &[
    "name",
    "room",
    "recipient",
    "handshake",
    "epoch",
    "admin_tx_id",
    "note",
];
const HANDOUT_FIELDS: &[&str] = &[
    "admin_tx_id",
    "recipients",
    "first",
    "landed",
    "pending",
    "resumed",
];
const MESSAGE_FIELDS: &[&str] = &[
    "index",
    "room",
    "sender",
    "epoch",
    "counter",
    "plaintext",
    "note",
];
const READ_FIELDS: &[&str] = &["name", "op", "room", "key_epoch", "message", "expect"];
const AUTHORIZE_FIELDS: &[&str] = &[
    "name",
    "op",
    "room",
    "admin_tx_id",
    "sender",
    "recipient",
    "epoch",
    "expect",
];
const MAY_POST_FIELDS: &[&str] = &["name", "op", "room", "sender", "epoch", "expect"];

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

fn strings<'a>(value: &'a Value, context: &str) -> Vec<&'a str> {
    value
        .as_array()
        .unwrap_or_else(|| panic!("{context}: not an array"))
        .iter()
        .map(|item| text(item, context))
        .collect()
}

struct Place {
    group_id: [u8; 32],
    mailbox: [u8; 32],
    keys: BTreeMap<u32, [u8; 32]>,
}

struct Vector {
    v: Value,
    seeds: BTreeMap<String, Vec<u8>>,
    addresses: BTreeMap<String, [u8; 32]>,
    places: BTreeMap<String, Place>,
    room_events: Vec<(String, AdminEvent)>,
    channel_events: Vec<(String, AdminEvent)>,
    handshakes: BTreeMap<String, Vec<u8>>,
}

impl Vector {
    fn load() -> Vector {
        let v = vector();
        keys(&v, FIELDS, FILE);
        assert_eq!(v["batch_size"].as_u64(), Some(16), "batch size");
        let mut seeds = BTreeMap::new();
        let mut addresses = BTreeMap::new();
        // Messages here stay static: they never include an account's name or bytes.
        for (name, item) in v["accounts"].as_object().expect("accounts: not an object") {
            keys(item, ACCOUNT_FIELDS, "an account");
            let seed = bytes(&item["seed"], "an account seed");
            let seed32: [u8; 32] = seed.clone().try_into().expect("32-byte seed");
            let address = SigningKey::from_bytes(&seed32).verifying_key().to_bytes();
            assert!(
                address == array32(&item["address"], "an account address"),
                "an account's address does not come from its seed"
            );
            let (_, public) = derive_keys_from_seed(&seed).expect("X25519 keys");
            assert!(
                public.as_bytes().to_vec()
                    == bytes(&item["x25519_public"], "an account X25519 key"),
                "an account's X25519 key does not come from its seed"
            );
            let mlkem = derive_mlkem768(&seed).expect("ML-KEM keys");
            assert!(
                mlkem.encaps_key == bytes(&item["encaps_key"], "an account ML-KEM key"),
                "an account's ML-KEM key does not come from its seed"
            );
            seeds.insert(name.clone(), seed);
            addresses.insert(name.clone(), address);
        }
        assert_eq!(seeds.len(), 19, "the owner and 18 members");
        let mut places = BTreeMap::new();
        for place in ["room", "channel"] {
            let item = &v["rooms"][place];
            keys(item, ROOM_FIELDS, place);
            let mut epoch_keys = BTreeMap::new();
            for (epoch, key) in item["keys"].as_object().expect("keys: not an object") {
                let epoch: u32 = epoch.parse().expect("an epoch number");
                epoch_keys.insert(epoch, array32(key, "a room key"));
            }
            assert_eq!(
                epoch_keys.keys().copied().collect::<Vec<_>>(),
                vec![1, 2],
                "{place}: keys for epochs 1 and 2"
            );
            places.insert(
                place.to_string(),
                Place {
                    group_id: array32(&item["group_id"], "group_id"),
                    mailbox: array32(&item["mailbox"], "mailbox"),
                    keys: epoch_keys,
                },
            );
        }
        let mut room_events = Vec::new();
        let mut channel_events = Vec::new();
        for (index, item) in array(&v["admin"], "admin").iter().enumerate() {
            let context = format!("admin record {index}");
            keys(item, ADMIN_FIELDS, &context);
            let sender = addresses
                .get(text(&item["sender"], &context))
                .copied()
                .unwrap_or_else(|| panic!("{context}: unknown sender"));
            let event = AdminEvent {
                note: bytes(&item["note"], &context),
                sender,
                tx_id: array32(&item["tx_id"], &context),
                round: number(&item["round"], &context),
                offset: number(&item["offset"], &context),
            };
            let name = text(&item["name"], &context).to_string();
            match text(&item["room"], &context) {
                "room" => room_events.push((name, event)),
                "channel" => channel_events.push((name, event)),
                other => panic!("{context}: unknown room {other:?}"),
            }
        }
        let mut handshakes = BTreeMap::new();
        for (index, item) in array(&v["handshakes"], "handshakes").iter().enumerate() {
            let context = format!("handshake {index}");
            keys(item, HANDSHAKE_FIELDS, &context);
            handshakes.insert(
                text(&item["name"], &context).to_string(),
                bytes(&item["note"], &context),
            );
        }
        Vector {
            v,
            seeds,
            addresses,
            places,
            room_events,
            channel_events,
            handshakes,
        }
    }

    fn address(&self, name: &str) -> [u8; 32] {
        *self
            .addresses
            .get(name)
            .unwrap_or_else(|| panic!("the vector names an unknown account"))
    }

    fn name_of(&self, address: &[u8; 32]) -> String {
        self.addresses
            .iter()
            .find(|(_, item)| *item == address)
            .map(|(name, _)| name.clone())
            .unwrap_or_else(|| "unknown".to_string())
    }

    fn names(&self, list: &[[u8; 32]]) -> Vec<String> {
        list.iter().map(|item| self.name_of(item)).collect()
    }

    fn place(&self, name: &str) -> &Place {
        self.places
            .get(name)
            .unwrap_or_else(|| panic!("unknown room {name:?}"))
    }

    fn events(list: &[(String, AdminEvent)], until: Option<&str>) -> Vec<AdminEvent> {
        list.iter()
            .take_while(|(name, _)| Some(name.as_str()) != until)
            .map(|(_, event)| event.clone())
            .collect()
    }

    fn room(&self, until: Option<&str>) -> (RoomState, Vec<AcceptedAdmin>) {
        let reduced = reduce_admin(&Self::events(&self.room_events, until));
        assert!(reduced.rejected.is_empty(), "a room record was rejected");
        (reduced.state.expect("a room"), reduced.accepted)
    }

    fn channel(
        &self,
        until: Option<&str>,
        parent_until: Option<&str>,
    ) -> (RoomState, Vec<AcceptedAdmin>) {
        let reduced = reduce_admin_with_parent(
            &Self::events(&self.channel_events, until),
            &Self::events(&self.room_events, parent_until),
        );
        assert!(reduced.rejected.is_empty(), "a channel record was rejected");
        (reduced.state.expect("a channel"), reduced.accepted)
    }

    fn accepted(&self, place: &str) -> Vec<AcceptedAdmin> {
        match place {
            "room" => self.room(None).1,
            "channel" => self.channel(None, None).1,
            other => panic!("unknown room {other:?}"),
        }
    }

    fn session(&self, recipient: &str) -> PqSession {
        let note = self
            .handshakes
            .get(&format!("owner-to-{recipient}"))
            .unwrap_or_else(|| panic!("a delivery names a member without a handshake"));
        let seed = self
            .seeds
            .get(recipient)
            .unwrap_or_else(|| panic!("the vector names an unknown account"));
        accept_pq_handshake(note, seed).expect("recipient accept")
    }

    fn state_matches(&self, state: &RoomState, expected: &Value, context: &str) {
        keys(expected, STATE_FIELDS, context);
        assert!(
            self.name_of(&state.owner) == text(&expected["owner"], context),
            "{context}: the owner differs from TypeScript's"
        );
        assert!(
            state.admins.is_empty() && expected["admins"].as_array().is_some_and(Vec::is_empty),
            "{context}: admins"
        );
        let mut members = self.names(&state.members);
        members.sort();
        assert!(
            members == strings(&expected["members"], context),
            "{context}: members differ from TypeScript's"
        );
        assert_eq!(
            state.epoch,
            u32_of(&expected["epoch"], context),
            "{context}: epoch"
        );
        assert_eq!(
            state.head_tx_id,
            array32(&expected["head_tx_id"], context),
            "{context}: head"
        );
        assert_eq!(
            state.parent_group_id,
            array32(&expected["parent_group_id"], context),
            "{context}: parent group id"
        );
    }
}

#[test]
fn the_room_and_channel_reduce_the_way_typescript_does() {
    let data = Vector::load();
    let states = &data.v["states"];
    let (before, _) = data.room(Some("remove member_b"));
    data.state_matches(
        &before,
        &states["room_before_removal"],
        "room before the removal",
    );
    assert_eq!(before.members.len(), 19, "19 members before the removal");
    let (after, _) = data.room(None);
    data.state_matches(&after, &states["room"], "room");
    assert_eq!(after.epoch, 2, "the removal rotates the room to epoch 2");
    let (channel_before, _) =
        data.channel(Some("channel remove member_b"), Some("remove member_b"));
    data.state_matches(
        &channel_before,
        &states["channel_before_removal"],
        "channel before the removal",
    );
    let (channel, _) = data.channel(None, None);
    data.state_matches(&channel, &states["channel"], "channel");
    assert_eq!(
        channel.parent_group_id, after.group_id,
        "the channel names its parent"
    );
    let departures = channel_departures(&channel_before, &after).expect("channel departures");
    assert!(
        data.names(&departures) == strings(&data.v["channel_departures"], "channel_departures"),
        "channel departures differ from TypeScript's"
    );
}

#[test]
fn every_delivery_opens_for_its_member_and_is_authorized() {
    let data = Vector::load();
    let owner = data.address("owner");
    let mut per_place: BTreeMap<(String, u32), BTreeSet<String>> = BTreeMap::new();
    for (index, item) in array(&data.v["deliveries"], "deliveries")
        .iter()
        .enumerate()
    {
        let context = format!("delivery {index}");
        keys(item, DELIVERY_FIELDS, &context);
        let place_name = text(&item["room"], &context);
        let place = data.place(place_name);
        let recipient = text(&item["recipient"], &context);
        let epoch = u32_of(&item["epoch"], &context);
        let note = bytes(&item["note"], &context);
        assert_eq!(note.len(), 227, "{context}: delivery size");
        let delivery = open_group_key_delivery(&note, &data.session(recipient))
            .unwrap_or_else(|error| panic!("{context}: {error}"));
        assert!(
            delivery.group_key == place.keys[&epoch],
            "{context}: room key"
        );
        assert_eq!(delivery.group_id, place.group_id, "{context}: group id");
        assert_eq!(delivery.mailbox, place.mailbox, "{context}: mailbox");
        assert_eq!(delivery.epoch, epoch, "{context}: epoch");
        assert_eq!(
            delivery.admin_tx_id,
            array32(&item["admin_tx_id"], &context),
            "{context}: record"
        );
        assert!(
            delivery_authorized(
                &data.accepted(place_name),
                &delivery.admin_tx_id,
                &owner,
                &data.address(recipient),
                epoch
            ),
            "{context}: not authorized"
        );
        assert!(
            per_place
                .entry((place_name.to_string(), epoch))
                .or_default()
                .insert(recipient.to_string()),
            "{context}: a delivery is repeated"
        );
    }
    let count = |place: &str, epoch: u32| {
        per_place
            .get(&(place.to_string(), epoch))
            .map_or(0, BTreeSet::len)
    };
    assert_eq!(count("room", 1), 18, "18 epoch-1 room deliveries");
    assert_eq!(count("room", 2), 17, "17 epoch-2 room deliveries");
    assert_eq!(count("channel", 1), 3, "3 epoch-1 channel deliveries");
    assert_eq!(count("channel", 2), 2, "2 epoch-2 channel deliveries");
    for epoch_two in [("room", 2), ("channel", 2)] {
        assert!(
            !per_place[&(epoch_two.0.to_string(), epoch_two.1)].contains("member_b"),
            "the removed member gets no new key"
        );
    }
}

#[test]
fn an_interrupted_handout_resumes_only_the_missed_at_most_16_at_a_time() {
    let data = Vector::load();
    let owner = data.address("owner");
    let deliveries = array(&data.v["deliveries"], "deliveries");
    for place in ["room", "channel"] {
        let handout = &data.v["handouts"][place];
        keys(handout, HANDOUT_FIELDS, place);
        let tx = array32(&handout["admin_tx_id"], place);
        let recipients: Vec<[u8; 32]> =
            authorized_recipients(&data.accepted(place), &tx, &owner, 2)
                .into_iter()
                .filter(|item| *item != owner)
                .collect();
        let list = |field: &str| {
            strings(&handout[field], field)
                .into_iter()
                .map(String::from)
                .collect::<Vec<_>>()
        };
        assert!(
            data.names(&recipients) == list("recipients"),
            "{place}: recipients differ from TypeScript's"
        );
        let first = next_delivery_batch(&recipients);
        assert!(first.len() <= 16, "{place}: a batch is at most 16");
        assert!(
            data.names(&first) == list("first"),
            "{place}: first batch differs from TypeScript's"
        );
        let landed: Vec<[u8; 32]> = list("landed")
            .iter()
            .map(|name| data.address(name))
            .collect();
        assert!(
            landed.len() + 1 == first.len() && first.starts_with(&landed),
            "{place}: all but the last of the first batch landed"
        );
        let pending = pending_key_deliveries(&recipients, &landed);
        assert!(
            data.names(&pending) == list("pending"),
            "{place}: pending differs from TypeScript's"
        );
        assert!(
            pending.first() == first.last(),
            "{place}: the missed payment is resumed first"
        );
        let resumed = next_delivery_batch(&pending);
        assert!(
            data.names(&resumed) == list("resumed"),
            "{place}: resumed batch differs from TypeScript's"
        );
        let mut all = landed.clone();
        all.extend(resumed.iter().copied());
        assert!(
            pending_key_deliveries(&recipients, &all).is_empty(),
            "{place}: nobody is left"
        );
        let sent: Vec<String> = deliveries
            .iter()
            .filter(|item| item["room"] == place && item["epoch"] == 2)
            .map(|item| text(&item["recipient"], "recipient").to_string())
            .collect();
        assert!(
            sent == data.names(&all),
            "{place}: the epoch-2 deliveries are the landed ones, then the resumed ones, once each"
        );
    }
    assert_eq!(
        data.v["handouts"]["room"]["recipients"]
            .as_array()
            .map(Vec::len),
        Some(17),
        "17 room recipients"
    );
}

#[test]
fn each_message_opens_only_under_the_key_for_its_epoch() {
    let data = Vector::load();
    let state_for = |place: &str, epoch: u32| -> RoomState {
        match (place, epoch) {
            ("room", 1) => data.room(Some("remove member_b")).0,
            ("room", _) => data.room(None).0,
            ("channel", 1) => {
                data.channel(Some("channel remove member_b"), Some("remove member_b"))
                    .0
            }
            _ => data.channel(None, None).0,
        }
    };
    let mut accepted: BTreeMap<(String, String), Vec<(u32, u32)>> = BTreeMap::new();
    let mut epochs = BTreeSet::new();
    for (position, item) in array(&data.v["messages"], "messages").iter().enumerate() {
        let context = format!("message {position}");
        keys(item, MESSAGE_FIELDS, &context);
        assert_eq!(
            number(&item["index"], &context),
            position as u64,
            "{context}: index"
        );
        let place_name = text(&item["room"], &context);
        let place = data.place(place_name);
        let sender = text(&item["sender"], &context);
        let address = data.address(sender);
        let epoch = u32_of(&item["epoch"], &context);
        let note = bytes(&item["note"], &context);
        let scope = accepted
            .entry((place_name.to_string(), sender.to_string()))
            .or_default();
        let message = open_group_message(&note, &place.keys[&epoch], &address, scope)
            .unwrap_or_else(|error| panic!("{context}: {error}"));
        assert_eq!(
            message.plaintext,
            text(&item["plaintext"], &context).as_bytes(),
            "{context}: plaintext"
        );
        assert_eq!(message.epoch, epoch, "{context}: epoch");
        assert_eq!(
            message.counter,
            u32_of(&item["counter"], &context),
            "{context}: counter"
        );
        assert_eq!(message.group_id, place.group_id, "{context}: group id");
        assert!(
            sender_may_post(&state_for(place_name, epoch), &address, epoch),
            "{context}: the sender may not post at that point"
        );
        for other in place.keys.keys().filter(|other| **other != epoch) {
            assert!(
                open_group_message(&note, &place.keys[other], &address, &[]).is_err(),
                "{context}: opens under another epoch's key"
            );
        }
        assert!(
            open_group_message(
                &note,
                &place.keys[&epoch],
                &address,
                &[(epoch, message.counter)]
            )
            .is_err(),
            "{context}: a repeat is rejected"
        );
        scope.push((epoch, message.counter));
        epochs.insert((place_name.to_string(), epoch));
    }
    assert_eq!(
        epochs.len(),
        4,
        "messages at both epochs in the room and the channel"
    );
}

#[test]
fn every_case_matches_typescript() {
    let data = Vector::load();
    let owner = data.address("owner");
    let messages = array(&data.v["messages"], "messages");
    let mut names = BTreeSet::new();
    let mut seen = BTreeSet::new();
    for case in array(&data.v["cases"], "cases") {
        let name = text(&case["name"], "case name");
        assert!(names.insert(name), "{name}: duplicate case name");
        let op = text(&case["op"], name);
        let place_name = text(&case["room"], name);
        let accepted = match op {
            "read" => {
                keys(case, READ_FIELDS, name);
                let message = &messages[number(&case["message"], name) as usize];
                let key = data.place(place_name).keys[&u32_of(&case["key_epoch"], name)];
                open_group_message(
                    &bytes(&message["note"], name),
                    &key,
                    &data.address(text(&message["sender"], name)),
                    &[],
                )
                .is_ok()
            }
            "authorize" => {
                keys(case, AUTHORIZE_FIELDS, name);
                assert_eq!(text(&case["sender"], name), "owner", "{name}: sender");
                delivery_authorized(
                    &data.accepted(place_name),
                    &array32(&case["admin_tx_id"], name),
                    &owner,
                    &data.address(text(&case["recipient"], name)),
                    u32_of(&case["epoch"], name),
                )
            }
            "may_post" => {
                keys(case, MAY_POST_FIELDS, name);
                let state = match place_name {
                    "room" => data.room(None).0,
                    _ => data.channel(None, None).0,
                };
                sender_may_post(
                    &state,
                    &data.address(text(&case["sender"], name)),
                    u32_of(&case["epoch"], name),
                )
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
    for op in ["read", "authorize", "may_post"] {
        for expect in ["accepted", "rejected"] {
            assert!(seen.contains(&(op, expect)), "no {expect} {op} case");
        }
    }
}
