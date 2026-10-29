"""
The shared agent core (AGENT-1, AGENT-1.d).

One object per bot. It owns the bot's own account and an :class:`AlgoChat`
client bound to it. The operator supplies the algod and indexer clients, so
the bot runs wherever the operator hosts it; nothing here calls a hosted
service. The core reads one-to-one messages sent to the bot and replies to
them from the bot's own account (AGENT-5). It joins the rooms and channels
an owner or admin adds it to, reads and replies there, and stops when it is
removed or leaves (AGENT-6, AGENT-7). In each room it follows the reply
mode and rate limit in the room's record, never answers another bot, and
declares its own slash commands (AGENT-8). Later changes add the MCP, CLI
and webhook adapters on top of this object.
"""

from __future__ import annotations

import inspect
import logging
import os
import time
from collections.abc import Awaitable, Callable, Mapping, Sequence

from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)

from ..blockchain import AlgodClient, IndexerClient, NoteTransaction
from ..client import AlgoChat, AlgoChatConfig
from ..group import GroupCounter, open_group_message, seal_group_message
from ..group_admin import (
    BOT_MODE_COMMANDS,
    BOT_MODE_MENTIONS,
    open_group_key_delivery,
    room_bot,
    sender_may_post,
)
from ..keys import derive_keys_from_seed
from ..models import MessageDirection
from ..pq import (
    MLKEMKeyPair,
    PQSession,
    accept_pq_session,
    derive_mlkem_keypair,
    encode_pq_key_announcement,
    is_pq_handshake,
    parse_pq_key_announcement,
)
from ..signature import sign_encryption_key
from ..storage import EncryptionKeyStorage, MessageCache
from ..transaction import send_payment
from .account import AgentAccount, address_from_public_key, public_key_from_address
from .config import AgentConfigError, load_agent_mnemonic
from .direct import DirectMessage, DirectReply, encode_reply
from .policy import (
    HELP_COMMAND,
    SKIP_FROM_BOT,
    SKIP_NO_MODE,
    SKIP_NOT_A_COMMAND,
    SKIP_NOT_MENTIONED,
    SKIP_RATE_LIMIT,
    BotCommand,
    check_bot_name,
    command_call,
    command_list_text,
    declared_commands,
    mentions,
    parse_room_text,
    within_rate,
)
from .rooms import (
    LEAVE_NOTICE,
    ROOM_ACTIVE,
    ROOM_LEFT,
    ROOM_REMOVED,
    ROOM_WAITING,
    KeyDelivery,
    Room,
    RoomMessage,
    RoomReply,
    RoomTrack,
    txid_bytes,
)

_LOG = logging.getLogger(__name__)

DirectHandler = Callable[[DirectMessage], "str | None | Awaitable[str | None]"]
"""Returns the reply text for a message, or ``None`` to stay silent."""

RoomHandler = Callable[[RoomMessage], "str | None | Awaitable[str | None]"]
"""Returns the reply text for a room message, or ``None`` to stay silent."""

_KEY_DELIVERY_SIZE = 227


def _chain_order(tx: NoteTransaction) -> tuple[int, int, bytes]:
    return (tx.confirmed_round, tx.intra_round_offset, txid_bytes(tx.txid))


