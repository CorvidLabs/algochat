//! Public room administration (protocol 0x03) and 0x06 action-5 key delivery.
//!
//! Pending join requests are derived by the reducer and are not written in the
//! note. Legacy 0x06 actions 1-4 stay 195-byte notes in `group`.

use std::collections::HashSet;

use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{ChaCha20Poly1305, Nonce};

use crate::pq::PqSession;
use crate::types::{MAX_NOTE_SIZE, PROTOCOL_VERSION_V2, TAG_SIZE};

const ADMIN_PROTOCOL: u8 = 0x03;
const DELIVER_PROTOCOL: u8 = 0x06;
const HEADER_LEN: usize = 78;
const NAME_MAX: usize = 64;
const ADMIN_MAX: usize = 16;
const MEMBER_MAX: usize = 100;
const DELIVER_PLAINTEXT: usize = 133;
const DELIVER_NOTE: usize = HEADER_LEN + DELIVER_PLAINTEXT + TAG_SIZE;
const JOINING_INVITE: u8 = 1;
const JOINING_ASK: u8 = 2;

const OP_CREATE: u8 = 1;
const OP_SET_NAME: u8 = 2;
const OP_SET_POLICY: u8 = 3;
const OP_APPOINT_ADMIN: u8 = 4;
const OP_DISMISS_ADMIN: u8 = 5;
const OP_TRANSFER_OWNER: u8 = 6;
const OP_ADD_MEMBER: u8 = 7;
const OP_REQUEST_JOIN: u8 = 8;
const OP_ACCEPT_JOIN: u8 = 9;
const OP_DECLINE_JOIN: u8 = 10;
const OP_REMOVE_MEMBER: u8 = 11;
const OP_REKEY: u8 = 12;

/// Failure whose text is the administration sentence, with no prefix.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("{0}")]
pub struct GroupAdminError(String);

fn fail(message: impl Into<String>) -> GroupAdminError {
    GroupAdminError(message.into())
}

/// Current room, including pending requests derived from accepted records.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RoomState {
    pub group_id: [u8; 32],
    pub mailbox: [u8; 32],
    pub owner: [u8; 32],
    pub admins: Vec<[u8; 32]>,
    pub members: Vec<[u8; 32]>,
    pub pending: Vec<[u8; 32]>,
    pub policy: u8,
    pub name: Vec<u8>,
    pub epoch: u32,
    pub head_tx_id: [u8; 32],
}

/// One confirmed administration payment.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AdminEvent {
    pub note: Vec<u8>,
    pub sender: [u8; 32],
    pub tx_id: [u8; 32],
    pub round: u64,
    pub offset: u64,
}

/// An administration record the reducer accepted.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AcceptedAdmin {
    pub tx_id: [u8; 32],
    pub sender: [u8; 32],
    pub op: u8,
    pub epoch: u32,
    pub subject: [u8; 32],
    pub members: Vec<[u8; 32]>,
}

/// An administration record the reducer rejected.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RejectedAdmin {
    pub tx_id: [u8; 32],
    pub reason: String,
}

/// Reducer output. `state` is `None` until a create is accepted.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ReduceAdminResult {
    pub state: Option<RoomState>,
    pub accepted: Vec<AcceptedAdmin>,
    pub rejected: Vec<RejectedAdmin>,
}

/// Inputs for one drafted record. Absent fields are taken from `state`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AdminDraft {
    pub op: u8,
    pub sender: [u8; 32],
    pub subject: Option<[u8; 32]>,
    pub name: Option<Vec<u8>>,
    pub policy: Option<u8>,
    pub group_id: Option<[u8; 32]>,
    pub mailbox: Option<[u8; 32]>,
}

/// Room key recovered from a 227-byte action-5 note.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct GroupKeyDelivery {
    pub epoch: u32,
    pub group_id: [u8; 32],
    pub mailbox: [u8; 32],
    pub group_key: [u8; 32],
    pub admin_tx_id: [u8; 32],
}

#[derive(Clone)]
struct Decoded {
    parent: [u8; 32],
    group_id: [u8; 32],
    mailbox: [u8; 32],
    epoch: u32,
    op: u8,
    name: Vec<u8>,
    policy: u8,
    owner: [u8; 32],
    admins: Vec<[u8; 32]>,
    members: Vec<[u8; 32]>,
    subject: [u8; 32],
}

struct Body {
    group_id: [u8; 32],
    mailbox: [u8; 32],
    owner: [u8; 32],
    admins: Vec<[u8; 32]>,
    members: Vec<[u8; 32]>,
    pending: Vec<[u8; 32]>,
    policy: u8,
    name: Vec<u8>,
    epoch: u32,
}

