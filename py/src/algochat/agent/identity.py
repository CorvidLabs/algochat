"""
The bot's own Raven identity NFT (AGENT-2, AGENT-2.a to AGENT-2.f).

It is the same identity NFT a person makes in Raven (Raven 0.20.2,
``src/app/core/utils/identity-asset.ts``), so Raven finds and shows it like
anyone else's: a 1 of 1 asset (total 1, decimals 0) with unit name ``RAVEN``,
created and managed by the bot's own account, with no reserve, freeze or
clawback. Its ARC-69 note says which address it belongs to, which picture it
shows and the bot's public name. The bot's own wallet pays the fee and holds
the 0.1 ALGO minimum balance the asset locks.

The picture is an NFT the bot's wallet holds or one emoji, never an uploaded
image or a link the operator types. The public name is the bot's ``@name``,
trimmed to 32 bytes. A bot has one identity NFT: asking again rewrites the
existing one's note with an asset config instead of creating another.

Reading it back follows Raven: the newest undeleted asset with unit ``RAVEN``
the address created, then the newest asset config on it that the address sent
and whose note names that address. A look-alike made by anyone else never
counts. Nothing here makes an account a bot: only a room's owner or admin
does that, in the room's record (AGENT-2.e, AGENT-7.b). Transactions are
signed on this machine; only the signed bytes are sent (AGENT-2.f).
"""

from __future__ import annotations

import base64
import json
import re
import urllib.parse
from dataclasses import dataclass
from typing import Any, Protocol, runtime_checkable

from ..blockchain import SuggestedParams, TransactionInfo, _decode_algorand_address
from ..transaction import build_asset_config, build_asset_create, sign_payment

IDENTITY_UNIT_NAME = "RAVEN"
"""Unit name on every Raven identity asset."""

IDENTITY_FALLBACK_NAME = "Raven identity"
"""Asset name when the account has no .algo name; a bot has none."""

IDENTITY_DESCRIPTION = "Raven identity picture"
"""The ARC-69 ``description`` Raven writes."""

IDENTITY_MIN_BALANCE = 100_000
"""MicroAlgos one created asset locks in the bot's minimum balance while it exists."""

ASSET_URL_MAX_BYTES = 96
NAME_MAX_BYTES = 32
EMOJI_MAX_BYTES = 32
NOTE_MAX_BYTES = 1024
EDITION_MAX_TOTAL = 100_000
"""Largest supply Raven still treats as an edition (a picture) rather than a token."""

PICTURE_COLLECTIBLE = "collectible"
PICTURE_EMOJI = "emoji"


class IdentityError(ValueError):
    """The identity NFT cannot be made or updated as asked. The message is for the operator."""


# --- names, links and emoji -----------------------------------------------------


def _utf8_len(value: str) -> int:
    return len(value.encode("utf-8"))


def _byte_trim(value: str, limit: int) -> str:
    """Trims to at most ``limit`` UTF-8 bytes without splitting a code point (Raven's ``byteTrim``)."""
    if _utf8_len(value) <= limit:
        return value
    result = ""
    for character in value:
        if _utf8_len(result + character) > limit:
            break
        result += character
    return result


_CONTROL = re.compile("[\u0000-\u001f\u007f]")
_SPACES = re.compile(r"\s+")


def identity_display_name(name: str | None) -> str | None:
    """The name for the note, as Raven's ``identityDisplayName`` cleans it, or None when blank."""
    cleaned = _SPACES.sub(" ", _CONTROL.sub(" ", name or "")).strip()
    if not cleaned:
        return None
    trimmed = _byte_trim(cleaned, NAME_MAX_BYTES)
    return trimmed or None


_CID = re.compile(r"^(?:Qm[1-9A-HJ-NP-Za-km-z]{44}|baf[a-z2-7]{55,})$")


