//! Group mailbox notes.
//!
//! Protocol 0x06 seals a 101-byte membership record under the hybrid session
//! key. Protocol 0x07 seals a mailbox message under a per-sender message key.

use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{ChaCha20Poly1305, Nonce};
use hkdf::Hkdf;
use sha2::Sha256;

use crate::pq::PqSession;
use crate::types::{AlgoChatError, Result, MAX_NOTE_SIZE, PROTOCOL_VERSION_V2, TAG_SIZE};

const PROTOCOL_MEMBERSHIP: u8 = 0x06;
const PROTOCOL_MESSAGE: u8 = 0x07;
const MEMBERSHIP_HEADER: usize = 78;
const MEMBERSHIP_PLAINTEXT: usize = 101;
const MEMBERSHIP_NOTE: usize = MEMBERSHIP_HEADER + MEMBERSHIP_PLAINTEXT + TAG_SIZE;
const MESSAGE_HEADER: usize = 54;
const MAX_GROUP_PLAINTEXT: usize = MAX_NOTE_SIZE - MESSAGE_HEADER - TAG_SIZE;
const GROUP_INFO: &[u8] = b"AlgoChat-group-v1";

/// Membership record carried in a 0x06 note.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GroupMembership {
    pub action: u8,
    pub epoch: u32,
    pub group_id: [u8; 32],
    pub mailbox: [u8; 32],
    pub group_key: [u8; 32],
}

/// Opened 0x07 mailbox message.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GroupMessage {
    pub plaintext: Vec<u8>,
    pub group_id: [u8; 32],
    pub epoch: u32,
    pub counter: u32,
}

pub fn seal_group_membership(
    session: &PqSession,
    membership: &GroupMembership,
    nonce: &[u8; 12],
) -> Result<Vec<u8>> {
    let plaintext = encode_membership(membership)?;
    let header = membership_header(&session.sender_public, &session.handshake_id, nonce);
    let cipher = ChaCha20Poly1305::new_from_slice(&session.session_key)
        .map_err(|e| AlgoChatError::EncryptionError(e.to_string()))?;
    let sealed = cipher
        .encrypt(
            Nonce::from_slice(nonce),
            Payload {
                msg: &plaintext,
                aad: &header,
            },
        )
        .map_err(|_| AlgoChatError::EncryptionError("seal".into()))?;
    let mut note = header;
    note.extend_from_slice(&sealed);
    if note.len() != MEMBERSHIP_NOTE {
        return Err(AlgoChatError::EncryptionError(format!("{}", note.len())));
    }
    Ok(note)
}

pub fn open_group_membership(note: &[u8], session: &PqSession) -> Result<GroupMembership> {
    if note.len() != MEMBERSHIP_NOTE
        || note[0] != PROTOCOL_VERSION_V2
        || note[1] != PROTOCOL_MEMBERSHIP
    {
        return Err(AlgoChatError::InvalidEnvelope(
            "not a group membership note".into(),
        ));
    }
    if note[2..34] != session.sender_public || note[34..66] != session.handshake_id {
        return Err(AlgoChatError::DecryptionError("header mismatch".into()));
    }
    let cipher = ChaCha20Poly1305::new_from_slice(&session.session_key)
        .map_err(|e| AlgoChatError::DecryptionError(e.to_string()))?;
    let plain = cipher
        .decrypt(
            Nonce::from_slice(&note[66..78]),
            Payload {
                msg: &note[MEMBERSHIP_HEADER..],
                aad: &note[..MEMBERSHIP_HEADER],
            },
        )
        .map_err(|_| {
            AlgoChatError::DecryptionError("group membership authentication failed".into())
        })?;
    decode_membership(&plain)
}

pub fn derive_group_message_key(
    group_key: &[u8; 32],
    epoch: u32,
    counter: u32,
    group_id: &[u8; 32],
    sender_address: &[u8; 32],
) -> Result<[u8; 32]> {
    require_epoch(epoch)?;
    let mut salt = [0u8; 8];
    salt[..4].copy_from_slice(&epoch.to_be_bytes());
    salt[4..].copy_from_slice(&counter.to_be_bytes());
    let mut info = Vec::with_capacity(GROUP_INFO.len() + 64);
    info.extend_from_slice(GROUP_INFO);
    info.extend_from_slice(group_id);
    info.extend_from_slice(sender_address);
    hkdf32(group_key, &salt, &info)
}

