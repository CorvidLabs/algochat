"""
How the CLI and the MCP server build the bot from the operator's settings.

Design choices, not confirmed intent: the algod and indexer addresses have
no default, so the bot never reaches a public network unless the operator
names one; the bot only uses encryption keys signed by their account; the
bot's name and commands come from the command line.
"""

from __future__ import annotations

import os
import ssl
from collections.abc import Callable, Mapping, Sequence

from ..blockchain import AlgorandConfig
from ..client import AlgoChatConfig
from ..http_clients import HttpAlgodClient, HttpIndexerClient
from .config import AgentConfigError
from .core import AgentCore
from .policy import BotCommand
from .webhook import WebhookBridge, load_webhook_secret

ALGOD_URL_ENV = "ALGOCHAT_ALGOD_URL"
ALGOD_TOKEN_ENV = "ALGOCHAT_ALGOD_TOKEN"
INDEXER_URL_ENV = "ALGOCHAT_INDEXER_URL"
INDEXER_TOKEN_ENV = "ALGOCHAT_INDEXER_TOKEN"
WEBHOOK_CA_FILE_ENV = "ALGOCHAT_WEBHOOK_CA_FILE"
"""Optional CA bundle for a webhook whose certificate a private CA signed."""


def parse_command(spec: str) -> BotCommand:
    """Reads ``name=description`` (or just ``name``) into a :class:`BotCommand`."""
    name, _, description = spec.partition("=")
    return BotCommand(name.strip(), description.strip())


async def build_core(
    environ: Mapping[str, str] | None = None,
    *,
    name: str | None = None,
    commands: Sequence[BotCommand] = (),
) -> AgentCore:
    """Builds the bot from its mnemonic and the network settings in the environment."""
    env = os.environ if environ is None else environ
    algod_url = env.get(ALGOD_URL_ENV, "").strip()
    indexer_url = env.get(INDEXER_URL_ENV, "").strip()
    if not algod_url or not indexer_url:
        raise AgentConfigError(f"Set {ALGOD_URL_ENV} and {INDEXER_URL_ENV} to the bot's algod and indexer")
    algod_token = env.get(ALGOD_TOKEN_ENV, "")
    indexer_token = env.get(INDEXER_TOKEN_ENV, "")
    config = AlgoChatConfig(
        network=AlgorandConfig(algod_url, algod_token, indexer_url, indexer_token),
        allow_unverified_keys=False,
    )
    return await AgentCore.from_environment(
        config,
        HttpAlgodClient(algod_url, algod_token),
        HttpIndexerClient(indexer_url, indexer_token),
        environ=env,
        name=name,
        commands=commands,
    )


def webhook_factory(environ: Mapping[str, str] | None = None) -> Callable[[str], WebhookBridge]:
    """Returns a function that builds a :class:`WebhookBridge` for a URL, with the secret and CA from the environment."""
    env = os.environ if environ is None else environ

    def make(url: str) -> WebhookBridge:
        cafile = env.get(WEBHOOK_CA_FILE_ENV, "").strip() or None
        context = ssl.create_default_context(cafile=cafile)
        return WebhookBridge(url, load_webhook_secret(env), ssl_context=context)

    return make
