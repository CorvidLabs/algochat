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
slash commands (AGENT-8). The MCP server, the CLI (``algochat-agent``) and the
webhook bridge share one list of commands on top of :class:`AgentCore`
(AGENT-1.a, AGENT-1.c, AGENT-1.e).
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
from .service import COMMANDS, AgentCommand, AgentService, CommandError
from .webhook import (
    SECRET_ENV,
    SECRET_FILE_ENV,
    WebhookBridge,
    WebhookError,
    check_webhook_url,
    load_webhook_secret,
    verify_signature,
)

__all__ = [
    "COMMANDS",
    "LEAVE_NOTICE",
    "MNEMONIC_ENV",
    "MNEMONIC_FILE_ENV",
    "ROOM_ACTIVE",
    "ROOM_LEFT",
    "ROOM_REMOVED",
    "ROOM_WAITING",
    "SECRET_ENV",
    "SECRET_FILE_ENV",
    "SKIP_FROM_BOT",
    "SKIP_NOT_A_COMMAND",
    "SKIP_NOT_MENTIONED",
    "SKIP_NO_MODE",
    "SKIP_RATE_LIMIT",
    "SKIP_TO_BOT",
    "AgentAccount",
    "AgentCommand",
    "AgentConfigError",
    "AgentCore",
    "AgentService",
    "BotCommand",
    "CommandCall",
    "CommandError",
    "DirectHandler",
    "DirectMessage",
    "DirectReply",
    "PolicySkip",
    "Room",
    "RoomHandler",
    "RoomMessage",
    "RoomReply",
    "WebhookBridge",
    "WebhookError",
    "address_from_public_key",
    "check_webhook_url",
    "encode_reply",
    "load_agent_mnemonic",
    "load_webhook_secret",
    "mnemonic_to_seed",
    "read_mnemonic_file",
    "reply_preview",
    "verify_signature",
]
