//! Public room administration (protocol 0x03) and 0x06 action-5 key delivery.
//!
//! A new note omits the member list. Pending join requests are derived by the
//! reducer and are not written in the note. Legacy 0x06 actions 1-4 stay
//! 195-byte notes in `group`.

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
const MEMBER_MAX: usize = 256;
/// Member count 0xFFFF. The note names one subject and omits the roster.
const MEMBERS_OMITTED: u16 = 0xffff;
/// Separate key-delivery payments in one pass. Not an atomic transaction group.
const DELIVER_BATCH: usize = 16;
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
    /// 32 zero bytes when this room is not a channel.
    pub parent_group_id: [u8; 32],
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
    /// Required when creating a channel, and for every later note on that channel.
    pub parent_room: Option<RoomState>,
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
    /// True when the note uses the 0xFFFF sentinel instead of a member list.
    members_omitted: bool,
    /// Present on a delta note. A legacy full-list note leaves this as 32 zero bytes.
    parent_group_id: [u8; 32],
}

struct Body {
    group_id: [u8; 32],
    mailbox: [u8; 32],
    parent_group_id: [u8; 32],
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
///
/// The note omits the member list. Callers still holding an older full-list
/// note pass that note to [`reduce_admin`]; this function does not emit one.
pub fn draft_admin(
    state: Option<&RoomState>,
    input: &AdminDraft,
) -> Result<Vec<u8>, GroupAdminError> {
    let subject = input.subject.unwrap_or([0u8; 32]);
    let parent_group_id = channel_parent(state, input, &subject)?;
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
            parent_group_id,
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
            members_omitted: true,
            parent_group_id,
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
        members_omitted: true,
        parent_group_id: next.parent_group_id,
    })
}

/// Reduce confirmed records. Order is round, then offset, then transaction id.
pub fn reduce_admin(events: &[AdminEvent]) -> ReduceAdminResult {
    fold_admin(events, None).result
}