pub fn seal_group_message(
    plaintext: &[u8],
    group_key: &[u8; 32],
    group_id: &[u8; 32],
    epoch: u32,
    counter: u32,
    sender_address: &[u8; 32],
    nonce: &[u8; 12],
) -> Result<Vec<u8>> {
    if plaintext.len() > MAX_GROUP_PLAINTEXT {
        return Err(AlgoChatError::EncryptionError(format!(
            "group message too large: {} bytes, max {MAX_GROUP_PLAINTEXT}",
            plaintext.len()
        )));
    }
    let message_key =
        derive_group_message_key(group_key, epoch, counter, group_id, sender_address)?;
    let header = message_header(group_id, epoch, counter, nonce);
    let cipher = ChaCha20Poly1305::new_from_slice(&message_key)
        .map_err(|e| AlgoChatError::EncryptionError(e.to_string()))?;
    let sealed = cipher
        .encrypt(
            Nonce::from_slice(nonce),
            Payload {
                msg: plaintext,
                aad: &header,
            },
        )
        .map_err(|_| AlgoChatError::EncryptionError("seal".into()))?;
    let mut note = header;
    note.extend_from_slice(&sealed);
    Ok(note)
}

/// `accepted` is the `(epoch, counter)` pairs already seen for this sender.
pub fn open_group_message(
    note: &[u8],
    group_key: &[u8; 32],
    sender_address: &[u8; 32],
    accepted: &[(u32, u32)],
) -> Result<GroupMessage> {
    if note.len() < MESSAGE_HEADER + TAG_SIZE
        || note.len() > MAX_NOTE_SIZE
        || note[0] != PROTOCOL_VERSION_V2
        || note[1] != PROTOCOL_MESSAGE
    {
        return Err(AlgoChatError::InvalidEnvelope("not a group message".into()));
    }
    let group_id = read32(note, 2);
    let epoch = read_u32(note, 34);
    let counter = read_u32(note, 38);
    require_epoch(epoch)?;
    // A matching pair is a replay for this sender and epoch.
    if accepted
        .iter()
        .any(|(seen_epoch, seen_counter)| *seen_epoch == epoch && *seen_counter == counter)
    {
        return Err(AlgoChatError::DecryptionError(
            "repeated group counter".into(),
        ));
    }
    let message_key =
        derive_group_message_key(group_key, epoch, counter, &group_id, sender_address)?;
    let cipher = ChaCha20Poly1305::new_from_slice(&message_key)
        .map_err(|e| AlgoChatError::DecryptionError(e.to_string()))?;
    let plaintext = cipher
        .decrypt(
            Nonce::from_slice(&note[42..54]),
            Payload {
                msg: &note[MESSAGE_HEADER..],
                aad: &note[..MESSAGE_HEADER],
            },
        )
        .map_err(|_| {
            AlgoChatError::DecryptionError("group message authentication failed".into())
        })?;
    Ok(GroupMessage {
        plaintext,
        group_id,
        epoch,
        counter,
    })
}

fn encode_membership(membership: &GroupMembership) -> Result<[u8; MEMBERSHIP_PLAINTEXT]> {
    require_action(membership.action)?;
    require_epoch(membership.epoch)?;
    let mut out = [0u8; MEMBERSHIP_PLAINTEXT];
    out[0] = membership.action;
    out[1..5].copy_from_slice(&membership.epoch.to_be_bytes());
    out[5..37].copy_from_slice(&membership.group_id);
    out[37..69].copy_from_slice(&membership.mailbox);
    out[69..101].copy_from_slice(&membership.group_key);
    Ok(out)
}

fn decode_membership(plaintext: &[u8]) -> Result<GroupMembership> {
    if plaintext.len() != MEMBERSHIP_PLAINTEXT {
        return Err(AlgoChatError::InvalidEnvelope(
            "group membership plaintext is the wrong length".into(),
        ));
    }
    let membership = GroupMembership {
        action: plaintext[0],
        epoch: read_u32(plaintext, 1),
        group_id: read32(plaintext, 5),
        mailbox: read32(plaintext, 37),
        group_key: read32(plaintext, 69),
    };
    require_action(membership.action)?;
    require_epoch(membership.epoch)?;
    Ok(membership)
}

