"""
AGENT-5 on LocalNet: a bot reads one-to-one messages and replies by itself.

People write their messages with each implementation's own tool (TypeScript,
Go, Rust, Python, Kotlin), the notes go on a real local chain, and the bot
reads and answers them with ``AgentCore.serve_direct``. Every implementation
then opens every bot note, as recipient and as sender. Swift reads the same
confirmed notes through ``swift test`` (its tool needs macOS 26).

Run with ``ALGOCHAT_REQUIRE_LOCALNET=1`` so a missing network or tool fails
instead of skipping. Build the tools first (see ``tests/cross_tools.py``).
Accounts are throwaway and funded only by the local KMD dispenser.
"""

from __future__ import annotations

import json
import os

import pytest

from algochat.agent import AgentAccount, AgentCore, DirectMessage
from algochat.client import AlgoChatConfig
from algochat.models import MessageDirection

from .cross_tools import MESH, Tool, ToolError, ToolMissing, swift_replay
from .localnet_support import (
    LocalnetAlgod,
    LocalnetIndexer,
    SigningAccount,
    dispenser,
    localnet_status,
    send_payment,
)

REQUIRED = os.environ.get("ALGOCHAT_REQUIRE_LOCALNET") == "1"
_REASON = localnet_status()
if _REASON is not None and REQUIRED:
    raise RuntimeError(f"ALGOCHAT_REQUIRE_LOCALNET=1 but {_REASON}")

pytestmark = [
    pytest.mark.localnet,
    pytest.mark.skipif(_REASON is not None, reason=_REASON or ""),
]

FUND = 10_000_000


def _config() -> AlgoChatConfig:
    config = AlgoChatConfig.localnet()
    config.allow_unverified_keys = False
    return config


def _tools() -> dict[str, Tool]:
    tools: dict[str, Tool] = {}
    missing: list[str] = []
    for lang in MESH:
        try:
            tools[lang] = Tool(lang)
        except ToolMissing as error:
            missing.append(str(error))
    if missing:
        for tool in tools.values():
            tool.close()
        if REQUIRED:
            pytest.fail("cross-language tools missing: " + "; ".join(missing))
        pytest.skip("cross-language tools missing: " + "; ".join(missing))
    return tools


async def _core(account: SigningAccount, algod, indexer) -> AgentCore:
    return await AgentCore.create(AgentAccount.from_seed(account.seed), _config(), algod, indexer)


def _read_everywhere(tools: dict[str, Tool], writer_seed: bytes, reader_seed: bytes, note: bytes, text: str) -> None:
    """Every tool opens ``note`` as both parties and must get exactly ``text``.

    For a section 9.2 reply ``text`` is the reply's own text: each implementation
    parses the JSON payload rather than showing it raw.
    """
    for lang, tool in tools.items():
        try:
            tool.ask("read01", aliceSeed=writer_seed.hex(), bobSeed=reader_seed.hex(), note=note.hex(), text=text)
        except ToolError as error:
            raise AssertionError(f"{lang} could not open the note as {text!r}: {error}") from None


