"""Public room administration (protocol 0x03) and 0x06 action 5 key delivery.

Legacy 0x06 actions 1–4 stay in group.py and do not create an owner.
Pending join requests are derived by the reducer and are not written in the note.
A new note omits the member list. A full-list note still decodes.
"""

from __future__ import annotations

import os
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import ChaCha20Poly1305

from .pq import PQ_DATA_HEADER_SIZE, PQ_VERSION, PQSession
from .types import NONCE_SIZE, TAG_SIZE, PQError


GROUP_ADMIN_PROTOCOL = 0x03
GROUP_DELIVER_ACTION = 5
GROUP_NAME_MAX = 64
GROUP_ADMIN_MAX = 16
GROUP_MEMBER_MAX = 256
# Separate key-delivery payments in one pass. Not an atomic transaction group.
GROUP_DELIVER_BATCH = 16
# Member count sentinel: the note names one subject and omits the roster.
GROUP_MEMBERS_OMITTED = 0xFFFF
GROUP_DELIVER_PLAINTEXT_SIZE = 133
JOINING_INVITE = 1
JOINING_ASK = 2

OP_CREATE = 1
OP_SET_NAME = 2
OP_SET_POLICY = 3
OP_APPOINT_ADMIN = 4
OP_DISMISS_ADMIN = 5
OP_TRANSFER_OWNER = 6
OP_ADD_MEMBER = 7
OP_REQUEST_JOIN = 8
OP_ACCEPT_JOIN = 9
OP_DECLINE_JOIN = 10
OP_REMOVE_MEMBER = 11
OP_REKEY = 12
# Owner or admin adds a bot, marked as a bot with its reply mode and rate limit.
OP_ADD_BOT = 13
# Owner or admin changes a bot's reply mode and rate limit.
OP_SET_BOT = 14

# How a bot replies in one room. There is no default; the admin picks one.
BOT_MODE_MENTIONS = 1
BOT_MODE_EVERY_MESSAGE = 2
BOT_MODE_COMMANDS = 3
# Suggested safe preset: 5 replies per 60 seconds. A suggestion, never a default.
BOT_RATE_PRESET_REPLIES = 5
BOT_RATE_PRESET_SECONDS = 60
# Bytes a bot record adds after the parent group id: mode, replies, seconds.
BOT_SETTINGS_SIZE = 5
_BOT_MODES = frozenset({BOT_MODE_MENTIONS, BOT_MODE_EVERY_MESSAGE, BOT_MODE_COMMANDS})

_KNOWN_OPS = frozenset(
    {
        OP_CREATE,
        OP_SET_NAME,
        OP_SET_POLICY,
        OP_APPOINT_ADMIN,
        OP_DISMISS_ADMIN,
        OP_TRANSFER_OWNER,
        OP_ADD_MEMBER,
        OP_REQUEST_JOIN,
        OP_ACCEPT_JOIN,
        OP_DECLINE_JOIN,
        OP_REMOVE_MEMBER,
        OP_REKEY,
        OP_ADD_BOT,
        OP_SET_BOT,
    }
)
_ZERO_ID = bytes(32)
_NOTE_LIMIT = 4096


@dataclass(frozen=True)
class BotSettings:
    """A bot's reply mode and rate limit in one room: ``replies`` per ``seconds``."""

    mode: int
    replies: int
    seconds: int


@dataclass(frozen=True)
class RoomBot:
    """One member marked as a bot in a room, with its settings there."""

    account: bytes
    mode: int
    replies: int
    seconds: int

    @property
    def settings(self) -> BotSettings:
        return BotSettings(self.mode, self.replies, self.seconds)


@dataclass
class RoomState:
    """Accepted public room plus the derived pending requests and chain head."""

    group_id: bytes
    mailbox: bytes
    owner: bytes
    admins: list[bytes]
    members: list[bytes]
    pending: list[bytes]
    policy: int
    name: bytes
    epoch: int
    head_tx_id: bytes
    # 32 zero bytes when this room is not a channel.
    parent_group_id: bytes = _ZERO_ID
    # Members marked as bots in this room, sorted by account.
    bots: list[RoomBot] = field(default_factory=list)


@dataclass
class AdminEvent:
    """One confirmed administration payment, before ordering."""

    note: bytes
    sender: bytes
    tx_id: bytes
    round: int
    offset: int


@dataclass
class AcceptedAdmin:
    """One administration record the reducer accepted."""

    tx_id: bytes
    sender: bytes
    op: int
    epoch: int
    subject: bytes
    members: list[bytes]


@dataclass
class RejectedAdmin:
    """One administration record the reducer refused, in chain order."""

    tx_id: bytes
    reason: str


@dataclass
class ReduceAdminResult:
    """Room state after every event, plus the accepted and rejected records."""

    state: RoomState | None
    accepted: list[AcceptedAdmin]
    rejected: list[RejectedAdmin]


@dataclass
class GroupKeyDelivery:
    """Plaintext of a 227-byte 0x06 action 5 note."""

    epoch: int
    group_id: bytes
    mailbox: bytes
    group_key: bytes
    admin_tx_id: bytes


