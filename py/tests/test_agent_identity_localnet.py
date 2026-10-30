"""AGENT-2.a to AGENT-2.f on LocalNet: the bot's own Raven identity NFT.

The bot mints its identity with an emoji, switches it to an NFT its wallet
holds, and asks again; it stays one asset, read back the way Raven reads it
(created assets, then the newest self-authored note naming the address). A
look-alike asset someone else made is ignored. The identity never makes an
account a bot in a room, and a bot without one still answers. The CLI and the
MCP server do the same with the mnemonic only in their environment, and no
HTTP call the library makes carries the key.

Other accounts' assets are set up with py-algorand-sdk (a dev dependency);
the bot's own transactions go through the library. Accounts are throwaway
and funded only by the local KMD dispenser. No TestNet, MainNet or real funds.
"""

from __future__ import annotations

import base64
import json
import urllib.request

import msgpack
import pytest
from algochat import http_clients
from algochat.agent import IdentityError
from algochat.agent.identity import IDENTITY_MIN_BALANCE, decode_identity_note
from algochat.group_admin import (
    BOT_MODE_EVERY_MESSAGE,
    OP_ADD_BOT,
    OP_ADD_MEMBER,
    OP_CREATE,
    BotSettings,
)
from algosdk import transaction as sdk
from algosdk.encoding import decode_address, msgpack_encode

from .localnet_support import LocalnetHTTPError, SigningAccount, algod_get, indexer_get
from .room_support import public_key
from .test_agent_adapters_localnet import Bot
from .test_agent_localnet import _assert_no_secret, _secret_forms
from .test_agent_rooms_localnet import _REASON, Harness, _core

pytestmark = [
    pytest.mark.localnet,
    pytest.mark.skipif(_REASON is not None, reason=_REASON or ""),
]

CID = "bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy"
FOX, BIRD, ROBOT = "\U0001f98a", "\U0001f426", "\U0001f916"


def _sk(account: SigningAccount) -> str:
    from algochat.agent import AgentAccount

    return base64.b64encode(account.seed + AgentAccount.from_seed(account.seed).ed25519_public_key).decode()


async def _sdk_send(harness: Harness, account: SigningAccount, make) -> tuple[str, dict]:
    """Signs an algosdk transaction for a test account and waits for it."""
    params = await harness.algod.get_suggested_params()
    sp = sdk.SuggestedParams(
        0, params.first_valid, params.last_valid, base64.b64encode(params.genesis_hash).decode(), params.genesis_id,
        flat_fee=True, min_fee=1000,
    )
    sp.fee = 1000
    txn = make(sp)
    txid = await harness.algod.submit_transaction(base64.b64decode(msgpack_encode(txn.sign(_sk(account)))))
    await harness.algod.wait_for_confirmation(txid, 10)
    return txid, algod_get(f"/v2/transactions/pending/{txid}")


async def _give_nft(harness: Harness, artist: SigningAccount, to: SigningAccount, url: str, reserve: str | None = None) -> int:
    """The artist makes a 1-of-1 picture NFT; ``to`` opts in and receives it."""
    _, made = await _sdk_send(harness, artist, lambda sp: sdk.AssetCreateTxn(
        artist.address, sp, total=1, default_frozen=False, unit_name="ART", asset_name="Art", manager=artist.address,
        reserve=reserve, freeze=None, clawback=None, url=url, decimals=0,
    ))
    asset = made["asset-index"]
    await _sdk_send(harness, to, lambda sp: sdk.AssetOptInTxn(to.address, sp, asset))
    await _sdk_send(harness, artist, lambda sp: sdk.AssetTransferTxn(artist.address, sp, to.address, 1, asset))
    return asset


async def _wait_indexed(harness: Harness, txid: str) -> None:
    import asyncio

    for _ in range(60):
        try:
            if indexer_get(f"/v2/transactions/{txid}").get("transaction"):
                return
        except LocalnetHTTPError as error:
            assert error.status == 404, error  # anything but "not indexed yet" is a failure
        await asyncio.sleep(0.5)
    raise AssertionError(f"the indexer never saw {txid}")


class Wire:
    """Records every URL and body the library's HTTP clients send."""

    def __init__(self, monkeypatch) -> None:
        self.calls: list[tuple[str, bytes]] = []
        real = urllib.request.urlopen

        def recording(request, *args, **kwargs):
            self.calls.append((request.full_url, request.data or b""))
            return real(request, *args, **kwargs)

        monkeypatch.setattr(http_clients.urllib.request, "urlopen", recording)

    def sent_by(self, account: SigningAccount, since: int = 0) -> list[dict]:
        """The transactions ``account`` submitted through the library since call number ``since``."""
        txns = [
            msgpack.unpackb(body, raw=False, strict_map_key=False)["txn"]
            for url, body in self.calls[since:]
            if url.endswith("/v2/transactions") and body
        ]
        return [t for t in txns if t["snd"] == decode_address(account.address)]

    def assert_clean(self, account: SigningAccount) -> None:
        assert self.calls, "nothing was recorded"
        for url, body in self.calls:
            assert account.seed not in body
            _assert_no_secret(url + "\n" + body.decode("latin-1"), account)
            for form in _secret_forms(account):
                assert form.encode() not in body


