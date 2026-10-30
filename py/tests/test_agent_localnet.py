"""
Localnet integration tests for the agent core (AGENT-1.b, AGENT-1.d, AGENT-2, AGENT-4).

These run against a real local Algorand network (algod + indexer + kmd), not
mocks. They are skipped when no localnet is reachable so CI stays green; set
``ALGOCHAT_REQUIRE_LOCALNET=1`` to make a missing localnet fail instead.
See ``py/docs/localnet-testing.md``.

Every account is generated here and funded from the localnet's own KMD
dispenser. No TestNet, MainNet or real funds are involved.
"""

from __future__ import annotations

import asyncio
import base64
import logging
import os
import re
import traceback

import pytest

from algochat.agent import AgentAccount, AgentConfigError, AgentCore
from algochat.agent.config import MNEMONIC_ENV, MNEMONIC_FILE_ENV
from algochat.client import AlgoChat, AlgoChatConfig
from algochat.http_clients import HttpError
from algochat.models import MessageDirection

from .localnet_support import (
    LocalnetAlgod,
    LocalnetIndexer,
    SigningAccount,
    dispenser,
    localnet_status,
    send_payment,
)

_REASON = localnet_status()
if _REASON is not None and os.environ.get("ALGOCHAT_REQUIRE_LOCALNET") == "1":
    raise RuntimeError(f"ALGOCHAT_REQUIRE_LOCALNET=1 but {_REASON}")

pytestmark = [
    pytest.mark.localnet,
    pytest.mark.skipif(_REASON is not None, reason=_REASON or ""),
]

FUND = 10_000_000  # 10 localnet ALGO


def _config() -> AlgoChatConfig:
    config = AlgoChatConfig.localnet()
    config.allow_unverified_keys = False  # only accept keys bound to the address
    return config


def _secret_forms(account: SigningAccount) -> list[str]:
    """Every textual form the key could leak in."""
    seed = account.seed
    words = account.mnemonic.split()
    forms = [
        account.mnemonic,
        seed.hex(),
        base64.b64encode(seed).decode(),
        base64.b32encode(seed).decode().rstrip("="),
        repr(seed),
    ]
    # Any run of three consecutive mnemonic words.
    forms += [" ".join(words[i : i + 3]) for i in range(len(words) - 2)]
    return forms


def _assert_no_secret(text: str, account: SigningAccount) -> None:
    lowered = text.lower()
    for form in _secret_forms(account):
        assert form.lower() not in lowered, (
            "the bot key leaked into an error, repr or log"
        )


def _full_error_text(error: BaseException) -> str:
    return "".join(traceback.format_exception(type(error), error, error.__traceback__))


async def _funded_account(algod: LocalnetAlgod) -> SigningAccount:
    account = SigningAccount.generate()
    await send_payment(algod, dispenser(), account.address, FUND)
    return account


async def _publish_key(core: AgentCore) -> None:
    """Publishes through the library and waits until the indexer has it."""
    txid = await core.publish_key()
    assert txid is not None
    await LocalnetIndexer().wait_for_indexer(txid, 30)
    # One-to-one messages are hybrid only (algochat#63): publish the ML-KEM-768 key too.
    pq_txid = await core.publish_pq_key()
    assert pq_txid is not None
    await LocalnetIndexer().wait_for_indexer(pq_txid, 30)


async def _sync_until(chat: AlgoChat, indexer: LocalnetIndexer, txid: str):
    await indexer.wait_for_indexer(txid, 30)
    messages = await chat.sync()
    return {m.id: m for m in messages}


async def test_bot_account_from_env_mnemonic_matches_funded_localnet_account():
    algod, indexer = LocalnetAlgod(), LocalnetIndexer()
    funded = await _funded_account(algod)

    core = await AgentCore.from_environment(
        _config(), algod, indexer, environ={MNEMONIC_ENV: funded.mnemonic}
    )

    assert core.address == funded.address
    info = await algod.get_account_info(core.address)
    assert info.amount == FUND
    # The seed decoded from the mnemonic signs transactions algod accepts for this address.
    bot_signer = SigningAccount(address=core.address, seed=core.account.seed)
    sent = await send_payment(
        algod, bot_signer, funded.address, 0, b"agent-core localnet self-check"
    )
    assert sent.confirmed_round


async def test_bot_account_from_owner_only_mnemonic_file(tmp_path):
    algod, indexer = LocalnetAlgod(), LocalnetIndexer()
    funded = await _funded_account(algod)
    key_file = tmp_path / "bot.mnemonic"
    key_file.write_text(funded.mnemonic + "\n", encoding="utf-8")
    key_file.chmod(0o600)

    core = await AgentCore.from_environment(
        _config(), algod, indexer, environ={MNEMONIC_FILE_ENV: str(key_file)}
    )
    assert core.address == funded.address

    key_file.chmod(0o644)
    with pytest.raises(AgentConfigError) as caught:
        await AgentCore.from_environment(
            _config(), algod, indexer, environ={MNEMONIC_FILE_ENV: str(key_file)}
        )
    _assert_no_secret(_full_error_text(caught.value), funded)


