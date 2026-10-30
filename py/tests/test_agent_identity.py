"""The bot's own Raven identity NFT (AGENT-2, AGENT-2.a to AGENT-2.f).

Encoding is checked byte for byte against py-algorand-sdk (a dev-only
dependency). An in-memory asset ledger stands in for algod and the indexer.
Seeds are public test values, not wallets. No test touches a network.
"""

from __future__ import annotations

import base64
import json

import msgpack
import pytest
from algochat.agent import (
    COMMANDS,
    AgentAccount,
    AgentCore,
    AgentService,
    CommandError,
    IdentityError,
    IdentityPicture,
)
from algochat.agent.identity import (
    IDENTITY_FALLBACK_NAME,
    IDENTITY_UNIT_NAME,
    build_identity_note,
    check_emoji,
    decode_identity_note,
    encode_identity_note,
    identity_display_name,
    ipfs_link_pointer,
    make_identity,
    newest_identity_asset,
    nft_picture,
    nft_picture_pointer,
    read_identity,
)
from algochat.blockchain import AccountInfo, SuggestedParams, TransactionInfo
from algochat.transaction import build_asset_config, build_asset_create, sign_payment
from algochat.types import TransactionError
from algosdk import transaction as sdk
from algosdk.encoding import msgpack_encode

from tests.test_agent_direct import BOT_SEED, PERSON_SEED, Chain, _address, _config

BOT = _address(BOT_SEED)
PERSON = _address(PERSON_SEED)
GH = bytes(range(32))
CID = "bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy"


def _params(fee: int = 0) -> SuggestedParams:
    return SuggestedParams(fee, 1000, 100, 1100, "dockernet-v1", GH)


def _sdk_params(fee: int) -> sdk.SuggestedParams:
    return sdk.SuggestedParams(fee=fee, first=100, last=1100, gh=base64.b64encode(GH).decode(), gen="dockernet-v1", flat_fee=True, min_fee=1000)


# --- byte-for-byte with algosdk ---------------------------------------------------


@pytest.mark.parametrize("url", ["", "ipfs://" + CID])
def test_asset_create_matches_algosdk_byte_for_byte(url):
    note = encode_identity_note(build_identity_note(BOT, IdentityPicture.of_emoji("\U0001f98a"), "helper"))
    ours = build_asset_create(
        BOT, total=1, decimals=0, unit_name="RAVEN", asset_name="Raven identity", url=url, manager=BOT, note=note, params=_params()
    )
    theirs = sdk.AssetCreateTxn(
        BOT, _sdk_params(ours["fee"]), total=1, default_frozen=False, unit_name="RAVEN", asset_name="Raven identity",
        manager=BOT, reserve=None, freeze=None, clawback=None, url=url or None, decimals=0, note=note,
    )
    assert ours["fee"] == 1000
    signed = sign_payment(BOT_SEED, ours)
    sk = base64.b64encode(BOT_SEED + AgentAccount.from_seed(BOT_SEED).ed25519_public_key).decode()
    reference = theirs.sign(sk)
    assert signed.txid == theirs.get_txid() == reference.get_txid()
    assert signed.blob == base64.b64decode(msgpack_encode(reference))


def test_asset_config_matches_algosdk_byte_for_byte():
    note = encode_identity_note(build_identity_note(BOT, IdentityPicture("collectible", "ipfs://" + CID, 77), "helper"))
    ours = build_asset_config(BOT, 1234, manager=BOT, note=note, params=_params())
    theirs = sdk.AssetConfigTxn(
        BOT, _sdk_params(ours["fee"]), index=1234, manager=BOT, reserve=None, freeze=None, clawback=None,
        note=note, strict_empty_address_check=False,
    )
    sk = base64.b64encode(BOT_SEED + AgentAccount.from_seed(BOT_SEED).ed25519_public_key).decode()
    reference = theirs.sign(sk)
    signed = sign_payment(BOT_SEED, ours)
    assert signed.txid == reference.get_txid()
    assert signed.blob == base64.b64decode(msgpack_encode(reference))


