"""MCP server, CLI and webhook bridge on the agent core (AGENT-1.a, AGENT-1.c, AGENT-1.e).

The in-memory chain from test_agent_direct.py stands in for algod and the
indexer. Webhook receivers run on 127.0.0.1 only. Seeds and secrets are
public test values. No test touches a network beyond loopback.
"""

from __future__ import annotations

import io
import json
import os
import ssl

import pytest

from algochat.agent import (
    COMMANDS,
    SKIP_FROM_BOT,
    AgentConfigError,
    AgentService,
    CommandError,
    WebhookBridge,
    WebhookError,
    check_webhook_url,
    load_webhook_secret,
    verify_signature,
)
from algochat.agent.cli import MCP_COMMAND, build_parser, main
from algochat.agent.mcp import PROTOCOL_VERSIONS, McpServer, tool_list
from algochat.agent.webhook import SIGNATURE_HEADER, TIMESTAMP_HEADER, sign
from algochat.group_admin import (
    BOT_MODE_COMMANDS,
    BOT_MODE_EVERY_MESSAGE,
    BOT_MODE_MENTIONS,
    OP_ADD_BOT,
    OP_SET_BOT,
    BotSettings,
)
from tests.room_support import address, public_key
from tests.test_agent_direct import BOT_SEED, PERSON_SEED, _person, _say
from tests.test_agent_policy import (
    ADDRESS,
    OTHER_BOT_SEED,
    OWNER_SEED,
    Clock,
    Ledger,
    _bot,
    _read,
    _room,
)
from tests.webhook_support import Receiver, self_signed

SECRET = "test-secret-not-real-0123456789abcdef"


# --- AGENT-1.e: a tool for every command-line command ------------------------


def _cli_commands() -> dict[str, set[str]]:
    parser = build_parser()
    sub = next(a for a in parser._actions if a.dest == "cmd")
    found = {}
    for name, p in sub.choices.items():
        found[name] = {
            a.dest for a in p._actions if a.dest not in ("help", "once", "interval")
        }
    return found


def test_every_cli_command_has_an_mcp_tool_with_the_same_parameters():
    cli = _cli_commands()
    assert MCP_COMMAND in cli
    del cli[MCP_COMMAND]  # the server itself
    tools = {t["name"]: set(t["inputSchema"]["properties"]) for t in tool_list()}
    assert {name.replace("-", "_"): params for name, params in cli.items()} == tools
    assert len(tools) == len(COMMANDS) == 11
    for tool in tool_list():
        command = next(c for c in COMMANDS if c.tool_name == tool["name"])
        assert tool["inputSchema"]["required"] == [
            p.name for p in command.params if p.required
        ]
        assert tool["description"] == command.description


# --- MCP protocol --------------------------------------------------------------


async def _mcp(service: AgentService | None = None) -> McpServer:
    async def factory() -> AgentService:
        assert service is not None, "the service is built only when a tool runs"
        return service

    return McpServer(factory, "test")


async def test_mcp_initialize_list_and_errors():
    server = await _mcp()
    init = await server.handle(
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {"protocolVersion": "2025-03-26"},
        }
    )
    assert init["result"]["protocolVersion"] == "2025-03-26"
    assert init["result"]["capabilities"] == {"tools": {"listChanged": False}}
    newer = await server.handle(
        {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "initialize",
            "params": {"protocolVersion": "1999-01-01"},
        }
    )
    assert newer["result"]["protocolVersion"] == PROTOCOL_VERSIONS[0]
    assert (
        await server.handle({"jsonrpc": "2.0", "method": "notifications/initialized"})
        is None
    )
    assert (await server.handle({"jsonrpc": "2.0", "id": 3, "method": "ping"}))[
        "result"
    ] == {}
    listed = await server.handle({"jsonrpc": "2.0", "id": 4, "method": "tools/list"})
    assert [t["name"] for t in listed["result"]["tools"]] == [
        c.tool_name for c in COMMANDS
    ]
    assert (await server.handle({"jsonrpc": "2.0", "id": 5, "method": "nope"}))[
        "error"
    ]["code"] == -32601
    unknown = await server.handle(
        {"jsonrpc": "2.0", "id": 6, "method": "tools/call", "params": {"name": "rm"}}
    )
    assert unknown["error"]["code"] == -32602
    assert (await server.handle({"id": 7, "method": "ping"}))["error"]["code"] == -32600


