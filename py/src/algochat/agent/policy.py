"""
Reply policy for the agent core (AGENT-8, AGENT-8.b to AGENT-8.f).

The room's record (op 13, changed by op 14) holds the bot's reply mode and
rate limit in that room (PROTOCOL.md section 5.8.2, "Bots"). The bot reads
them from the room's current accepted state every time it serves, so a
change by the owner or an admin applies from the next message it handles.

* Mode 1 (mentions): the bot answers a message that writes ``@`` and its
  name (or its address), or that replies to one of its own messages with a
  section 9.2 reply.
* Mode 2 (every message): the bot answers every message.
* Mode 3 (commands): the bot answers ``/command`` messages for the commands
  it declared, and posts its command list in the room.
* The bot never answers an account the room's record marks as a bot.
* The bot sends at most ``replies`` messages in that room in any window of
  ``seconds`` seconds. A message over the limit is skipped, not queued.

Nothing here touches the chain; :class:`~algochat.agent.core.AgentCore` uses
these helpers.
"""

from __future__ import annotations

import json
import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass

COMMAND_NAME_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{0,31}$")
"""A command name: 1 to 32 lowercase letters, digits, ``_`` or ``-``, not starting with ``_`` or ``-``."""

HELP_COMMAND = "help"
"""Always declared. When the operator does not handle it, the bot answers with its command list."""

COMMANDS_HEADER = "Commands"
"""The first word of the bot's command list message."""

MAX_ROOM_TEXT_BYTES = 4026
"""Largest room message plaintext (PROTOCOL.md section 5.8.3)."""

SKIP_FROM_BOT = "from-bot"
"""The sender is a bot in the room's record (AGENT-8.c)."""
SKIP_NO_MODE = "no-mode"
"""The room's record has no reply mode for the bot: it was added as a plain member."""
SKIP_NOT_MENTIONED = "not-mentioned"
"""Mentions mode, and the message neither mentions the bot nor replies to it."""
SKIP_NOT_A_COMMAND = "not-a-command"
"""Commands mode, and the message is not one of the bot's declared commands."""
SKIP_RATE_LIMIT = "rate-limit"
"""Answering would go over the room's rate limit for the bot."""
SKIP_TO_BOT = "to-bot"
"""The one-to-one message would go to an account one of the bot's rooms marks as a bot (AGENT-8.c)."""


class PolicySkip(PermissionError):
    """The reply policy keeps the bot silent. ``reason`` is one of the ``SKIP_*`` values."""

    def __init__(self, reason: str) -> None:
        super().__init__(f"The reply policy keeps the bot silent here ({reason})")
        self.reason = reason

_COMMAND_PATTERN = re.compile(r"^/([^\s@/]+)(?:@(\S+))?(?:\s+(.*))?$", re.DOTALL)
_NAME_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$")


@dataclass(frozen=True)
class BotCommand:
    """A slash command the bot declares: ``/name``, with a short description."""

    name: str
    description: str

    def __post_init__(self) -> None:
        if not COMMAND_NAME_PATTERN.match(self.name):
            raise ValueError(
                "A command name is 1 to 32 lowercase letters, digits, _ or -, "
                "and starts with a letter or digit"
            )
        if "\n" in self.description or "\r" in self.description:
            raise ValueError("A command description is one line")


@dataclass(frozen=True)
class RoomText:
    """A room message's text, with the transaction id it replies to when it is a section 9.2 reply."""

    text: str
    reply_to: str | None = None


@dataclass(frozen=True)
class CommandCall:
    """A ``/command`` the bot declared, with the rest of the message as its arguments."""

    name: str
    arguments: str


def check_bot_name(name: str | None) -> str | None:
    """Checks the name members mention the bot by (``@name``). Returns it unchanged."""
    if name is None:
        return None
    if not _NAME_PATTERN.match(name):
        raise ValueError(
            "A bot name is 1 to 64 letters, digits, _, . or -, starting with a letter or digit"
        )
    return name


