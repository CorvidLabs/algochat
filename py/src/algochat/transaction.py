"""
Algorand payment and asset transactions: build, sign and send.

AlgoChat messages are payment transactions whose note is the envelope
(PROTOCOL.md section 10.1). This module builds one in canonical msgpack,
signs it with an Ed25519 seed, and submits it through any
:class:`~algochat.blockchain.AlgodClient`. It needs no Algorand SDK.

Only the fields a payment needs are encoded. Canonical encoding means sorted
keys and no empty values, so the transaction id matches algod's.

The agent's Raven identity NFT (AGENT-2) also needs an asset create and an
asset config. :func:`build_asset_create` and :func:`build_asset_config`
encode exactly the fields those need, in the same canonical form, so they are
signed by :func:`sign_payment` like a payment. They are not exported from the
package root.
"""

from __future__ import annotations

import base64
import hashlib
import struct
from dataclasses import dataclass
from typing import Any

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from .blockchain import (
    AlgodClient,
    SuggestedParams,
    TransactionInfo,
    _decode_algorand_address,
)
from .types import MAX_NOTE_SIZE, TransactionError, payment_fee

VALIDITY_ROUNDS = 1000
"""Rounds a transaction stays valid after the suggested first round."""


def _pack(value: Any) -> bytes:
    """Canonical msgpack for the value types a payment uses."""
    if isinstance(value, bool):
        raise TypeError("booleans are not used in payment transactions")
    if isinstance(value, int):
        if value < 0:
            raise ValueError("negative integers are not used in payment transactions")
        if value < 0x80:
            return bytes([value])
        if value <= 0xFF:
            return b"\xcc" + struct.pack(">B", value)
        if value <= 0xFFFF:
            return b"\xcd" + struct.pack(">H", value)
        if value <= 0xFFFFFFFF:
            return b"\xce" + struct.pack(">I", value)
        return b"\xcf" + struct.pack(">Q", value)
    if isinstance(value, str):
        raw = value.encode()
        if len(raw) < 32:
            return bytes([0xA0 | len(raw)]) + raw
        if len(raw) <= 0xFF:
            return b"\xd9" + bytes([len(raw)]) + raw
        return b"\xda" + struct.pack(">H", len(raw)) + raw
    if isinstance(value, (bytes, bytearray)):
        raw = bytes(value)
        if len(raw) <= 0xFF:
            return b"\xc4" + bytes([len(raw)]) + raw
        if len(raw) <= 0xFFFF:
            return b"\xc5" + struct.pack(">H", len(raw)) + raw
        return b"\xc6" + struct.pack(">I", len(raw)) + raw
    if isinstance(value, dict):
        items = [(k, v) for k, v in sorted(value.items()) if v not in (0, b"", "", None)]
        if len(items) < 16:
            head = bytes([0x80 | len(items)])
        else:
            head = b"\xde" + struct.pack(">H", len(items))
        return head + b"".join(_pack(k) + _pack(v) for k, v in items)
    raise TypeError(f"cannot encode {type(value).__name__} in a payment transaction")


def _sha512_256(data: bytes) -> bytes:
    return hashlib.new("sha512_256", data).digest()


@dataclass(frozen=True)
class SignedPayment:
    """A signed payment ready to submit."""

    txid: str
    blob: bytes
    fee: int


def build_payment(
    sender: str,
    receiver: str,
    amount: int,
    note: bytes,
    params: SuggestedParams,
) -> dict[str, Any]:
    """The payment transaction fields, keyed as algod expects."""
    if len(note) > MAX_NOTE_SIZE:
        raise TransactionError(f"Note is {len(note)} bytes; the limit is {MAX_NOTE_SIZE}")
    if amount < 0:
        raise TransactionError("Amount cannot be negative")
    return {
        "amt": amount,
        "fee": payment_fee(len(note), max(params.min_fee, 1000)),
        "fv": params.first_valid,
        "gen": params.genesis_id,
        "gh": params.genesis_hash,
        "lv": params.last_valid,
        "note": note,
        "rcv": _decode_algorand_address(receiver),
        "snd": _decode_algorand_address(sender),
        "type": "pay",
    }