async def test_mcp_serves_lines_over_stdio_and_reports_parse_errors():
    server = await _mcp()
    reader = io.StringIO(
        '{"jsonrpc":"2.0","id":1,"method":"ping"}\n\nnot json\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n'
    )
    writer = io.StringIO()
    await server.serve(reader, writer)
    lines = [json.loads(line) for line in writer.getvalue().splitlines()]
    assert lines == [
        {"jsonrpc": "2.0", "id": 1, "result": {}},
        {
            "jsonrpc": "2.0",
            "id": None,
            "error": {"code": -32700, "message": "Parse error"},
        },
    ]


async def _call(
    server: McpServer, name: str, arguments: dict | None = None
) -> tuple[bool, object]:
    answer = await server.handle(
        {
            "jsonrpc": "2.0",
            "id": 9,
            "method": "tools/call",
            "params": {"name": name, "arguments": arguments or {}},
        }
    )
    result = answer["result"]
    text = result["content"][0]["text"]
    return result["isError"], (text if result["isError"] else json.loads(text))


# --- the shared commands follow the reply policy -------------------------------


async def test_mcp_room_tools_follow_the_rooms_reply_policy():
    chain = Ledger()
    clock = Clock(chain)
    room = await _room(chain, BotSettings(BOT_MODE_MENTIONS, 1, 60), other_bot=True)
    bot = await _bot(chain, clock)
    server = await _mcp(AgentService(bot))

    error, rooms = await _call(server, "rooms")
    assert not error
    assert [(r["name"], r["status"], r["bot"]) for r in rooms] == [
        ("team", "active", {"mode": 1, "replies": 1, "seconds": 60})
    ]

    quiet = await room.post(PERSON_SEED, "no mention here")
    asked = await room.post(PERSON_SEED, "@helper hello")
    again = await room.post(OWNER_SEED, "@helper me too")
    from_bot = await room.post(OTHER_BOT_SEED, "@helper bot here")
    error, messages = await _call(server, "read_rooms")
    assert not error
    assert [
        (m["txid"], m["mentioned"], m["from_bot"], m["skipped"]) for m in messages
    ] == [
        (quiet.txid, False, False, "not-mentioned"),
        (asked.txid, True, False, None),
        (again.txid, True, False, None),
        (from_bot.txid, True, True, SKIP_FROM_BOT),
    ]
    error, text = await _call(server, "reply_room", {"txid": quiet.txid, "text": "hi"})
    assert error and "not-mentioned" in text
    error, text = await _call(
        server, "reply_room", {"txid": from_bot.txid, "text": "hi"}
    )
    assert error and SKIP_FROM_BOT in text
    error, sent = await _call(
        server, "reply_room", {"txid": asked.txid, "text": "hello back"}
    )
    assert not error
    assert _read(room, sent["txid"], chain) == "hello back"
    # The limit is 1 per 60 s: the second mention waits.
    error, text = await _call(
        server, "reply_room", {"txid": again.txid, "text": "too soon"}
    )
    assert error and "rate-limit" in text
    clock.now += 61
    error, _ = await _call(server, "reply_room", {"txid": again.txid, "text": "now"})
    assert not error
    error, text = await _call(
        server, "reply_room", {"txid": again.txid, "text": "twice"}
    )
    assert error and "No unanswered room message" in text
    error, text = await _call(server, "reply_room", {"txid": asked.txid})
    assert error and "needs text" in text
    error, text = await _call(server, "reply_room", {"txid": asked.txid, "text": 5})
    assert error and "must be a string" in text
    error, text = await _call(
        server, "reply_room", {"txid": asked.txid, "text": "x", "extra": 1}
    )
    assert error and "no parameter extra" in text


