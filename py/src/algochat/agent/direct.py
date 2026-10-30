"""
One-to-one messages for the agent core (AGENT-5).

The bot reads AlgoChat ``0x01`` messages sent to its own address and replies
from its own account. Message text follows PROTOCOL.md section 9: plain
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