struct Applied {
    state: RoomState,
    accepted: AcceptedAdmin,
    advance: bool,
}

/// Draft the one legal next administration note.
pub fn draft_admin(
    state: Option<&RoomState>,
    input: &AdminDraft,
) -> Result<Vec<u8>, GroupAdminError> {
    let subject = input.subject.unwrap_or([0u8; 32]);
    let group_id = input
        .group_id
        .or_else(|| state.map(|item| item.group_id))
        .unwrap_or([0u8; 32]);
    let mailbox = input
        .mailbox
        .or_else(|| state.map(|item| item.mailbox))
        .unwrap_or([0u8; 32]);
    let name = input
        .name
        .clone()
        .unwrap_or_else(|| state.map(|item| item.name.clone()).unwrap_or_default());
    let policy = input
        .policy
        .or_else(|| state.map(|item| item.policy))
        .unwrap_or(JOINING_INVITE);
    let parent = state.map_or([0u8; 32], |item| item.head_tx_id);
    let next = if input.op == OP_CREATE {
        Body {
            group_id,
            mailbox,
            owner: input.sender,
            admins: Vec::new(),
            members: vec![input.sender],
            pending: Vec::new(),
            policy,
            name,
            epoch: 1,
        }
    } else {
        let decoded = Decoded {
            parent,
            group_id,
            mailbox,
            epoch: state.map_or(1, |item| item.epoch),
            op: input.op,
            name,
            policy,
            owner: state.map_or(input.sender, |item| item.owner),
            admins: state.map(|item| item.admins.clone()).unwrap_or_default(),
            members: state.map(|item| item.members.clone()).unwrap_or_default(),
            subject,
        };
        expect_next(state, &decoded, &input.sender)?
    };
    encode_admin(&Decoded {
        parent,
        group_id: next.group_id,
        mailbox: next.mailbox,
        epoch: next.epoch,
        op: input.op,
        name: next.name,
        policy: next.policy,
        owner: next.owner,
        admins: next.admins,
        members: next.members,
        subject,
    })
}

/// Reduce confirmed records. Order is round, then offset, then transaction id.
pub fn reduce_admin(events: &[AdminEvent]) -> ReduceAdminResult {
    let mut ordered: Vec<&AdminEvent> = events.iter().collect();
    ordered.sort_by(|left, right| compare_events(left, right));
    let mut state: Option<RoomState> = None;
    let mut accepted = Vec::new();
    let mut rejected = Vec::new();
    let mut seen = HashSet::new();
    // Accepted non-request ids. Create's parent is the zero id.
    let mut known = HashSet::from([[0u8; 32]]);
    for event in ordered {
        if seen.contains(&event.tx_id) {
            rejected.push(RejectedAdmin {
                tx_id: event.tx_id,
                reason: "replay".to_string(),
            });
            continue;
        }
        match apply_admin(state.as_ref(), event, &known) {
            Ok(applied) => {
                seen.insert(event.tx_id);
                if applied.advance {
                    known.insert(event.tx_id);
                }
                state = Some(applied.state);
                accepted.push(applied.accepted);
            }
            Err(error) => rejected.push(RejectedAdmin {
                tx_id: event.tx_id,
                reason: error.to_string(),
            }),
        }
    }
    ReduceAdminResult {
        state,
        accepted,
        rejected,
    }
}

/// True only when `epoch` is the room epoch and `sender` is a current member.
pub fn sender_may_post(state: &RoomState, sender: &[u8; 32], epoch: u32) -> bool {
    epoch == state.epoch && contains(&state.members, sender)
}

/// Whether this accepted record authorizes delivery of the room key.
pub fn delivery_authorized(
    accepted: &[AcceptedAdmin],
    admin_tx_id: &[u8; 32],
    sender: &[u8; 32],
    recipient: &[u8; 32],
    epoch: u32,
) -> bool {
    let Some(record) = accepted.iter().find(|item| item.tx_id == *admin_tx_id) else {
        return false;
    };
    if record.sender != *sender || record.epoch != epoch || !contains(&record.members, recipient) {
        return false;
    }
    match record.op {
        OP_ADD_MEMBER | OP_ACCEPT_JOIN => record.subject == *recipient,
        OP_REMOVE_MEMBER => record.subject != *recipient,
        OP_REKEY | OP_TRANSFER_OWNER => true,
        _ => false,
    }
}