def ipfs_link_pointer(link: str) -> str | None:
    """``ipfs://<cid>[/path]`` for a link naming IPFS content, else None (Raven's ``ipfsLinkPointer``)."""
    trimmed = link.strip()
    if not trimmed:
        return None
    if trimmed.startswith("ipfs://"):
        rest: str | None = re.sub(r"^ipfs/", "", trimmed[len("ipfs://"):])
    elif _CID.match(trimmed):
        rest = trimmed
    else:
        parsed = urllib.parse.urlsplit(trimmed)
        if parsed.scheme != "https" or not parsed.netloc:
            return None
        match = re.match(r"^/ipfs/(.+)$", parsed.path)
        rest = match.group(1) if match else None
    if not rest:
        return None
    cleaned = re.sub(r"/+$", "", re.split(r"[?#]", rest)[0])
    cid, *path = cleaned.split("/")
    if not cid or not _CID.match(cid):
        return None
    return f"ipfs://{cid}/{'/'.join(path)}" if path else f"ipfs://{cid}"


_ARC19_PREFIX = "template-ipfs://"
_ARC19_RAW = "{ipfscid:1:raw:reserve:sha2-256}"
_IMAGE_EXTENSION = re.compile(r"\.(png|jpe?g|gif|webp|avif|svg|bmp)$", re.IGNORECASE)
_IMAGE_POINTER = re.compile(r"^#i(?:$|@)", re.IGNORECASE)


def is_media_url(url: str) -> bool:
    """Whether an asset ``url`` points at media (Raven's ``isMediaUrl``)."""
    trimmed = url.strip()
    if not trimmed:
        return False
    if trimmed.startswith(("ipfs://", "ar://", _ARC19_PREFIX)):
        return True
    hash_index = trimmed.find("#")
    if hash_index != -1 and _IMAGE_POINTER.match(trimmed[hash_index:]):
        return True
    if ipfs_link_pointer(trimmed) is not None:
        return True
    parsed = urllib.parse.urlsplit(trimmed)
    if parsed.scheme != "https" or not parsed.hostname:
        return False
    if parsed.hostname == "arweave.net" or parsed.hostname.endswith(".arweave.net"):
        return True
    return bool(_IMAGE_EXTENSION.search(parsed.path))


def _arc19_pointer(url: str, reserve: str | None) -> str | None:
    """The ``ipfs://`` CID an ARC-19 raw sha2-256 template names, as Raven computes it."""
    if _ARC19_RAW not in url or not reserve:
        return None
    try:
        digest = _decode_algorand_address(reserve)
    except ValueError:
        return None
    cid = bytes([0x01, 0x55, 0x12, 0x20]) + digest
    return "ipfs://b" + base64.b32encode(cid).decode().lower().rstrip("=")


def nft_picture_pointer(url: str, reserve: str | None = None) -> str | None:
    """The pointer an identity stores for an NFT's on-chain ``url``, or None when none fits.

    An ARC-19 template resolves to its CID; IPFS content is stored as
    ``ipfs://<cid>``; any other media link is kept as it is when it fits
    Algorand's 96-byte ``url`` limit (Raven's ``identityPicturePointer``).
    Nothing is fetched.
    """
    trimmed = url.strip()
    if trimmed.startswith(_ARC19_PREFIX):
        pointer = _arc19_pointer(trimmed, reserve)
        return pointer if pointer and _utf8_len(pointer) <= ASSET_URL_MAX_BYTES else None
    if not is_media_url(trimmed):
        return None
    ipfs = ipfs_link_pointer(trimmed)
    if ipfs and _utf8_len(ipfs) <= ASSET_URL_MAX_BYTES:
        return ipfs
    return trimmed if _utf8_len(trimmed) <= ASSET_URL_MAX_BYTES else None