class AgentCore:
    """A self-hosted AlgoChat bot with its own account."""

    def __init__(
        self,
        account: AgentAccount,
        chat: AlgoChat,
        *,
        name: str | None = None,
        commands: Sequence[BotCommand] = (),
        clock: Callable[[], float] = time.time,
    ) -> None:
        # ``AgentAccount`` already proves its address and public key come from
        # its seed; also require the chat client's signing key to be that key.
        if chat.address != account.address or chat._ed25519_public_key != account.ed25519_public_key:
            raise ValueError("The chat client must belong to the bot's own account")
        self._name = check_bot_name(name)
        self._operator_commands = {command.name for command in commands}
        self._commands = declared_commands(commands)
        self._command_list = command_list_text(self._commands, self._name)
        self._clock = clock
        self._account = account
        self._chat = chat
        self._algod: AlgodClient | None = None
        self._indexer: IndexerClient | None = None
        self._cursor: int | None = None
        self._seen: set[str] = set()
        self._answered: set[str] = set()
        self._rooms: dict[tuple[bytes, str], RoomTrack] = {}
        self._sessions: dict[bytes, tuple[PQSession, str]] = {}
        self._pending: list[KeyDelivery] = []
        self._inbox_cursor: int | None = None
        self._inbox_seen: set[str] = set()
        self._kem: MLKEMKeyPair | None = None

    @classmethod
    async def create(
        cls,
        account: AgentAccount,
        config: AlgoChatConfig,
        algod: AlgodClient,
        indexer: IndexerClient,
        key_storage: EncryptionKeyStorage | None = None,
        message_cache: MessageCache | None = None,
        *,
        name: str | None = None,
        commands: Sequence[BotCommand] = (),
        clock: Callable[[], float] = time.time,
    ) -> AgentCore:
        """Builds the core for ``account`` on the operator's algod and indexer clients.

        ``name`` is what members write after ``@`` to mention the bot, and
        ``commands`` are the slash commands it declares (``/help`` is always
        added). ``clock`` gives the time for the rate limit.
        """
        chat = await AlgoChat.from_seed(
            seed=account.seed,
            address=account.address,
            config=config,
            algod=algod,
            indexer=indexer,
            key_storage=key_storage,
            message_cache=message_cache,
        )
        core = cls(account, chat, name=name, commands=commands, clock=clock)
        core._algod = algod
        core._indexer = indexer
        return core

    @classmethod
    async def from_environment(
        cls,
        config: AlgoChatConfig,
        algod: AlgodClient,
        indexer: IndexerClient,
        environ: Mapping[str, str] | None = None,
        path: str | os.PathLike[str] | None = None,
        key_storage: EncryptionKeyStorage | None = None,
        message_cache: MessageCache | None = None,
        *,
        name: str | None = None,
        commands: Sequence[BotCommand] = (),
        clock: Callable[[], float] = time.time,
    ) -> AgentCore:
        """Loads the bot's mnemonic from its env var or local file, then builds the core."""
        try:
            account = AgentAccount.from_mnemonic(load_agent_mnemonic(environ=environ, path=path))
        except AgentConfigError:
            # Keep the environment mapping (and so the phrase) off the traceback's frame locals.
            environ = None
            raise
        environ = None
        return await cls.create(
            account,
            config,
            algod,
            indexer,
            key_storage,
            message_cache,
            name=name,
            commands=commands,
            clock=clock,
        )

    @property
    def name(self) -> str | None:
        """The name members mention the bot by, as ``@name``."""
        return self._name

    @property
    def commands(self) -> list[BotCommand]:
        """The slash commands the bot declares, ``/help`` included, sorted by name."""
        return list(self._commands)

    @property
    def command_list(self) -> str:
        """The command list the bot posts in rooms where its mode is commands."""
        return self._command_list

    @property
    def account(self) -> AgentAccount:
        """The bot's own account."""
        return self._account

    @property
    def address(self) -> str:
        """The bot's Algorand address."""
        return self._account.address

    @property
    def chat(self) -> AlgoChat:
        """The AlgoChat client bound to the bot's account."""
        return self._chat

    @property
    def encryption_public_key(self) -> bytes:
        """The bot's 32-byte X25519 public key."""
        return self._chat.encryption_public_key

    def _clients(self) -> tuple[AlgodClient, IndexerClient]:
        if self._algod is None or self._indexer is None:
            raise RuntimeError(
                "Build the core with AgentCore.create to send or read messages"
            )
        return self._algod, self._indexer

    async def _pay(self, receiver: str, note: bytes) -> str:
        algod, _ = self._clients()
        info = await send_payment(
            algod, self._account.seed, self.address, receiver, 0, note
        )
        return info.txid

    async def publish_key(self, force: bool = False) -> str | None:
        """Publishes the bot's encryption key, signed by its account.

        Returns the transaction id, or ``None`` when the same verified key is
        already on chain and ``force`` is false.
        """
        key = self.encryption_public_key
        if not force:
            found = await self._chat.discover_key(self.address)
            if found is not None and found.is_verified and found.public_key == key:
                return None
        signature = sign_encryption_key(
            key, Ed25519PrivateKey.from_private_bytes(self._account.seed)
        )
        return await self._pay(self.address, key + signature)

    async def send_direct(self, address: str, text: str) -> str:
        """Sends ``text`` to ``address`` as a one-to-one message. Returns the txid."""
        if address == self.address:
            raise ValueError("The bot does not message itself")
        key = await self._chat.discover_key(address)
        if key is None:
            raise LookupError(f"{address} has not published an encryption key")
        self._chat._ensure_key_usable(address, key)
        return await self._pay(address, self._chat.encrypt(text, key.public_key))

    async def reply(self, message: DirectMessage, text: str) -> str:
        """Replies to ``message`` with a section 9.2 reply. Returns the txid."""
        key = await self._chat.discover_key(message.sender)
        if key is None:
            raise LookupError(f"{message.sender} has not published an encryption key")
        self._chat._ensure_key_usable(message.sender, key)
        note = self._chat.encrypt(
            encode_reply(text, message.txid, message.text), key.public_key
        )
        txid = await self._pay(message.sender, note)
        self._answered.add(message.txid)
        return txid

    async def _open(self, tx: NoteTransaction) -> DirectMessage | None:
        """Decrypts one transaction. Records the bot's own replies as answered."""
        try:
            message = await self._chat.process_transaction(tx)
        except Exception as error:  # noqa: BLE001 - an unreadable note must not stop the bot
            _LOG.debug("skipped %s: %s", tx.txid, type(error).__name__)
            return None
        if message is None:
            return None
        reply_to = message.reply_context.message_id if message.reply_context else None
        if message.direction == MessageDirection.SENT:
            if reply_to is not None:
                self._answered.add(reply_to)
            return None
        if message.sender == self.address or not message.content:
            # Its own notes, key publishes and empty text need no answer.
            return None
        return DirectMessage(
            txid=message.id,
            sender=message.sender,
            text=message.content,
            confirmed_round=message.confirmed_round,
            reply_to=reply_to,
        )

    async def read_direct(self) -> list[DirectMessage]:
        """Returns one-to-one messages to the bot that it has not answered yet.

        The first call reads the account's history. A message the bot already
        replied to on chain (its own reply cites it) is not returned, so a
        restarted bot does not answer twice. Each message is returned once per
        core, oldest first.
        """
        _, indexer = self._clients()
        # No limit: the client returns every match after the cursor (HttpIndexerClient
        # follows the indexer's next tokens). Indexers list newest first, so sort here.
        found = await indexer.search_transactions(
            self.address, after_round=self._cursor, limit=None
        )
        received: list[DirectMessage] = []
        for tx in sorted(found, key=lambda item: item.confirmed_round):
            if tx.txid in self._seen:
                continue
            self._seen.add(tx.txid)
            message = await self._open(tx)
            if message is not None:
                received.append(message)
        if found:
            top = max(tx.confirmed_round for tx in found)
            self._cursor = top if self._cursor is None else max(self._cursor, top)
        return [m for m in received if m.txid not in self._answered]

    async def serve_direct(self, handler: DirectHandler) -> list[DirectReply]:
        """Reads new one-to-one messages and replies with ``handler``'s text.

        A handler that returns ``None`` or an empty string sends nothing. A
        handler or send that fails is reported in the result and not retried.
        A sender that any of the bot's rooms marks as a bot gets no answer.
        """
        results: list[DirectReply] = []
        messages = await self.read_direct()
        if messages:
            # Read the rooms first, so a fresh core also knows which senders are bots.
            await self.sync_rooms()
        bots = self._known_bots() if messages else set()
        for message in messages:
            if public_key_from_address(message.sender) in bots:
                # Never answer another bot (AGENT-8.c), here too.
                self._answered.add(message.txid)
                results.append(DirectReply(message, None, skipped=SKIP_FROM_BOT))
                continue
            try:
                answer = handler(message)
                if inspect.isawaitable(answer):
                    answer = await answer
                if not answer:
                    results.append(DirectReply(message, None))
                    continue
                results.append(
                    DirectReply(message, await self.reply(message, str(answer)))
                )
            except Exception as error:  # noqa: BLE001 - one bad message must not stop the others
                self._answered.add(message.txid)
                results.append(DirectReply(message, None, type(error).__name__))
        return results

    # Rooms (AGENT-6, AGENT-7)

    @property
    def _bot_key(self) -> bytes:
        return self._account.ed25519_public_key

    def _kem_keys(self) -> MLKEMKeyPair:
        if self._kem is None:
            self._kem = derive_mlkem_keypair(self._account.seed)
        return self._kem

    async def publish_pq_key(self, force: bool = False) -> str | None:
        """Publishes the bot's ML-KEM-768 encapsulation key, signed by its account.

        An owner or admin needs it to open the hybrid session that carries a
        room key. Returns the transaction id, or ``None`` when the same signed
        key is already on chain and ``force`` is false.
        """
        kem = self._kem_keys()
        if not force:
            _, indexer = self._clients()
            verifier = Ed25519PublicKey.from_public_bytes(self._bot_key)
            for tx in await indexer.search_transactions(self.address, limit=None):
                if tx.sender != self.address or tx.receiver != self.address:
                    continue
                found = parse_pq_key_announcement(bytes(tx.note), verifier)
                if (
                    found is not None
                    and found.is_verified
                    and found.encaps_key == kem.encaps_key
                ):
                    return None
        signer = Ed25519PrivateKey.from_private_bytes(self._account.seed)
        return await self._pay(
            self.address, encode_pq_key_announcement(kem.encaps_key, signer)
        )

    def _accept_handshake(self, tx: NoteTransaction) -> None:
        private, public = derive_keys_from_seed(self._account.seed)
        try:
            session = accept_pq_session(
                bytes(tx.note), private, public, self._kem_keys()
            )
        except Exception as error:  # noqa: BLE001 - a handshake for another key is skipped
            _LOG.debug("skipped handshake %s: %s", tx.txid, type(error).__name__)
            return
        self._sessions[bytes(session.handshake_id)] = (session, tx.sender)

    def _open_delivery(self, tx: NoteTransaction) -> None:
        note = bytes(tx.note)
        entry = self._sessions.get(note[34:66])
        # The session must come from a handshake the same account sent.
        if entry is None or entry[1] != tx.sender:
            _LOG.debug("skipped key delivery %s: no session from its sender", tx.txid)
            return
        try:
            delivery = open_group_key_delivery(note, entry[0])
        except Exception as error:  # noqa: BLE001 - a bad delivery is skipped
            _LOG.debug("skipped key delivery %s: %s", tx.txid, type(error).__name__)
            return
        self._pending.append(KeyDelivery(tx, delivery))

    async def _read_inbox(self) -> None:
        _, indexer = self._clients()
        found = await indexer.search_transactions(
            self.address, after_round=self._inbox_cursor, limit=None
        )
        for tx in sorted(found, key=_chain_order):
            if tx.txid in self._inbox_seen:
                continue
            self._inbox_seen.add(tx.txid)
            if tx.receiver != self.address or tx.sender == self.address:
                continue
            note = bytes(tx.note)
            if is_pq_handshake(note):
                self._accept_handshake(tx)
            elif len(note) == _KEY_DELIVERY_SIZE and note[:2] == b"\x02\x06":
                self._open_delivery(tx)
        if found:
            top = max(tx.confirmed_round for tx in found)
            self._inbox_cursor = (
                top if self._inbox_cursor is None else max(self._inbox_cursor, top)
            )

    async def _refresh(self, track: RoomTrack) -> None:
        _, indexer = self._clients()
        track.ingest(
            await indexer.search_transactions(
                track.mailbox, after_round=track.cursor, limit=None
            )
        )

    def _authorize(self, tracks: list[RoomTrack]) -> None:
        keep: list[KeyDelivery] = []
        wanted = {track.mailbox for track in tracks}
        for item in self._pending:
            mailbox = address_from_public_key(item.delivery.mailbox)
            track = self._rooms.get((bytes(item.delivery.group_id), mailbox))
            if track is None or mailbox not in wanted:
                keep.append(item)
                continue
            verdict = track.authorize(item)
            if verdict is None:
                keep.append(item)
            elif verdict:
                track.keys.setdefault(
                    item.delivery.epoch, bytes(item.delivery.group_key)
                )
            else:
                _LOG.debug(
                    "refused key delivery %s: not authorized by the room", item.tx.txid
                )
        self._pending = keep

    def _parent_for(self, group_id: bytes) -> RoomTrack | None:
        for track in self._rooms.values():
            if track.group_id == group_id and track.keys and track.parent is None:
                return track
        return None

    async def sync_rooms(self) -> list[Room]:
        """Reads the bot's inbox and its rooms' chains, and returns the rooms it was added to.

        The bot joins as soon as an owner or admin adds it and delivers the
        key: it never sends a request or an accept. A key is used only when the
        room's accepted records authorize that sender to deliver it to the bot.
        """
        await self._read_inbox()
        for item in self._pending:
            key = (
                bytes(item.delivery.group_id),
                address_from_public_key(item.delivery.mailbox),
            )
            if key not in self._rooms:
                self._rooms[key] = RoomTrack(
                    group_id=key[0], mailbox=key[1], bot_key=self._bot_key
                )
        tracks = list(self._rooms.values())
        for track in tracks:
            await self._refresh(track)
        rooms = [track for track in tracks if track.parent_group_id() is None]
        channels = [track for track in tracks if track.parent_group_id() is not None]
        for group in (rooms, channels):
            for track in group:
                parent_id = track.parent_group_id()
                if parent_id is not None:
                    track.parent = self._parent_for(parent_id)
                    if track.parent is None:
                        continue
                try:
                    track.reduce()
                except Exception as error:  # noqa: BLE001 - a room that does not reduce is skipped
                    _LOG.debug(
                        "room %s does not reduce: %s",
                        track.mailbox,
                        type(error).__name__,
                    )
            self._authorize(group)
        waiting = {
            (
                bytes(item.delivery.group_id),
                address_from_public_key(item.delivery.mailbox),
            )
            for item in self._pending
        }
        for key, track in list(self._rooms.items()):
            if not track.keys and key not in waiting:
                del self._rooms[key]
        return [
            track.to_room()
            for track in self._rooms.values()
            if track.keys and track.state is not None
        ]

    def _track(self, room: Room | RoomMessage | tuple[bytes, str]) -> RoomTrack:
        key = (
            room.key
            if isinstance(room, Room)
            else room.room_key
            if isinstance(room, RoomMessage)
            else room
        )
        track = self._rooms.get((bytes(key[0]), key[1]))
        if track is None:
            raise LookupError("The bot is not in that room")
        return track

    async def read_rooms(self) -> list[RoomMessage]:
        """Returns new messages members posted in the bot's rooms and channels, oldest first.

        Only messages after the bot joined, and after its own last post when
        a core starts, are returned, so a restarted bot does not answer old
        messages again. A note opens only under the key for its epoch, from a
        sender who was a member at that point in the chain.
        """
        await self.sync_rooms()
        received: list[RoomMessage] = []
        for track in self._rooms.values():
            status = track.status() if track.state is not None else ROOM_WAITING
            if status in (ROOM_REMOVED, ROOM_LEFT):
                track.seen.update(tx.txid for tx in track.messages)
                continue
            if track.state is None:
                continue
            if track.handled_mark is None:
                marks = [mark for mark in [track.joined_at()] if mark is not None]
                own = track.own_messages()
                if own:
                    marks.append(_chain_order(own[-1]))
                track.handled_mark = max(marks) if marks else (0, 0, b"")
            for tx in track.messages:
                if tx.txid in track.seen:
                    continue
                message = self._open_room_message(track, tx)
                if message is not None:
                    received.append(message)
        received.sort(
            key=lambda item: (
                item.confirmed_round,
                item.intra_round_offset,
                txid_bytes(item.txid),
            )
        )
        return received

    def _open_room_message(
        self, track: RoomTrack, tx: NoteTransaction
    ) -> RoomMessage | None:
        note = bytes(tx.note)
        epoch = int.from_bytes(note[34:38], "big")
        if epoch not in track.keys:
            # Wait: the key for that epoch may still be on its way.
            return None
        track.seen.add(tx.txid)
        if track.handled_mark is not None and _chain_order(tx) <= track.handled_mark:
            return None
        if tx.sender == self.address:
            return None
        record = track.record_before(tx)
        sender = public_key_from_address(tx.sender)
        if record is None or record.epoch != epoch or sender not in record.members:
            return None
        accepted = track.counters.setdefault(tx.sender, [])
        try:
            opened = open_group_message(note, track.keys[epoch], sender, accepted)
        except Exception as error:  # noqa: BLE001 - an unreadable or copied note is skipped
            _LOG.debug("skipped room note %s: %s", tx.txid, type(error).__name__)
            return None
        accepted.append(GroupCounter(opened.epoch, opened.counter))
        try:
            text = opened.plaintext.decode("utf-8")
        except UnicodeDecodeError:
            return None
        if not text:
            return None
        parsed = parse_room_text(text)
        own = track.own_txids()
        return RoomMessage(
            txid=tx.txid,
            group_id=track.group_id,
            mailbox=track.mailbox,
            sender=tx.sender,
            text=parsed.text,
            epoch=opened.epoch,
            counter=opened.counter,
            confirmed_round=tx.confirmed_round,
            intra_round_offset=tx.intra_round_offset,
            is_channel=track.parent is not None,
            reply_to=parsed.reply_to,
            mentioned=mentions(parsed.text, self._name, self.address)
            or (parsed.reply_to is not None and parsed.reply_to in own),
            command=command_call(
                parsed.text,
                [command.name for command in self._commands],
                self._name,
                self.address,
            ),
            from_bot=sender in self._known_bots(),
        )

    def _known_bots(self) -> set[bytes]:
        """Every account a room the bot is in marks as a bot, the bot itself excluded."""
        found: set[bytes] = set()
        for track in self._rooms.values():
            if track.state is not None:
                found.update(bytes(item.account) for item in track.state.bots)
        found.discard(self._bot_key)
        return found

    def _rate_ok(self, track: RoomTrack) -> bool:
        state = track.state
        settings = None if state is None else room_bot(state, self._bot_key)
        if settings is None:
            return False
        return within_rate(
            track.post_times(), self._clock(), settings.replies, settings.seconds
        )

    def _skip_reason(self, track: RoomTrack, message: RoomMessage) -> str | None:
        """Why the room's current record keeps the bot silent on ``message``, or None."""
        if message.from_bot:
            return SKIP_FROM_BOT
        state = track.state
        settings = None if state is None else room_bot(state, self._bot_key)
        if settings is None:
            return SKIP_NO_MODE
        if settings.mode == BOT_MODE_MENTIONS and not message.mentioned:
            return SKIP_NOT_MENTIONED
        if settings.mode == BOT_MODE_COMMANDS and message.command is None:
            return SKIP_NOT_A_COMMAND
        if not self._rate_ok(track):
            return SKIP_RATE_LIMIT
        return None

    async def declare_commands(self) -> list[str]:
        """Posts the bot's command list in each room where its mode is commands.

        A room already showing the current list (the bot's latest list there
        since it was added) gets nothing. A post that would go over the rate
        limit waits for a later call. Returns the transaction ids.
        """
        await self.sync_rooms()
        return await self._declare()

    async def _declare(self) -> list[str]:
        txids: list[str] = []
        for track in self._rooms.values():
            if track.state is None or track.status() != ROOM_ACTIVE:
                continue
            settings = room_bot(track.state, self._bot_key)
            if settings is None or settings.mode != BOT_MODE_COMMANDS:
                continue
            if track.latest_command_list() == self._command_list:
                continue
            if not self._rate_ok(track):
                continue
            txids.append(await self._post(track, self._command_list))
        return txids

    async def _post(self, track: RoomTrack, text: str) -> str:
        status = track.status()
        if status != ROOM_ACTIVE:
            raise PermissionError(f"The bot is not active in that room ({status})")
        state = track.state
        if state is None or not sender_may_post(state, self._bot_key, state.epoch):
            raise PermissionError("The bot may not post in that room")
        epoch = state.epoch
        counter = track.highest_counter(epoch) + 1
        note = seal_group_message(
            text.encode("utf-8"),
            track.keys[epoch],
            state.group_id,
            epoch,
            counter,
            self._bot_key,
        )
        txid = await self._pay(track.mailbox, note)
        track.next_counter[epoch] = counter + 1
        track.sent_at[txid] = self._clock()
        return txid

    async def send_room(
        self, room: Room | RoomMessage | tuple[bytes, str], text: str
    ) -> str:
        """Posts ``text`` in a room or channel the bot is active in. Returns the txid."""
        if not text:
            raise ValueError("A room message needs text")
        if text == LEAVE_NOTICE:
            raise ValueError("Use leave_room to leave a room")
        return await self._post(self._track(room), text)

    async def reply_room(self, message: RoomMessage, text: str) -> str:
        """Answers ``message`` in the room it was posted in. Returns the txid."""
        return await self.send_room(message, text)

    async def serve_rooms(self, handler: RoomHandler) -> list[RoomReply]:
        """Reads new room messages and answers them the way each room's record says.

        The reply mode and rate limit come from the room's current record, so
        a change by the owner or an admin applies from the next message. In
        mentions mode the bot answers ``@name`` (or ``@address``) and replies
        to its own messages; in every-message mode, everything; in commands
        mode, its declared ``/commands``, after posting its command list
        there. It never answers an account a room marks as a bot. A message
        over the rate limit is skipped, not queued. ``/help`` is answered with
        the command list unless the operator declared their own ``help``.

        A handler that returns ``None`` or an empty string sends nothing. A
        handler or send that fails is reported in the result and not retried.
        """
        messages = await self.read_rooms()
        await self._declare()
        results: list[RoomReply] = []
        for message in messages:
            track = self._track(message)
            skipped = self._skip_reason(track, message)
            if skipped is not None:
                results.append(RoomReply(message, None, skipped=skipped))
                continue
            try:
                if (
                    message.command is not None
                    and message.command.name == HELP_COMMAND
                    and HELP_COMMAND not in self._operator_commands
                ):
                    answer = self._command_list
                else:
                    answer = handler(message)
                    if inspect.isawaitable(answer):
                        answer = await answer
                if not answer:
                    results.append(RoomReply(message, None))
                    continue
                results.append(
                    RoomReply(message, await self.reply_room(message, str(answer)))
                )
            except Exception as error:  # noqa: BLE001 - one bad message must not stop the others
                results.append(RoomReply(message, None, type(error).__name__))
        return results

    async def leave_room(
        self, room: Room | RoomMessage | tuple[bytes, str]
    ) -> list[str]:
        """Leaves a room and its channels. Returns the notice transaction ids.

        The protocol has no op for a member to remove themselves, so the bot
        posts :data:`LEAVE_NOTICE` and stops reading and posting there. Only the
        owner or an admin can remove it and rotate the key.
        """
        track = self._track(room)
        txids: list[str] = []
        # Channels first: once the room notice lands, its channels read as left.
        targets = [item for item in self._rooms.values() if item.parent is track] + [track]
        active = [target.status() == ROOM_ACTIVE for target in targets]
        for target, post in zip(targets, active):
            if post:
                txids.append(await self._post(target, LEAVE_NOTICE))
            target.left_here = True
        return txids

    def __repr__(self) -> str:
        return f"AgentCore(address={self.address!r})"
