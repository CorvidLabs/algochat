"""
The commands the MCP server and the CLI share (AGENT-1.a, AGENT-1.e).

Every command is defined once here, with its parameters, and both adapters
are built from this list: the CLI has one subcommand per command and the MCP
server one tool per command, with the same parameters. A test checks that
the two stay the same.

Replies go through the core's reply policy (AGENT-8): ``reply-room`` refuses
a message the room's record keeps the bot silent on, and ``reply`` refuses a
sender a room marks as a bot. Design choice: the adapters do not post in a
room unprompted, so a room only hears the bot as its mode allows.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from .core import AgentCore
from .direct import DirectMessage
from .policy import PolicySkip
from .rooms import Room, RoomMessage
from .webhook import WebhookBridge


@dataclass(frozen=True)
class Param:
    """One parameter of a command: a CLI option and an MCP tool argument."""

    name: str
    kind: str
    """``"string"``, ``"boolean"`` or ``"integer"``."""
    description: str
    required: bool = False


@dataclass(frozen=True)
class AgentCommand:
    """One command, shared by the CLI (``name``) and the MCP server (``tool_name``)."""

    name: str
    description: str
    params: tuple[Param, ...]
    run: Callable[[AgentService, dict[str, Any]], Awaitable[Any]]

    @property
    def tool_name(self) -> str:
        return self.name.replace("-", "_")

    def input_schema(self) -> dict[str, Any]:
        """The JSON Schema of the MCP tool's arguments."""
        return {
            "type": "object",
            "properties": {
                p.name: {"type": p.kind, "description": p.description} for p in self.params
            },
            "required": [p.name for p in self.params if p.required],
            "additionalProperties": False,
        }


class CommandError(ValueError):
    """A command was called with bad arguments, or refused by the reply policy."""


def _direct_json(core: AgentCore, message: DirectMessage) -> dict[str, Any]:
    return {
        "txid": message.txid,
        "sender": message.sender,
        "text": message.text,
        "reply_to": message.reply_to,
        "confirmed_round": message.confirmed_round,
        "from_bot": core.is_known_bot(message.sender),
    }


def _room_json(room: Room) -> dict[str, Any]:
    return {
        "group_id": room.group_id.hex(),
        "mailbox": room.mailbox,
        "name": room.name,
        "epoch": room.epoch,
        "status": room.status,
        "is_channel": room.is_channel,
        "parent_group_id": None if room.parent_group_id is None else room.parent_group_id.hex(),
        "bot": None
        if room.bot is None
        else {"mode": room.bot.mode, "replies": room.bot.replies, "seconds": room.bot.seconds},
    }


def _room_message_json(core: AgentCore, message: RoomMessage) -> dict[str, Any]:
    return {
        "txid": message.txid,
        "group_id": bytes(message.group_id).hex(),
        "mailbox": message.mailbox,
        "is_channel": message.is_channel,
        "sender": message.sender,
        "text": message.text,
        "reply_to": message.reply_to,
        "confirmed_round": message.confirmed_round,
        "mentioned": message.mentioned,
        "command": None
        if message.command is None
        else {"name": message.command.name, "arguments": message.command.arguments},
        "from_bot": message.from_bot,
        "skipped": core.room_skip_reason(message),
    }


class AgentService:
    """Runs the shared commands on one :class:`AgentCore`.

    It remembers the messages it has read, so ``reply`` and ``reply-room``
    find a message by its transaction id within one MCP session or one CLI
    run (a fresh CLI run reads them again first).
    """

    def __init__(
        self,
        core: AgentCore,
        *,
        webhook: Callable[[str], WebhookBridge] | None = None,
    ) -> None:
        self._core = core
        self._webhook = webhook
        self._direct: dict[str, DirectMessage] = {}
        self._room: dict[str, RoomMessage] = {}

    @property
    def core(self) -> AgentCore:
        return self._core

    async def run(self, name: str, arguments: Mapping[str, Any] | None = None) -> Any:
        """Runs one command by its CLI name or MCP tool name."""
        command = command_by_name(name)
        return await command.run(self, check_arguments(command, arguments or {}))

    async def _read_direct(self) -> list[DirectMessage]:
        messages = await self._core.read_direct()
        if messages:
            await self._core.sync_rooms()
        for message in messages:
            self._direct[message.txid] = message
        return messages

    async def _read_rooms(self) -> list[RoomMessage]:
        messages = await self._core.read_rooms()
        for message in messages:
            self._room[message.txid] = message
        return messages