# Extended_Pictographic as ranges: Unicode emoji-data.txt, the same set
# ``\p{Extended_Pictographic}`` matches in V8/ICU (Node 20, Chrome).
_PICTOGRAPHIC = (
    (0x00A9, 0x00A9), (0x00AE, 0x00AE), (0x203C, 0x203C), (0x2049, 0x2049),
    (0x2122, 0x2122), (0x2139, 0x2139), (0x2194, 0x2199), (0x21A9, 0x21AA),
    (0x231A, 0x231B), (0x2328, 0x2328), (0x2388, 0x2388), (0x23CF, 0x23CF),
    (0x23E9, 0x23F3), (0x23F8, 0x23FA), (0x24C2, 0x24C2), (0x25AA, 0x25AB),
    (0x25B6, 0x25B6), (0x25C0, 0x25C0), (0x25FB, 0x25FE), (0x2600, 0x2605),
    (0x2607, 0x2612), (0x2614, 0x2685), (0x2690, 0x2705), (0x2708, 0x2712),
    (0x2714, 0x2714), (0x2716, 0x2716), (0x271D, 0x271D), (0x2721, 0x2721),
    (0x2728, 0x2728), (0x2733, 0x2734), (0x2744, 0x2744), (0x2747, 0x2747),
    (0x274C, 0x274C), (0x274E, 0x274E), (0x2753, 0x2755), (0x2757, 0x2757),
    (0x2763, 0x2767), (0x2795, 0x2797), (0x27A1, 0x27A1), (0x27B0, 0x27B0),
    (0x27BF, 0x27BF), (0x2934, 0x2935), (0x2B05, 0x2B07), (0x2B1B, 0x2B1C),
    (0x2B50, 0x2B50), (0x2B55, 0x2B55), (0x3030, 0x3030), (0x303D, 0x303D),
    (0x3297, 0x3297), (0x3299, 0x3299), (0x1F000, 0x1F0FF), (0x1F10D, 0x1F10F),
    (0x1F12F, 0x1F12F), (0x1F16C, 0x1F171), (0x1F17E, 0x1F17F), (0x1F18E, 0x1F18E),
    (0x1F191, 0x1F19A), (0x1F1AD, 0x1F1E5), (0x1F201, 0x1F20F), (0x1F21A, 0x1F21A),
    (0x1F22F, 0x1F22F), (0x1F232, 0x1F23A), (0x1F23C, 0x1F23F), (0x1F249, 0x1F3FA),
    (0x1F400, 0x1F53D), (0x1F546, 0x1F64F), (0x1F680, 0x1F6FF), (0x1F774, 0x1F77F),
    (0x1F7D5, 0x1F7FF), (0x1F80C, 0x1F80F), (0x1F848, 0x1F84F), (0x1F85A, 0x1F85F),
    (0x1F888, 0x1F88F), (0x1F8AE, 0x1F8FF), (0x1F90C, 0x1F93A), (0x1F93C, 0x1F945),
    (0x1F947, 0x1FAFF), (0x1FC00, 0x1FFFD),
)
_ZWJ = 0x200D
_VS16 = 0xFE0F
_KEYCAP = 0x20E3
# Emoji_Component code points other than ZWJ, VS16 and the keycap mark.
_COMPONENT = (
    (0x0023, 0x0023), (0x002A, 0x002A), (0x0030, 0x0039), (0x1F1E6, 0x1F1FF),
    (0x1F3FB, 0x1F3FF), (0x1F9B0, 0x1F9B3), (0xE0020, 0xE007F),
)


def _pictographic(cp: int) -> bool:
    return any(low <= cp <= high for low, high in _PICTOGRAPHIC)


def _regional(cp: int) -> bool:
    return 0x1F1E6 <= cp <= 0x1F1FF


def _emoji_part(cp: int) -> bool:
    """Raven's ``EMOJI_PART``: Extended_Pictographic, Emoji_Component, ZWJ, VS16 or the keycap mark."""
    return cp in (_ZWJ, _VS16, _KEYCAP) or _pictographic(cp) or any(low <= cp <= high for low, high in _COMPONENT)


def _extend(cp: int) -> bool:
    """Grapheme_Cluster_Break=Extend among emoji parts: VS16, the keycap mark, skin tones and tags."""
    return cp in (_VS16, _KEYCAP) or 0x1F3FB <= cp <= 0x1F3FF or 0xE0020 <= cp <= 0xE007F


def _grapheme_count(cps: list[int]) -> int:
    """Extended grapheme clusters (UAX #29) in a string of emoji parts only.

    Among these code points the rules that apply are GB9 (no break before
    Extend or ZWJ), GB11 (an emoji, Extend*, ZWJ, then an emoji stay joined),
    GB12/GB13 (regional indicators pair up) and GB999 (break otherwise), so this
    counts what ``Intl.Segmenter`` counts for them.
    """
    count = 0
    regional_run = 0
    for index, cp in enumerate(cps):
        joined = False
        if index > 0:
            prev = cps[index - 1]
            if _extend(cp) or cp == _ZWJ:
                joined = True
            elif _pictographic(cp) and prev == _ZWJ:
                back = index - 2
                while back >= 0 and _extend(cps[back]):
                    back -= 1
                joined = back >= 0 and _pictographic(cps[back])
            elif _regional(cp) and _regional(prev) and regional_run % 2 == 1:
                joined = True
        if not joined:
            count += 1
        regional_run = regional_run + 1 if _regional(cp) else 0
    return count