async def test_the_bots_identity_nft_on_localnet(monkeypatch):
    harness = Harness({})
    bot_account, artist, mimic = await harness.account(), await harness.account(), await harness.account()
    bot = await _core(bot_account, harness, name="helper")
    wire = Wire(monkeypatch)
    before = algod_get(f"/v2/accounts/{bot_account.address}?exclude=all")
    assert await bot.identity() is None

    # 1. AGENT-2.a/b/c: the bot's wallet mints a 1-of-1 RAVEN asset with an emoji and its @name.
    made = await bot.make_identity(emoji=FOX)
    assert made.minted and made.asset_id > 0
    after = algod_get(f"/v2/accounts/{bot_account.address}?exclude=all")
    assert after["min-balance"] - before["min-balance"] == IDENTITY_MIN_BALANCE
    paid = algod_get(f"/v2/transactions/pending/{made.txid}")["txn"]["txn"]
    assert (paid["snd"], paid["fee"], paid["type"]) == (bot_account.address, 1000, "acfg"), "the bot's own wallet paid"
    assert after["amount"] < before["amount"]  # less the fee (localnet rewards can add a few microAlgos)
    params = algod_get(f"/v2/assets/{made.asset_id}")["params"]
    assert {k: params.get(k) for k in ("creator", "total", "decimals", "unit-name", "name", "manager")} == {
        "creator": bot_account.address, "total": 1, "decimals": 0, "unit-name": "RAVEN", "name": "Raven identity",
        "manager": bot_account.address,
    }
    assert not any(params.get(k) for k in ("reserve", "freeze", "clawback", "url", "default-frozen"))
    await _wait_indexed(harness, made.txid)
    found = await bot.identity()
    assert (found.asset_id, found.picture, found.emoji, found.name) == (made.asset_id, "emoji", FOX, "helper")
    # Read the raw note straight off the indexer, as Raven does.
    [tx] = indexer_get(f"/v2/transactions?asset-id={made.asset_id}&tx-type=acfg")["transactions"]
    assert json.loads(base64.b64decode(tx["note"]))["properties"]["raven"] == {
        "address": bot_account.address, "picture": "emoji", "emoji": FOX, "name": "helper"
    }
    assert "media_url" not in json.loads(base64.b64decode(tx["note"]))

    # The locked 0.1 ALGO is not counted as spendable, and the low-funds logic ignores it.
    status = await bot.check_funds()
    assert status.spendable == after["amount"] - after["min-balance"]

    # 2. AGENT-2.c/d: switching to a held NFT updates the same asset; no second NFT.
    art = await _give_nft(harness, artist, bot_account, f"ipfs://{CID}#arc3")
    switched = await bot.make_identity(nft=art)
    assert (switched.minted, switched.asset_id) == (False, made.asset_id)
    await _wait_indexed(harness, switched.txid)
    found = await bot.identity()
    assert (found.picture, found.media_url, found.source_asset_id) == ("collectible", f"ipfs://{CID}", art)
    assert algod_get(f"/v2/assets/{made.asset_id}")["params"].get("url") is None, "the asset url is set once, at mint"

    # An ARC-19 NFT: the pointer is the CID Raven derives from the reserve address.
    arc19 = await _give_nft(harness, artist, bot_account, "template-ipfs://{ipfscid:1:raw:reserve:sha2-256}", reserve=mimic.address)
    again = await (await _core(bot_account, harness, name="helper")).make_identity(nft=arc19)
    assert (again.minted, again.asset_id) == (False, made.asset_id)
    assert again.note["media_url"].startswith("ipfs://b") and again.note["properties"]["raven"]["sourceAssetId"] == arc19

    # Asking again with an emoji from a fresh core: still one RAVEN asset.
    last = await (await _core(bot_account, harness, name="helper")).make_identity(emoji=BIRD)
    assert (last.minted, last.asset_id) == (False, made.asset_id)
    await _wait_indexed(harness, last.txid)
    created = algod_get(f"/v2/accounts/{bot_account.address}")["created-assets"]
    assert [a["index"] for a in created] == [made.asset_id]
    assert (await bot.identity()).emoji == BIRD
    assert len(indexer_get(f"/v2/transactions?asset-id={made.asset_id}&tx-type=acfg")["transactions"]) == 4

    # 3. Should-reject: a link, two emoji, an NFT the bot does not hold; nothing is sent.
    sent = len(wire.calls)
    for bad in ("https://example.com/me.png", FOX + BIRD):
        with pytest.raises(IdentityError):
            await bot.make_identity(emoji=bad)
    not_held = await _give_nft(harness, artist, mimic, f"ipfs://{CID}")
    with pytest.raises(IdentityError, match="does not hold"):
        await bot.make_identity(nft=not_held)
    assert wire.sent_by(bot_account, since=sent) == [], "the bot submitted nothing"

    # 4. A look-alike: another creator's RAVEN asset whose note names the bot is ignored.
    forged = dict(decode_identity_note(base64.b64decode(tx["note"])))
    forged["properties"] = {"raven": {**forged["properties"]["raven"], "emoji": ROBOT}}
    note = json.dumps(forged, separators=(",", ":"), ensure_ascii=False).encode()
    look, _ = await _sdk_send(harness, mimic, lambda sp: sdk.AssetCreateTxn(
        mimic.address, sp, total=1, default_frozen=False, unit_name="RAVEN", asset_name="Raven identity",
        manager=mimic.address, reserve=None, freeze=None, clawback=None, decimals=0, note=note,
    ))
    await _wait_indexed(harness, look)
    assert (await bot.identity()).emoji == BIRD
    mimic_core = await _core(mimic, harness, name="mimic")
    assert await mimic_core.identity() is None, "the note names someone else"

    # 5. AGENT-2.f: the bot made one asset and three updates (its other sends are the test's opt-ins),
    # and no call the library made carried the key in any form.
    configs = [t.get("caid", 0) for t in wire.sent_by(bot_account) if t["type"] == "acfg"]
    assert configs == [0] + [made.asset_id] * 3
    wire.assert_clean(bot_account)