@dataclass
class _Decoded:
    parent: bytes
    group_id: bytes
    mailbox: bytes
    epoch: int
    op: int
    name: bytes
    policy: int
    owner: bytes
    admins: list[bytes]
    members: list[bytes]
    subject: bytes
    # True when the note uses the 0xFFFF sentinel instead of a member list.
    members_omitted: bool = False
    # Present on a delta note. Legacy full-list notes leave this as 32 zero bytes.
    parent_group_id: bytes = _ZERO_ID
    # Present only on an add-bot or set-bot note.
    bot: BotSettings | None = None


@dataclass
class _Public:
    group_id: bytes
    mailbox: bytes
    parent_group_id: bytes
    owner: bytes
    admins: list[bytes]
    members: list[bytes]
    pending: list[bytes]
    policy: int
    name: bytes
    epoch: int
    bots: list[RoomBot] = field(default_factory=list)


def draft_admin(
    state: RoomState | None,
    op: int,
    sender: bytes,
    subject: bytes | None = None,
    name: bytes | None = None,
    policy: int | None = None,
    group_id: bytes | None = None,
    mailbox: bytes | None = None,
    parent_room: RoomState | None = None,
    bot: BotSettings | None = None,
) -> bytes:
    """Encode the only public note that ``op`` may append to ``state``.

    The note omits the member list. ``parent_room`` is required when creating
    a channel and on every later note for that channel. ``bot`` is required for
    add-bot and set-bot; there is no default.
    """
    subject_bytes = _ZERO_ID if subject is None else bytes(subject)
    if _is_bot_op(op):
        if bot is None:
            raise PQError("A bot needs a reply mode and a rate limit")
        _check_bot_settings(bot)
    sender_bytes = bytes(sender)
    parent_group_id = _channel_parent(
        state,
        op,
        sender_bytes,
        subject_bytes,
        group_id,
        mailbox,
        parent_room,
    )
    if state is None:
        parent = _ZERO_ID
        base_name = b""
        base_policy = JOINING_INVITE
        base_owner = sender_bytes
        base_admins: list[bytes] = []
        base_members: list[bytes] = []
        base_group = _ZERO_ID
        base_mailbox = _ZERO_ID
        base_epoch = 1
    else:
        parent = bytes(state.head_tx_id)
        base_name = bytes(state.name)
        base_policy = state.policy
        base_owner = bytes(state.owner)
        base_admins = _copy_list(state.admins)
        base_members = _copy_list(state.members)
        base_group = bytes(state.group_id)
        base_mailbox = bytes(state.mailbox)
        base_epoch = state.epoch
    chosen_group = base_group if group_id is None else bytes(group_id)
    chosen_mailbox = base_mailbox if mailbox is None else bytes(mailbox)
    chosen_name = base_name if name is None else bytes(name)
    chosen_policy = base_policy if policy is None else policy
    if _op_is(op, OP_CREATE):
        nxt = _Public(
            group_id=chosen_group,
            mailbox=chosen_mailbox,
            parent_group_id=bytes(parent_group_id),
            owner=sender_bytes,
            admins=[],
            members=[sender_bytes],
            pending=[],
            policy=chosen_policy,
            name=chosen_name,
            epoch=1,
        )
    else:
        proposed = _Decoded(
            parent=parent,
            group_id=chosen_group,
            mailbox=chosen_mailbox,
            epoch=base_epoch,
            op=op,
            name=chosen_name,
            policy=chosen_policy,
            owner=base_owner,
            admins=base_admins,
            members=base_members,
            subject=subject_bytes,
            members_omitted=True,
            parent_group_id=bytes(parent_group_id),
            bot=bot,
        )
        nxt = _expect_next(state, proposed, sender_bytes)
    return _encode_admin_record(
        _Decoded(
            parent=parent,
            group_id=nxt.group_id,
            mailbox=nxt.mailbox,
            epoch=nxt.epoch,
            op=op,
            name=nxt.name,
            policy=nxt.policy,
            owner=nxt.owner,
            admins=nxt.admins,
            members=nxt.members,
            subject=subject_bytes,
            members_omitted=True,
            parent_group_id=bytes(nxt.parent_group_id),
            bot=bot if _is_bot_op(op) else None,
        )
    )


def room_bot(state: RoomState, account: bytes) -> RoomBot | None:
    """The bot mark, reply mode and rate limit for ``account``, or None when it is not a bot here."""
    _require_length("account", account, 32)
    return next((item for item in state.bots if item.account == bytes(account)), None)


def reduce_admin(
    events: Iterable[AdminEvent],
    parent_events: Iterable[AdminEvent] | None = None,
) -> ReduceAdminResult:
    """Replay administration notes in confirmed order.

    Order is round, then intra-round offset, then transaction id bytes.
    A repeated accepted transaction id is ``replay``. A join request does
    not become the chain head. Its parent must be an accepted administration
    transaction. The 32 zero bytes are create's parent and are not that set.
    Pass ``parent_events`` when the room is a channel. Parent membership is
    not copied into the channel.
    """
    parent_steps = None if parent_events is None else _fold_admin(parent_events, None).steps
    return _fold_admin(events, parent_steps).result