/// Seal a 227-byte action-5 delivery under the hybrid session key.
pub fn seal_group_key_delivery(
    session: &PqSession,
    epoch: u32,
    group_id: &[u8; 32],
    mailbox: &[u8; 32],
    group_key: &[u8; 32],
    admin_tx_id: &[u8; 32],
    nonce: &[u8; 12],
) -> Result<Vec<u8>, GroupAdminError> {
    if epoch < 1 {
        return Err(fail("Group epoch must be from 1 through 4294967295"));
    }
    let mut plaintext = [0u8; DELIVER_PLAINTEXT];
    plaintext[0] = 5;
    plaintext[1..5].copy_from_slice(&epoch.to_be_bytes());
    plaintext[5..37].copy_from_slice(group_id);
    plaintext[37..69].copy_from_slice(mailbox);
    plaintext[69..101].copy_from_slice(group_key);
    plaintext[101..133].copy_from_slice(admin_tx_id);
    let header = delivery_header(&session.sender_public, &session.handshake_id, nonce);
    let cipher = ChaCha20Poly1305::new_from_slice(&session.session_key)
        .map_err(|error| fail(error.to_string()))?;
    let sealed = cipher
        .encrypt(
            Nonce::from_slice(nonce),
            Payload {
                msg: &plaintext,
                aad: &header,
            },
        )
        .map_err(|_| fail("seal"))?;
    let mut note = header;
    note.extend_from_slice(&sealed);
    Ok(note)
}

/// Open a 227-byte action-5 note. A 195-byte legacy note is not a delivery.
pub fn open_group_key_delivery(
    note: &[u8],
    session: &PqSession,
) -> Result<GroupKeyDelivery, GroupAdminError> {
    if note.len() != DELIVER_NOTE || note[1] != DELIVER_PROTOCOL {
        return Err(fail("Not a group key delivery"));
    }
    let cipher = ChaCha20Poly1305::new_from_slice(&session.session_key)
        .map_err(|error| fail(error.to_string()))?;
    let plain = cipher
        .decrypt(
            Nonce::from_slice(&note[66..78]),
            Payload {
                msg: &note[HEADER_LEN..],
                aad: &note[..HEADER_LEN],
            },
        )
        .map_err(|_| fail("Group key delivery authentication failed"))?;
    if plain.len() != DELIVER_PLAINTEXT || plain[0] != 5 {
        return Err(fail("Group key delivery plaintext is not action 5"));
    }
    Ok(GroupKeyDelivery {
        epoch: u32::from_be_bytes([plain[1], plain[2], plain[3], plain[4]]),
        group_id: read32(&plain, 5),
        mailbox: read32(&plain, 37),
        group_key: read32(&plain, 69),
        admin_tx_id: read32(&plain, 101),
    })
}

fn apply_admin(
    state: Option<&RoomState>,
    event: &AdminEvent,
    known: &HashSet<[u8; 32]>,
) -> Result<Applied, GroupAdminError> {
    let decoded = decode_admin(&event.note)?;
    if decoded.mailbox == event.sender {
        return Err(fail("Mailbox key does not own the room"));
    }
    let request = decoded.op == OP_REQUEST_JOIN;
    if request {
        if state.is_none() || !known.contains(&decoded.parent) {
            return Err(fail("Join request does not cite this room"));
        }
    } else if decoded.parent != state.map_or([0u8; 32], |item| item.head_tx_id) {
        return Err(fail("Stale administration parent"));
    }
    let next = expect_next(state, &decoded, &event.sender)?;
    if !same_state(&decoded, &next) {
        return Err(fail(
            "Administration record does not match the authorized next state",
        ));
    }
    // Join requests stay off the head so later requests can cite the same record.
    let head_tx_id = if request {
        state
            .expect("join request already required a room")
            .head_tx_id
    } else {
        event.tx_id
    };
    let room = into_room(next, head_tx_id);
    Ok(Applied {
        advance: !request,
        accepted: AcceptedAdmin {
            tx_id: event.tx_id,
            sender: event.sender,
            op: decoded.op,
            epoch: room.epoch,
            subject: decoded.subject,
            members: room.members.clone(),
        },
        state: room,
    })
}