async def test_reply_refuses_a_one_to_one_message_from_a_room_bot():
    chain = Ledger()
    clock = Clock(chain)
    await _room(chain, BotSettings(BOT_MODE_EVERY_MESSAGE, 5, 60), other_bot=True)
    bot = await _bot(chain, clock)
    await bot.publish_key()
    person = await _person(chain)
    other = await _person(chain, OTHER_BOT_SEED)
    hello = await _say(chain, person, PERSON_SEED, bot.address, "hi from a person")
    robot = await _say(chain, other, OTHER_BOT_SEED, bot.address, "hi from a bot")
    service = AgentService(bot)
    read = await service.run("read")
    assert [(m["txid"], m["from_bot"]) for m in read] == [
        (hello.txid, False),
        (robot.txid, True),
    ]
    with pytest.raises(CommandError, match="another bot"):
        await service.run("reply", {"txid": robot.txid, "text": "hi"})
    assert (await service.run("reply", {"txid": hello.txid, "text": "hello"}))["txid"]
    # A fresh service (a new CLI run) reads again and finds nothing left to answer from the person.
    fresh = AgentService(await _bot(chain, clock))
    with pytest.raises(CommandError, match="No unanswered"):
        await fresh.run("reply", {"txid": hello.txid, "text": "again"})


async def test_address_and_unknown_commands():
    chain = Ledger()
    service = AgentService(await _bot(chain, Clock(chain)))
    assert await service.run("address") == {"address": ADDRESS, "name": "helper"}
    with pytest.raises(CommandError, match="Unknown command"):
        await service.run("drop-tables")
    with pytest.raises(CommandError, match="serve needs a webhook"):
        await service.run("serve", {"webhook": "http://127.0.0.1:1/"})


# --- webhook bridge (AGENT-1.c) ------------------------------------------------


@pytest.mark.parametrize(
    "url, secret, ok",
    [
        ("http://127.0.0.1:8080/hook", False, True),
        ("http://localhost/hook", False, True),
        ("http://[::1]:9000/", False, True),
        ("https://localhost/hook", False, True),
        ("https://bots.example.com/hook", True, True),
        ("https://bots.example.com/hook", False, False),
        ("http://bots.example.com/hook", True, False),
        ("http://10.0.0.5/hook", True, False),
        ("http://localhost.example.com/hook", True, False),
        ("ftp://127.0.0.1/hook", False, False),
        ("https://user:pass@bots.example.com/hook", True, False),
        ("127.0.0.1:8080", False, False),
        ("file:///etc/passwd", True, False),
        ("https://user@bots.example.com/hook", True, False),
        ("https://169.254.169.254/latest/meta-data/", True, False),
        ("http://169.254.169.254/latest/meta-data/", True, False),
        ("https://[fe80::1]/hook", True, False),
        ("https://[::ffff:169.254.169.254]/", True, False),
        ("https://[fd00:ec2::254]/", True, False),
        ("https://metadata.google.internal/computeMetadata/v1/", True, False),
        ("https://0.0.0.0/hook", True, False),
    ],
)
def test_readable_text_only_goes_to_this_machine_or_a_secured_https_address(
    url, secret, ok
):
    if ok:
        assert check_webhook_url(url, secret) == url
    else:
        with pytest.raises(WebhookError):
            check_webhook_url(url, secret)


