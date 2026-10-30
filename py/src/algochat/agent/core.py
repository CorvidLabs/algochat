"""
The shared agent core (AGENT-1, AGENT-1.d).

One object per bot. It owns the bot's own account and an :class:`AlgoChat`
client bound to it. The operator supplies the algod and indexer clients, so
the bot runs wherever the operator hosts it; nothing here calls a hosted
service. The core reads one-to-one messages sent to the bot and replies to
them from the bot's own account (AGENT-5). Later changes add rooms, reply
policy, and the MCP, CLI and webhook adapters on top of this object.
"""

from __future__ import annotations

import inspect
import logging
import os
from collections.abc import Awaitable, Callable, Mapping

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from ..blockchain import AlgodClient, IndexerClient, NoteTransaction
from ..client import AlgoChat, AlgoChatConfig
from ..models import MessageDirection
from ..signature import sign_encryption_key
from ..storage import EncryptionKeyStorage, MessageCache
from ..transaction import send_payment
from .account import AgentAccount
from .config import AgentConfigError, load_agent_mnemonic
from .direct import DirectMessage, DirectReply, encode_reply

_LOG = logging.getLogger(__name__)

DirectHandler = Callable[[DirectMessage], "str | None | Awaitable[str | None]"]
"""Returns the reply text for a message, or ``None`` to stay silent."""


class AgentCore:
    """A self-hosted AlgoChat bot with its own account."""

    def __init__(self, account: AgentAccount, chat: AlgoChat) -> None:
        # ``AgentAccount`` already proves its address and public key come from
        # its seed; also require the chat client's signing key to be that key.
        if chat.address != account.address or chat._ed25519_public_key != account.ed25519_public_key:
            raise ValueError("The chat client must belong to the bot's own account")
        self._account = account
        self._chat = chat
        self._algod: AlgodClient | None = None
        self._indexer: IndexerClient | None = None
        self._cursor: int | None = None
        self._seen: set[str] = set()
        self._answered: set[str] = set()

    @classmethod
    async def create(
        cls,
        account: AgentAccount,
        config: AlgoChatConfig,
        algod: AlgodClient,
        indexer: IndexerClient,
        key_storage: EncryptionKeyStorage | None = None,
        message_cache: MessageCache | None = None,
    ) -> AgentCore:
        """Builds the core for ``account`` on the operator's algod and indexer clients."""
        chat = await AlgoChat.from_seed(
            seed=account.seed,
            address=account.address,
            config=config,
            algod=algod,
            indexer=indexer,
            key_storage=key_storage,
            message_cache=message_cache,
        )
        core = cls(account, chat)
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
    ) -> AgentCore:
        """Loads the bot's mnemonic from its env var or local file, then builds the core."""
        try:
            account = AgentAccount.from_mnemonic(load_agent_mnemonic(environ=environ, path=path))
        except AgentConfigError:
            # Keep the environment mapping (and so the phrase) off the traceback's frame locals.
            environ = None
            raise
        environ = None
        return await cls.create(account, config, algod, indexer, key_storage, message_cache)

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
            raise RuntimeError("Build the core with AgentCore.create to send or read messages")
        return self._algod, self._indexer

    async def _pay(self, receiver: str, note: bytes) -> str:
        algod, _ = self._clients()
        info = await send_payment(algod, self._account.seed, self.address, receiver, 0, note)
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
        signature = sign_encryption_key(key, Ed25519PrivateKey.from_private_bytes(self._account.seed))
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
        note = self._chat.encrypt(encode_reply(text, message.txid, message.text), key.public_key)
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
        found = await indexer.search_transactions(self.address, after_round=self._cursor, limit=None)
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
        """
        results: list[DirectReply] = []
        for message in await self.read_direct():
            try:
                answer = handler(message)
                if inspect.isawaitable(answer):
                    answer = await answer
                if not answer:
                    results.append(DirectReply(message, None))
                    continue
                results.append(DirectReply(message, await self.reply(message, str(answer))))
            except Exception as error:  # noqa: BLE001 - one bad message must not stop the others
                self._answered.add(message.txid)
                results.append(DirectReply(message, None, type(error).__name__))
        return results

    def __repr__(self) -> str:
        return f"AgentCore(address={self.address!r})"
