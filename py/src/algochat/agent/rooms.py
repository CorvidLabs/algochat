"""
Rooms for the agent core (AGENT-6, AGENT-7, AGENT-7.c, AGENT-7.d, AGENT-7.g).

A room is a mailbox address with a public ``0x03`` administration chain and
``0x07`` messages (PROTOCOL.md section 5.8). The bot never asks to join. An
owner or admin adds it (op 13 or op 7), opens a hybrid session to it and
delivers the room key with ``0x06`` action 5. The bot accepts that key only
when the delivery is authorized by the room's accepted records, so it joins
as soon as it is added. A removal is an ordinary removal: the epoch moves
on, the bot gets no new key, and it stops reading and posting there and in
that room's channels.

The protocol has no op for a member to remove themselves, so the bot
"leaves" by posting :data:`LEAVE_NOTICE` in the room and stopping. The chain
keeps that notice, so a restarted bot stays out. Only the owner or an admin
can remove it and rotate the key.

This module keeps the per-room state. :class:`~algochat.agent.core.AgentCore`
does the reading and paying.
"""

from __future__ import annotations

import base64
from bisect import bisect_right
from dataclasses import dataclass, field

from ..blockchain import NoteTransaction
from ..group import GroupCounter, open_group_message
from ..group_admin import (
    GROUP_ADMIN_PROTOCOL,
    OP_ACCEPT_JOIN,
    OP_ADD_BOT,
    OP_ADD_MEMBER,
    OP_CREATE,
    AcceptedAdmin,
    AdminEvent,
    GroupKeyDelivery,
    ReduceAdminResult,
    RoomBot,
    RoomState,
    _decode_admin,  # same package: reads the parent group id of a create
    delivery_authorized,
    reduce_admin,
    room_bot,
)
from ..pq import PQ_VERSION
from .account import address_from_public_key, public_key_from_address

GROUP_MESSAGE_PROTOCOL = 0x07
_ZERO_ID = bytes(32)

LEAVE_NOTICE = (
    "I left this room. An owner or admin can remove me to rotate the room key."
)
"""The room message the bot posts when it leaves. The bot never sends it as a reply."""

ROOM_ACTIVE = "active"
"""The bot is a member and holds the key for the current epoch."""
ROOM_WAITING = "waiting"
"""The bot is a member but has no key for the current epoch yet."""
ROOM_REMOVED = "removed"
"""The bot was removed from the room, or from the parent of this channel."""
ROOM_LEFT = "left"
"""The bot left the room, or the parent of this channel."""


def txid_bytes(txid: str) -> bytes:
    """The 32 raw bytes of a base32 transaction id."""
    raw = base64.b32decode(txid + "=" * (-len(txid) % 8))
    if len(raw) != 32:
        raise ValueError("A transaction id is 32 bytes")
    return raw


def _position(tx: NoteTransaction) -> tuple[int, int, bytes]:
    # Chain order: confirmed round, then intra-round offset, then transaction id bytes.
    return (tx.confirmed_round, tx.intra_round_offset, txid_bytes(tx.txid))


def is_admin_note(note: bytes) -> bool:
    """Whether ``note`` is a ``0x03`` administration record."""
    return len(note) >= 2 and note[0] == PQ_VERSION and note[1] == GROUP_ADMIN_PROTOCOL


def is_room_message(note: bytes) -> bool:
    """Whether ``note`` is a ``0x07`` room message."""
    return (
        len(note) >= 54 and note[0] == PQ_VERSION and note[1] == GROUP_MESSAGE_PROTOCOL
    )


@dataclass(frozen=True)
class Room:
    """A room or channel the bot was added to, as the chain shows it now."""

    group_id: bytes
    mailbox: str
    name: str
    epoch: int
    status: str
    """One of ``active``, ``waiting``, ``removed`` or ``left``."""
    parent_group_id: bytes | None
    """The parent room's group id when this room is a channel."""
    bot: RoomBot | None
    """The bot's mark, reply mode and rate limit here, or None when it was added as a plain member."""
    state: RoomState = field(repr=False, compare=False)

    @property
    def is_channel(self) -> bool:
        return self.parent_group_id is not None

    @property
    def key(self) -> tuple[bytes, str]:
        return (self.group_id, self.mailbox)