fn membership_header(sender: &[u8; 32], handshake_id: &[u8; 32], nonce: &[u8; 12]) -> Vec<u8> {
    let mut header = Vec::with_capacity(MEMBERSHIP_HEADER);
    header.push(PROTOCOL_VERSION_V2);
    header.push(PROTOCOL_MEMBERSHIP);
    header.extend_from_slice(sender);
    header.extend_from_slice(handshake_id);
    header.extend_from_slice(nonce);
    header
}

fn message_header(group_id: &[u8; 32], epoch: u32, counter: u32, nonce: &[u8; 12]) -> Vec<u8> {
    let mut header = Vec::with_capacity(MESSAGE_HEADER);
    header.push(PROTOCOL_VERSION_V2);
    header.push(PROTOCOL_MESSAGE);
    header.extend_from_slice(group_id);
    header.extend_from_slice(&epoch.to_be_bytes());
    header.extend_from_slice(&counter.to_be_bytes());
    header.extend_from_slice(nonce);
    header
}

fn require_action(action: u8) -> Result<()> {
    if !(1..=4).contains(&action) {
        return Err(AlgoChatError::InvalidEnvelope(
            "group action is not 1, 2, 3, or 4".into(),
        ));
    }
    Ok(())
}

fn require_epoch(epoch: u32) -> Result<()> {
    if epoch == 0 {
        return Err(AlgoChatError::InvalidEnvelope(
            "group epoch must be from 1 through 4294967295".into(),
        ));
    }
    Ok(())
}

fn read_u32(bytes: &[u8], offset: usize) -> u32 {
    u32::from_be_bytes([
        bytes[offset],
        bytes[offset + 1],
        bytes[offset + 2],
        bytes[offset + 3],
    ])
}

fn read32(bytes: &[u8], offset: usize) -> [u8; 32] {
    let mut out = [0u8; 32];
    out.copy_from_slice(&bytes[offset..offset + 32]);
    out
}