def test_a_per_byte_fee_is_charged_on_the_signed_size_like_algosdk():
    note = b"x" * 600
    ours = build_asset_config(BOT, 9, manager=BOT, note=note, params=_params(fee=10))
    theirs = sdk.AssetConfigTxn(BOT, sdk.SuggestedParams(10, 100, 1100, base64.b64encode(GH).decode(), "dockernet-v1", min_fee=1000),
                                index=9, manager=BOT, note=note, strict_empty_address_check=False)
    assert ours["fee"] == theirs.fee


def test_asset_fields_over_algorand_limits_are_refused():
    for kwargs in ({"asset_name": "n" * 33}, {"unit_name": "RAVENRAVEN"}, {"url": "ipfs://" + "a" * 90}):
        base = {"unit_name": "RAVEN", "asset_name": "Raven identity", "url": ""}
        base.update(kwargs)
        with pytest.raises(TransactionError):
            build_asset_create(BOT, total=1, decimals=0, manager=BOT, note=b"", params=_params(), **base)
    with pytest.raises(TransactionError):
        build_asset_config(BOT, 1, manager=BOT, note=b"x" * 1025, params=_params())


# --- the note, as Raven writes and reads it ----------------------------------------


def test_emoji_note_is_the_shared_raven_format():
    note = build_identity_note(BOT, IdentityPicture.of_emoji("\U0001f98a"), "helper")
    assert encode_identity_note(note) == (
        '{"standard":"arc69","description":"Raven identity picture","properties":{"raven":'
        '{"address":"' + BOT + '","picture":"emoji","emoji":"\U0001f98a","name":"helper"}}}'
    ).encode()
    assert "media_url" not in note and "sourceAssetId" not in note["properties"]["raven"]


def test_nft_note_matches_ravens_build_identity_note():
    note = build_identity_note(BOT, IdentityPicture("collectible", "ipfs://" + CID, 4242), "helper")
    # JSON.stringify(buildIdentityNote(address, {source: "collectible", mediaUrl, sourceAssetId}, "helper"))
    assert encode_identity_note(note) == (
        '{"standard":"arc69","description":"Raven identity picture","media_url":"ipfs://' + CID + '",'
        '"properties":{"raven":{"address":"' + BOT + '","picture":"collectible","sourceAssetId":4242,"name":"helper"}}}'
    ).encode()


def test_the_name_is_trimmed_to_32_bytes_and_cleaned_like_raven():
    long = "a" * 64  # the longest @name a bot can have
    assert identity_display_name(long) == "a" * 32
    assert identity_display_name("caf\u00e9" * 10) == ("caf\u00e9" * 10).encode()[:32].decode("utf-8", "ignore")
    assert identity_display_name(" a\tb\n\x00c ") == "a b c"
    assert identity_display_name("   ") is None
    note = build_identity_note(BOT, IdentityPicture.of_emoji("\U0001f98a"), long)
    assert len(note["properties"]["raven"]["name"].encode()) == 32
    assert "name" not in build_identity_note(BOT, IdentityPicture.of_emoji("\U0001f98a"), None)["properties"]["raven"]


def test_an_oversized_name_read_back_is_trimmed_not_trusted():
    raw = json.dumps({"standard": "arc69", "properties": {"raven": {"address": BOT, "picture": "emoji", "emoji": "\U0001f98a", "name": "x" * 80}}})
    assert decode_identity_note(raw.encode())["properties"]["raven"]["name"] == "x" * 32


@pytest.mark.parametrize(
    "emoji",
    ["\U0001f98a", "\u2764\ufe0f", "\U0001f44d\U0001f3fd", "\U0001f469\u200d\U0001f4bb", "\U0001f1fa\U0001f1f8", "1\ufe0f\u20e3",
     "\U0001f3f4\U000e0067\U000e0062\U000e0065\U000e006e\U000e0067\U000e007f", "\U0001f468\u200d\U0001f469\u200d\U0001f467\u200d\U0001f466"],
)
def test_one_emoji_is_accepted(emoji):
    assert check_emoji(emoji) == emoji