def sender_may_post(state: RoomState, sender: bytes, epoch: int) -> bool:
    """Return whether ``sender`` may post a mailbox note at ``epoch``."""
    _require_length("sender", sender, 32)
    if type(epoch) is not int:
        return False
    return epoch == state.epoch and _contains(state.members, sender)


def delivery_authorized(
    accepted: Sequence[AcceptedAdmin],
    admin_tx_id: bytes,
    sender: bytes,
    recipient: bytes,
    epoch: int,
) -> bool:
    """Return whether ``sender`` may deliver the room key to ``recipient``.

    Add and accept authorize only the subject. Remove authorizes every
    remaining member except the subject. Rekey and transfer authorize every
    remaining member. Every other operation authorizes nobody.
    """
    record = next((item for item in accepted if item.tx_id == admin_tx_id), None)
    if record is None or record.sender != sender or type(epoch) is not int or record.epoch != epoch:
        return False
    if not _contains(record.members, recipient):
        return False
    if _op_is(record.op, OP_ADD_MEMBER) or _op_is(record.op, OP_ACCEPT_JOIN) or _op_is(record.op, OP_ADD_BOT):
        return record.subject == recipient
    if _op_is(record.op, OP_REMOVE_MEMBER):
        return record.subject != recipient
    return _op_is(record.op, OP_REKEY) or _op_is(record.op, OP_TRANSFER_OWNER)


def authorized_recipients(
    accepted: Sequence[AcceptedAdmin],
    admin_tx_id: bytes,
    sender: bytes,
    epoch: int,
) -> list[bytes]:
    """Members authorized to receive the key for one accepted record."""
    record = next((item for item in accepted if item.tx_id == admin_tx_id), None)
    if record is None:
        return []
    return [
        bytes(member)
        for member in record.members
        if delivery_authorized(accepted, admin_tx_id, sender, member, epoch)
    ]


def channel_departures(channel: RoomState, parent: RoomState) -> list[bytes]:
    """Members of a channel who are no longer members of the parent room."""
    if _is_zero(channel.parent_group_id) or channel.parent_group_id != parent.group_id:
        raise PQError("Channel does not point at this parent room")
    return [bytes(member) for member in channel.members if not _contains(parent.members, member)]


def pending_key_deliveries(recipients: Sequence[bytes], landed: Sequence[bytes]) -> list[bytes]:
    """Recipients still owed a key. A payment already in ``landed`` stays there."""
    return [bytes(recipient) for recipient in recipients if not _contains(landed, recipient)]


def next_delivery_batch(
    pending: Sequence[bytes],
    batch_size: int = GROUP_DELIVER_BATCH,
) -> list[bytes]:
    """The next separate payments, at most 16. This does not build an atomic group."""
    if type(batch_size) is not int or batch_size < 1 or batch_size > GROUP_DELIVER_BATCH:
        raise PQError("A key delivery batch is at most 16 payments")
    return [bytes(item) for item in list(pending)[:batch_size]]


def encode_admin_record(
    parent: bytes,
    group_id: bytes,
    mailbox: bytes,
    epoch: int,
    op: int,
    name: bytes,
    policy: int,
    owner: bytes,
    admins: Sequence[bytes],
    members: Sequence[bytes],
    subject: bytes,
    *,
    members_omitted: bool = False,
    parent_group_id: bytes | None = None,
    bot: BotSettings | None = None,
) -> bytes:
    """Encode one 0x03 note. Omitted members use the 65535 sentinel."""
    return _encode_admin_record(
        _Decoded(
            parent=bytes(parent),
            group_id=bytes(group_id),
            mailbox=bytes(mailbox),
            epoch=epoch,
            op=op,
            name=bytes(name),
            policy=policy,
            owner=bytes(owner),
            admins=[bytes(item) for item in admins],
            members=[bytes(item) for item in members],
            subject=bytes(subject),
            members_omitted=members_omitted,
            parent_group_id=_ZERO_ID if parent_group_id is None else bytes(parent_group_id),
            bot=bot,
        )
    )


def seal_group_key_delivery(
    session: PQSession,
    epoch: int,
    group_id: bytes,
    mailbox: bytes,
    group_key: bytes,
    admin_tx_id: bytes,
    nonce: bytes | None = None,
) -> bytes:
    """Seal a 133-byte action 5 plaintext into a 227-byte 0x06 note."""
    session_key = _require_length("session key", session.session_key, 32)
    sender = _require_length("sender public key", session.sender_public_key, 32)
    handshake_id = _require_length("handshake id", session.handshake_id, 32)
    if nonce is None:
        nonce = os.urandom(NONCE_SIZE)
    nonce = _require_length("nonce", nonce, NONCE_SIZE)
    plaintext = _encode_delivery(epoch, group_id, mailbox, group_key, admin_tx_id)
    header = bytes([PQ_VERSION, 0x06]) + sender + handshake_id + nonce
    if len(header) != PQ_DATA_HEADER_SIZE:
        raise PQError(f"Group key delivery header is {len(header)} bytes")
    sealed = ChaCha20Poly1305(session_key).encrypt(nonce, plaintext, header)
    return header + sealed