async def test_an_identity_never_makes_an_account_a_bot_and_a_bot_without_one_still_answers():
    harness = Harness({})
    owner = await harness.account()
    holder_account = await harness.account()
    helper_account = await harness.account()
    mailbox = await harness.account()
    holder = await _core(holder_account, harness, name="holder")
    made = await holder.make_identity(emoji=ROBOT)
    await _wait_indexed(harness, made.txid)
    helper = await _core(helper_account, harness, name="helper")
    assert await helper.identity() is None

    # The holder joins as a plain member; the helper bot (no identity NFT) is added as a bot.
    room = harness.room(mailbox)
    await room.admin(owner.seed, OP_CREATE, name="identity \u2713")
    await room.admin(owner.seed, OP_ADD_MEMBER, subject=public_key(holder_account.seed))
    add = await room.admin(owner.seed, OP_ADD_BOT, subject=public_key(helper_account.seed), bot=BotSettings(BOT_MODE_EVERY_MESSAGE, 5, 60))
    await room.deliver(owner.seed, helper_account.seed, add)
    await helper.sync_rooms()
    asked = await room.post(holder_account.seed, f"hello from an account with an identity {ROBOT}")

    served = await helper.serve_rooms(lambda message: f"heard: {message.text}")
    assert [(r.message.txid, r.message.from_bot, r.skipped) for r in served] == [(asked.txid, False, None)]
    assert served[0].txid, "the bot without an identity NFT answered"
    assert not helper.is_known_bot(holder_account.address), "holding the identity NFT did not make it a bot"
    assert [b.account for b in room.state().bots] == [public_key(helper_account.seed)]


async def test_the_cli_and_mcp_make_and_show_the_identity():
    harness = Harness({})
    bot_account, artist = await harness.account(), await harness.account()
    bot = Bot(bot_account)
    try:
        assert bot.cli("identity") == {"address": bot_account.address, "identity": None}
        made = bot.cli("make-identity", "--emoji", FOX)
        assert made["minted"] and made["picture"] == "emoji" and made["emoji"] == FOX and made["name"] == "helper"
        assert "exactly one emoji" in bot.cli("make-identity", "--emoji", "https://example.com/a.png", ok=False)
        await _wait_indexed(harness, made["txid"])
        shown = bot.cli("identity")["identity"]
        assert (shown["asset_id"], shown["emoji"], shown["name"]) == (made["asset_id"], FOX, "helper")

        art = await _give_nft(harness, artist, bot_account, "https://example.com/art.png")
        bot.start_mcp()
        tools = {t["name"] for t in bot.rpc("tools/list")["tools"]}
        assert {"identity", "make_identity"} <= tools
        error, updated = bot.tool("make_identity", nft=art)
        assert not error and (updated["minted"], updated["asset_id"]) == (False, made["asset_id"])
        assert updated["media_url"] == "https://example.com/art.png"
        error, text = bot.tool("make_identity", nft=art + 999)
        assert error and "does not hold" in text
        await _wait_indexed(harness, updated["txid"])
        error, shown = bot.tool("identity")
        assert not error and shown["identity"]["picture"] == "collectible" and shown["identity"]["source_asset_id"] == art
        bot.close()
        created = algod_get(f"/v2/accounts/{bot_account.address}")["created-assets"]
        assert [a["index"] for a in created] == [made["asset_id"]]
    finally:
        if bot.mcp is not None:
            bot.mcp.kill()
        _assert_no_secret("\n".join(bot.output), bot_account)