@pytest.mark.parametrize(
    "value",
    [
        "https://example.com/me.png",  # a link is never a picture
        "ipfs://" + CID,
        "\U0001f98a\U0001f98a",  # two emoji
        "\U0001f44d\U0001f3fd\U0001f44d",
        "\U0001f1fa",  # half a flag
        "ab",
        "",
        "\U0001f468\u200d" * 8 + "\U0001f466",  # one joined sequence over 32 bytes
        "\u200d\U0001f98a",
    ],
)
def test_a_link_text_or_several_emoji_are_refused(value):
    with pytest.raises(IdentityError):
        check_emoji(value)
    with pytest.raises(IdentityError):
        IdentityPicture.of_emoji(value)


def test_decode_reads_only_raven_notes():
    good = encode_identity_note(build_identity_note(BOT, IdentityPicture.of_emoji("\U0001f98a"), "helper"))
    assert decode_identity_note(good)["properties"]["raven"]["emoji"] == "\U0001f98a"
    assert decode_identity_note(b"") is None
    assert decode_identity_note(b"not json") is None
    assert decode_identity_note(json.dumps({"standard": "arc3"}).encode()) is None
    no_media = {"standard": "arc69", "properties": {"raven": {"address": BOT, "picture": "collectible"}}}
    assert decode_identity_note(json.dumps(no_media).encode()) is None
    bad_emoji = {"standard": "arc69", "properties": {"raven": {"address": BOT, "picture": "emoji", "emoji": "hi"}}}
    assert decode_identity_note(json.dumps(bad_emoji).encode()) is None


def test_nft_links_become_raven_pointers_and_nothing_is_fetched():
    assert ipfs_link_pointer(f"https://gateway.example/ipfs/{CID}/a.png?w=100") == f"ipfs://{CID}/a.png"
    assert nft_picture_pointer(f"ipfs://{CID}#arc3") == f"ipfs://{CID}"
    assert nft_picture_pointer("https://example.com/a.png") == "https://example.com/a.png"
    assert nft_picture_pointer("https://example.com/page") is None
    assert nft_picture_pointer("") is None
    assert nft_picture_pointer("https://example.com/" + "a" * 100 + ".png") is None
    # ARC-19: the CID Raven computes from the reserve address (CIDv1, raw, sha2-256).
    reserve = PERSON
    pointer = nft_picture_pointer("template-ipfs://{ipfscid:1:raw:reserve:sha2-256}", reserve)
    from algosdk.encoding import decode_address

    expected = "ipfs://b" + base64.b32encode(bytes([1, 0x55, 0x12, 0x20]) + decode_address(reserve)).decode().lower().rstrip("=")
    assert pointer == expected
    assert nft_picture_pointer("template-ipfs://{ipfscid:0:dag-pb:reserve:sha2-256}", reserve) is None


# --- an in-memory asset ledger --------------------------------------------------------