async def test_bot_reads_and_answers_every_language_and_every_language_reads_the_bot(tmp_path):
    algod, indexer = LocalnetAlgod(), LocalnetIndexer()
    source = dispenser()
    bot_account, person_account = SigningAccount.generate(), SigningAccount.generate()
    for account in (bot_account, person_account):
        await send_payment(algod, source, account.address, FUND)

    tools = _tools()
    try:
        bot = await _core(bot_account, algod, indexer)
        person = await _core(person_account, algod, indexer)
        for core in (bot, person):
            txid = await core.publish_key()
            await indexer.wait_for_indexer(txid, 30)
        assert await bot.publish_key() is None, "a second publish of the same key is skipped"

        # 1. Each language writes a message to the bot; it goes on chain from the person.
        asked: dict[str, tuple[str, str]] = {}
        for lang, tool in tools.items():
            text = f"hello from {lang} \u2713 \u00f1 \U0001f680"
            note = bytes.fromhex(tool.ask("write01", aliceSeed=person_account.seed.hex(), bobSeed=bot_account.seed.hex(), text=text)["note"])
            info = await send_payment(algod, person_account, bot.address, 0, note)
            asked[info.txid] = (lang, text)
        await indexer.wait_for_indexer(info.txid, 30)

        # 2. The bot reads them all, oldest first, and answers each one itself.
        def answer(message: DirectMessage) -> str:
            assert message.sender == person.address
            return f"bot heard: {message.text}"

        served = await bot.serve_direct(answer)
        assert [r.message.txid for r in served] == list(asked)
        assert [r.message.text for r in served] == [text for _, text in asked.values()]
        assert all(r.reply_txid and r.error is None for r in served)
        assert await bot.serve_direct(answer) == [], "nothing is answered twice"

        plain_txid = await bot.send_direct(person.address, "a plain note from the bot \U0001f916")
        await indexer.wait_for_indexer(plain_txid, 30)

        # 3. A restarted bot sees its replies on chain and does not answer again.
        restarted = await _core(bot_account, algod, indexer)
        assert await restarted.read_direct() == []

        # 4. The person (Python client) sees each reply with its reply context.
        seen = {m.id: m for m in await person.chat.sync()}
        for result in served:
            got = seen[result.reply_txid]
            assert got.direction == MessageDirection.RECEIVED and got.sender == bot.address
            assert got.content == f"bot heard: {result.message.text}"
            assert got.reply_context.message_id == result.message.txid
            assert got.reply_context.preview == result.message.text

        # 5. Every language opens every bot note from the chain, as person and as bot.
        record = {"bot_seed": bot_account.seed.hex(), "person_seed": person_account.seed.hex(), "notes": []}
        bot_notes = [(r.reply_txid, r.message, f"bot heard: {r.message.text}") for r in served]
        bot_notes.append((plain_txid, None, "a plain note from the bot \U0001f916"))
        for txid, cited, text in bot_notes:
            tx = await indexer.get_transaction(txid)
            assert tx.sender == bot.address and tx.receiver == person.address
            _read_everywhere(tools, bot_account.seed, person_account.seed, tx.note, text)
            record["notes"].append({
                "name": txid,
                "note": tx.note.hex(),
                "text": text,
                "reply_to": cited.txid if cited else None,
                "reply_preview": cited.text if cited else None,
            })
        # The person's messages too, as each language wrote them.
        for txid, (lang, text) in asked.items():
            tx = await indexer.get_transaction(txid)
            _read_everywhere(tools, person_account.seed, bot_account.seed, tx.note, text)
            record["notes"].append({"name": f"{lang}:{txid}", "note": tx.note.hex(), "text": text, "reply_to": None, "reply_preview": None})

        # 6. Swift opens the same confirmed notes.
        record_path, done_path = tmp_path / "dm-record.json", tmp_path / "dm-done"
        record_path.write_text(json.dumps(record, ensure_ascii=False), encoding="utf-8")
        try:
            run = swift_replay(record_path, done_path)
        except ToolMissing as error:
            if REQUIRED:
                pytest.fail(str(error))
            pytest.skip(str(error))
        assert run.returncode == 0, (run.stdout + run.stderr)[-4000:]
        assert done_path.read_text().strip() == str(len(record["notes"])), "the Swift replay test did not run"
    finally:
        for tool in tools.values():
            tool.close()


async def test_bot_reads_a_long_history_across_indexer_pages():
    """More messages than one indexer page, so reading must follow next tokens."""
    algod, indexer = LocalnetAlgod(), LocalnetIndexer()
    source = dispenser()
    bot_account, person_account = SigningAccount.generate(), SigningAccount.generate()
    for account in (bot_account, person_account):
        await send_payment(algod, source, account.address, FUND)
    bot = await _core(bot_account, algod, indexer)
    person = await _core(person_account, algod, indexer)
    for core in (bot, person):
        await indexer.wait_for_indexer(await core.publish_key(), 30)

    from algochat import http_clients

    sent = [await person.send_direct(bot.address, f"message {n}") for n in range(7)]
    await indexer.wait_for_indexer(sent[-1], 30)
    page, http_clients.INDEXER_PAGE_LIMIT = http_clients.INDEXER_PAGE_LIMIT, 3
    try:
        messages = await bot.read_direct()
    finally:
        http_clients.INDEXER_PAGE_LIMIT = page
    assert [m.txid for m in messages] == sent
    assert [m.text for m in messages] == [f"message {n}" for n in range(7)]
