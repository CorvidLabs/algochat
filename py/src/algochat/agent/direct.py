"""
One-to-one messages for the agent core (AGENT-5).

The bot reads hybrid AlgoChat messages sent to its own address (a ``0x04``
handshake, then ``0x05`` messages) and replies from its own account the same
way. It never sends ``0x01`` or ``0x02`` and does not read them
(algochat#63). Message text follows PROTOCOL.md section 9: plain
UTF-8 text, a ``{"text": ...}`` object, or a ``{"text": ..., "replyTo": ...}``
reply. The bot's replies use the section 9.2 form.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

REPLY_PREVIEW_CHARS = 80
"""A reply preview longer than this is cut to 77 characters plus ``...``."""


@dataclass(frozen=True)
class DirectMessage:
    """A one-to-one message the bot received."""

    txid: str
    sender: str
    text: str
    confirmed_round: int
    reply_to: str | None = None
    """Transaction id this message replies to, when it is a reply."""


@dataclass(frozen=True)
class DirectReply:
    """The outcome of handling one received message."""

    message: DirectMessage
    reply_txid: str | None
    """The bot's reply, or ``None`` when the handler chose not to answer."""

    error: str | None = None
    """Why handling failed, when it did. The message is not retried."""

    skipped: str | None = None
    """Why the bot stayed silent by policy: ``from-bot`` when the sender is a bot in one of its rooms."""


def reply_preview(text: str) -> str:
    """The preview carried in a reply, cut the way the TypeScript library cuts it."""
    if len(text) > REPLY_PREVIEW_CHARS:
        return text[: REPLY_PREVIEW_CHARS - 3] + "..."
    return text


def encode_reply(text: str, reply_to_txid: str, original_text: str) -> str:
    """The section 9.2 reply payload, as compact JSON."""
    return json.dumps(
        {"text": text, "replyTo": {"txid": reply_to_txid, "preview": reply_preview(original_text)}},
        ensure_ascii=False,
        separators=(",", ":"),
    )