def open_group_key_delivery(note: bytes, session: PQSession) -> GroupKeyDelivery:
    """Open a 227-byte 0x06 action 5 note with the hybrid session key."""
    if isinstance(note, bytearray):
        note = bytes(note)
    expected = PQ_DATA_HEADER_SIZE + GROUP_DELIVER_PLAINTEXT_SIZE + TAG_SIZE
    if not isinstance(note, bytes) or len(note) != expected or note[0] != PQ_VERSION or note[1] != 0x06:
        raise PQError("Not a group key delivery")
    session_key = _require_length("session key", session.session_key, 32)
    sender = _require_length("sender public key", session.sender_public_key, 32)
    handshake_id = _require_length("handshake id", session.handshake_id, 32)
    if note[2:34] != sender:
        raise PQError("Key delivery sender does not match the session")
    if note[34:66] != handshake_id:
        raise PQError("Key delivery is for a different handshake")
    nonce = note[66:78]
    header = note[:PQ_DATA_HEADER_SIZE]
    try:
        plain = ChaCha20Poly1305(session_key).decrypt(
            nonce,
            note[PQ_DATA_HEADER_SIZE:],
            header,
        )
    except (InvalidTag, ValueError) as exc:
        raise PQError("Group key delivery authentication failed") from exc
    if len(plain) != GROUP_DELIVER_PLAINTEXT_SIZE or plain[0] != GROUP_DELIVER_ACTION:
        raise PQError("Group key delivery plaintext is not action 5")
    epoch = int.from_bytes(plain[1:5], "big")
    if epoch < 1:
        raise PQError("Group epoch must be from 1 through 4294967295")
    return GroupKeyDelivery(
        epoch=epoch,
        group_id=plain[5:37],
        mailbox=plain[37:69],
        group_key=plain[69:101],
        admin_tx_id=plain[101:133],
    )


def _apply_admin(
    state: RoomState | None,
    event: AdminEvent,
    known: set[str],
    parent_state: RoomState | None,
) -> tuple[RoomState, AcceptedAdmin, bool]:
    _require_length("sender", event.sender, 32)
    _require_length("transaction id", event.tx_id, 32)
    decoded = _decode_admin(bytes(event.note))
    if decoded.mailbox == event.sender:
        raise PQError("Mailbox key does not own the room")
    _bind_channel(decoded, bytes(event.sender), parent_state)
    parent = _ZERO_ID if state is None else bytes(state.head_tx_id)
    request = _op_is(decoded.op, OP_REQUEST_JOIN)
    if request:
        if state is None or decoded.parent == _ZERO_ID or decoded.parent.hex() not in known:
            raise PQError("Join request does not cite this room")
    elif decoded.parent != parent:
        raise PQError("Stale administration parent")
    nxt = _expect_next(state, decoded, event.sender)
    if not _same_state(decoded, nxt):
        raise PQError("Administration record does not match the authorized next state")
    if request:
        if state is None:
            raise PQError("Join request does not cite this room")
        head = bytes(state.head_tx_id)
    else:
        head = bytes(event.tx_id)
    room = RoomState(
        group_id=nxt.group_id,
        mailbox=nxt.mailbox,
        owner=nxt.owner,
        admins=nxt.admins,
        members=nxt.members,
        pending=nxt.pending,
        policy=nxt.policy,
        name=nxt.name,
        epoch=nxt.epoch,
        head_tx_id=head,
        parent_group_id=bytes(nxt.parent_group_id),
        bots=list(nxt.bots),
    )
    record = AcceptedAdmin(
        tx_id=bytes(event.tx_id),
        sender=bytes(event.sender),
        op=decoded.op,
        epoch=room.epoch,
        subject=bytes(decoded.subject),
        members=_copy_list(room.members),
    )
    return room, record, not request