def _flat_fee(txn: dict[str, Any], params: SuggestedParams) -> int:
    """The minimum fee, or the per-byte fee on the signed size when that is higher."""
    fee = max(params.min_fee, 1000)
    if params.fee > 0:
        size = len(_pack({"sig": b"\x00" * 64, "txn": {**txn, "fee": params.fee}}))  # as algosdk estimates it
        fee = max(fee, params.fee * size)
    return fee


def _asset_note(note: bytes) -> bytes:
    if len(note) > 1024:
        raise TransactionError(f"Note is {len(note)} bytes; an asset transaction allows 1024")
    return note


def build_asset_create(
    sender: str,
    *,
    total: int,
    decimals: int,
    unit_name: str,
    asset_name: str,
    url: str,
    manager: str,
    note: bytes,
    params: SuggestedParams,
) -> dict[str, Any]:
    """An asset create (``acfg`` with no asset id) with no reserve, freeze or clawback.

    Algorand allows 8 bytes of unit name, 32 of asset name and 96 of url; longer
    values are refused here rather than by algod.
    """
    if total < 1:
        raise TransactionError("An asset needs a total of at least 1")
    if not 0 <= decimals <= 19:
        raise TransactionError("Decimals must be 0 to 19")
    for field, value, limit in (("unit name", unit_name, 8), ("asset name", asset_name, 32), ("url", url, 96)):
        if len(value.encode()) > limit:
            raise TransactionError(f"The asset {field} is over {limit} bytes")
    txn: dict[str, Any] = {
        "apar": {
            "an": asset_name,
            "au": url,
            "dc": decimals,
            "m": _decode_algorand_address(manager),
            "t": total,
            "un": unit_name,
        },
        "fv": params.first_valid,
        "gen": params.genesis_id,
        "gh": params.genesis_hash,
        "lv": params.last_valid,
        "note": _asset_note(note),
        "snd": _decode_algorand_address(sender),
        "type": "acfg",
    }
    txn["fee"] = _flat_fee(txn, params)
    return txn


def build_asset_config(
    sender: str,
    asset_id: int,
    *,
    manager: str,
    note: bytes,
    params: SuggestedParams,
) -> dict[str, Any]:
    """An asset config that keeps ``manager`` and leaves reserve, freeze and clawback empty.

    Only the manager can send it. Its note is the part a reconfigure rewrites.
    """
    if asset_id < 1:
        raise TransactionError("An asset config needs the asset id")
    txn: dict[str, Any] = {
        "apar": {"m": _decode_algorand_address(manager)},
        "caid": asset_id,
        "fv": params.first_valid,
        "gen": params.genesis_id,
        "gh": params.genesis_hash,
        "lv": params.last_valid,
        "note": _asset_note(note),
        "snd": _decode_algorand_address(sender),
        "type": "acfg",
    }
    txn["fee"] = _flat_fee(txn, params)
    return txn


def sign_payment(seed: bytes, txn: dict[str, Any]) -> SignedPayment:
    """Signs ``txn`` (a payment or an asset transaction) with the Ed25519 ``seed`` of its sender."""
    key = Ed25519PrivateKey.from_private_bytes(seed)
    if key.public_key().public_bytes_raw() != txn["snd"]:
        raise TransactionError("The signing key does not belong to the sender")
    encoded = b"TX" + _pack(txn)
    txid = base64.b32encode(_sha512_256(encoded)).decode().rstrip("=")
    return SignedPayment(txid=txid, blob=_pack({"sig": key.sign(encoded), "txn": txn}), fee=txn["fee"])


async def send_payment(
    algod: AlgodClient,
    seed: bytes,
    sender: str,
    receiver: str,
    amount: int = 0,
    note: bytes = b"",
    wait_rounds: int = 10,
) -> TransactionInfo:
    """Builds, signs, submits and confirms one payment from ``sender``."""
    params = await algod.get_suggested_params()
    signed = sign_payment(seed, build_payment(sender, receiver, amount, note, params))
    submitted = await algod.submit_transaction(signed.blob)
    if submitted != signed.txid:
        raise TransactionError(f"algod returned txid {submitted}, expected {signed.txid}")
    return await algod.wait_for_confirmation(signed.txid, wait_rounds)
