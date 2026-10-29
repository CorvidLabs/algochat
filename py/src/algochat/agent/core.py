"""
The shared agent core (AGENT-1, AGENT-1.d).

One object per bot. It owns the bot's own account and an :class:`AlgoChat`
client bound to it. The operator supplies the algod and indexer clients, so
the bot runs wherever the operator hosts it; nothing here calls a hosted
service. Later changes add one-to-one replies, rooms, reply policy, and the
MCP, CLI and webhook adapters on top of this object.
"""

from __future__ import annotations

import os
from collections.abc import Mapping

from ..blockchain import AlgodClient, IndexerClient
from ..client import AlgoChat, AlgoChatConfig
from ..storage import EncryptionKeyStorage, MessageCache
from .account import AgentAccount
from .config import AgentConfigError, load_agent_mnemonic


class AgentCore:
    """A self-hosted AlgoChat bot with its own account."""

    def __init__(self, account: AgentAccount, chat: AlgoChat) -> None:
        # ``AgentAccount`` already proves its address and public key come from
        # its seed; also require the chat client's signing key to be that key.
        if chat.address != account.address or chat._ed25519_public_key != account.ed25519_public_key:
            raise ValueError("The chat client must belong to the bot's own account")
        self._account = account
        self._chat = chat

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
        return cls(account, chat)

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

    def __repr__(self) -> str:
        return f"AgentCore(address={self.address!r})"
