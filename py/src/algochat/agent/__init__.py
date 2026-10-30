"""
AlgoChat agent module.

The shared core that lets any agent run a self-hosted AlgoChat bot. The bot
has its own Algorand account, loaded from a 25-word mnemonic held in an
environment variable or a local file on the bot host (AGENT-1, AGENT-1.b,
AGENT-1.d, AGENT-2, AGENT-4). It reads one-to-one messages and replies to
them (AGENT-5). It joins the rooms and channels an owner or admin adds it
to, reads and replies there, and stops when removed or when it leaves
(AGENT-6, AGENT-7). In each room it follows the reply mode and rate limit
the room's record holds, never answers another bot, and declares its own
slash commands (AGENT-8). The MCP server, CLI and webhook bridge build on
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
from .core import AgentCore, DirectHandler, RoomHandler
from .direct import DirectMessage, DirectReply, encode_reply, reply_preview
from .policy import (
    SKIP_FROM_BOT,
    SKIP_NO_MODE,
    SKIP_NOT_A_COMMAND,
    SKIP_NOT_MENTIONED,
    SKIP_RATE_LIMIT,
    SKIP_TO_BOT,
    BotCommand,
    CommandCall,
    PolicySkip,
)
from .rooms import (
    LEAVE_NOTICE,
    ROOM_ACTIVE,
    ROOM_LEFT,
    ROOM_REMOVED,
    ROOM_WAITING,
    Room,
    RoomMessage,
    RoomReply,
)

__all__ = [
    "LEAVE_NOTICE",
    "MNEMONIC_ENV",
    "MNEMONIC_FILE_ENV",
    "ROOM_ACTIVE",
    "ROOM_LEFT",
    "ROOM_REMOVED",
    "ROOM_WAITING",
    "SKIP_FROM_BOT",
    "SKIP_NOT_A_COMMAND",
    "SKIP_NOT_MENTIONED",
    "SKIP_NO_MODE",
    "SKIP_RATE_LIMIT",
    "SKIP_TO_BOT",
    "AgentAccount",
    "AgentConfigError",
    "AgentCore",
    "BotCommand",
    "CommandCall",
    "DirectHandler",
    "DirectMessage",
    "DirectReply",
    "PolicySkip",
    "Room",
    "RoomHandler",
    "RoomMessage",
    "RoomReply",
    "address_from_public_key",
    "encode_reply",
    "load_agent_mnemonic",
    "mnemonic_to_seed",
    "read_mnemonic_file",
    "reply_preview",
]