fn expect_next(
    state: Option<&RoomState>,
    decoded: &Decoded,
    sender: &[u8; 32],
) -> Result<Body, GroupAdminError> {
    if decoded.op == OP_CREATE {
        return expect_create(state, decoded, sender);
    }
    let state = state.ok_or_else(|| fail("Administration parent is missing"))?;
    if decoded.group_id != state.group_id || decoded.mailbox != state.mailbox {
        return Err(fail("Administration record is for a different room"));
    }
    let mut body = Body {
        group_id: state.group_id,
        mailbox: state.mailbox,
        owner: state.owner,
        admins: state.admins.clone(),
        members: state.members.clone(),
        pending: state.pending.clone(),
        policy: state.policy,
        name: state.name.clone(),
        epoch: state.epoch,
    };
    apply_op(&mut body, state, decoded, sender)?;
    reject_mailbox_overlap(&state.mailbox, &body.members, &body.admins, &body.owner)?;
    if !contains(&body.members, &body.owner) {
        return Err(fail("The owner must remain a member"));
    }
    Ok(body)
}

fn expect_create(
    state: Option<&RoomState>,
    decoded: &Decoded,
    sender: &[u8; 32],
) -> Result<Body, GroupAdminError> {
    if state.is_some() {
        return Err(fail("Create requires an empty parent"));
    }
    if !is_zero(&decoded.parent) || !is_zero(&decoded.subject) {
        return Err(fail("Create parent and subject must be zero"));
    }
    if decoded.owner != *sender {
        return Err(fail("Create sender is not the owner"));
    }
    if decoded.epoch != 1 || !decoded.admins.is_empty() {
        return Err(fail("Create starts at epoch 1 with no admins"));
    }
    if decoded.members.len() != 1 || decoded.members[0] != *sender {
        return Err(fail("Create membership is the owner alone"));
    }
    reject_mailbox_overlap(
        &decoded.mailbox,
        &decoded.members,
        &decoded.admins,
        &decoded.owner,
    )?;
    Ok(Body {
        group_id: decoded.group_id,
        mailbox: decoded.mailbox,
        owner: decoded.owner,
        admins: decoded.admins.clone(),
        members: decoded.members.clone(),
        pending: Vec::new(),
        policy: decoded.policy,
        name: decoded.name.clone(),
        epoch: decoded.epoch,
    })
}

fn apply_op(
    body: &mut Body,
    state: &RoomState,
    decoded: &Decoded,
    sender: &[u8; 32],
) -> Result<(), GroupAdminError> {
    let privileged = *sender == state.owner || contains(&state.admins, sender);
    let subject = decoded.subject;
    match decoded.op {
        OP_SET_NAME => {
            if !privileged || !is_zero(&subject) {
                return Err(fail("Sender cannot rename the room"));
            }
            body.name.clone_from(&decoded.name);
        }
        OP_SET_POLICY => {
            if !privileged || !is_zero(&subject) {
                return Err(fail("Sender cannot change the joining rule"));
            }
            body.policy = decoded.policy;
        }
        OP_APPOINT_ADMIN => {
            if *sender != state.owner {
                return Err(fail("Only the owner appoints an admin"));
            }
            if !contains(&body.members, &subject)
                || subject == body.owner
                || contains(&body.admins, &subject)
            {
                return Err(fail("That person cannot be appointed"));
            }
            body.admins = insert_sorted(&body.admins, subject, "admins", ADMIN_MAX)?;
        }
        OP_DISMISS_ADMIN => {
            if *sender != state.owner || !contains(&body.admins, &subject) {
                return Err(fail("Only the owner dismisses an admin"));
            }
            body.admins.retain(|item| *item != subject);
        }
        OP_TRANSFER_OWNER => {
            if *sender != state.owner || !contains(&body.members, &subject) || subject == body.owner
            {
                return Err(fail(
                    "Ownership can move only from the owner to another member",
                ));
            }
            body.owner = subject;
            body.admins.retain(|item| *item != subject);
            body.epoch = bump(body.epoch)?;
        }
        OP_ADD_MEMBER => {
            if !privileged || contains(&body.members, &subject) || subject == state.mailbox {
                return Err(fail("Sender cannot add that member"));
            }
            body.members = insert_sorted(&body.members, subject, "members", MEMBER_MAX)?;
            body.pending.retain(|item| *item != subject);
        }
        OP_REQUEST_JOIN => {
            if state.policy != JOINING_ASK
                || *sender != subject
                || contains(&body.members, &subject)
                || contains(&body.pending, &subject)
            {
                return Err(fail("That join request is not allowed"));
            }
            body.pending = insert_sorted(&body.pending, subject, "pending", MEMBER_MAX)?;
        }
        OP_ACCEPT_JOIN => {
            if !privileged || !contains(&body.pending, &subject) {
                return Err(fail("No join request to accept"));
            }
            body.members = insert_sorted(&body.members, subject, "members", MEMBER_MAX)?;
            body.pending.retain(|item| *item != subject);
        }
        OP_DECLINE_JOIN => {
            if !privileged || !contains(&body.pending, &subject) {
                return Err(fail("No join request to decline"));
            }
            body.pending.retain(|item| *item != subject);
        }
        OP_REMOVE_MEMBER => {
            if !privileged || !contains(&body.members, &subject) || subject == body.owner {
                return Err(fail("Sender cannot remove that member"));
            }
            body.members.retain(|item| *item != subject);
            body.admins.retain(|item| *item != subject);
            body.pending.retain(|item| *item != subject);
            body.epoch = bump(body.epoch)?;
        }
        OP_REKEY => {
            if !privileged || !is_zero(&subject) {
                return Err(fail("Sender cannot rotate the room key"));
            }
            body.epoch = bump(body.epoch)?;
        }
        _ => return Err(fail("Unknown room administration operation")),
    }
    Ok(())
}