/// Reduce a channel against its parent room timeline.
///
/// Parent membership is not copied into the channel. An empty parent timeline
/// is not the same as omitting the parent: a channel note then has no room to
/// point at.
pub fn reduce_admin_with_parent(
    events: &[AdminEvent],
    parent_events: &[AdminEvent],
) -> ReduceAdminResult {
    let parent = parent_timeline(parent_events);
    fold_admin(events, Some(&parent)).result
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

/// Recipients this accepted record still authorizes for a key payment.
pub fn authorized_recipients(
    accepted: &[AcceptedAdmin],
    admin_tx_id: &[u8; 32],
    sender: &[u8; 32],
    epoch: u32,
) -> Vec<[u8; 32]> {
    let Some(record) = accepted.iter().find(|item| item.tx_id == *admin_tx_id) else {
        return Vec::new();
    };
    record
        .members
        .iter()
        .copied()
        .filter(|member| delivery_authorized(accepted, admin_tx_id, sender, member, epoch))
        .collect()
}

/// Members of a channel who are no longer members of the parent room.
pub fn channel_departures(
    channel: &RoomState,
    parent: &RoomState,
) -> Result<Vec<[u8; 32]>, GroupAdminError> {
    if is_zero(&channel.parent_group_id) || channel.parent_group_id != parent.group_id {
        return Err(fail("Channel does not point at this parent room"));
    }
    Ok(channel
        .members
        .iter()
        .copied()
        .filter(|member| !contains(&parent.members, member))
        .collect())
}

/// Recipients still owed a key. A payment already in `landed` stays there.
pub fn pending_key_deliveries(recipients: &[[u8; 32]], landed: &[[u8; 32]]) -> Vec<[u8; 32]> {
    recipients
        .iter()
        .copied()
        .filter(|recipient| !contains(landed, recipient))
        .collect()
}

/// The next separate payments, at most 16. This does not build an atomic group.
pub fn next_delivery_batch(pending: &[[u8; 32]]) -> Vec<[u8; 32]> {
    pending.iter().copied().take(DELIVER_BATCH).collect()
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
    if note.len() != DELIVER_NOTE || note[0] != PROTOCOL_VERSION_V2 || note[1] != DELIVER_PROTOCOL {
        return Err(fail("Not a group key delivery"));
    }
    if note[2..34] != session.sender_public {
        return Err(fail("Key delivery sender does not match the session"));
    }
    if note[34..66] != session.handshake_id {
        return Err(fail("Key delivery is for a different handshake"));
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
    let epoch = u32::from_be_bytes([plain[1], plain[2], plain[3], plain[4]]);
    if epoch < 1 {
        return Err(fail("Group epoch must be from 1 through 4294967295"));
    }
    Ok(GroupKeyDelivery {
        epoch,
        group_id: read32(&plain, 5),
        mailbox: read32(&plain, 37),
        group_key: read32(&plain, 69),
        admin_tx_id: read32(&plain, 101),
    })
}

struct ParentStep {
    round: u64,
    offset: u64,
    tx_id: [u8; 32],
    state: Option<RoomState>,
}

struct Fold {
    result: ReduceAdminResult,
    steps: Vec<ParentStep>,
}

/// `Absent` means the caller did not supply a parent room. `Present(None)` means
/// the parent timeline was supplied and did not yet have a room.
enum ParentRef<'a> {
    Absent,
    Present(Option<&'a RoomState>),
}

fn parent_timeline(events: &[AdminEvent]) -> Vec<ParentStep> {
    fold_admin(events, None).steps
}

fn fold_admin(events: &[AdminEvent], parent: Option<&[ParentStep]>) -> Fold {
    let mut ordered: Vec<&AdminEvent> = events.iter().collect();
    ordered.sort_by(|left, right| compare_events(left, right));
    let mut state: Option<RoomState> = None;
    let mut accepted = Vec::new();
    let mut rejected = Vec::new();
    let mut steps = Vec::new();
    let mut seen = HashSet::new();
    // Accepted administration ids. Create's parent is 32 zero bytes and is not one of them.
    let mut known: HashSet<[u8; 32]> = HashSet::new();
    for event in ordered {
        if seen.contains(&event.tx_id) {
            rejected.push(RejectedAdmin {
                tx_id: event.tx_id,
                reason: "replay".to_string(),
            });
            steps.push(parent_step(event, &state));
            continue;
        }
        let looked_up = parent.map(|parent_steps| parent_before(parent_steps, event));
        let parent_state = match &looked_up {
            None => ParentRef::Absent,
            Some(found) => ParentRef::Present(found.as_ref()),
        };
        match apply_admin(state.as_ref(), event, &known, parent_state) {
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
        steps.push(parent_step(event, &state));
    }
    Fold {
        result: ReduceAdminResult {
            state,
            accepted,
            rejected,
        },
        steps,
    }
}

fn parent_step(event: &AdminEvent, state: &Option<RoomState>) -> ParentStep {
    ParentStep {
        round: event.round,
        offset: event.offset,
        tx_id: event.tx_id,
        state: state.clone(),
    }
}

fn parent_before(steps: &[ParentStep], event: &AdminEvent) -> Option<RoomState> {
    let mut state = None;
    for step in steps {
        if (step.round, step.offset, step.tx_id) < (event.round, event.offset, event.tx_id) {
            state = step.state.clone();
        } else {
            break;
        }
    }
    state
}

fn channel_parent(
    state: Option<&RoomState>,
    input: &AdminDraft,
    subject: &[u8; 32],
) -> Result<[u8; 32], GroupAdminError> {
    if input.op == OP_CREATE {
        let Some(parent) = input.parent_room.as_ref() else {
            return Ok([0u8; 32]);
        };
        if input.sender != parent.owner {
            return Err(fail("Only the group owner creates a channel"));
        }
        // Create does not inherit the parent room's ids. A missing id is 32 zero bytes.
        let group_id = input.group_id.unwrap_or([0u8; 32]);
        let mailbox = input.mailbox.unwrap_or([0u8; 32]);
        if group_id == parent.group_id || mailbox == parent.mailbox {
            return Err(fail("A channel has its own mailbox and group id"));
        }
        return Ok(parent.group_id);
    }
    let current = state.map(|item| item.parent_group_id).unwrap_or([0u8; 32]);
    if is_zero(&current) {
        return Ok(current);
    }
    let Some(parent) = input.parent_room.as_ref() else {
        return Err(fail("Channel does not point at this parent room"));
    };
    if parent.group_id != current {
        return Err(fail("Channel does not point at this parent room"));
    }
    if input.op == OP_TRANSFER_OWNER {
        return Err(fail("The group owner keeps the channel"));
    }
    if matches!(input.op, OP_ADD_MEMBER | OP_ACCEPT_JOIN | OP_REQUEST_JOIN)
        && !contains(&parent.members, subject)
    {
        return Err(fail("That person is not in the parent room"));
    }
    Ok(current)
}

fn apply_admin(
    state: Option<&RoomState>,
    event: &AdminEvent,
    known: &HashSet<[u8; 32]>,
    parent_state: ParentRef<'_>,
) -> Result<Applied, GroupAdminError> {
    let decoded = decode_admin(&event.note)?;
    if decoded.mailbox == event.sender {
        return Err(fail("Mailbox key does not own the room"));
    }
    bind_channel(&decoded, &event.sender, parent_state)?;
    let request = decoded.op == OP_REQUEST_JOIN;
    if request {
        if state.is_none() || is_zero(&decoded.parent) || !known.contains(&decoded.parent) {
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
        parent_group_id: state.parent_group_id,
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
    // A delta create names no members. A full-list create names the owner alone.
    // Either way the room starts as that one sender.
    if decoded.members_omitted {
        if !decoded.members.is_empty() {
            return Err(fail("Create membership is the owner alone"));
        }
    } else if decoded.members.len() != 1 || decoded.members[0] != *sender {
        return Err(fail("Create membership is the owner alone"));
    }
    let members = vec![*sender];
    reject_mailbox_overlap(&decoded.mailbox, &members, &decoded.admins, &decoded.owner)?;
    Ok(Body {
        group_id: decoded.group_id,
        mailbox: decoded.mailbox,
        parent_group_id: decoded.parent_group_id,
        owner: decoded.owner,
        admins: decoded.admins.clone(),
        members,
        pending: Vec::new(),
        policy: decoded.policy,
        name: decoded.name.clone(),
        epoch: decoded.epoch,
    })
}

fn bind_channel(
    decoded: &Decoded,
    sender: &[u8; 32],
    parent_state: ParentRef<'_>,
) -> Result<(), GroupAdminError> {
    if is_zero(&decoded.parent_group_id) {
        return Ok(());
    }
    let parent_state = match parent_state {
        ParentRef::Present(Some(state)) => state,
        ParentRef::Absent | ParentRef::Present(None) => {
            return Err(fail("Channel does not point at this parent room"));
        }
    };
    if parent_state.group_id != decoded.parent_group_id {
        return Err(fail("Channel does not point at this parent room"));
    }
    if decoded.op == OP_CREATE {
        if *sender != parent_state.owner {
            return Err(fail("Only the group owner creates a channel"));
        }
        if decoded.group_id == parent_state.group_id || decoded.mailbox == parent_state.mailbox {
            return Err(fail("A channel has its own mailbox and group id"));
        }
    }
    if decoded.op == OP_TRANSFER_OWNER {
        return Err(fail("The group owner keeps the channel"));
    }
    if matches!(decoded.op, OP_ADD_MEMBER | OP_ACCEPT_JOIN | OP_REQUEST_JOIN)
        && !contains(&parent_state.members, &decoded.subject)
    {
        return Err(fail("That person is not in the parent room"));
    }
    Ok(())
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
    // A delta note has no member list. The folded members are the next state.
    decoded.owner == next.owner
        && decoded.epoch == next.epoch
        && decoded.policy == next.policy
        && decoded.name == next.name
        && decoded.parent_group_id == next.parent_group_id
        && decoded.admins == next.admins
        && (decoded.members_omitted || decoded.members == next.members)
}

fn encode_admin(fields: &Decoded) -> Result<Vec<u8>, GroupAdminError> {
    let name = canonical_name(&fields.name)?;
    let admins = canonical_set(&fields.admins, "admins", ADMIN_MAX)?;
    if !fields.members_omitted && !is_zero(&fields.parent_group_id) {
        return Err(fail("A full member list cannot name a parent room"));
    }
    let members = if fields.members_omitted {
        Vec::new()
    } else {
        canonical_set(&fields.members, "members", MEMBER_MAX)?
    };
    if fields.policy != JOINING_INVITE && fields.policy != JOINING_ASK {
        return Err(fail("Joining rule must be invite-only or ask-to-join"));
    }
    if !(OP_CREATE..=OP_REKEY).contains(&fields.op) {
        return Err(fail("Unknown room administration operation"));
    }
    let name_len =
        u8::try_from(name.len()).map_err(|_| fail("Room name is longer than 64 bytes"))?;
    let admin_count = u16::try_from(admins.len()).map_err(|_| fail("Too many admins"))?;
    let member_count = if fields.members_omitted {
        MEMBERS_OMITTED
    } else {
        u16::try_from(members.len()).map_err(|_| fail("Too many members"))?
    };
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
    if !fields.members_omitted {
        for member in &members {
            out.extend_from_slice(member);
        }
    }
    out.extend_from_slice(&fields.subject);
    if fields.members_omitted {
        out.extend_from_slice(&fields.parent_group_id);
    }
    if out.len() > MAX_NOTE_SIZE {
        return Err(fail(if fields.members_omitted {
            "Administration record exceeds 4096 bytes"
        } else {
            "Full member list is too large"
        }));
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
    let raw_member_count = cursor.u16_be()?;
    let members_omitted = raw_member_count == MEMBERS_OMITTED;
    let mut members = Vec::new();
    if !members_omitted {
        let member_count = usize::from(raw_member_count);
        members.reserve(member_count);
        for _ in 0..member_count {
            members.push(cursor.arr32()?);
        }
    }
    let subject = cursor.arr32()?;
    let parent_group_id = if members_omitted {
        cursor.arr32()?
    } else {
        [0u8; 32]
    };
    if cursor.at != note.len() {
        return Err(fail("Administration record has trailing bytes"));
    }
    if note.len() > MAX_NOTE_SIZE {
        return Err(fail(if members_omitted {
            "Administration record exceeds 4096 bytes"
        } else {
            "Full member list is too large"
        }));
    }
    // Duplicate and size errors win over the sorted-order check. The sorted
    // copy is discarded so the original order is what must be strictly increasing.
    canonical_set(&admins, "admins", ADMIN_MAX)?;
    if !members_omitted {
        canonical_set(&members, "members", MEMBER_MAX)?;
    }
    if !strictly_increasing(&admins) || !strictly_increasing(&members) {
        return Err(fail("Administration sets must be strictly sorted"));
    }
    if policy != JOINING_INVITE && policy != JOINING_ASK {
        return Err(fail("Joining rule must be invite-only or ask-to-join"));
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
        members_omitted,
        parent_group_id,
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
        parent_group_id: body.parent_group_id,
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

    fn delta_vector() -> Value {
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../vectors/group-admin-delta-v1.json"
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
            parent_group_id: match value.get("parent_group_id") {
                Some(Value::String(text)) => hex32_str(text),
                _ => [0u8; 32],
            },
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
            parent_room: revive(&value["parent_room"]),
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

    fn snap_parent(state: &RoomState) -> Value {
        let mut value = snap(state);
        value["parent_group_id"] = Value::String(hex::encode(state.parent_group_id));
        value
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
            let stored = hex::decode(draft["note"].as_str().unwrap()).unwrap();
            let name = draft["name"].as_str().unwrap();
            assert_eq!(stored[0], PROTOCOL_VERSION_V2, "{name}");
            assert_eq!(stored[1], ADMIN_PROTOCOL, "{name}");
            let member_count = member_count_at(&stored);
            assert_ne!(member_count, MEMBERS_OMITTED, "{name}");
            assert!(usize::from(member_count) <= 100, "{name}");
            let basis = revive(&draft["basis_state"]);
            let delta = draft_admin(basis.as_ref(), &draft_from(draft))
                .unwrap_or_else(|error| panic!("{name}: {error}"));
            assert!(delta.len() <= 4096, "{name}");
            assert_eq!(member_count_at(&delta), MEMBERS_OMITTED, "{name}");
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

    #[test]
    fn rejects_unbound_delivery_undefined_policy_and_zero_join_parent() {
        let owner = [1u8; 32];
        let friend = [2u8; 32];
        let group_id = [7u8; 32];
        let mailbox = [9u8; 32];
        let create = draft_admin(
            None,
            &AdminDraft {
                op: OP_CREATE,
                sender: owner,
                subject: None,
                name: Some(b"team".to_vec()),
                policy: Some(JOINING_INVITE),
                group_id: Some(group_id),
                mailbox: Some(mailbox),
                parent_room: None,
            },
        )
        .unwrap();
        for policy in [0u8, 3, 255] {
            let reduced = reduce_admin(&[event(with_policy(&create, policy), owner, 10, 0)]);
            assert!(reduced.state.is_none());
            assert!(reduced.accepted.is_empty());
            assert!(reduced.rejected[0]
                .reason
                .contains("invite-only or ask-to-join"));
        }
        let created = reduce_admin(&[event(create.clone(), owner, 10, 0)]);
        let state = created.state.as_ref().unwrap();
        let set_policy = draft_admin(
            Some(state),
            &AdminDraft {
                op: OP_SET_POLICY,
                sender: owner,
                subject: None,
                name: None,
                policy: Some(JOINING_ASK),
                group_id: None,
                mailbox: None,
                parent_room: None,
            },
        )
        .unwrap();
        for policy in [0u8, 3, 255] {
            let reduced = reduce_admin(&[
                event(create.clone(), owner, 10, 0),
                event(with_policy(&set_policy, policy), owner, 11, 1),
            ]);
            let room = reduced.state.unwrap();
            assert_eq!(room.policy, JOINING_INVITE);
            assert_eq!(room.head_tx_id, [10u8; 32]);
            assert!(reduced.rejected[0]
                .reason
                .contains("invite-only or ask-to-join"));
        }

        let ask = draft_admin(
            None,
            &AdminDraft {
                op: OP_CREATE,
                sender: owner,
                subject: None,
                name: Some(b"general".to_vec()),
                policy: Some(JOINING_ASK),
                group_id: Some(group_id),
                mailbox: Some(mailbox),
                parent_room: None,
            },
        )
        .unwrap();
        let asked = reduce_admin(&[event(ask.clone(), owner, 10, 0)]);
        let real = draft_admin(
            asked.state.as_ref(),
            &AdminDraft {
                op: OP_REQUEST_JOIN,
                sender: friend,
                subject: Some(friend),
                name: None,
                policy: None,
                group_id: None,
                mailbox: None,
                parent_room: None,
            },
        )
        .unwrap();
        let mut zero = real.clone();
        zero[2..34].fill(0);
        let mut unknown = real.clone();
        unknown[2..34].fill(0x99);
        let zeroed = reduce_admin(&[event(ask.clone(), owner, 10, 0), event(zero, friend, 11, 1)]);
        assert!(zeroed.state.as_ref().unwrap().pending.is_empty());
        assert_eq!(zeroed.state.as_ref().unwrap().head_tx_id, [10u8; 32]);
        assert!(zeroed.rejected[0].reason.contains("cite"));
        let missed = reduce_admin(&[
            event(ask.clone(), owner, 10, 0),
            event(unknown, friend, 11, 1),
        ]);
        assert!(missed.state.as_ref().unwrap().pending.is_empty());
        assert_eq!(missed.state.as_ref().unwrap().policy, JOINING_ASK);
        assert!(missed.rejected[0].reason.contains("cite"));
        let accepted = reduce_admin(&[event(ask, owner, 10, 0), event(real, friend, 11, 1)]);
        assert!(accepted.rejected.is_empty());
        assert_eq!(accepted.state.as_ref().unwrap().pending, vec![friend]);
        assert_eq!(accepted.state.as_ref().unwrap().head_tx_id, [10u8; 32]);

        let session = PqSession {
            session_key: rand::random(),
            sender_public: [0x11u8; 32],
            recipient_public: [0u8; 32],
            handshake_id: [0x43u8; 32],
        };
        let nonce: [u8; 12] = rand::random();
        let note = seal_group_key_delivery(
            &session,
            1,
            &group_id,
            &mailbox,
            &[4u8; 32],
            &[10u8; 32],
            &nonce,
        )
        .unwrap();
        assert_eq!(open_group_key_delivery(&note, &session).unwrap().epoch, 1);
        let mut other_sender = session.clone();
        other_sender.sender_public = [0x22u8; 32];
        let sender_error = open_group_key_delivery(&note, &other_sender).unwrap_err();
        assert!(
            sender_error.to_string().contains("sender"),
            "{sender_error}"
        );
        let mut other_handshake = session.clone();
        other_handshake.handshake_id = [0x44u8; 32];
        let handshake_error = open_group_key_delivery(&note, &other_handshake).unwrap_err();
        assert!(
            handshake_error.to_string().contains("handshake"),
            "{handshake_error}"
        );
        let mut flipped = note.clone();
        let last = flipped.len() - 1;
        flipped[last] ^= 1;
        let tag_error = open_group_key_delivery(&flipped, &session).unwrap_err();
        assert!(
            tag_error.to_string().contains("authentication"),
            "{tag_error}"
        );
        let mut plain = [0u8; DELIVER_PLAINTEXT];
        plain[0] = 5;
        plain[5..37].copy_from_slice(&group_id);
        plain[37..69].copy_from_slice(&mailbox);
        plain[69..101].copy_from_slice(&[4u8; 32]);
        plain[101..133].copy_from_slice(&[10u8; 32]);
        for version in [0u8, 1, 3, 255] {
            let bad = seal_raw(&session, &plain, version, &nonce);
            let error = open_group_key_delivery(&bad, &session).unwrap_err();
            assert!(
                error.to_string().contains("Not a group key delivery"),
                "{version} {error}"
            );
        }
        let epoch_zero = seal_raw(&session, &plain, PROTOCOL_VERSION_V2, &nonce);
        let epoch_error = open_group_key_delivery(&epoch_zero, &session).unwrap_err();
        assert!(epoch_error.to_string().contains("epoch"), "{epoch_error}");
    }

    #[test]
    fn full_list_of_256_is_too_large_and_a_delta_note_folds_through_256() {
        let owner = [1u8; 32];
        let friend = [2u8; 32];
        let group_id = [7u8; 32];
        let mailbox = [9u8; 32];
        let roster: Vec<[u8; 32]> = (1..=256).map(person).collect();
        let admins: Vec<[u8; 32]> = (0..ADMIN_MAX)
            .map(|index| person(1000 + index as u32))
            .collect();
        assert_eq!(MEMBER_MAX, 256);
        assert_eq!(NAME_MAX, 64);
        assert_eq!(ADMIN_MAX, 16);
        let too_big = encode_admin(&Decoded {
            parent: [0u8; 32],
            group_id,
            mailbox,
            epoch: 1,
            op: OP_CREATE,
            name: vec![0u8; NAME_MAX],
            policy: JOINING_INVITE,
            owner: roster[0],
            admins,
            members: roster,
            subject: [0u8; 32],
            members_omitted: false,
            parent_group_id: [0u8; 32],
        })
        .unwrap_err();
        assert!(too_big.to_string().contains("too large"), "{too_big}");

        let legacy = encode_admin(&Decoded {
            parent: [0u8; 32],
            group_id,
            mailbox,
            epoch: 1,
            op: OP_CREATE,
            name: b"team".to_vec(),
            policy: JOINING_INVITE,
            owner,
            admins: Vec::new(),
            members: vec![owner],
            subject: [0u8; 32],
            members_omitted: false,
            parent_group_id: [0u8; 32],
        })
        .unwrap();
        let legacy_room = reduce_admin(&[event(legacy.clone(), owner, 10, 0)]);
        assert!(legacy_room.rejected.is_empty());
        assert_eq!(legacy_room.state.as_ref().unwrap().members.len(), 1);
        let legacy_add = draft_admin(
            legacy_room.state.as_ref(),
            &AdminDraft {
                op: OP_ADD_MEMBER,
                sender: owner,
                subject: Some(friend),
                name: None,
                policy: None,
                group_id: None,
                mailbox: None,
                parent_room: None,
            },
        )
        .unwrap();
        let legacy_grown = reduce_admin(&[
            event(legacy, owner, 10, 0),
            event_at(legacy_add, owner, 11, 2),
        ]);
        assert!(legacy_grown.rejected.is_empty());
        assert_eq!(legacy_grown.state.as_ref().unwrap().members.len(), 2);

        let hall_owner = person(1);
        let mut events = vec![marked(
            draft_admin(
                None,
                &AdminDraft {
                    op: OP_CREATE,
                    sender: hall_owner,
                    subject: None,
                    name: Some(b"hall".to_vec()),
                    policy: Some(JOINING_INVITE),
                    group_id: Some(person(900)),
                    mailbox: Some(person(901)),
                    parent_room: None,
                },
            )
            .unwrap(),
            hall_owner,
            1,
        )];
        let mut reduced = reduce_admin(&events);
        assert!(reduced.rejected.is_empty());
        assert_eq!(reduced.state.as_ref().unwrap().members.len(), 1);
        for count in 2u32..=256 {
            let note = draft_admin(
                reduced.state.as_ref(),
                &AdminDraft {
                    op: OP_ADD_MEMBER,
                    sender: hall_owner,
                    subject: Some(person(count)),
                    name: None,
                    policy: None,
                    group_id: None,
                    mailbox: None,
                    parent_room: None,
                },
            )
            .unwrap();
            assert!(note.len() <= 4096);
            assert_eq!(member_count_at(&note), MEMBERS_OMITTED);
            events.push(marked(note, hall_owner, count));
            reduced = reduce_admin(&events);
            assert!(
                reduced.rejected.is_empty(),
                "{count} {:?}",
                reduced.rejected
            );
            if count == 101 {
                assert_eq!(reduced.state.as_ref().unwrap().members.len(), 101);
            }
        }
        assert_eq!(reduced.state.as_ref().unwrap().members.len(), 256);
        assert_eq!(reduced.state.as_ref().unwrap().epoch, 1);
    }

    #[test]
    fn channel_keeps_its_roster_and_a_missed_key_payment_can_resume() {
        let owner = [1u8; 32];
        let parent_id = person(700);
        let parent_mail = person(701);
        let channel_id = person(702);
        let channel_mail = person(703);
        let alice = person(2);
        let bob = person(3);
        let cara = person(4);
        let extra: Vec<[u8; 32]> = (0..16).map(|index| person(20 + index)).collect();
        let parent_create = draft_admin(
            None,
            &AdminDraft {
                op: OP_CREATE,
                sender: owner,
                subject: None,
                name: Some(b"hall".to_vec()),
                policy: Some(JOINING_INVITE),
                group_id: Some(parent_id),
                mailbox: Some(parent_mail),
                parent_room: None,
            },
        )
        .unwrap();
        let mut parent_events = vec![event(parent_create, owner, 10, 0)];
        let mut parent = reduce_admin(&parent_events);
        let mut parent_members = vec![alice, bob, cara];
        parent_members.extend(extra.iter().copied());
        for (index, member) in parent_members.iter().copied().enumerate() {
            let note = draft_admin(
                parent.state.as_ref(),
                &AdminDraft {
                    op: OP_ADD_MEMBER,
                    sender: owner,
                    subject: Some(member),
                    name: None,
                    policy: None,
                    group_id: None,
                    mailbox: None,
                    parent_room: None,
                },
            )
            .unwrap();
            parent_events.push(event_at(
                note,
                owner,
                u8::try_from(11 + index).unwrap(),
                u64::try_from(index + 2).unwrap(),
            ));
            parent = reduce_admin(&parent_events);
        }
        assert!(parent.rejected.is_empty());
        assert_eq!(
            parent.state.as_ref().unwrap().members.len(),
            1 + 3 + extra.len()
        );

        let stranger_create = draft_admin(
            None,
            &AdminDraft {
                op: OP_CREATE,
                sender: alice,
                subject: None,
                name: Some(b"ops".to_vec()),
                policy: Some(JOINING_INVITE),
                group_id: Some(channel_id),
                mailbox: Some(channel_mail),
                parent_room: parent.state.clone(),
            },
        )
        .unwrap_err();
        assert!(
            stranger_create.to_string().contains("group owner"),
            "{stranger_create}"
        );

        let channel_create = draft_admin(
            None,
            &AdminDraft {
                op: OP_CREATE,
                sender: owner,
                subject: None,
                name: Some(b"ops".to_vec()),
                policy: Some(JOINING_INVITE),
                group_id: Some(channel_id),
                mailbox: Some(channel_mail),
                parent_room: parent.state.clone(),
            },
        )
        .unwrap();
        let mut channel_events = vec![event_at(channel_create, owner, 80, 30)];
        let mut channel = reduce_admin_with_parent(&channel_events, &parent_events);
        assert!(channel.rejected.is_empty(), "{:?}", channel.rejected);
        assert_eq!(channel.state.as_ref().unwrap().members.len(), 1);
        assert_eq!(channel.state.as_ref().unwrap().parent_group_id, parent_id);
        assert_eq!(channel.state.as_ref().unwrap().group_id, channel_id);
        assert_eq!(channel.state.as_ref().unwrap().mailbox, channel_mail);
        assert_ne!(
            channel.state.as_ref().unwrap().group_id,
            parent.state.as_ref().unwrap().group_id
        );

        let mut channel_members = vec![alice, bob];
        channel_members.extend(extra.iter().copied());
        for (index, member) in channel_members.iter().copied().enumerate() {
            let note = draft_admin(
                channel.state.as_ref(),
                &AdminDraft {
                    op: OP_ADD_MEMBER,
                    sender: owner,
                    subject: Some(member),
                    name: None,
                    policy: None,
                    group_id: None,
                    mailbox: None,
                    parent_room: parent.state.clone(),
                },
            )
            .unwrap();
            channel_events.push(event_at(
                note,
                owner,
                u8::try_from(81 + index).unwrap(),
                u64::try_from(31 + index).unwrap(),
            ));
            channel = reduce_admin_with_parent(&channel_events, &parent_events);
        }
        assert!(channel.rejected.is_empty(), "{:?}", channel.rejected);
        assert!(!channel.state.as_ref().unwrap().members.contains(&cara));
        assert!(channel.state.as_ref().unwrap().members.contains(&alice));
        let outsider = draft_admin(
            channel.state.as_ref(),
            &AdminDraft {
                op: OP_ADD_MEMBER,
                sender: owner,
                subject: Some(person(500)),
                name: None,
                policy: None,
                group_id: None,
                mailbox: None,
                parent_room: parent.state.clone(),
            },
        )
        .unwrap_err();
        assert!(outsider.to_string().contains("parent room"), "{outsider}");
        let transfer = draft_admin(
            channel.state.as_ref(),
            &AdminDraft {
                op: OP_TRANSFER_OWNER,
                sender: owner,
                subject: Some(bob),
                name: None,
                policy: None,
                group_id: None,
                mailbox: None,
                parent_room: parent.state.clone(),
            },
        )
        .unwrap_err();
        assert!(
            transfer.to_string().contains("group owner keeps"),
            "{transfer}"
        );

        let parent_remove = draft_admin(
            parent.state.as_ref(),
            &AdminDraft {
                op: OP_REMOVE_MEMBER,
                sender: owner,
                subject: Some(alice),
                name: None,
                policy: None,
                group_id: None,
                mailbox: None,
                parent_room: None,
            },
        )
        .unwrap();
        parent_events.push(event_at(parent_remove, owner, 60, 80));
        parent = reduce_admin(&parent_events);
        assert_eq!(parent.state.as_ref().unwrap().epoch, 2);
        assert!(!sender_may_post(parent.state.as_ref().unwrap(), &alice, 2));
        let stale = reduce_admin_with_parent(&channel_events, &parent_events);
        assert!(stale.state.as_ref().unwrap().members.contains(&alice));
        let departed = channel_departures(
            stale.state.as_ref().unwrap(),
            parent.state.as_ref().unwrap(),
        )
        .unwrap();
        assert_eq!(
            departed.iter().map(|item| item[3]).collect::<Vec<_>>(),
            vec![alice[3]]
        );

        let channel_remove = draft_admin(
            stale.state.as_ref(),
            &AdminDraft {
                op: OP_REMOVE_MEMBER,
                sender: owner,
                subject: Some(alice),
                name: None,
                policy: None,
                group_id: None,
                mailbox: None,
                parent_room: parent.state.clone(),
            },
        )
        .unwrap();
        channel_events.push(event_at(channel_remove, owner, 120, 90));
        channel = reduce_admin_with_parent(&channel_events, &parent_events);
        assert!(channel.rejected.is_empty(), "{:?}", channel.rejected);
        assert_eq!(channel.state.as_ref().unwrap().epoch, 2);
        assert!(!channel.state.as_ref().unwrap().members.contains(&alice));
        let remove_tx = channel.accepted.last().unwrap();
        assert!(!delivery_authorized(
            &channel.accepted,
            &remove_tx.tx_id,
            &owner,
            &alice,
            2
        ));
        assert!(!delivery_authorized(
            &channel.accepted,
            &remove_tx.tx_id,
            &bob,
            &bob,
            2
        ));
        let recipients = authorized_recipients(&channel.accepted, &remove_tx.tx_id, &owner, 2);
        assert!(!recipients.contains(&alice));
        assert!(recipients.contains(&bob));
        assert!(recipients.len() > DELIVER_BATCH);
        let batch = next_delivery_batch(&recipients);
        assert_eq!(batch.len(), DELIVER_BATCH);
        let missed = *batch.last().unwrap();
        let landed = &batch[..batch.len() - 1];
        let pending = pending_key_deliveries(&recipients, landed);
        assert!(pending.contains(&missed));
        assert_eq!(next_delivery_batch(&pending)[0], missed);
        let mut resumed = landed.to_vec();
        resumed.push(missed);
        assert!(!pending_key_deliveries(&recipients, &resumed).contains(&missed));
        assert_eq!(
            pending_key_deliveries(&recipients, &resumed).len(),
            recipients.len() - resumed.len()
        );
    }

    #[test]
    fn group_admin_delta_vector_matches_frozen_bytes() {
        let value = delta_vector();
        assert_eq!(
            value["constants"]["member_max"].as_u64().unwrap(),
            MEMBER_MAX as u64
        );
        assert_eq!(
            value["constants"]["members_omitted"].as_u64().unwrap(),
            u64::from(MEMBERS_OMITTED)
        );
        assert_eq!(
            value["constants"]["deliver_batch"].as_u64().unwrap(),
            DELIVER_BATCH as u64
        );
        for draft in value["drafts"].as_array().unwrap() {
            let basis = revive(&draft["basis_state"]);
            let name = draft["name"].as_str().unwrap();
            let note = draft_admin(basis.as_ref(), &draft_from(draft))
                .unwrap_or_else(|error| panic!("{name}: {error}"));
            assert_eq!(hex::encode(note), draft["note"].as_str().unwrap(), "{name}");
        }
        for (name, reduction) in value["reductions"].as_object().unwrap() {
            let events: Vec<AdminEvent> = reduction["events"]
                .as_array()
                .unwrap()
                .iter()
                .map(event_from)
                .collect();
            let result = match reduction.get("parent_events").and_then(Value::as_array) {
                Some(parent) => {
                    let parent_events: Vec<AdminEvent> = parent.iter().map(event_from).collect();
                    reduce_admin_with_parent(&events, &parent_events)
                }
                None => reduce_admin(&events),
            };
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
                Some(state) => assert_eq!(snap_parent(state), reduction["state"].clone(), "{name}"),
            }
        }
    }

    fn event(note: Vec<u8>, sender: [u8; 32], tx: u8, offset: u64) -> AdminEvent {
        AdminEvent {
            note,
            sender,
            tx_id: [tx; 32],
            round: 1,
            offset,
        }
    }

    fn event_at(note: Vec<u8>, sender: [u8; 32], tx: u8, round: u64) -> AdminEvent {
        AdminEvent {
            note,
            sender,
            tx_id: [tx; 32],
            round,
            offset: 0,
        }
    }

    fn person(id: u32) -> [u8; 32] {
        let mut out = [0u8; 32];
        out[..4].copy_from_slice(&id.to_be_bytes());
        out
    }

    fn marked(note: Vec<u8>, sender: [u8; 32], n: u32) -> AdminEvent {
        AdminEvent {
            note,
            sender,
            tx_id: person(10_000 + n),
            round: u64::from(n),
            offset: 0,
        }
    }

    fn member_count_at(note: &[u8]) -> u16 {
        let name_len = usize::from(note[103]);
        let admin_count = usize::from(u16::from_be_bytes([
            note[137 + name_len],
            note[138 + name_len],
        ]));
        let at = 139 + name_len + (32 * admin_count);
        u16::from_be_bytes([note[at], note[at + 1]])
    }

    fn with_policy(note: &[u8], policy: u8) -> Vec<u8> {
        let mut out = note.to_vec();
        let name_len = usize::from(out[103]);
        out[104 + name_len] = policy;
        out
    }

    fn seal_raw(session: &PqSession, plain: &[u8], version: u8, nonce: &[u8; 12]) -> Vec<u8> {
        use chacha20poly1305::aead::{Aead, KeyInit, Payload};
        use chacha20poly1305::{ChaCha20Poly1305, Nonce};

        let mut header = vec![version, super::DELIVER_PROTOCOL];
        header.extend_from_slice(&session.sender_public);
        header.extend_from_slice(&session.handshake_id);
        header.extend_from_slice(nonce);
        let cipher = ChaCha20Poly1305::new_from_slice(&session.session_key).unwrap();
        let sealed = cipher
            .encrypt(
                Nonce::from_slice(nonce),
                Payload {
                    msg: plain,
                    aad: &header,
                },
            )
            .unwrap();
        header.extend_from_slice(&sealed);
        header
    }
}