fn hkdf32(ikm: &[u8], salt: &[u8], info: &[u8]) -> Result<[u8; 32]> {
    let hk = Hkdf::<Sha256>::new(Some(salt), ikm);
    let mut out = [0u8; 32];
    hk.expand(info, &mut out)
        .map_err(|e| AlgoChatError::KeyDerivationFailed(e.to_string()))?;
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    const VECTOR: &str = include_str!("../../vectors/group-v1.json");

    fn vector() -> serde_json::Value {
        serde_json::from_str(VECTOR).unwrap()
    }

    fn hex32(value: &serde_json::Value, key: &str) -> [u8; 32] {
        let bytes = hex::decode(value[key].as_str().unwrap()).unwrap();
        bytes.as_slice().try_into().unwrap()
    }

    fn hex12(value: &serde_json::Value, key: &str) -> [u8; 12] {
        let bytes = hex::decode(value[key].as_str().unwrap()).unwrap();
        bytes.as_slice().try_into().unwrap()
    }

    fn session_from(value: &serde_json::Value) -> PqSession {
        PqSession {
            session_key: hex32(value, "session_key"),
            sender_public: hex32(value, "sender_x25519"),
            recipient_public: [0u8; 32],
            handshake_id: hex32(value, "handshake_id"),
        }
    }

    #[test]
    fn frozen_group_vector() {
        let value = vector();
        let session = session_from(&value);
        let epoch = u32::try_from(value["epoch"].as_u64().unwrap()).unwrap();
        let counter = u32::try_from(value["counter"].as_u64().unwrap()).unwrap();
        let membership = GroupMembership {
            action: u8::try_from(value["action"].as_u64().unwrap()).unwrap(),
            epoch,
            group_id: hex32(&value, "group_id"),
            mailbox: hex32(&value, "mailbox"),
            group_key: hex32(&value, "group_key"),
        };
        let note = seal_group_membership(&session, &membership, &hex12(&value, "membership_nonce"))
            .unwrap();
        assert_eq!(note.len(), 195);
        assert_eq!(
            hex::encode(&note),
            value["membership_note"].as_str().unwrap()
        );

        let opened = open_group_membership(&note, &session).unwrap();
        assert_eq!(opened, membership);

        let sender = hex32(&value, "sender_address");
        let message_key = derive_group_message_key(
            &membership.group_key,
            epoch,
            counter,
            &membership.group_id,
            &sender,
        )
        .unwrap();
        assert_eq!(
            hex::encode(message_key),
            value["message_key"].as_str().unwrap()
        );

        let plaintext = value["plaintext_utf8"].as_str().unwrap().as_bytes();
        let message = seal_group_message(
            plaintext,
            &membership.group_key,
            &membership.group_id,
            epoch,
            counter,
            &sender,
            &hex12(&value, "message_nonce"),
        )
        .unwrap();
        assert_eq!(
            hex::encode(&message),
            value["message_note"].as_str().unwrap()
        );
        assert_eq!(message[0], 0x02);
        assert_eq!(message[1], 0x07);

        let opened_message =
            open_group_message(&message, &membership.group_key, &sender, &[]).unwrap();
        assert_eq!(opened_message.plaintext, plaintext);
        assert_eq!(opened_message.epoch, epoch);
        assert_eq!(opened_message.counter, counter);
        assert_eq!(opened_message.group_id, membership.group_id);
    }

    #[test]
    fn rejects_repeated_counter_and_bad_tag() {
        let value = vector();
        let note = hex::decode(value["message_note"].as_str().unwrap()).unwrap();
        let group_key = hex32(&value, "group_key");
        let sender = hex32(&value, "sender_address");
        let repeated = open_group_message(&note, &group_key, &sender, &[(1, 0)]).unwrap_err();
        assert!(repeated.to_string().contains("repeated"), "{repeated}");

        let mut flipped = note.clone();
        let last = flipped.len() - 1;
        flipped[last] ^= 0x01;
        let bad_tag = open_group_message(&flipped, &group_key, &sender, &[]).unwrap_err();
        assert!(bad_tag.to_string().contains("authentication"), "{bad_tag}");

        let previous = [0x98u8; 32];
        let wrong_key = open_group_message(&note, &previous, &sender, &[]).unwrap_err();
        assert!(
            wrong_key.to_string().contains("authentication"),
            "{wrong_key}"
        );

        let mut membership = hex::decode(value["membership_note"].as_str().unwrap()).unwrap();
        let last = membership.len() - 1;
        membership[last] ^= 0x01;
        let bad_membership = open_group_membership(&membership, &session_from(&value)).unwrap_err();
        assert!(
            bad_membership.to_string().contains("authentication"),
            "{bad_membership}"
        );
    }

    #[test]
    fn rejects_bad_action_epoch_and_oversize_plaintext() {
        assert_eq!(MAX_GROUP_PLAINTEXT, 4026);
        assert_eq!(MEMBERSHIP_NOTE, 195);
        let session = PqSession {
            session_key: [0x42; 32],
            sender_public: [0x11; 32],
            recipient_public: [0; 32],
            handshake_id: [0x43; 32],
        };
        let nonce = [0x55; 12];
        let mut membership = GroupMembership {
            action: 5,
            epoch: 1,
            group_id: [0x77; 32],
            mailbox: [0x88; 32],
            group_key: [0x99; 32],
        };
        assert!(seal_group_membership(&session, &membership, &nonce).is_err());
        membership.action = 1;
        membership.epoch = 0;
        assert!(seal_group_membership(&session, &membership, &nonce).is_err());
        assert!(derive_group_message_key(&[0x99; 32], 0, 0, &[0x77; 32], &[0xaa; 32]).is_err());
        assert!(derive_group_message_key(
            &[0x99; 32],
            u32::MAX,
            u32::MAX,
            &[0x77; 32],
            &[0xaa; 32]
        )
        .is_ok());

        let key = [0x99; 32];
        let group_id = [0x77; 32];
        let sender = [0xaa; 32];
        let full = seal_group_message(
            &[1u8; MAX_GROUP_PLAINTEXT],
            &key,
            &group_id,
            1,
            0,
            &sender,
            &nonce,
        )
        .unwrap();
        assert_eq!(full.len(), MAX_NOTE_SIZE);
        let too_big = seal_group_message(
            &[1u8; MAX_GROUP_PLAINTEXT + 1],
            &key,
            &group_id,
            1,
            1,
            &sender,
            &nonce,
        )
        .unwrap_err();
        assert!(matches!(too_big, AlgoChatError::EncryptionError(_)));
    }
}
