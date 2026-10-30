"""An owner's side of a room, for agent room tests on the in-memory chain and on LocalNet.

It drafts administration records, opens a hybrid session to a member and
delivers the room key, the way Raven and the other libraries do. Seeds are
test values, never wallets.
"""

from __future__ import annotations

import base64
import os
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from algochat.agent.account import address_from_public_key
from algochat.blockchain import NoteTransaction
from algochat.group import seal_group_message
from algochat.group_admin import (
    JOINING_INVITE,
    OP_CREATE,
    AdminEvent,
    BotSettings,
    RoomState,
    draft_admin,
    reduce_admin,
    seal_group_key_delivery,
)
from algochat.keys import derive_keys_from_seed
from algochat.pq import PQSession, derive_mlkem_keypair, initiate_pq_session

Pay = Callable[[bytes, str, bytes], Awaitable[NoteTransaction]]
"""Pays a 0-microAlgo note from a seed to an address and returns the confirmed transaction."""


def public_key(seed: bytes) -> bytes:
    return Ed25519PrivateKey.from_private_bytes(seed).public_key().public_bytes_raw()


def address(seed: bytes) -> str:
    return address_from_public_key(public_key(seed))


def raw_txid(txid: str) -> bytes:
    return base64.b32decode(txid + "=" * (-len(txid) % 8))


@dataclass
class OwnerRoom:
    """One room or channel driven by its owner (or an admin)."""

    pay: Pay
    group_id: bytes
    mailbox_seed: bytes
    parent: OwnerRoom | None = None
    events: list[AdminEvent] = field(default_factory=list)
    keys: dict[int, bytes] = field(default_factory=dict)
    sessions: dict[tuple[bytes, bytes], PQSession] = field(default_factory=dict)
    counters: dict[tuple[bytes, int], int] = field(default_factory=dict)
    notes: list[NoteTransaction] = field(default_factory=list)

    @property
    def mailbox(self) -> bytes:
        return public_key(self.mailbox_seed)

    @property
    def mailbox_address(self) -> str:
        return address_from_public_key(self.mailbox)

    def state(self) -> RoomState | None:
        parent = None if self.parent is None else self.parent.events
        return reduce_admin(self.events, parent).state

    def reduced(self):
        parent = None if self.parent is None else self.parent.events
        return reduce_admin(self.events, parent)

    async def admin(
        self,
        sender: bytes,
        op: int,
        subject: bytes | None = None,
        bot: BotSettings | None = None,
        name: str | None = None,
    ) -> NoteTransaction:
        state = self.state()
        note = draft_admin(
            state,
            op,
            public_key(sender),
            subject=subject,
            name=None if name is None else name.encode(),
            policy=JOINING_INVITE if op == OP_CREATE else None,
            group_id=self.group_id,
            mailbox=self.mailbox,
            parent_room=None if self.parent is None else self.parent.state(),
            bot=bot,
        )
        tx = await self.pay(sender, self.mailbox_address, note)
        self.events.append(
            AdminEvent(note, public_key(sender), raw_txid(tx.txid), tx.confirmed_round, tx.intra_round_offset)
        )
        reduced = self.reduced()
        if any(item.tx_id == raw_txid(tx.txid) for item in reduced.rejected):
            reason = next(item.reason for item in reduced.rejected if item.tx_id == raw_txid(tx.txid))
            raise AssertionError(f"admin op {op} rejected: {reason}")
        state = reduced.state
        if state is not None and state.epoch not in self.keys:
            self.keys[state.epoch] = os.urandom(32)
        return tx

    async def session(self, sender: bytes, recipient: bytes) -> PQSession:
        """Opens (once) a hybrid session from ``sender`` to ``recipient`` on chain."""
        found = self.sessions.get((sender, recipient))
        if found is not None:
            return found
        _, sender_pub = derive_keys_from_seed(sender)
        _, recipient_pub = derive_keys_from_seed(recipient)
        note, session = initiate_pq_session(
            sender_pub,
            recipient_pub,
            derive_mlkem_keypair(recipient).encaps_key,
            derive_mlkem_keypair(sender).encaps_key,
        )
        await self.pay(sender, address(recipient), note)
        self.sessions[(sender, recipient)] = session
        return session

    async def deliver(self, sender: bytes, recipient: bytes, admin_tx: NoteTransaction, epoch: int | None = None):
        state = self.state()
        assert state is not None
        epoch = state.epoch if epoch is None else epoch
        session = await self.session(sender, recipient)
        note = seal_group_key_delivery(
            session, epoch, self.group_id, self.mailbox, self.keys[epoch], raw_txid(admin_tx.txid)
        )
        return await self.pay(sender, address(recipient), note)

    def seal(self, sender: bytes, text: str, epoch: int | None = None, counter: int | None = None) -> bytes:
        state = self.state()
        assert state is not None
        epoch = state.epoch if epoch is None else epoch
        key = (sender, epoch)
        if counter is None:
            counter = self.counters.get(key, 0)
        self.counters[key] = counter + 1
        return seal_group_message(text.encode(), self.keys[epoch], self.group_id, epoch, counter, public_key(sender))

    async def post(self, sender: bytes, text: str, **kwargs) -> NoteTransaction:
        tx = await self.pay(sender, self.mailbox_address, self.seal(sender, text, **kwargs))
        self.notes.append(tx)
        return tx