fn same_state(decoded: &Decoded, next: &Body) -> bool {
    decoded.owner == next.owner
        && decoded.epoch == next.epoch
        && decoded.policy == next.policy
        && decoded.name == next.name
        && decoded.admins == next.admins
        && decoded.members == next.members
}

fn encode_admin(fields: &Decoded) -> Result<Vec<u8>, GroupAdminError> {
    let name = canonical_name(&fields.name)?;
    let admins = canonical_set(&fields.admins, "admins", ADMIN_MAX)?;
    let members = canonical_set(&fields.members, "members", MEMBER_MAX)?;
    if fields.policy != JOINING_INVITE && fields.policy != JOINING_ASK {
        return Err(fail("Joining rule must be invite-only or ask-to-join"));
    }
    if !(OP_CREATE..=OP_REKEY).contains(&fields.op) {
        return Err(fail("Unknown room administration operation"));
    }
    let name_len =
        u8::try_from(name.len()).map_err(|_| fail("Room name is longer than 64 bytes"))?;
    let admin_count = u16::try_from(admins.len()).map_err(|_| fail("Too many admins"))?;
    let member_count = u16::try_from(members.len()).map_err(|_| fail("Too many members"))?;
    let mut out = Vec::new();
    out.push(PROTOCOL_VERSION_V2);
    out.push(ADMIN_PROTOCOL);
    out.extend_from_slice(&fields.parent);
    out.extend_from_slice(&fields.group_id);
    out.extend_from_slice(&fields.mailbox);
    out.extend_from_slice(&fields.epoch.to_be_bytes());
    out.push(fields.op);
    out.push(name_len);
    out.extend_from_slice(&name);
    out.push(fields.policy);
    out.extend_from_slice(&fields.owner);
    out.extend_from_slice(&admin_count.to_be_bytes());
    for admin in &admins {
        out.extend_from_slice(admin);
    }
    out.extend_from_slice(&member_count.to_be_bytes());
    for member in &members {
        out.extend_from_slice(member);
    }
    out.extend_from_slice(&fields.subject);
    if out.len() > MAX_NOTE_SIZE {
        return Err(fail("Administration record exceeds 4096 bytes"));
    }
    Ok(out)
}

fn decode_admin(note: &[u8]) -> Result<Decoded, GroupAdminError> {
    if note.len() < 141 || note[0] != PROTOCOL_VERSION_V2 || note[1] != ADMIN_PROTOCOL {
        return Err(fail("Not a room administration record"));
    }
    let mut cursor = Cursor { note, at: 2 };
    let parent = cursor.arr32()?;
    let group_id = cursor.arr32()?;
    let mailbox = cursor.arr32()?;
    let epoch = cursor.u32_be()?;
    let op = cursor.u8()?;
    let name_len = usize::from(cursor.u8()?);
    if name_len > NAME_MAX {
        return Err(fail("Room name is longer than 64 bytes"));
    }
    let name = canonical_name(cursor.take(name_len)?)?;
    let policy = cursor.u8()?;
    let owner = cursor.arr32()?;
    let admin_count = usize::from(cursor.u16_be()?);
    let mut admins = Vec::with_capacity(admin_count);
    for _ in 0..admin_count {
        admins.push(cursor.arr32()?);
    }
    let member_count = usize::from(cursor.u16_be()?);
    let mut members = Vec::with_capacity(member_count);
    for _ in 0..member_count {
        members.push(cursor.arr32()?);
    }
    let subject = cursor.arr32()?;
    if cursor.at != note.len() {
        return Err(fail("Administration record has trailing bytes"));
    }
    // Duplicate and size errors win over the sorted-order check. The sorted
    // copy is discarded so the original order is what must be strictly increasing.
    canonical_set(&admins, "admins", ADMIN_MAX)?;
    canonical_set(&members, "members", MEMBER_MAX)?;
    if !strictly_increasing(&admins) || !strictly_increasing(&members) {
        return Err(fail("Administration sets must be strictly sorted"));
    }
    Ok(Decoded {
        parent,
        group_id,
        mailbox,
        epoch,
        op,
        name,
        policy,
        owner,
        admins,
        members,
        subject,
    })
}