class AssetLedger(Chain):
    """algod and indexer with assets: creates, configs, holdings and their history."""

    def __init__(self) -> None:
        super().__init__()
        self.assets: dict[int, dict] = {}
        self.holdings: dict[tuple[str, int], int] = {}
        self.history: list[dict] = []
        self.pending: dict[str, dict] = {}
        self.blobs: list[bytes] = []
        self.next_id = 1000
        self.balance = 10_000_000

    async def get_account_info(self, address: str) -> AccountInfo:
        created = sum(1 for a in self.assets.values() if a["creator"] == address and not a.get("deleted"))
        return AccountInfo(address, self.balance, 100_000 * (1 + created))

    async def submit_transaction(self, signed_txn: bytes) -> str:
        self.blobs.append(signed_txn)
        decoded = msgpack.unpackb(signed_txn, raw=False, strict_map_key=False)
        txn = decoded["txn"]
        if txn.get("type") != "acfg":
            return await super().submit_transaction(signed_txn)
        from algochat.transaction import _pack, _sha512_256

        txid = base64.b32encode(_sha512_256(b"TX" + _pack(txn))).decode().rstrip("=")
        sender = _address_of(txn["snd"])
        self.round += 1
        apar = txn.get("apar", {})
        if "caid" in txn:
            asset = self.assets[txn["caid"]]
            assert asset["params"]["manager"] == sender, "only the manager can reconfigure"
            asset_id, index = txn["caid"], None
        else:
            self.next_id += 1
            asset_id = index = self.next_id
            self.assets[asset_id] = {
                "creator": sender,
                "params": {
                    "creator": sender, "total": apar.get("t", 0), "decimals": apar.get("dc", 0),
                    "unit-name": apar.get("un", ""), "name": apar.get("an", ""), "url": apar.get("au", ""),
                    "manager": _address_of(apar["m"]) if "m" in apar else None,
                },
            }
            self.holdings[(sender, asset_id)] = apar.get("t", 0)
        self.history.append({
            "id": txid, "sender": sender, "asset-id": asset_id, "confirmed-round": self.round,
            "intra-round-offset": 0, "note": base64.b64encode(txn.get("note", b"")).decode(),
        })
        self.pending[txid] = {"confirmed-round": self.round, **({"asset-index": index} if index else {})}
        return txid

    def make_nft(self, holder: str, url: str, total: int = 1, decimals: int = 0, unit: str = "ART", reserve: str | None = None) -> int:
        self.next_id += 1
        self.assets[self.next_id] = {
            "creator": PERSON,
            "params": {"creator": PERSON, "total": total, "decimals": decimals, "unit-name": unit, "url": url, "reserve": reserve},
        }
        self.holdings[(holder, self.next_id)] = 1
        return self.next_id

    async def pending_transaction(self, txid):
        return self.pending[txid]

    async def account_created_assets(self, address):
        return [{"index": i, "params": a["params"], "deleted": bool(a.get("deleted"))} for i, a in self.assets.items() if a["creator"] == address]

    async def asset_holding(self, address, asset_id):
        amount = self.holdings.get((address, asset_id))
        return None if amount is None else {"amount": amount, "asset-id": asset_id}

    async def asset_params(self, asset_id):
        asset = self.assets.get(asset_id)
        return None if asset is None else asset["params"]

    async def asset_config_history(self, asset_id):
        return [tx for tx in self.history if tx["asset-id"] == asset_id]

    async def wait_for_confirmation(self, txid: str, rounds: int) -> TransactionInfo:
        return TransactionInfo(txid=txid, confirmed_round=self.round)


def _address_of(public_key: bytes) -> str:
    from algochat.agent.account import address_from_public_key

    return address_from_public_key(public_key)


async def _core(chain: AssetLedger, name: str | None = "helper") -> AgentCore:
    return await AgentCore.create(AgentAccount.from_seed(BOT_SEED), _config(), chain, chain, name=name)


# --- making it, asking again, reading it back ------------------------------------------


async def test_minting_with_an_emoji_makes_ravens_asset_shape():
    chain = AssetLedger()
    core = await _core(chain)
    made = await core.make_identity(emoji="\U0001f98a")
    assert made.minted
    params = chain.assets[made.asset_id]["params"]
    assert params == {
        "creator": BOT, "total": 1, "decimals": 0, "unit-name": IDENTITY_UNIT_NAME, "name": IDENTITY_FALLBACK_NAME,
        "url": "", "manager": BOT,
    }
    raw = msgpack.unpackb(chain.blobs[-1], raw=False, strict_map_key=False)["txn"]
    assert set(raw["apar"]) == {"t", "un", "an", "m"}, "no reserve, freeze, clawback, url or default-frozen"
    found = await core.identity()
    assert (found.asset_id, found.picture, found.emoji, found.name, found.media_url) == (made.asset_id, "emoji", "\U0001f98a", "helper", None)


async def test_minting_with_a_held_nft_points_at_it():
    chain = AssetLedger()
    core = await _core(chain)
    art = chain.make_nft(BOT, f"ipfs://{CID}#arc3")
    made = await core.make_identity(nft=art)
    assert chain.assets[made.asset_id]["params"]["url"] == f"ipfs://{CID}"
    found = await core.identity()
    assert (found.picture, found.media_url, found.source_asset_id) == ("collectible", f"ipfs://{CID}", art)