def is_one_emoji(value: object) -> bool:
    """Raven's ``identityEmoji`` rule: whether ``value`` is exactly one emoji.

    One grapheme cluster of at most 32 UTF-8 bytes, made only of emoji code
    points, with at least one pictograph or keycap mark, or a two-letter flag.
    Nothing is trimmed or repaired.
    """
    if not isinstance(value, str) or not value:
        return False
    if _utf8_len(value) > EMOJI_MAX_BYTES:
        return False
    cps = [ord(c) for c in value]
    if not all(_emoji_part(cp) for cp in cps):
        return False
    if _grapheme_count(cps) != 1:
        return False
    flag = len(cps) == 2 and all(_regional(cp) for cp in cps)
    return flag or any(_pictographic(cp) or cp == _KEYCAP for cp in cps)


def check_emoji(value: str) -> str:
    """Returns ``value`` unchanged when it is one emoji the way Raven counts one.

    Raises :class:`IdentityError` for text, a link, more than one emoji, spaces
    around it, or more than 32 UTF-8 bytes.
    """
    if not isinstance(value, str) or not value:
        raise IdentityError("Give one emoji for the picture")
    if _utf8_len(value) > EMOJI_MAX_BYTES:
        raise IdentityError(f"That emoji is over {EMOJI_MAX_BYTES} bytes; pick a single emoji")
    if not is_one_emoji(value):
        raise IdentityError("The picture must be exactly one emoji, not text, a link or several emoji")
    return value


# --- the note -------------------------------------------------------------------


@dataclass(frozen=True)
class IdentityPicture:
    """What the identity shows: an NFT the account holds, or one emoji."""

    kind: str
    """``"collectible"`` or ``"emoji"`` (Raven also writes ``"nfd"`` for a person's .algo avatar)."""
    media_url: str | None = None
    source_asset_id: int | None = None
    emoji: str | None = None

    @classmethod
    def of_emoji(cls, emoji: str) -> IdentityPicture:
        return cls(PICTURE_EMOJI, emoji=check_emoji(emoji))


def build_identity_note(address: str, picture: IdentityPicture, name: str | None) -> dict[str, Any]:
    """The ARC-69 note, with keys in Raven's order. The same body is written on mint and update."""
    if not address:
        raise IdentityError("An identity needs the address it belongs to")
    raven: dict[str, Any] = {"address": address, "picture": picture.kind}
    note: dict[str, Any] = {"standard": "arc69", "description": IDENTITY_DESCRIPTION}
    if picture.kind == PICTURE_EMOJI:
        raven["emoji"] = check_emoji(picture.emoji or "")
    else:
        if not picture.media_url:
            raise IdentityError("An identity needs a picture to point at")
        note["media_url"] = picture.media_url
        if picture.source_asset_id is not None:
            raven["sourceAssetId"] = picture.source_asset_id
    display = identity_display_name(name)
    if display is not None:
        raven["name"] = display
    note["properties"] = {"raven": raven}
    return note