struct Cursor<'a> {
    note: &'a [u8],
    at: usize,
}

impl<'a> Cursor<'a> {
    fn take(&mut self, length: usize) -> Result<&'a [u8], GroupAdminError> {
        let end = self
            .at
            .checked_add(length)
            .ok_or_else(|| fail("Administration record is truncated"))?;
        if end > self.note.len() {
            return Err(fail("Administration record is truncated"));
        }
        let slice = &self.note[self.at..end];
        self.at = end;
        Ok(slice)
    }

    fn u8(&mut self) -> Result<u8, GroupAdminError> {
        Ok(self.take(1)?[0])
    }

    fn u16_be(&mut self) -> Result<u16, GroupAdminError> {
        let bytes = self.take(2)?;
        Ok(u16::from_be_bytes([bytes[0], bytes[1]]))
    }

    fn u32_be(&mut self) -> Result<u32, GroupAdminError> {
        let bytes = self.take(4)?;
        Ok(u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
    }

    fn arr32(&mut self) -> Result<[u8; 32], GroupAdminError> {
        let mut out = [0u8; 32];
        out.copy_from_slice(self.take(32)?);
        Ok(out)
    }
}

fn delivery_header(sender: &[u8; 32], handshake_id: &[u8; 32], nonce: &[u8; 12]) -> Vec<u8> {
    let mut header = Vec::with_capacity(HEADER_LEN);
    header.push(PROTOCOL_VERSION_V2);
    header.push(DELIVER_PROTOCOL);
    header.extend_from_slice(sender);
    header.extend_from_slice(handshake_id);
    header.extend_from_slice(nonce);
    header
}

fn into_room(body: Body, head_tx_id: [u8; 32]) -> RoomState {
    RoomState {
        group_id: body.group_id,
        mailbox: body.mailbox,
        owner: body.owner,
        admins: body.admins,
        members: body.members,
        pending: body.pending,
        policy: body.policy,
        name: body.name,
        epoch: body.epoch,
        head_tx_id,
    }
}

fn insert_sorted(
    values: &[[u8; 32]],
    subject: [u8; 32],
    label: &str,
    max: usize,
) -> Result<Vec<[u8; 32]>, GroupAdminError> {
    let mut next = values.to_vec();
    next.push(subject);
    canonical_set(&next, label, max)
}

fn canonical_name(name: &[u8]) -> Result<Vec<u8>, GroupAdminError> {
    if name.len() > NAME_MAX {
        return Err(fail("Room name is longer than 64 bytes"));
    }
    if std::str::from_utf8(name).is_err() {
        return Err(fail("Room name is not UTF-8"));
    }
    Ok(name.to_vec())
}

fn canonical_set(
    values: &[[u8; 32]],
    label: &str,
    max: usize,
) -> Result<Vec<[u8; 32]>, GroupAdminError> {
    let mut sorted = values.to_vec();
    sorted.sort_unstable();
    for pair in sorted.windows(2) {
        if pair[0] == pair[1] {
            return Err(fail(format!("Duplicate {label}")));
        }
    }
    if sorted.len() > max {
        return Err(fail(format!("Too many {label}")));
    }
    Ok(sorted)
}

fn strictly_increasing(values: &[[u8; 32]]) -> bool {
    values.windows(2).all(|pair| pair[0] < pair[1])
}

fn contains(values: &[[u8; 32]], target: &[u8; 32]) -> bool {
    values.iter().any(|item| item == target)
}

fn reject_mailbox_overlap(
    mailbox: &[u8; 32],
    members: &[[u8; 32]],
    admins: &[[u8; 32]],
    owner: &[u8; 32],
) -> Result<(), GroupAdminError> {
    if mailbox == owner || contains(members, mailbox) || contains(admins, mailbox) {
        return Err(fail("Mailbox key does not own the room"));
    }
    Ok(())
}

fn bump(epoch: u32) -> Result<u32, GroupAdminError> {
    epoch
        .checked_add(1)
        .ok_or_else(|| fail("Group epoch is exhausted"))
}

fn is_zero(value: &[u8]) -> bool {
    value.iter().all(|byte| *byte == 0)
}