async def test_asking_again_updates_the_one_identity_instead_of_minting_another():
    chain = AssetLedger()
    core = await _core(chain)
    first = await core.make_identity(emoji="\U0001f98a")
    art = chain.make_nft(BOT, "https://example.com/a.png")
    again = await core.make_identity(nft=art)
    third = await core.make_identity(emoji="\U0001f426")
    assert (again.minted, third.minted) == (False, False)
    assert again.asset_id == third.asset_id == first.asset_id
    assert [a for a in chain.assets.values() if a["creator"] == BOT] == [chain.assets[first.asset_id]]
    found = await core.identity()
    assert (found.picture, found.emoji) == ("emoji", "\U0001f426")
    # A fresh core (another CLI run) finds it on chain and still does not mint.
    fresh = await _core(chain)
    assert (await fresh.make_identity(emoji="\U0001f98a")).minted is False


async def test_with_no_picture_given_the_existing_picture_stays_and_the_name_follows_the_bot():
    chain = AssetLedger()
    await (await _core(chain, name="helper")).make_identity(emoji="\U0001f98a")
    renamed = await (await _core(chain, name="scout")).make_identity()
    assert renamed.note["properties"]["raven"] == {"address": BOT, "picture": "emoji", "emoji": "\U0001f98a", "name": "scout"}
    # Run without a name, the bot keeps the one on its NFT.
    kept = await (await _core(chain, name=None)).make_identity()
    assert kept.note["properties"]["raven"]["name"] == "scout"


async def test_should_reject_bad_pictures_and_mints_nothing():
    chain = AssetLedger()
    core = await _core(chain)
    with pytest.raises(IdentityError):
        await core.make_identity()  # nothing to update, no picture picked
    with pytest.raises(IdentityError):
        await core.make_identity(emoji="https://example.com/me.png")
    with pytest.raises(IdentityError):
        await core.make_identity(emoji="\U0001f98a\U0001f426")
    with pytest.raises(IdentityError, match="does not hold"):
        await core.make_identity(nft=chain.make_nft(PERSON, f"ipfs://{CID}"))  # someone else's NFT
    with pytest.raises(IdentityError, match="does not hold"):
        await core.make_identity(nft=99_999)
    with pytest.raises(IdentityError, match="not an NFT"):
        await core.make_identity(nft=chain.make_nft(BOT, "https://example.com/site", total=1_000_000))
    with pytest.raises(IdentityError, match="not an NFT"):
        await core.make_identity(nft=chain.make_nft(BOT, f"ipfs://{CID}", decimals=2))
    with pytest.raises(IdentityError, match="no picture link"):
        await core.make_identity(nft=chain.make_nft(BOT, "https://example.com/page"))
    with pytest.raises(IdentityError, match="not both"):
        await core.make_identity(emoji="\U0001f98a", nft=1)
    assert chain.assets.keys().isdisjoint(a for a, v in chain.assets.items() if v["creator"] == BOT)
    assert chain.blobs == []


async def test_a_held_nft_must_still_be_held_when_the_picture_is_kept():
    chain = AssetLedger()
    core = await _core(chain)
    art = chain.make_nft(BOT, f"ipfs://{CID}")
    await core.make_identity(nft=art)
    chain.holdings[(BOT, art)] = 0  # sent away
    with pytest.raises(IdentityError, match="does not hold"):
        await core.make_identity()


async def test_a_wallet_without_the_locked_minimum_is_told_before_anything_is_sent():
    chain = AssetLedger()
    chain.balance = 150_000  # 50_000 above the 0.1 ALGO account minimum
    core = await _core(chain)
    with pytest.raises(IdentityError, match="needs 101000 microAlgos"):
        await core.make_identity(emoji="\U0001f98a")
    assert chain.blobs == []


async def test_a_look_alike_by_another_creator_is_ignored():
    chain = AssetLedger()
    person = await AgentCore.create(AgentAccount.from_seed(PERSON_SEED), _config(), chain, chain, name="mimic")
    # Someone else mints a RAVEN asset whose note claims the bot's address.
    forged = encode_identity_note(build_identity_note(BOT, IdentityPicture.of_emoji("\U0001f480"), "helper"))
    await make_identity(chain, PERSON_SEED, PERSON, IdentityPicture.of_emoji("\U0001f480"), "mimic")
    chain.history[-1]["note"] = base64.b64encode(forged).decode()
    core = await _core(chain)
    assert await core.identity() is None
    made = await core.make_identity(emoji="\U0001f98a")
    assert made.minted, "the look-alike does not count as the bot's identity"
    assert (await core.identity()).emoji == "\U0001f98a"
    assert (await person.identity()) is None, "a note naming another address is not the person's either"


