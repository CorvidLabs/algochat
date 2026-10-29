"""
Webhook bridge for the agent core (AGENT-1.a, AGENT-1.c).

The bridge hands each message the bot may answer to the operator's own web
service and posts the text it sends back. Because the message is readable
text, the bridge only talks to the same machine (``http`` or ``https`` on a
loopback address) or to a secured address over ``https`` with the server's
certificate checked and every request signed (AGENT-1.c).

Design choices, not confirmed intent:

* Every request is signed with HMAC-SHA256 under a shared secret kept in
  ``ALGOCHAT_WEBHOOK_SECRET`` or an owner-only file named by
  ``ALGOCHAT_WEBHOOK_SECRET_FILE``. The secret is required for any address
  that is not loopback, and used for loopback ones when set.
* The signature covers ``"<timestamp>." + body`` and is sent as
  ``X-AlgoChat-Signature: sha256=<hex>`` with ``X-AlgoChat-Timestamp``.
  :func:`verify_signature` checks it and refuses timestamps more than five
  minutes away, against replays.
* Proxies from the environment are ignored and redirects are refused, so a
  request can never leave by a route the operator did not name.
* The reply is ``{"reply": "<text>"}`` (or ``null``, an empty body or HTTP
  204 for none). Anything else is an error, which the core reports without
  retrying.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import ipaddress
import json
import os
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable, Mapping
from typing import Any

from .config import AgentConfigError, read_owner_only_file
from .direct import DirectMessage
from .rooms import RoomMessage

SECRET_ENV = "ALGOCHAT_WEBHOOK_SECRET"
"""Environment variable holding the webhook's shared secret."""

SECRET_FILE_ENV = "ALGOCHAT_WEBHOOK_SECRET_FILE"
"""Environment variable holding the path of an owner-only file with the secret."""

SIGNATURE_HEADER = "X-AlgoChat-Signature"
TIMESTAMP_HEADER = "X-AlgoChat-Timestamp"
MIN_SECRET_LENGTH = 32
"""Shortest accepted secret, in characters."""
TOLERANCE_SECONDS = 300
"""How far a signed timestamp may be from the receiver's clock."""
MAX_RESPONSE_BYTES = 65536
"""Largest webhook response read."""
TIMEOUT_SECONDS = 15.0


class WebhookError(RuntimeError):
    """The webhook refused, failed, or answered in an unexpected shape."""


def load_webhook_secret(environ: Mapping[str, str] | None = None) -> str | None:
    """The shared secret from ``ALGOCHAT_WEBHOOK_SECRET`` or the file named by ``ALGOCHAT_WEBHOOK_SECRET_FILE``.

    Returns ``None`` when neither is set. Both set, a short secret or an
    unsafe file raise :class:`AgentConfigError` without the secret in it.
    """
    env = os.environ if environ is None else environ
    inline = env.get(SECRET_ENV, "").strip()
    file_name = env.get(SECRET_FILE_ENV, "").strip()
    if inline and file_name:
        raise AgentConfigError(f"Set only one of {SECRET_ENV} or {SECRET_FILE_ENV}, not both")
    secret = inline or (read_owner_only_file(file_name, "Webhook secret") if file_name else None)
    if secret is not None and len(secret) < MIN_SECRET_LENGTH:
        raise AgentConfigError(f"The webhook secret needs at least {MIN_SECRET_LENGTH} characters")
    return secret


def is_loopback_host(host: str) -> bool:
    """Whether ``host`` is this machine: ``localhost`` or a literal loopback IP address."""
    host = host.strip("[]").lower()
    if host == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def check_webhook_url(url: str, has_secret: bool) -> str:
    """Checks where the bridge may send readable text (AGENT-1.c). Returns ``url``.

    Allowed: ``http`` or ``https`` to a loopback host, or ``https`` to any
    other host when a shared secret signs each request. Credentials inside
    the URL are refused, so they never land in logs.
    """
    parts = urllib.parse.urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise WebhookError("The webhook URL must be http:// or https:// with a host")
    if parts.username is not None or parts.password is not None:
        raise WebhookError("Put no credentials in the webhook URL; use the shared secret")
    if is_loopback_host(parts.hostname):
        return url
    if parts.scheme != "https":
        raise WebhookError(
            "Readable text goes over plain http only to this machine; use https for another address"
        )
    if not has_secret:
        raise WebhookError(
            f"An https webhook on another machine needs a shared secret in {SECRET_ENV} or {SECRET_FILE_ENV}"
        )
    return url


def sign(secret: str, timestamp: int, body: bytes) -> str:
    """The ``sha256=<hex>`` signature of ``"<timestamp>." + body``."""
    mac = hmac.new(secret.encode("utf-8"), f"{timestamp}.".encode("ascii") + body, hashlib.sha256)
    return "sha256=" + mac.hexdigest()