async def test_bot_sends_and_receives_a_real_message_on_localnet():
    algod, indexer = LocalnetAlgod(), LocalnetIndexer()
    bot_account = await _funded_account(algod)
    human = await _funded_account(algod)

    bot = await AgentCore.from_environment(
        _config(), algod, indexer, environ={MNEMONIC_ENV: bot_account.mnemonic}
    )
    human_core = await AgentCore.create(
        AgentAccount.from_seed(human.seed), _config(), algod, indexer
    )
    human_chat = human_core.chat

    await _publish_key(bot)
    await _publish_key(human_core)

    # Human -> bot.
    hello_txid = await human_core.send_direct(bot.address, "hello bot, are you there?")
    received = await _sync_until(bot.chat, indexer, hello_txid)
    assert received[hello_txid].content == "hello bot, are you there?"
    assert received[hello_txid].sender == human.address
    assert received[hello_txid].direction == MessageDirection.RECEIVED

    # Bot -> human, signed and sent by the library with the key from the bot's mnemonic.
    reply_txid = await bot.send_direct(human.address, "yes, hello from the bot")
    seen_by_human = await _sync_until(human_chat, indexer, reply_txid)
    assert seen_by_human[reply_txid].content == "yes, hello from the bot"
    assert seen_by_human[reply_txid].sender == bot.address
    assert seen_by_human[reply_txid].direction == MessageDirection.RECEIVED

    # The bot also sees its own sent message when it syncs.
    bot_view = await bot.chat.sync()
    sent = [m for m in bot_view if m.id == reply_txid]
    assert sent and sent[0].direction == MessageDirection.SENT
    assert sent[0].content == "yes, hello from the bot"


async def test_errors_reprs_and_logs_never_leak_the_bot_key(tmp_path, caplog):
    caplog.set_level(logging.DEBUG)
    algod, indexer = LocalnetAlgod(), LocalnetIndexer()
    funded = await _funded_account(algod)
    words = funded.mnemonic.split()
    texts: list[str] = []

    core = await AgentCore.from_environment(
        _config(), algod, indexer, environ={MNEMONIC_ENV: funded.mnemonic}
    )
    texts += [
        repr(core),
        str(core),
        repr(core.account),
        str(core.account),
        repr(core.chat),
    ]

    bad_inputs = {
        "checksum": " ".join(
            words[:-1] + [words[0] if words[-1] != words[0] else words[1]]
        ),
        "unknown word": " ".join(words[:-1] + ["notaword"]),
        "too short": " ".join(words[:-1]),
        "both sources": None,
    }
    for phrase in bad_inputs.values():
        environ = (
            {MNEMONIC_ENV: funded.mnemonic, MNEMONIC_FILE_ENV: str(tmp_path / "x")}
            if phrase is None
            else {MNEMONIC_ENV: phrase}
        )
        with pytest.raises(AgentConfigError) as caught:
            await AgentCore.from_environment(_config(), algod, indexer, environ=environ)
        texts.append(_full_error_text(caught.value))

    open_file = tmp_path / "world-readable.mnemonic"
    open_file.write_text(funded.mnemonic, encoding="utf-8")
    open_file.chmod(0o644)
    with pytest.raises(AgentConfigError) as caught:
        await AgentCore.from_environment(_config(), algod, indexer, path=open_file)
    texts.append(_full_error_text(caught.value))

    with pytest.raises(AgentConfigError) as caught:
        AgentAccount.from_seed(funded.seed[:31])
    texts.append(_full_error_text(caught.value))

    # A real node-side failure: an unfunded bot cannot pay its fee.
    broke = SigningAccount.generate()
    broke_core = await AgentCore.from_environment(
        _config(), algod, indexer, environ={MNEMONIC_ENV: broke.mnemonic}
    )
    with pytest.raises(HttpError) as caught:
        await send_payment(
            algod,
            SigningAccount(broke_core.address, broke_core.account.seed),
            funded.address,
            0,
            b"x",
        )
    assert caught.value.status == 400
    _assert_no_secret(_full_error_text(caught.value), broke)

    texts.append(caplog.text)
    for text in texts:
        _assert_no_secret(text, funded)


@pytest.mark.skipif(
    not os.environ.get("ALGOCHAT_LOCALNET_ALGOD_DATA"),
    reason="set ALGOCHAT_LOCALNET_ALGOD_DATA (and put goal on PATH) to cross-check against goal",
)
async def test_mnemonic_decoding_matches_goal_export():
    """Cross-checks the bot's mnemonic decoder against go-algorand's own ``goal``."""
    import shutil
    import subprocess

    goal = shutil.which("goal")
    if goal is None:
        pytest.skip("goal is not on PATH")
    source = dispenser()
    result = await asyncio.to_thread(
        subprocess.run,
        [
            goal,
            "account",
            "export",
            "-a",
            source.address,
            "-d",
            os.environ["ALGOCHAT_LOCALNET_ALGOD_DATA"],
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    # `goal account export` prints the phrase in double quotes; match the 25
    # quoted words wherever they appear so a changed prefix or JSON output still parses.
    found = re.search(r'"((?:[a-z]+ ){24}[a-z]+)"', result.stdout)
    assert found is not None, "goal account export did not print a quoted 25-word mnemonic"
    phrase = found.group(1)
    account = AgentAccount.from_mnemonic(phrase)
    assert account.address == source.address
    assert account.seed == source.seed