def parse_room_text(text: str) -> RoomText:
    """Reads plain text, a section 9.1 ``{"text": ...}`` object or a section 9.2 reply.

    Anything that is not one of those JSON forms is plain text, kept as it is.
    """
    stripped = text.strip()
    if not (stripped.startswith("{") and stripped.endswith("}")):
        return RoomText(text)
    try:
        payload = json.loads(stripped)
    except ValueError:
        return RoomText(text)
    if not isinstance(payload, dict) or not isinstance(payload.get("text"), str):
        return RoomText(text)
    reply = payload.get("replyTo")
    reply_to = None
    if isinstance(reply, dict) and isinstance(reply.get("txid"), str) and reply["txid"]:
        reply_to = reply["txid"]
    return RoomText(payload["text"], reply_to)


def mentions(text: str, name: str | None, address: str) -> bool:
    """Whether ``text`` writes ``@`` and the bot's name (any case) or its address."""
    targets = [re.escape(address)]
    if name:
        targets.append(re.escape(name))
    pattern = r"(?<![\w@.])@(?:" + "|".join(targets) + r")(?![\w-])"
    flags = re.IGNORECASE if name else 0
    found = re.search(pattern, text, flags)
    if found is None:
        return False
    # The address only counts in its own (upper) case.
    hit = found.group(0)[1:]
    return hit == address or (name is not None and hit.lower() == name.lower())


def command_call(
    text: str, declared: Iterable[str], name: str | None, address: str
) -> CommandCall | None:
    """The declared ``/command`` that starts ``text``, or None.

    ``/command@name`` counts only when the name (or address) is the bot's.
    """
    found = _COMMAND_PATTERN.match(text.strip())
    if found is None:
        return None
    command, target, arguments = found.group(1), found.group(2), found.group(3) or ""
    if target is not None:
        mine = target == address or (name is not None and target.lower() == name.lower())
        if not mine:
            return None
    command = command.lower()
    if command not in set(declared):
        return None
    return CommandCall(command, arguments.strip())


def declared_commands(commands: Sequence[BotCommand]) -> list[BotCommand]:
    """The operator's commands plus ``/help``, sorted by name. Duplicate names are refused."""
    names = [command.name for command in commands]
    if len(names) != len(set(names)):
        raise ValueError("Each command name is declared once")
    found = list(commands)
    if HELP_COMMAND not in names:
        found.append(BotCommand(HELP_COMMAND, "List these commands"))
    return sorted(found, key=lambda command: command.name)


def command_list_text(commands: Sequence[BotCommand], name: str | None) -> str:
    """The plain-text command list the bot posts in a room in commands mode."""
    title = f"{COMMANDS_HEADER} for @{name}:" if name else f"{COMMANDS_HEADER}:"
    lines = [title]
    for command in commands:
        line = f"/{command.name}"
        if command.description:
            line += f" - {command.description}"
        lines.append(line)
    text = "\n".join(lines)
    if len(text.encode("utf-8")) > MAX_ROOM_TEXT_BYTES:
        raise ValueError("The command list does not fit in one room message")
    return text


def is_command_list(text: str) -> bool:
    """Whether ``text`` has the shape of a command list from :func:`command_list_text`."""
    lines = text.split("\n")
    if not re.fullmatch(COMMANDS_HEADER + r"(?: for @\S+)?:", lines[0]):
        return False
    return len(lines) > 1 and all(line.startswith("/") for line in lines[1:])


def within_rate(sent_at: Iterable[float], now: float, replies: int, seconds: int) -> bool:
    """Whether one more message at ``now`` keeps at most ``replies`` in any ``seconds`` window."""
    recent = [when for when in sent_at if now - when < seconds]
    return len(recent) < replies


__all__ = [
    "COMMANDS_HEADER",
    "COMMAND_NAME_PATTERN",
    "HELP_COMMAND",
    "MAX_ROOM_TEXT_BYTES",
    "SKIP_FROM_BOT",
    "SKIP_NOT_A_COMMAND",
    "SKIP_NOT_MENTIONED",
    "SKIP_NO_MODE",
    "SKIP_RATE_LIMIT",
    "SKIP_TO_BOT",
    "BotCommand",
    "CommandCall",
    "PolicySkip",
    "RoomText",
    "check_bot_name",
    "command_call",
    "command_list_text",
    "declared_commands",
    "is_command_list",
    "mentions",
    "parse_room_text",
    "within_rate",
]