@dataclass(frozen=True)
class RoomMessage:
    """A message a member posted in a room the bot is in."""

    txid: str
    group_id: bytes
    mailbox: str
    sender: str
    text: str
    epoch: int
    counter: int
    confirmed_round: int
    intra_round_offset: int = 0
    is_channel: bool = False

    @property
    def room_key(self) -> tuple[bytes, str]:
        return (self.group_id, self.mailbox)


@dataclass(frozen=True)
class RoomReply:
    """What the bot did with one room message."""

    message: RoomMessage
    txid: str | None
    """The bot's reply transaction id, or None when it stayed silent or failed."""
    error: str | None = None
    """The exception type name when the handler or the send failed."""


@dataclass
class KeyDelivery:
    """An opened room key delivery that still needs the room's authorization."""

    tx: NoteTransaction
    delivery: GroupKeyDelivery


@dataclass
class RoomTrack:
    """Everything the bot knows about one room: its chain, its keys and what it read."""

    group_id: bytes
    mailbox: str
    bot_key: bytes
    admin: list[NoteTransaction] = field(default_factory=list)
    messages: list[NoteTransaction] = field(default_factory=list)
    keys: dict[int, bytes] = field(default_factory=dict)
    cursor: int | None = None
    txids: set[str] = field(default_factory=set)
    reduced: ReduceAdminResult | None = None
    parent: RoomTrack | None = None
    # Per sender: (epoch, counter) pairs already accepted, so a copied note is refused.
    counters: dict[str, list[GroupCounter]] = field(default_factory=dict)
    seen: set[str] = field(default_factory=set)
    handled_mark: tuple[int, int, bytes] | None = None
    next_counter: dict[int, int] = field(default_factory=dict)
    left_here: bool = False

    def ingest(self, found: list[NoteTransaction]) -> None:
        for tx in found:
            if tx.txid in self.txids or tx.receiver != self.mailbox:
                continue
            self.txids.add(tx.txid)
            if is_admin_note(tx.note):
                self.admin.append(tx)
            elif is_room_message(tx.note):
                self.messages.append(tx)
        if found:
            top = max(tx.confirmed_round for tx in found)
            self.cursor = top if self.cursor is None else max(self.cursor, top)
        self.admin.sort(key=_position)
        self.messages.sort(key=_position)

    def events(self) -> list[AdminEvent]:
        return [
            AdminEvent(
                note=bytes(tx.note),
                sender=public_key_from_address(tx.sender),
                tx_id=txid_bytes(tx.txid),
                round=tx.confirmed_round,
                offset=tx.intra_round_offset,
            )
            for tx in self.admin
        ]

    def reduce(self) -> ReduceAdminResult:
        parent_events = None if self.parent is None else self.parent.events()
        self.reduced = reduce_admin(self.events(), parent_events)
        return self.reduced

    @property
    def state(self) -> RoomState | None:
        return None if self.reduced is None else self.reduced.state

    def parent_group_id(self) -> bytes | None:
        """The parent group id named by this room's first create record, or None."""
        for tx in self.admin:
            try:
                decoded = _decode_admin(bytes(tx.note))
            except Exception:  # noqa: BLE001, S112 - a malformed record is the reducer's to reject
                continue
            if decoded.op == OP_CREATE:
                parent = bytes(decoded.parent_group_id)
                return None if parent == _ZERO_ID else parent
        return None

    def authorize(self, item: KeyDelivery) -> bool | None:
        """True when the delivery is authorized, False when it never will be, None to wait."""
        state = self.state
        if state is None or self.reduced is None:
            return None
        if (
            state.group_id != item.delivery.group_id
            or state.mailbox != item.delivery.mailbox
        ):
            return False
        admin_tx = item.delivery.admin_tx_id
        known = {txid_bytes(tx.txid) for tx in self.admin}
        if admin_tx not in known:
            return None
        return delivery_authorized(
            self.reduced.accepted,
            admin_tx,
            public_key_from_address(item.tx.sender),
            self.bot_key,
            item.delivery.epoch,
        )

    def _accepted_positions(
        self,
    ) -> tuple[list[tuple[int, int, bytes]], list[AcceptedAdmin]]:
        if self.reduced is None:
            return [], []
        where = {txid_bytes(tx.txid): _position(tx) for tx in self.admin}
        records = [item for item in self.reduced.accepted if item.tx_id in where]
        return [where[item.tx_id] for item in records], records

    def record_before(self, tx: NoteTransaction) -> AcceptedAdmin | None:
        """The last accepted record before ``tx`` in chain order."""
        positions, records = self._accepted_positions()
        index = bisect_right(positions, _position(tx))
        return records[index - 1] if index else None

    def joined_at(self) -> tuple[int, int, bytes] | None:
        """Chain position of the latest record that added the bot."""
        positions, records = self._accepted_positions()
        found = None
        for where, record in zip(positions, records, strict=True):
            if record.subject == self.bot_key and record.op in (
                OP_ADD_BOT,
                OP_ADD_MEMBER,
                OP_ACCEPT_JOIN,
            ):
                found = where
        return found

    def own_messages(self) -> list[NoteTransaction]:
        own = address_from_public_key(self.bot_key)
        return [tx for tx in self.messages if tx.sender == own]

    def open_text(self, tx: NoteTransaction) -> tuple[str, int, int] | None:
        """Opens a message with the key for its epoch, without replay checks."""
        note = bytes(tx.note)
        epoch = int.from_bytes(note[34:38], "big")
        key = self.keys.get(epoch)
        if key is None:
            return None
        try:
            opened = open_group_message(
                note, key, public_key_from_address(tx.sender), []
            )
            return opened.plaintext.decode("utf-8"), opened.epoch, opened.counter
        except Exception:  # noqa: BLE001 - an unreadable note is skipped
            return None

    def left(self) -> bool:
        """Whether the bot posted :data:`LEAVE_NOTICE` here after it was last added."""
        joined = self.joined_at()
        for tx in self.own_messages():
            if joined is not None and _position(tx) <= joined:
                continue
            opened = self.open_text(tx)
            if opened is not None and opened[0] == LEAVE_NOTICE:
                return True
        return False

    def own_status(self) -> str:
        state = self.state
        if state is None or self.bot_key not in state.members:
            return ROOM_REMOVED
        if self.left_here or self.left():
            return ROOM_LEFT
        if state.epoch not in self.keys:
            return ROOM_WAITING
        return ROOM_ACTIVE

    def status(self) -> str:
        own = self.own_status()
        if self.parent is not None and own in (ROOM_ACTIVE, ROOM_WAITING):
            parent = self.parent.status()
            if parent in (ROOM_REMOVED, ROOM_LEFT):
                # Leaving or losing the parent room takes the bot out of its channels.
                return parent
        return own

    def highest_counter(self, epoch: int) -> int:
        """Highest counter seen in ``epoch`` from anyone, or -1."""
        highest = self.next_counter.get(epoch, 0) - 1
        for tx in self.messages:
            note = bytes(tx.note)
            if int.from_bytes(note[34:38], "big") == epoch:
                highest = max(highest, int.from_bytes(note[38:42], "big"))
        return highest

    def to_room(self) -> Room:
        state = self.state
        if state is None:
            raise LookupError("The room has no accepted records")
        parent = state.parent_group_id
        return Room(
            group_id=bytes(state.group_id),
            mailbox=self.mailbox,
            name=bytes(state.name).decode("utf-8", errors="replace"),
            epoch=state.epoch,
            status=self.status(),
            parent_group_id=None if parent == _ZERO_ID else bytes(parent),
            bot=room_bot(state, self.bot_key),
            state=state,
        )


__all__ = [
    "GROUP_MESSAGE_PROTOCOL",
    "LEAVE_NOTICE",
    "ROOM_ACTIVE",
    "ROOM_LEFT",
    "ROOM_REMOVED",
    "ROOM_WAITING",
    "KeyDelivery",
    "Room",
    "RoomMessage",
    "RoomReply",
    "RoomTrack",
    "is_admin_note",
    "is_room_message",
    "txid_bytes",
]