def _expect_next(state: RoomState | None, decoded: _Decoded, sender: bytes) -> _Public:
    if _op_is(decoded.op, OP_CREATE):
        if state is not None:
            raise PQError("Create requires an empty parent")
        if not _is_zero(decoded.parent) or not _is_zero(decoded.subject):
            raise PQError("Create parent and subject must be zero")
        if decoded.owner != sender:
            raise PQError("Create sender is not the owner")
        if decoded.epoch != 1 or len(decoded.admins) != 0:
            raise PQError("Create starts at epoch 1 with no admins")
        if decoded.members_omitted:
            if len(decoded.members) != 0:
                raise PQError("Create membership is the owner alone")
        elif len(decoded.members) != 1 or decoded.members[0] != sender:
            raise PQError("Create membership is the owner alone")
        members = [bytes(sender)]
        _reject_mailbox_overlap(decoded.mailbox, members, decoded.admins, decoded.owner)
        return _body(decoded, [], members)
    if state is None:
        raise PQError("Administration parent is missing")
    if decoded.group_id != state.group_id or decoded.mailbox != state.mailbox:
        raise PQError("Administration record is for a different room")
    privileged = sender == state.owner or _contains(state.admins, sender)
    members = _copy_list(state.members)
    admins = _copy_list(state.admins)
    pending = _copy_list(state.pending)
    owner = bytes(state.owner)
    epoch = state.epoch
    name = bytes(state.name)
    policy = state.policy
    bots = list(state.bots)
    subject = decoded.subject

    def is_bot(account: bytes) -> bool:
        return any(item.account == account for item in bots)

    if _op_is(decoded.op, OP_SET_NAME):
        if not privileged or not _is_zero(subject):
            raise PQError("Sender cannot rename the room")
        name = bytes(decoded.name)
    elif _op_is(decoded.op, OP_SET_POLICY):
        if not privileged or not _is_zero(subject):
            raise PQError("Sender cannot change the joining rule")
        policy = decoded.policy
    elif _op_is(decoded.op, OP_APPOINT_ADMIN):
        if sender != state.owner:
            raise PQError("Only the owner appoints an admin")
        if not _contains(members, subject) or subject == owner or _contains(admins, subject):
            raise PQError("That person cannot be appointed")
        if is_bot(subject):
            raise PQError("A bot cannot be an admin")
        admins = _canonical_set([*admins, subject], "admins", GROUP_ADMIN_MAX)
    elif _op_is(decoded.op, OP_DISMISS_ADMIN):
        if sender != state.owner or not _contains(admins, subject):
            raise PQError("Only the owner dismisses an admin")
        admins = [item for item in admins if item != subject]
    elif _op_is(decoded.op, OP_TRANSFER_OWNER):
        if sender != state.owner or not _contains(members, subject) or subject == owner:
            raise PQError("Ownership can move only from the owner to another member")
        if is_bot(subject):
            raise PQError("A bot cannot own the room")
        owner = bytes(subject)
        admins = [item for item in admins if item != subject]
        epoch = _bump(epoch)
    elif _op_is(decoded.op, OP_ADD_MEMBER):
        if not privileged or _contains(members, subject) or subject == state.mailbox:
            raise PQError("Sender cannot add that member")
        members = _canonical_set([*members, subject], "members", GROUP_MEMBER_MAX)
        pending = [item for item in pending if item != subject]
    elif _op_is(decoded.op, OP_REQUEST_JOIN):
        if (
            state.policy != JOINING_ASK
            or sender != subject
            or _contains(members, subject)
            or _contains(pending, subject)
        ):
            raise PQError("That join request is not allowed")
        pending = _canonical_set([*pending, subject], "pending", GROUP_MEMBER_MAX)
    elif _op_is(decoded.op, OP_ACCEPT_JOIN):
        if not privileged or not _contains(pending, subject):
            raise PQError("No join request to accept")
        members = _canonical_set([*members, subject], "members", GROUP_MEMBER_MAX)
        pending = [item for item in pending if item != subject]
    elif _op_is(decoded.op, OP_DECLINE_JOIN):
        if not privileged or not _contains(pending, subject):
            raise PQError("No join request to decline")
        pending = [item for item in pending if item != subject]
    elif _op_is(decoded.op, OP_REMOVE_MEMBER):
        if not privileged or not _contains(members, subject) or subject == owner:
            raise PQError("Sender cannot remove that member")
        members = [item for item in members if item != subject]
        admins = [item for item in admins if item != subject]
        pending = [item for item in pending if item != subject]
        bots = [item for item in bots if item.account != subject]
        epoch = _bump(epoch)
    elif _op_is(decoded.op, OP_REKEY):
        if not privileged or not _is_zero(subject):
            raise PQError("Sender cannot rotate the room key")
        epoch = _bump(epoch)
    elif _op_is(decoded.op, OP_ADD_BOT):
        if (
            not privileged
            or _contains(members, subject)
            or subject == state.mailbox
            or _is_zero(subject)
        ):
            raise PQError("Sender cannot add that bot")
        settings = _require_bot(decoded)
        members = _canonical_set([*members, subject], "members", GROUP_MEMBER_MAX)
        pending = [item for item in pending if item != subject]
        bots = sorted(
            [*bots, RoomBot(bytes(subject), settings.mode, settings.replies, settings.seconds)],
            key=lambda item: item.account,
        )
    elif _op_is(decoded.op, OP_SET_BOT):
        if not privileged or not is_bot(subject):
            raise PQError("Sender cannot change that bot")
        settings = _require_bot(decoded)
        bots = [
            RoomBot(bytes(subject), settings.mode, settings.replies, settings.seconds)
            if item.account == subject
            else item
            for item in bots
        ]
    else:
        raise PQError("Unknown room administration operation")
    _reject_mailbox_overlap(state.mailbox, members, admins, owner)
    if not _contains(members, owner):
        raise PQError("The owner must remain a member")
    return _Public(
        group_id=bytes(state.group_id),
        mailbox=bytes(state.mailbox),
        parent_group_id=bytes(state.parent_group_id),
        owner=owner,
        admins=admins,
        members=members,
        pending=pending,
        policy=policy,
        name=name,
        epoch=epoch,
        bots=bots,
    )


def _is_bot_op(op: object) -> bool:
    return _op_is(op, OP_ADD_BOT) or _op_is(op, OP_SET_BOT)


def _check_bot_settings(bot: BotSettings) -> None:
    if type(bot.mode) is not int or bot.mode not in _BOT_MODES:
        raise PQError("Bot reply mode must be mentions, every message, or commands")
    for value in (bot.replies, bot.seconds):
        if type(value) is not int or value < 1 or value > 0xFFFF:
            raise PQError("Bot rate limit must be from 1 through 65535")