@pytest.mark.parametrize(
    "url, secret, message",
    [
        (
            "http://bots.example.com/hook",
            SECRET,
            "Readable text goes over plain http only to this machine",
        ),
        (
            "http://8.8.8.8/hook",
            SECRET,
            "Readable text goes over plain http only to this machine",
        ),
        ("file:///etc/passwd", SECRET, "must be http:// or https:// with a host"),
        (
            "https://user:pass@bots.example.com/hook",
            SECRET,
            "Put no credentials in the webhook URL",
        ),
        (
            "https://169.254.169.254/",
            SECRET,
            "link-local, unspecified or cloud metadata",
        ),
        (
            "https://metadata.google.internal/",
            SECRET,
            "link-local, unspecified or cloud metadata",
        ),
        ("https://bots.example.com/hook", None, "needs a shared secret"),
    ],
)
def test_the_bridge_refuses_unsafe_urls_with_the_reason(url, secret, message):
    # Fails if check_webhook_url returns the URL unchanged: the bridge must refuse at construction.
    with pytest.raises(WebhookError, match=message):
        WebhookBridge(url, secret)
    with pytest.raises(WebhookError, match=message):
        check_webhook_url(url, secret is not None)


def test_a_redirect_is_refused_and_its_target_never_called():
    with Receiver() as target:
        redirect = Receiver(lambda payload: (302, b"", {"Location": target.url}))
        with redirect as receiver, pytest.raises(WebhookError) as refused:
            WebhookBridge(receiver.url).post({"text": "secret words"})
    assert (
        str(refused.value)
        == "The webhook answered with a redirect, which the bridge does not follow"
    )
    assert target.received == []


def test_signatures_and_timestamps():
    body = b'{"text":"hi"}'
    signature = sign(SECRET, 1_800_000_000, body)
    assert signature.startswith("sha256=") and len(signature) == 7 + 64
    assert verify_signature(SECRET, "1800000000", body, signature, now=1_800_000_100)
    assert not verify_signature(
        SECRET, "1800000000", body + b" ", signature, now=1_800_000_100
    )
    assert not verify_signature(
        SECRET + "x", "1800000000", body, signature, now=1_800_000_100
    )
    assert not verify_signature(
        SECRET, "1800000000", body, signature, now=1_800_000_301
    )
    assert not verify_signature(SECRET, "soon", body, signature, now=1_800_000_000)
    assert not verify_signature(SECRET, "1800000000", body, "", now=1_800_000_000)


def test_the_secret_comes_from_one_place_and_is_long_enough(tmp_path):
    assert load_webhook_secret({}) is None
    assert load_webhook_secret({"ALGOCHAT_WEBHOOK_SECRET": SECRET}) == SECRET
    path = tmp_path / "secret"
    path.write_text(SECRET + "\n")
    path.chmod(0o600)
    assert load_webhook_secret({"ALGOCHAT_WEBHOOK_SECRET_FILE": str(path)}) == SECRET
    with pytest.raises(AgentConfigError, match="only one"):
        load_webhook_secret(
            {
                "ALGOCHAT_WEBHOOK_SECRET": SECRET,
                "ALGOCHAT_WEBHOOK_SECRET_FILE": str(path),
            }
        )
    with pytest.raises(AgentConfigError, match="at least 32") as caught:
        load_webhook_secret({"ALGOCHAT_WEBHOOK_SECRET": "short-secret"})
    assert "short-secret" not in str(caught.value)
    path.chmod(0o644)
    with pytest.raises(AgentConfigError, match="chmod 600") as caught:
        load_webhook_secret({"ALGOCHAT_WEBHOOK_SECRET_FILE": str(path)})
    assert SECRET not in str(caught.value)


def test_the_bridge_signs_requests_and_reads_replies(monkeypatch):
    # A proxy in the environment must not be used: the request stays on loopback.
    monkeypatch.setenv("HTTP_PROXY", "http://127.0.0.1:9")
    monkeypatch.setenv("http_proxy", "http://127.0.0.1:9")
    with Receiver(secret=SECRET) as receiver:
        bridge = WebhookBridge(receiver.url, SECRET)
        assert bridge.post({"type": "direct", "text": "ping"}) == "heard: ping"
        assert receiver.bad_signatures == 0
        sent = {k.lower(): v for k, v in receiver.headers[0].items()}
        assert sent[TIMESTAMP_HEADER.lower()] and sent[
            SIGNATURE_HEADER.lower()
        ].startswith("sha256=")
        # A bridge with the wrong secret is refused by the receiver.
        with pytest.raises(WebhookError, match="HTTP 401"):
            WebhookBridge(receiver.url, SECRET[::-1]).post({"text": "x"})
        assert SECRET not in repr(bridge)