async def test_reading_takes_the_newest_self_authored_self_naming_note_on_the_newest_raven_asset():
    good = encode_identity_note(build_identity_note(BOT, IdentityPicture.of_emoji("\U0001f98a"), "helper"))
    newer_other = encode_identity_note(build_identity_note(PERSON, IdentityPicture.of_emoji("\U0001f480"), "x"))

    class Indexer:
        async def account_created_assets(self, address):
            return [
                {"index": 5, "params": {"unit-name": "RAVEN"}},
                {"index": 9, "params": {"unit-name": "OTHER"}},
                {"index": 7, "params": {"unit-name": "RAVEN"}, "deleted": True},
                {"index": 6, "params": {"unitName": "RAVEN"}},
            ]

        async def asset_config_history(self, asset_id):
            assert asset_id == 6
            note = lambda b: base64.b64encode(b).decode()
            return [
                {"id": "A", "sender": BOT, "confirmed-round": 10, "note": note(good)},
                {"id": "B", "sender": BOT, "confirmed-round": 12, "note": note(newer_other)},
                {"id": "C", "sender": PERSON, "confirmed-round": 13, "note": note(good)},
                {"id": "D", "sender": BOT, "confirmed-round": 12, "intra-round-offset": 1, "note": note(b"junk")},
            ]

    found = await read_identity(Indexer(), BOT)
    assert (found.asset_id, found.txid, found.emoji) == (6, "A", "\U0001f98a")
    assert newest_identity_asset([]) is None


async def test_nft_picture_refuses_a_bad_id():
    chain = AssetLedger()
    for bad in (0, -1, True):
        with pytest.raises(IdentityError):
            await nft_picture(chain, BOT, bad)


async def test_the_signed_bytes_never_carry_the_key():
    chain = AssetLedger()
    core = await _core(chain)
    await core.make_identity(emoji="\U0001f98a")
    await core.make_identity(nft=chain.make_nft(BOT, f"ipfs://{CID}"))
    assert len(chain.blobs) == 2
    for blob in chain.blobs:
        assert BOT_SEED not in blob and BOT_SEED.hex().encode() not in blob


async def test_holding_an_identity_never_marks_anyone_a_bot():
    chain = AssetLedger()
    core = await _core(chain)
    await core.make_identity(emoji="\U0001f98a")
    note = (await core.identity())
    assert note is not None
    raven = decode_identity_note(base64.b64decode(chain.history[-1]["note"]))["properties"]["raven"]
    assert set(raven) == {"address", "picture", "emoji", "name"}, "the note has no bot flag"
    assert not core.is_known_bot(BOT) and not core.is_known_bot(PERSON)


# --- the CLI and the MCP tool -----------------------------------------------------------


async def test_identity_commands_are_shared_by_the_cli_and_mcp():
    names = {c.name for c in COMMANDS}
    assert {"identity", "make-identity"} <= names
    chain = AssetLedger()
    service = AgentService(await _core(chain))
    assert await service.run("identity") == {"address": BOT, "identity": None}
    made = await service.run("make_identity", {"emoji": "\U0001f98a"})
    assert made["minted"] and made["picture"] == "emoji" and made["name"] == "helper"
    shown = await service.run("identity")
    assert shown["identity"]["asset_id"] == made["asset_id"]
    with pytest.raises(CommandError):
        await service.run("make-identity", {"emoji": "https://example.com/a.png"})
    with pytest.raises(CommandError):
        await service.run("make-identity", {"nft": "12"})
    with pytest.raises(CommandError):
        await service.run("make-identity", {"picture_url": "https://example.com/a.png"})


async def test_a_core_on_clients_without_asset_reads_says_so():
    chain = Chain()
    core = await AgentCore.create(AgentAccount.from_seed(BOT_SEED), _config(), chain, chain, name="helper")
    with pytest.raises(TypeError, match="read assets"):
        await core.identity()