def _require_bot(decoded: _Decoded) -> BotSettings:
    if decoded.bot is None:
        raise PQError("A bot needs a reply mode and a rate limit")
    _check_bot_settings(decoded.bot)
    return BotSettings(decoded.bot.mode, decoded.bot.replies, decoded.bot.seconds)


def _body(decoded: _Decoded, pending: list[bytes], members: list[bytes]) -> _Public:
    return _Public(
        group_id=bytes(decoded.group_id),
        mailbox=bytes(decoded.mailbox),
        parent_group_id=bytes(decoded.parent_group_id),
        owner=bytes(decoded.owner),
        admins=_copy_list(decoded.admins),
        members=_copy_list(members),
        pending=_copy_list(pending),
        policy=decoded.policy,
        name=bytes(decoded.name),
        epoch=decoded.epoch,
    )


def _same_state(decoded: _Decoded, nxt: _Public) -> bool:
    return (
        decoded.owner == nxt.owner
        and decoded.epoch == nxt.epoch
        and decoded.policy == nxt.policy
        and decoded.name == nxt.name
        and decoded.parent_group_id == nxt.parent_group_id
        and _same_list(decoded.admins, nxt.admins)
        and (decoded.members_omitted or _same_list(decoded.members, nxt.members))
    )


def _encode_admin_record(fields: _Decoded) -> bytes:
    name = _canonical_name(fields.name)
    admins = _canonical_set(fields.admins, "admins", GROUP_ADMIN_MAX)
    members_omitted = fields.members_omitted is True
    parent_group_id = bytes(fields.parent_group_id)
    parent = _require_length("parent", fields.parent, 32)
    group_id = _require_length("group id", fields.group_id, 32)
    mailbox = _require_length("mailbox", fields.mailbox, 32)
    owner = _require_length("owner", fields.owner, 32)
    subject = _require_length("subject", fields.subject, 32)
    _require_length("parent group", parent_group_id, 32)
    epoch = _require_uint32("epoch", fields.epoch)
    if not members_omitted and not _is_zero(parent_group_id):
        raise PQError("A full member list cannot name a parent room")
    members = [] if members_omitted else _canonical_set(fields.members, "members", GROUP_MEMBER_MAX)
    if type(fields.policy) is not int or fields.policy not in (JOINING_INVITE, JOINING_ASK):
        raise PQError("Joining rule must be invite-only or ask-to-join")
    if type(fields.op) is not int or fields.op not in _KNOWN_OPS:
        raise PQError("Unknown room administration operation")
    bot_op = _is_bot_op(fields.op)
    if bot_op:
        if not members_omitted:
            raise PQError("A bot record uses the delta note")
        if fields.bot is None:
            raise PQError("A bot needs a reply mode and a rate limit")
        _check_bot_settings(fields.bot)
    elif fields.bot is not None:
        raise PQError("Only a bot record carries bot settings")
    out = bytearray()
    out += bytes([PQ_VERSION, GROUP_ADMIN_PROTOCOL])
    out += parent
    out += group_id
    out += mailbox
    out += epoch.to_bytes(4, "big")
    out.append(fields.op)
    out.append(len(name))
    out += name
    out.append(fields.policy)
    out += owner
    out += len(admins).to_bytes(2, "big")
    for admin in admins:
        out += admin
    out += (GROUP_MEMBERS_OMITTED if members_omitted else len(members)).to_bytes(2, "big")
    if not members_omitted:
        for member in members:
            out += member
    out += subject
    if members_omitted:
        out += parent_group_id
    if bot_op and fields.bot is not None:
        out.append(fields.bot.mode)
        out += fields.bot.replies.to_bytes(2, "big")
        out += fields.bot.seconds.to_bytes(2, "big")
    if len(out) > _NOTE_LIMIT:
        raise PQError(
            "Administration record exceeds 4096 bytes"
            if members_omitted
            else "Full member list is too large"
        )
    return bytes(out)