def check_arguments(command: AgentCommand, arguments: Mapping[str, Any]) -> dict[str, Any]:
    """Checks arguments against the command's parameters. Unknown or mistyped ones are refused."""
    known = {p.name: p for p in command.params}
    unknown = sorted(set(arguments) - set(known))
    if unknown:
        raise CommandError(f"{command.name} has no parameter {', '.join(unknown)}")
    checked: dict[str, Any] = {}
    for param in command.params:
        value = arguments.get(param.name)
        if value is None:
            if param.required:
                raise CommandError(f"{command.name} needs {param.name}")
            continue
        expected = {"string": str, "boolean": bool, "integer": int}[param.kind]
        if not isinstance(value, expected) or (param.kind == "integer" and isinstance(value, bool)):
            raise CommandError(f"{param.name} must be a {param.kind}")
        checked[param.name] = value
    return checked


# --- the commands -------------------------------------------------------------


async def _address(service: AgentService, _: dict[str, Any]) -> Any:
    core = service.core
    return {"address": core.address, "name": core.name}


async def _publish_keys(service: AgentService, args: dict[str, Any]) -> Any:
    force = bool(args.get("force", False))
    core = service.core
    return {
        "encryption_key_txid": await core.publish_key(force=force),
        "pq_key_txid": await core.publish_pq_key(force=force),
    }


async def _send(service: AgentService, args: dict[str, Any]) -> Any:
    # send_direct reads the rooms first and refuses an account any of them marks as a bot.
    try:
        txid = await service.core.send_direct(args["to"], args["text"])
    except PolicySkip as skipped:
        raise CommandError(f"The bot does not message another bot ({skipped.reason})") from None
    return {"txid": txid}


async def _read(service: AgentService, _: dict[str, Any]) -> Any:
    return [_direct_json(service.core, m) for m in await service._read_direct()]


async def _reply(service: AgentService, args: dict[str, Any]) -> Any:
    txid = args["txid"]
    message = service._direct.get(txid)
    if message is None:
        await service._read_direct()
        message = service._direct.get(txid)
    if message is None:
        raise CommandError(f"No unanswered one-to-one message {txid}")
    # core.reply reads the rooms again first, so a long-lived service (the MCP
    # server) sees a bot mark made after the message was read.
    try:
        reply_txid = await service.core.reply(message, args["text"])
    except PolicySkip as skipped:
        raise CommandError(f"The bot does not reply to another bot ({skipped.reason})") from None
    service._direct.pop(txid, None)
    return {"txid": reply_txid}


async def _rooms(service: AgentService, _: dict[str, Any]) -> Any:
    return [_room_json(room) for room in await service.core.sync_rooms()]


async def _read_rooms(service: AgentService, _: dict[str, Any]) -> Any:
    core = service.core
    return [_room_message_json(core, m) for m in await service._read_rooms()]


async def _reply_room(service: AgentService, args: dict[str, Any]) -> Any:
    txid = args["txid"]
    message = service._room.get(txid)
    if message is None:
        await service._read_rooms()
        message = service._room.get(txid)
    if message is None:
        raise CommandError(f"No unanswered room message {txid}")
    # core.reply_room reads the rooms again and applies the policy on that
    # fresh record (mode, rate window, bot marks), not the cached message's.
    try:
        reply_txid = await service.core.reply_room(message, args["text"])
    except PolicySkip as skipped:
        raise CommandError(
            f"The room's reply policy keeps the bot silent on this message ({skipped.reason})"
        ) from None
    service._room.pop(txid, None)
    return {"txid": reply_txid}


