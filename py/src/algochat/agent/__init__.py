"""
AlgoChat agent module.

The shared core that lets any agent run a self-hosted AlgoChat bot. The bot
has its own Algorand account, loaded from a 25-word mnemonic held in an
environment variable or a local file on the bot host (AGENT-1, AGENT-1.b,
AGENT-1.d, AGENT-2, AGENT-4). The MCP server, CLI and webhook bridge build on
:class:`AgentCore` in later changes.
"""

from .account import AgentAccount, address_from_public_key, mnemonic_to_seed
from .config import (
    MNEMONIC_ENV,
    MNEMONIC_FILE_ENV,
    AgentConfigError,
    load_agent_mnemonic,
    read_mnemonic_file,
)
from .core import AgentCore

__all__ = [
    "MNEMONIC_ENV",
    "MNEMONIC_FILE_ENV",
    "AgentAccount",
    "AgentConfigError",
    "AgentCore",
    "address_from_public_key",
    "load_agent_mnemonic",
    "mnemonic_to_seed",
    "read_mnemonic_file",
]