def verify_signature(
    secret: str,
    timestamp: str,
    body: bytes,
    signature: str,
    now: float | None = None,
    tolerance: int = TOLERANCE_SECONDS,
) -> bool:
    """For the operator's receiver: whether a request's signature and timestamp are good."""
    try:
        when = int(timestamp)
    except (TypeError, ValueError):
        return False
    current = time.time() if now is None else now
    if abs(current - when) > tolerance:
        return False
    return hmac.compare_digest(sign(secret, when, body), signature or "")


def direct_payload(message: DirectMessage) -> dict[str, Any]:
    """What the bridge sends for a one-to-one message."""
    return {
        "type": "direct",
        "txid": message.txid,
        "sender": message.sender,
        "text": message.text,
        "reply_to": message.reply_to,
        "confirmed_round": message.confirmed_round,
    }


def room_payload(message: RoomMessage) -> dict[str, Any]:
    """What the bridge sends for a room or channel message."""
    return {
        "type": "room",
        "txid": message.txid,
        "sender": message.sender,
        "text": message.text,
        "reply_to": message.reply_to,
        "confirmed_round": message.confirmed_round,
        "group_id": bytes(message.group_id).hex(),
        "mailbox": message.mailbox,
        "is_channel": message.is_channel,
        "mentioned": message.mentioned,
        "command": None
        if message.command is None
        else {"name": message.command.name, "arguments": message.command.arguments},
    }


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args: Any, **kwargs: Any) -> None:
        raise WebhookError("The webhook answered with a redirect, which the bridge does not follow")


class WebhookBridge:
    """Calls the operator's webhook for each message and returns its reply text.

    Use an instance as the handler for :meth:`AgentCore.serve_direct` and
    :meth:`AgentCore.serve_rooms`; the core only calls it for messages the
    reply policy allows.
    """

    def __init__(
        self,
        url: str,
        secret: str | None = None,
        *,
        ssl_context: ssl.SSLContext | None = None,
        timeout: float = TIMEOUT_SECONDS,
        clock: Callable[[], float] = time.time,
    ) -> None:
        if secret is not None and len(secret) < MIN_SECRET_LENGTH:
            raise AgentConfigError(f"The webhook secret needs at least {MIN_SECRET_LENGTH} characters")
        self._url = check_webhook_url(url, secret is not None)
        self._secret = secret
        self._timeout = timeout
        self._clock = clock
        context = ssl_context or ssl.create_default_context()
        if context.verify_mode != ssl.CERT_REQUIRED or not context.check_hostname:
            raise WebhookError("The webhook's https certificate must be checked")
        self._opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({}),
            urllib.request.HTTPSHandler(context=context),
            _NoRedirect(),
        )

    @property
    def url(self) -> str:
        return self._url

    def post(self, payload: Mapping[str, Any]) -> str | None:
        """Sends one payload and returns the reply text, or ``None`` for no reply."""
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        headers = {"Content-Type": "application/json", "User-Agent": "algochat-agent"}
        if self._secret is not None:
            timestamp = int(self._clock())
            headers[TIMESTAMP_HEADER] = str(timestamp)
            headers[SIGNATURE_HEADER] = sign(self._secret, timestamp, body)
        request = urllib.request.Request(self._url, data=body, headers=headers, method="POST")
        try:
            with self._opener.open(request, timeout=self._timeout) as response:
                status = response.status
                raw = response.read(MAX_RESPONSE_BYTES + 1)
        except urllib.error.HTTPError as error:
            raise WebhookError(f"The webhook answered HTTP {error.code}") from None
        except urllib.error.URLError as error:
            if isinstance(error.reason, WebhookError):
                raise error.reason from None
            raise WebhookError(f"The webhook could not be reached: {type(error.reason).__name__}") from None
        if len(raw) > MAX_RESPONSE_BYTES:
            raise WebhookError("The webhook's answer is too large")
        if status == 204 or not raw.strip():
            return None
        try:
            answer = json.loads(raw)
        except ValueError:
            raise WebhookError('The webhook must answer JSON like {"reply": "text"}') from None
        if not isinstance(answer, dict) or "reply" not in answer:
            raise WebhookError('The webhook must answer JSON like {"reply": "text"}')
        reply = answer["reply"]
        if reply is not None and not isinstance(reply, str):
            raise WebhookError("The webhook's reply must be text or null")
        return reply or None

    async def __call__(self, message: DirectMessage | RoomMessage) -> str | None:
        payload = room_payload(message) if isinstance(message, RoomMessage) else direct_payload(message)
        return await asyncio.to_thread(self.post, payload)

    def __repr__(self) -> str:
        return f"WebhookBridge(url={self._url!r}, signed={self._secret is not None})"


__all__ = [
    "MAX_RESPONSE_BYTES",
    "MIN_SECRET_LENGTH",
    "SECRET_ENV",
    "SECRET_FILE_ENV",
    "SIGNATURE_HEADER",
    "TIMESTAMP_HEADER",
    "TOLERANCE_SECONDS",
    "WebhookBridge",
    "WebhookError",
    "check_webhook_url",
    "direct_payload",
    "is_loopback_host",
    "load_webhook_secret",
    "room_payload",
    "sign",
    "verify_signature",
]