@pytest.mark.parametrize(
    "status, body, headers, expected",
    [
        (204, b"", {}, None),
        (200, b"", {}, None),
        (200, b'{"reply": null}', {}, None),
        (200, b'{"reply": ""}', {}, None),
        (200, b'{"reply": "ok \\u2713"}', {}, "ok \u2713"),
        (200, b"plain text", {}, WebhookError),
        (200, b'{"answer": "x"}', {}, WebhookError),
        (200, b'{"reply": 5}', {}, WebhookError),
        (500, b"boom", {}, WebhookError),
        (302, b"", {"Location": "http://example.com/"}, WebhookError),
        (200, b'{"reply": "' + b"x" * 70000 + b'"}', {}, WebhookError),
    ],
)
def test_webhook_answers(status, body, headers, expected):
    with Receiver(lambda payload: (status, body, headers)) as receiver:
        bridge = WebhookBridge(receiver.url)
        if expected is WebhookError:
            with pytest.raises(WebhookError):
                bridge.post({"text": "x"})
        else:
            assert bridge.post({"text": "x"}) == expected


def test_https_checks_the_certificate(tmp_path):
    cert, key = self_signed(tmp_path)
    with Receiver(secret=SECRET, tls=(cert, key)) as receiver:
        trusted = ssl.create_default_context(cafile=str(cert))
        assert (
            WebhookBridge(receiver.url, SECRET, ssl_context=trusted).post(
                {"text": "tls"}
            )
            == "heard: tls"
        )
        with pytest.raises(WebhookError, match="could not be reached"):
            WebhookBridge(receiver.url, SECRET).post({"text": "untrusted"})
        loose = ssl.create_default_context()
        loose.check_hostname = False
        loose.verify_mode = ssl.CERT_NONE
        with pytest.raises(WebhookError, match="certificate must be checked"):
            WebhookBridge(receiver.url, SECRET, ssl_context=loose)
    with pytest.raises(WebhookError, match="needs a shared secret"):
        WebhookBridge("https://bots.example.com/hook")
    with pytest.raises(AgentConfigError, match="at least 32"):
        WebhookBridge("http://127.0.0.1/hook", "short")


async def test_serve_sends_only_what_the_policy_allows_to_the_webhook():
    chain = Ledger()
    clock = Clock(chain)
    room = await _room(chain, BotSettings(BOT_MODE_MENTIONS, 5, 60), other_bot=True)
    bot = await _bot(chain, clock)
    await bot.publish_key()
    person = await _person(chain)
    other = await _person(chain, OTHER_BOT_SEED)
    await _say(chain, person, PERSON_SEED, bot.address, "private hello")
    await _say(chain, other, OTHER_BOT_SEED, bot.address, "private bot hello")
    with Receiver(secret=SECRET) as receiver:
        service = AgentService(bot, webhook=lambda url: WebhookBridge(url, SECRET))
        await bot.sync_rooms()
        await room.post(PERSON_SEED, "no mention")
        asked = await room.post(PERSON_SEED, "@helper weather?")
        await room.post(OTHER_BOT_SEED, "@helper from a bot")
        served = await service.run("serve", {"webhook": receiver.url})
        assert [(p["type"], p["text"]) for p in receiver.received] == [
            ("direct", "private hello"),
            ("room", "@helper weather?"),
        ]
        room_payload = receiver.received[1]
        assert (
            room_payload["mentioned"] is True
            and room_payload["mailbox"] == room.mailbox_address
        )
        assert [r["skipped"] for r in served["direct"]] == [None, SKIP_FROM_BOT]
        assert [r["skipped"] for r in served["rooms"]] == [
            "not-mentioned",
            None,
            SKIP_FROM_BOT,
        ]
        reply = next(r for r in served["rooms"] if r["txid"] == asked.txid)
        assert _read(room, reply["reply_txid"], chain) == "heard: @helper weather?"
        assert receiver.bad_signatures == 0