def _decode_admin(note: bytes) -> _Decoded:
    if len(note) < 141 or note[0] != PQ_VERSION or note[1] != GROUP_ADMIN_PROTOCOL:
        raise PQError("Not a room administration record")
    cursor = 2
    parent = _take(note, cursor, 32)
    cursor += 32
    group_id = _take(note, cursor, 32)
    cursor += 32
    mailbox = _take(note, cursor, 32)
    cursor += 32
    epoch = int.from_bytes(_take(note, cursor, 4), "big")
    cursor += 4
    op = _read_u8(note, cursor)
    cursor += 1
    name_len = _read_u8(note, cursor)
    cursor += 1
    if name_len > GROUP_NAME_MAX:
        raise PQError("Room name is longer than 64 bytes")
    name = _take(note, cursor, name_len)
    cursor += name_len
    _canonical_name(name)
    policy = _read_u8(note, cursor)
    cursor += 1
    owner = _take(note, cursor, 32)
    cursor += 32
    admin_count = int.from_bytes(_take(note, cursor, 2), "big")
    cursor += 2
    admins: list[bytes] = []
    for _ in range(admin_count):
        admins.append(_take(note, cursor, 32))
        cursor += 32
    member_count = int.from_bytes(_take(note, cursor, 2), "big")
    cursor += 2
    members_omitted = member_count == GROUP_MEMBERS_OMITTED
    members: list[bytes] = []
    if not members_omitted:
        for _ in range(member_count):
            members.append(_take(note, cursor, 32))
            cursor += 32
    subject = _take(note, cursor, 32)
    cursor += 32
    if members_omitted:
        parent_group_id = _take(note, cursor, 32)
        cursor += 32
    else:
        parent_group_id = bytes(32)
    bot: BotSettings | None = None
    if _is_bot_op(op):
        if not members_omitted:
            raise PQError("A bot record uses the delta note")
        settings = _take(note, cursor, BOT_SETTINGS_SIZE)
        cursor += BOT_SETTINGS_SIZE
        bot = BotSettings(
            settings[0],
            int.from_bytes(settings[1:3], "big"),
            int.from_bytes(settings[3:5], "big"),
        )
        _check_bot_settings(bot)
    if cursor != len(note):
        raise PQError("Administration record has trailing bytes")
    if len(note) > _NOTE_LIMIT:
        raise PQError(
            "Administration record exceeds 4096 bytes"
            if members_omitted
            else "Full member list is too large"
        )
    _canonical_set(admins, "admins", GROUP_ADMIN_MAX)
    if not members_omitted:
        _canonical_set(members, "members", GROUP_MEMBER_MAX)
    if not _strictly_increasing(admins) or not _strictly_increasing(members):
        raise PQError("Administration sets must be strictly sorted")
    if policy not in (JOINING_INVITE, JOINING_ASK):
        raise PQError("Joining rule must be invite-only or ask-to-join")
    return _Decoded(
        parent=parent,
        group_id=group_id,
        mailbox=mailbox,
        epoch=epoch,
        op=op,
        name=name,
        policy=policy,
        owner=owner,
        admins=admins,
        members=members,
        subject=subject,
        members_omitted=members_omitted,
        parent_group_id=parent_group_id,
        bot=bot,
    )


def _encode_delivery(
    epoch: int,
    group_id: bytes,
    mailbox: bytes,
    group_key: bytes,
    admin_tx_id: bytes,
) -> bytes:
    epoch_value = _require_uint32("epoch", epoch)
    if epoch_value < 1:
        raise PQError("Group epoch must be from 1 through 4294967295")
    return (
        bytes([GROUP_DELIVER_ACTION])
        + epoch_value.to_bytes(4, "big")
        + _require_length("group id", group_id, 32)
        + _require_length("mailbox", mailbox, 32)
        + _require_length("group key", group_key, 32)
        + _require_length("administration id", admin_tx_id, 32)
    )


@dataclass
class _Folded:
    result: ReduceAdminResult
    steps: list[tuple[AdminEvent, RoomState | None]]


def _fold_admin(
    events: Iterable[AdminEvent],
    parent_steps: list[tuple[AdminEvent, RoomState | None]] | None,
) -> _Folded:
    ordered = sorted(events, key=lambda item: (item.round, item.offset, bytes(item.tx_id)))
    state: RoomState | None = None
    accepted: list[AcceptedAdmin] = []
    rejected: list[RejectedAdmin] = []
    seen: set[str] = set()
    known: set[str] = set()
    steps: list[tuple[AdminEvent, RoomState | None]] = []
    for event in ordered:
        tx_id = bytes(event.tx_id)
        key = tx_id.hex()
        if key in seen:
            rejected.append(RejectedAdmin(tx_id=tx_id, reason="replay"))
            steps.append((event, state))
            continue
        try:
            parent_state = None if parent_steps is None else _parent_before(parent_steps, event)
            nxt, record, advance = _apply_admin(state, event, known, parent_state)
        except Exception as error:  # noqa: BLE001 - one bad note must not stop the chain
            message = str(error)
            rejected.append(RejectedAdmin(tx_id=tx_id, reason=message if message else "rejected"))
            steps.append((event, state))
            continue
        seen.add(key)
        if advance:
            known.add(key)
        state = nxt
        accepted.append(record)
        steps.append((event, state))
    return _Folded(
        result=ReduceAdminResult(state=state, accepted=accepted, rejected=rejected),
        steps=steps,
    )


def _parent_before(
    steps: list[tuple[AdminEvent, RoomState | None]],
    event: AdminEvent,
) -> RoomState | None:
    state: RoomState | None = None
    for step_event, step_state in steps:
        if _compare_events(step_event, event) < 0:
            state = step_state
        else:
            break
    return state


def _compare_events(left: AdminEvent, right: AdminEvent) -> int:
    if left.round != right.round:
        return -1 if left.round < right.round else 1
    if left.offset != right.offset:
        return -1 if left.offset < right.offset else 1
    left_id = bytes(left.tx_id)
    right_id = bytes(right.tx_id)
    if left_id < right_id:
        return -1
    if left_id > right_id:
        return 1
    return 0