fn compare_events(left: &AdminEvent, right: &AdminEvent) -> std::cmp::Ordering {
    left.round
        .cmp(&right.round)
        .then(left.offset.cmp(&right.offset))
        .then(left.tx_id.cmp(&right.tx_id))
}

fn read32(bytes: &[u8], offset: usize) -> [u8; 32] {
    let mut out = [0u8; 32];
    out.copy_from_slice(&bytes[offset..offset + 32]);
    out
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use serde_json::Value;

    use super::*;

    fn vector() -> Value {
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../vectors/group-admin-v1.json"
        );
        let text = std::fs::read_to_string(path).unwrap_or_else(|error| panic!("{path}: {error}"));
        serde_json::from_str(&text).unwrap()
    }

    fn hex32_str(text: &str) -> [u8; 32] {
        let bytes = hex::decode(text).unwrap();
        bytes.as_slice().try_into().unwrap()
    }

    fn hex_list(value: &Value) -> Vec<[u8; 32]> {
        value
            .as_array()
            .unwrap()
            .iter()
            .map(|item| hex32_str(item.as_str().unwrap()))
            .collect()
    }

    fn optional_bytes(value: &Value) -> Option<[u8; 32]> {
        match value {
            Value::Null => None,
            Value::String(text) => Some(hex32_str(text)),
            other => panic!("bad hex {other}"),
        }
    }

    fn optional_policy(value: &Value) -> Option<u8> {
        match value {
            Value::Null => None,
            Value::Number(number) => Some(u8::try_from(number.as_u64().unwrap()).unwrap()),
            other => panic!("bad policy {other}"),
        }
    }

    fn revive(value: &Value) -> Option<RoomState> {
        if value.is_null() {
            return None;
        }
        Some(RoomState {
            group_id: hex32_str(value["group_id"].as_str().unwrap()),
            mailbox: hex32_str(value["mailbox"].as_str().unwrap()),
            owner: hex32_str(value["owner"].as_str().unwrap()),
            admins: hex_list(&value["admins"]),
            members: hex_list(&value["members"]),
            pending: hex_list(&value["pending"]),
            policy: u8::try_from(value["policy"].as_u64().unwrap()).unwrap(),
            name: hex::decode(value["name_hex"].as_str().unwrap()).unwrap(),
            epoch: u32::try_from(value["epoch"].as_u64().unwrap()).unwrap(),
            head_tx_id: hex32_str(value["head_tx_id"].as_str().unwrap()),
        })
    }

    fn draft_from(value: &Value) -> AdminDraft {
        let name = match &value["name_utf8"] {
            Value::Null => None,
            Value::String(text) => Some(text.as_bytes().to_vec()),
            other => panic!("bad name {other}"),
        };
        AdminDraft {
            op: u8::try_from(value["op"].as_u64().unwrap()).unwrap(),
            sender: hex32_str(value["sender"].as_str().unwrap()),
            subject: Some(hex32_str(value["subject"].as_str().unwrap())),
            name,
            policy: optional_policy(&value["policy"]),
            group_id: optional_bytes(&value["group_id"]),
            mailbox: optional_bytes(&value["mailbox"]),
        }
    }

    fn snap(state: &RoomState) -> Value {
        serde_json::json!({
            "group_id": hex::encode(state.group_id),
            "mailbox": hex::encode(state.mailbox),
            "owner": hex::encode(state.owner),
            "admins": state.admins.iter().map(hex::encode).collect::<Vec<_>>(),
            "members": state.members.iter().map(hex::encode).collect::<Vec<_>>(),
            "pending": state.pending.iter().map(hex::encode).collect::<Vec<_>>(),
            "policy": state.policy,
            "name_hex": hex::encode(&state.name),
            "epoch": state.epoch,
            "head_tx_id": hex::encode(state.head_tx_id),
        })
    }

    fn event_from(value: &Value) -> AdminEvent {
        AdminEvent {
            note: hex::decode(value["note"].as_str().unwrap()).unwrap(),
            sender: hex32_str(value["sender"].as_str().unwrap()),
            tx_id: hex32_str(value["tx_id"].as_str().unwrap()),
            round: value["round"].as_u64().unwrap(),
            offset: value["offset"].as_u64().unwrap(),
        }
    }

    #[test]
    fn group_admin_vector() {
        let value = vector();
        for draft in value["drafts"].as_array().unwrap() {
            let basis = revive(&draft["basis_state"]);
            let name = draft["name"].as_str().unwrap();
            let note = draft_admin(basis.as_ref(), &draft_from(draft))
                .unwrap_or_else(|error| panic!("{name}: {error}"));
            assert_eq!(hex::encode(note), draft["note"].as_str().unwrap(), "{name}");
        }

        for item in value["draft_errors"].as_array().unwrap() {
            let basis = revive(&item["basis_state"]);
            let name = item["name"].as_str().unwrap();
            let error = draft_admin(basis.as_ref(), &draft_from(item))
                .expect_err(name)
                .to_string();
            let needle = item["error_includes"].as_str().unwrap();
            assert!(
                error.contains(needle),
                "{name}: {error} does not contain {needle}"
            );
        }

        let mut reduced = HashMap::<String, ReduceAdminResult>::new();
        for (name, reduction) in value["reductions"].as_object().unwrap() {
            let events: Vec<AdminEvent> = reduction["events"]
                .as_array()
                .unwrap()
                .iter()
                .map(event_from)
                .collect();
            let result = reduce_admin(&events);
            let reasons: Vec<&str> = result
                .rejected
                .iter()
                .map(|item| item.reason.as_str())
                .collect();
            let expected_reasons: Vec<&str> = reduction["rejected"]
                .as_array()
                .unwrap()
                .iter()
                .map(|item| item["reason"].as_str().unwrap())
                .collect();
            assert_eq!(reasons, expected_reasons, "{name}");
            let ops: Vec<u8> = result.accepted.iter().map(|item| item.op).collect();
            let expected_ops: Vec<u8> = reduction["accepted"]
                .as_array()
                .unwrap()
                .iter()
                .map(|item| u8::try_from(item["op"].as_u64().unwrap()).unwrap())
                .collect();
            assert_eq!(ops, expected_ops, "{name}");
            match &result.state {
                None => assert!(reduction["state"].is_null(), "{name}"),
                Some(state) => assert_eq!(snap(state), reduction["state"].clone(), "{name}"),
            }
            reduced.insert(name.clone(), result);
        }

        for check in value["checks"]["delivery_authorized"].as_array().unwrap() {
            let result = &reduced[check["reduction"].as_str().unwrap()];
            let allowed = delivery_authorized(
                &result.accepted,
                &hex32_str(check["admin_tx_id"].as_str().unwrap()),
                &hex32_str(check["sender"].as_str().unwrap()),
                &hex32_str(check["recipient"].as_str().unwrap()),
                u32::try_from(check["epoch"].as_u64().unwrap()).unwrap(),
            );
            assert_eq!(allowed, check["allowed"].as_bool().unwrap(), "{check}");
        }
        for check in value["checks"]["may_post"].as_array().unwrap() {
            let result = &reduced[check["reduction"].as_str().unwrap()];
            let allowed = sender_may_post(
                result.state.as_ref().unwrap(),
                &hex32_str(check["sender"].as_str().unwrap()),
                u32::try_from(check["epoch"].as_u64().unwrap()).unwrap(),
            );
            assert_eq!(allowed, check["allowed"].as_bool().unwrap(), "{check}");
        }

        let delivery = &value["delivery"];
        let session = PqSession {
            session_key: hex32_str(delivery["session_key"].as_str().unwrap()),
            sender_public: hex32_str(delivery["sender_x25519"].as_str().unwrap()),
            recipient_public: [0u8; 32],
            handshake_id: hex32_str(delivery["handshake_id"].as_str().unwrap()),
        };
        let nonce_bytes = hex::decode(delivery["nonce"].as_str().unwrap()).unwrap();
        let nonce: [u8; 12] = nonce_bytes.as_slice().try_into().unwrap();
        let note = seal_group_key_delivery(
            &session,
            u32::try_from(delivery["epoch"].as_u64().unwrap()).unwrap(),
            &hex32_str(delivery["group_id"].as_str().unwrap()),
            &hex32_str(delivery["mailbox"].as_str().unwrap()),
            &hex32_str(delivery["group_key"].as_str().unwrap()),
            &hex32_str(delivery["admin_tx_id"].as_str().unwrap()),
            &nonce,
        )
        .unwrap();
        assert_eq!(note.len(), 227);
        assert_eq!(hex::encode(&note), delivery["note"].as_str().unwrap());
        let opened = open_group_key_delivery(&note, &session).unwrap();
        assert_eq!(
            hex::encode(opened.group_key),
            delivery["group_key"].as_str().unwrap()
        );
        let legacy = crate::group::open_group_membership(&note, &session).unwrap_err();
        assert!(
            legacy.to_string().contains("not a group membership note"),
            "{legacy}"
        );
    }
}