def encode_identity_note(note: dict[str, Any]) -> bytes:
    """``JSON.stringify`` bytes: compact, UTF-8, key order kept. At most 1024 bytes."""
    encoded = json.dumps(note, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if len(encoded) > NOTE_MAX_BYTES:
        raise IdentityError("Identity metadata is too long for a transaction note")
    return encoded


def decode_identity_note(note: bytes | None) -> dict[str, Any] | None:
    """A Raven identity note, or None, as Raven's ``decodeIdentityNote`` reads it.

    An emoji note needs one emoji and no ``media_url``, ``sourceAssetId`` or
    ``sourceName``; any other needs a ``media_url``.
    """
    if not note:
        return None
    try:
        parsed = json.loads(note.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        return None
    if not isinstance(parsed, dict) or parsed.get("standard") != "arc69":
        return None
    properties = parsed.get("properties")
    raven = properties.get("raven") if isinstance(properties, dict) else None
    if not isinstance(raven, dict) or not isinstance(raven.get("address"), str):
        return None
    if raven.get("picture") == PICTURE_EMOJI:
        # Raven refuses an emoji note that carries a link or a source, so there
        # is never anything to fetch for it, and checks the emoji as it is.
        if "media_url" in parsed or "sourceAssetId" in raven or "sourceName" in raven:
            return None
        if not is_one_emoji(raven.get("emoji")):
            return None
    elif not isinstance(parsed.get("media_url"), str) or not parsed["media_url"]:
        return None
    name = identity_display_name(raven["name"]) if isinstance(raven.get("name"), str) else None
    if name:
        raven["name"] = name
    else:
        raven.pop("name", None)
    return parsed


# --- the chain ------------------------------------------------------------------


@runtime_checkable
class AssetAlgod(Protocol):
    """The algod calls the identity needs (``HttpAlgodClient`` has them)."""

    async def get_suggested_params(self) -> SuggestedParams: ...
    async def submit_transaction(self, signed_txn: bytes) -> str: ...
    async def wait_for_confirmation(self, txid: str, rounds: int) -> TransactionInfo: ...
    async def pending_transaction(self, txid: str) -> dict[str, Any]: ...
    async def account_created_assets(self, address: str) -> list[dict[str, Any]]: ...
    async def asset_holding(self, address: str, asset_id: int) -> dict[str, Any] | None: ...
    async def asset_params(self, asset_id: int) -> dict[str, Any] | None: ...


@runtime_checkable
class AssetIndexer(Protocol):
    """The indexer calls Raven makes to find an identity (``HttpIndexerClient`` has them)."""

    async def account_created_assets(self, address: str) -> list[dict[str, Any]]: ...
    async def asset_config_history(self, asset_id: int) -> list[dict[str, Any]]: ...


def _unit(params: dict[str, Any] | None) -> str | None:
    if not isinstance(params, dict):
        return None
    return params.get("unit-name", params.get("unitName"))


def newest_identity_asset(created: list[dict[str, Any]]) -> int | None:
    """The newest undeleted ``RAVEN`` asset in a created-assets list, or None."""
    ids = [
        int(asset.get("index") or 0)
        for asset in created
        if not asset.get("deleted") and _unit(asset.get("params")) == IDENTITY_UNIT_NAME
    ]
    ids = [i for i in ids if i > 0]
    return max(ids) if ids else None


@dataclass(frozen=True)
class Identity:
    """An identity NFT as Raven reads it."""

    asset_id: int
    address: str
    picture: str
    name: str | None
    media_url: str | None
    source_asset_id: int | None
    emoji: str | None
    txid: str | None

    def to_json(self) -> dict[str, Any]:
        return {
            "asset_id": self.asset_id,
            "address": self.address,
            "picture": self.picture,
            "emoji": self.emoji,
            "media_url": self.media_url,
            "source_asset_id": self.source_asset_id,
            "name": self.name,
            "txid": self.txid,
        }


async def read_identity(indexer: AssetIndexer, address: str) -> Identity | None:
    """The identity ``address`` created for itself, read the way Raven reads it, or None."""
    asset_id = newest_identity_asset(await indexer.account_created_assets(address))
    if asset_id is None:
        return None
    history = [tx for tx in await indexer.asset_config_history(asset_id) if tx.get("sender") == address]
    history.sort(
        key=lambda tx: (int(tx.get("confirmed-round") or 0), int(tx.get("intra-round-offset") or 0)),
        reverse=True,
    )
    for tx in history:
        try:
            raw = base64.b64decode(tx.get("note") or "")
        except ValueError:
            continue
        note = decode_identity_note(raw)
        if note is None or note["properties"]["raven"]["address"] != address:
            continue
        raven = note["properties"]["raven"]
        source = raven.get("sourceAssetId")
        return Identity(
            asset_id=asset_id,
            address=address,
            picture=str(raven.get("picture")),
            name=raven.get("name"),
            media_url=note.get("media_url"),
            source_asset_id=source if isinstance(source, int) and not isinstance(source, bool) else None,
            emoji=raven.get("emoji"),
            txid=tx.get("id"),
        )
    return None


async def own_identity_asset(algod: AssetAlgod, address: str) -> int | None:
    """The identity asset ``address`` has right now, from algod (no indexer lag)."""
    return newest_identity_asset(await algod.account_created_assets(address))


async def nft_picture(algod: AssetAlgod, address: str, asset_id: int) -> IdentityPicture:
    """The picture from an NFT ``address`` holds now. Refused when it is not held or not a picture."""
    if isinstance(asset_id, bool) or not isinstance(asset_id, int) or asset_id < 1:
        raise IdentityError("Give the NFT's asset id")
    holding = await algod.asset_holding(address, asset_id)
    if holding is None or int(holding.get("amount") or 0) <= 0:
        raise IdentityError(f"The bot's wallet does not hold NFT {asset_id}; it can only use an NFT it holds")
    params = await algod.asset_params(asset_id)
    if params is None:
        raise IdentityError(f"NFT {asset_id} does not exist")
    if _unit(params) == IDENTITY_UNIT_NAME and params.get("creator") == address:
        raise IdentityError("The identity NFT cannot be its own picture")
    total = int(params.get("total") or 0)
    url = str(params.get("url") or "")
    if int(params.get("decimals") or 0) != 0 or total < 1 or (
        total != 1 and not (total <= EDITION_MAX_TOTAL and is_media_url(url))
    ):
        raise IdentityError(f"Asset {asset_id} is not an NFT that can be a picture")
    pointer = nft_picture_pointer(url, params.get("reserve"))
    if pointer is None:
        raise IdentityError(f"NFT {asset_id} has no picture link Algorand can store (96 bytes at most)")
    return IdentityPicture(PICTURE_COLLECTIBLE, media_url=pointer, source_asset_id=asset_id)


@dataclass(frozen=True)
class IdentityResult:
    """The outcome of making or updating the identity NFT."""

    asset_id: int
    txid: str
    minted: bool
    """True when this call created the asset; False when it updated the existing one."""
    note: dict[str, Any]


async def _send(algod: AssetAlgod, seed: bytes, txn: dict[str, Any]) -> tuple[str, int | None]:
    signed = sign_payment(seed, txn)
    submitted = await algod.submit_transaction(signed.blob)
    if submitted != signed.txid:
        raise IdentityError(f"algod returned txid {submitted}, expected {signed.txid}")
    await algod.wait_for_confirmation(signed.txid, 10)
    pending = await algod.pending_transaction(signed.txid)
    index = pending.get("asset-index")
    return signed.txid, (int(index) if index else None)


async def make_identity(
    algod: AssetAlgod,
    seed: bytes,
    address: str,
    picture: IdentityPicture,
    name: str | None,
) -> IdentityResult:
    """Creates ``address``'s identity NFT, or rewrites the one it has (one per account).

    ``seed`` signs here; only the signed transaction goes to algod.
    """
    note = build_identity_note(address, picture, name)
    encoded = encode_identity_note(note)
    params = await algod.get_suggested_params()
    existing = await own_identity_asset(algod, address)
    if existing is not None:
        txn = build_asset_config(address, existing, manager=address, note=encoded, params=params)
        txid, _ = await _send(algod, seed, txn)
        return IdentityResult(existing, txid, False, note)
    txn = build_asset_create(
        address,
        total=1,
        decimals=0,
        unit_name=IDENTITY_UNIT_NAME,
        asset_name=IDENTITY_FALLBACK_NAME,
        url=picture.media_url or "",
        manager=address,
        note=encoded,
        params=params,
    )
    txid, asset_id = await _send(algod, seed, txn)
    if not asset_id:
        raise IdentityError("The identity NFT was submitted but algod did not report its asset id")
    return IdentityResult(asset_id, txid, True, note)


__all__ = [
    "ASSET_URL_MAX_BYTES",
    "EMOJI_MAX_BYTES",
    "IDENTITY_FALLBACK_NAME",
    "IDENTITY_MIN_BALANCE",
    "IDENTITY_UNIT_NAME",
    "NAME_MAX_BYTES",
    "PICTURE_COLLECTIBLE",
    "PICTURE_EMOJI",
    "AssetAlgod",
    "AssetIndexer",
    "Identity",
    "IdentityError",
    "IdentityPicture",
    "IdentityResult",
    "build_identity_note",
    "check_emoji",
    "decode_identity_note",
    "encode_identity_note",
    "identity_display_name",
    "ipfs_link_pointer",
    "is_media_url",
    "is_one_emoji",
    "make_identity",
    "newest_identity_asset",
    "nft_picture",
    "nft_picture_pointer",
    "own_identity_asset",
    "read_identity",
]