# --- CLI ------------------------------------------------------------------------


def test_cli_reports_missing_settings_without_leaking_the_key(monkeypatch, capsys):
    from tests.localnet_support import seed_to_mnemonic

    words = seed_to_mnemonic(BOT_SEED)
    for name in list(os.environ):
        if name.startswith("ALGOCHAT_"):
            monkeypatch.delenv(name)
    monkeypatch.setenv("ALGOCHAT_AGENT_MNEMONIC", words)
    assert main(["address"]) == 1
    out = capsys.readouterr()
    assert "ALGOCHAT_ALGOD_URL" in out.err and out.out == ""
    assert words not in out.err
    with pytest.raises(SystemExit) as stop:
        main(["reply", "--txid", "X"])
    assert stop.value.code == 2
    assert "--text" in capsys.readouterr().err


def test_cli_rejects_a_bad_command_declaration(monkeypatch, capsys):
    monkeypatch.setenv("ALGOCHAT_ALGOD_URL", "http://127.0.0.1:1")
    monkeypatch.setenv("ALGOCHAT_INDEXER_URL", "http://127.0.0.1:1")
    assert main(["--command", "Bad Name=x", "address"]) == 1
    assert "command name" in capsys.readouterr().err.lower()


async def test_send_refuses_an_account_a_room_marks_as_a_bot():
    chain = Ledger()
    clock = Clock(chain)
    await _room(chain, BotSettings(BOT_MODE_EVERY_MESSAGE, 5, 60), other_bot=True)
    bot = await _bot(chain, clock)
    await bot.publish_key()
    await _person(chain, OTHER_BOT_SEED)
    # A fresh service, as on a new CLI run: no sync_rooms before send.
    service = AgentService(await _bot(chain, clock))
    before = len(chain.txs)
    with pytest.raises(CommandError, match="another bot"):
        await service.run("send", {"to": address(OTHER_BOT_SEED), "text": "hi"})
    assert len(chain.txs) == before


async def test_a_long_lived_service_reads_the_rooms_again_before_replying():
    chain = Ledger()
    clock = Clock(chain)
    room = await _room(chain, BotSettings(BOT_MODE_EVERY_MESSAGE, 5, 60))
    bot = await _bot(chain, clock)
    await bot.publish_key()
    service = AgentService(bot)
    # Room: the mode changes between read-rooms and reply-room.
    said = await room.post(PERSON_SEED, "plain words")
    [read] = await service.run("read-rooms")
    assert read["txid"] == said.txid and read["skipped"] is None
    await room.admin(
        OWNER_SEED,
        OP_SET_BOT,
        subject=public_key(BOT_SEED),
        bot=BotSettings(BOT_MODE_COMMANDS, 5, 60),
    )
    with pytest.raises(CommandError, match="not-a-command"):
        await service.run("reply-room", {"txid": said.txid, "text": "too late"})
    # One-to-one: the sender is marked as a bot after the message was read.
    stranger_seed = bytes([0x77]) * 32
    stranger = await _person(chain, stranger_seed)
    hello = await _say(chain, stranger, stranger_seed, bot.address, "hi")
    [direct] = await service.run("read")
    assert direct["txid"] == hello.txid and not direct["from_bot"]
    await room.admin(
        OWNER_SEED,
        OP_ADD_BOT,
        subject=public_key(stranger_seed),
        bot=BotSettings(BOT_MODE_EVERY_MESSAGE, 5, 60),
    )
    before = len(chain.txs)
    with pytest.raises(CommandError, match="another bot"):
        await service.run("reply", {"txid": hello.txid, "text": "hello"})
    assert len(chain.txs) == before