async def _declare_commands(service: AgentService, _: dict[str, Any]) -> Any:
    core = service.core
    return {"command_list": core.command_list, "txids": await core.declare_commands()}


async def _leave_room(service: AgentService, args: dict[str, Any]) -> Any:
    try:
        group_id = bytes.fromhex(args["group_id"])
    except ValueError:
        raise CommandError("group_id must be hex") from None
    await service.core.sync_rooms()
    return {"txids": await service.core.leave_room((group_id, args["mailbox"]))}


async def _serve(service: AgentService, args: dict[str, Any]) -> Any:
    if service._webhook is None:
        raise CommandError("serve needs a webhook bridge")
    bridge = service._webhook(args["webhook"])
    core = service.core
    direct = await core.serve_direct(bridge)
    rooms = await core.serve_rooms(bridge)
    return {
        "direct": [
            {"txid": r.message.txid, "reply_txid": r.reply_txid, "error": r.error, "skipped": r.skipped}
            for r in direct
        ],
        "rooms": [
            {"txid": r.message.txid, "reply_txid": r.txid, "error": r.error, "skipped": r.skipped}
            for r in rooms
        ],
    }


_TXID = Param("txid", "string", "Transaction id of the message to answer", required=True)
_TEXT = Param("text", "string", "Text to send", required=True)

COMMANDS: tuple[AgentCommand, ...] = (
    AgentCommand("address", "Show the bot's address and the name members mention it by.", (), _address),
    AgentCommand(
        "publish-keys",
        "Publish the bot's signed encryption key and its post-quantum room key, if not already on chain.",
        (Param("force", "boolean", "Publish again even if the same keys are on chain"),),
        _publish_keys,
    ),
    AgentCommand(
        "send",
        "Send a one-to-one message.",
        (Param("to", "string", "Recipient's Algorand address", required=True), _TEXT),
        _send,
    ),
    AgentCommand("read", "Read one-to-one messages the bot has not answered yet.", (), _read),
    AgentCommand(
        "reply",
        "Answer a one-to-one message. Refused when a room marks the sender as a bot.",
        (_TXID, _TEXT),
        _reply,
    ),
    AgentCommand("rooms", "List the rooms and channels the bot was added to, with its mode and rate limit.", (), _rooms),
    AgentCommand(
        "read-rooms",
        "Read new room and channel messages, each with the reason the reply policy would keep the bot silent, if any.",
        (),
        _read_rooms,
    ),
    AgentCommand(
        "reply-room",
        "Answer a room or channel message. Refused when the room's mode, rate limit or bot mark keeps the bot silent.",
        (_TXID, _TEXT),
        _reply_room,
    ),
    AgentCommand(
        "declare-commands",
        "Post the bot's command list in rooms where its mode is commands and the list changed.",
        (),
        _declare_commands,
    ),
    AgentCommand(
        "leave-room",
        "Leave a room and its channels.",
        (
            Param("group_id", "string", "The room's group id, in hex", required=True),
            Param("mailbox", "string", "The room's mailbox address", required=True),
        ),
        _leave_room,
    ),
    AgentCommand(
        "serve",
        "Answer new messages through the webhook, following each room's reply policy (one pass per call).",
        (Param("webhook", "string", "Webhook URL: loopback, or https with a shared secret", required=True),),
        _serve,
    ),
)


def command_by_name(name: str) -> AgentCommand:
    for command in COMMANDS:
        if name in (command.name, command.tool_name):
            return command
    raise CommandError(f"Unknown command {name}")


def to_json(value: Any) -> Any:
    """Makes a command result JSON-safe (bytes as hex)."""
    if isinstance(value, bytes):
        return value.hex()
    if isinstance(value, Mapping):
        return {k: to_json(v) for k, v in value.items()}
    if isinstance(value, Sequence) and not isinstance(value, str):
        return [to_json(v) for v in value]
    return value


__all__ = [
    "COMMANDS",
    "AgentCommand",
    "AgentService",
    "CommandError",
    "Param",
    "check_arguments",
    "command_by_name",
    "to_json",
]