def _channel_parent(
    state: RoomState | None,
    op: int,
    sender: bytes,
    subject: bytes,
    group_id: bytes | None,
    mailbox: bytes | None,
    parent_room: RoomState | None,
) -> bytes:
    if _op_is(op, OP_CREATE):
        if parent_room is None:
            return bytes(32)
        if sender != parent_room.owner:
            raise PQError("Only the group owner creates a channel")
        chosen_group = bytes(32) if group_id is None else bytes(group_id)
        chosen_mailbox = bytes(32) if mailbox is None else bytes(mailbox)
        if chosen_group == parent_room.group_id or chosen_mailbox == parent_room.mailbox:
            raise PQError("A channel has its own mailbox and group id")
        return bytes(parent_room.group_id)
    current = bytes(32) if state is None else bytes(state.parent_group_id)
    if _is_zero(current):
        return bytes(current)
    if parent_room is None or parent_room.group_id != current:
        raise PQError("Channel does not point at this parent room")
    if _op_is(op, OP_TRANSFER_OWNER):
        raise PQError("The group owner keeps the channel")
    _check_channel_join(op, subject, parent_room)
    return bytes(current)


def _bind_channel(decoded: _Decoded, sender: bytes, parent_state: RoomState | None) -> None:
    parent_group_id = decoded.parent_group_id
    if _is_zero(parent_group_id):
        return
    if parent_state is None or parent_state.group_id != parent_group_id:
        raise PQError("Channel does not point at this parent room")
    if _op_is(decoded.op, OP_CREATE):
        if sender != parent_state.owner:
            raise PQError("Only the group owner creates a channel")
        if decoded.group_id == parent_state.group_id or decoded.mailbox == parent_state.mailbox:
            raise PQError("A channel has its own mailbox and group id")
    if _op_is(decoded.op, OP_TRANSFER_OWNER):
        raise PQError("The group owner keeps the channel")
    _check_channel_join(decoded.op, decoded.subject, parent_state)


def _check_channel_join(op: int, subject: bytes, parent_room: RoomState) -> None:
    """A channel takes people from its parent room. A bot there joins a channel only as a bot."""
    joining = _op_is(op, OP_ADD_MEMBER) or _op_is(op, OP_ACCEPT_JOIN) or _op_is(op, OP_REQUEST_JOIN)
    if not joining and not _op_is(op, OP_ADD_BOT):
        return
    if not _contains(parent_room.members, subject):
        raise PQError("That person is not in the parent room")
    parent_bot = any(item.account == subject for item in parent_room.bots)
    if _op_is(op, OP_ADD_BOT) and not parent_bot:
        raise PQError("That account is not a bot in the parent room")
    if joining and parent_bot:
        raise PQError("A bot joins a channel only when added as a bot")


def _reject_mailbox_overlap(
    mailbox: bytes,
    members: Sequence[bytes],
    admins: Sequence[bytes],
    owner: bytes,
) -> None:
    if mailbox == owner or _contains(members, mailbox) or _contains(admins, mailbox):
        raise PQError("Mailbox key does not own the room")


def _canonical_name(name: bytes) -> bytes:
    if len(name) > GROUP_NAME_MAX:
        raise PQError("Room name is longer than 64 bytes")
    try:
        name.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise PQError("Room name is not UTF-8") from exc
    return name


def _canonical_set(values: Sequence[bytes], label: str, maximum: int) -> list[bytes]:
    ordered = sorted(bytes(value) for value in values)
    for index in range(1, len(ordered)):
        if ordered[index] == ordered[index - 1]:
            raise PQError(f"Duplicate {label}")
    if len(ordered) > maximum:
        raise PQError(f"Too many {label}")
    for value in ordered:
        _require_length(label, value, 32)
    return ordered


def _strictly_increasing(values: Sequence[bytes]) -> bool:
    for index in range(1, len(values)):
        if values[index - 1] >= values[index]:
            return False
    return True


def _contains(values: Sequence[bytes], target: bytes) -> bool:
    return any(item == target for item in values)


def _same_list(left: Sequence[bytes], right: Sequence[bytes]) -> bool:
    return len(left) == len(right) and all(item == right[index] for index, item in enumerate(left))


def _copy_list(values: Sequence[bytes]) -> list[bytes]:
    return [bytes(item) for item in values]


def _bump(epoch: int) -> int:
    if epoch >= 0xFFFFFFFF:
        raise PQError("Group epoch is exhausted")
    return epoch + 1


def _is_zero(value: bytes) -> bool:
    return not any(value)


def _op_is(op: object, expected: int) -> bool:
    return type(op) is int and op == expected


def _take(source: bytes, offset: int, length: int) -> bytes:
    if offset + length > len(source):
        raise PQError("Administration record is truncated")
    return source[offset : offset + length]


def _read_u8(source: bytes, offset: int) -> int:
    if offset >= len(source):
        raise PQError("Administration record is truncated")
    return source[offset]


def _require_length(name: str, value: object, length: int) -> bytes:
    if isinstance(value, bytearray):
        value = bytes(value)
    if not isinstance(value, bytes):
        raise PQError(f"{name} must be {length} bytes, got not bytes")
    if len(value) != length:
        raise PQError(f"{name} must be {length} bytes, got {len(value)}")
    return value


def _require_uint32(name: str, value: object) -> int:
    if type(value) is not int or value < 0 or value > 0xFFFFFFFF:
        raise PQError(f"{name} must be from 0 through 4294967295")
    return value
