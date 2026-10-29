"""
Test-only helpers for the localnet integration tests.

Talks to an AlgoKit-compatible local network (``algokit localnet start`` or
``py/scripts/native-localnet.sh start``): algod on 4001, kmd on 4002 and
the indexer on 8980, all with the 64 x "a" token. Funds come only from the
localnet's own default KMD wallet. Nothing here talks to TestNet or MainNet:
``require_localnet`` refuses any genesis id other than a local one.

Payment transactions are built with a tiny canonical msgpack encoder so the
tests need no extra dependency.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import os
import secrets
import struct
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from algochat.agent.account import _to_11_bit, _wordlist, address_from_public_key
from algochat.blockchain import (
    AccountInfo,
    AlgodClient,
    IndexerClient,
    NoteTransaction,
    SuggestedParams,
    TransactionInfo,
    _decode_algorand_address,
)

TOKEN = "a" * 64
ALGOD_URL = os.environ.get("ALGOCHAT_LOCALNET_ALGOD_URL", "http://127.0.0.1:4001")
KMD_URL = os.environ.get("ALGOCHAT_LOCALNET_KMD_URL", "http://127.0.0.1:4002")
INDEXER_URL = os.environ.get("ALGOCHAT_LOCALNET_INDEXER_URL", "http://127.0.0.1:8980")
LOCAL_GENESIS_IDS = {"dockernet-v1", "devnet-v1", "sandnet-v1"}
"""Genesis ids of local dev networks. Anything else is refused."""


class LocalnetHTTPError(RuntimeError):
    """A localnet HTTP call failed."""

    def __init__(self, status: int, body: str) -> None:
        super().__init__(f"HTTP {status}: {body}")
        self.status = status
        self.body = body


def _request(
    url: str,
    header: str,
    method: str = "GET",
    body: bytes | None = None,
    content_type: str = "application/json",
    timeout: float = 10.0,
) -> Any:
    request = urllib.request.Request(url, data=body, method=method)
    request.add_header(header, TOKEN)
    if body is not None:
        request.add_header("Content-Type", content_type)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = response.read()
    except urllib.error.HTTPError as error:
        raise LocalnetHTTPError(
            error.code, error.read().decode("utf-8", "replace")
        ) from None
    return json.loads(payload) if payload else {}


def algod_get(path: str) -> Any:
    return _request(ALGOD_URL + path, "X-Algo-API-Token")


def indexer_get(path: str) -> Any:
    return _request(INDEXER_URL + path, "X-Indexer-API-Token")


def kmd_call(method: str, path: str, payload: dict[str, Any] | None = None) -> Any:
    body = json.dumps(payload).encode() if payload is not None else None
    return _request(KMD_URL + path, "X-KMD-API-Token", method=method, body=body)


def localnet_status() -> str | None:
    """Returns None when a local network is reachable, else the reason it is not."""
    try:
        params = algod_get("/v2/transactions/params")
        indexer_get("/health")
        kmd_call("GET", "/v1/wallets")
    except (OSError, LocalnetHTTPError, ValueError) as error:
        return f"no localnet at {ALGOD_URL} / {INDEXER_URL} / {KMD_URL}: {error}"
    if params.get("genesis-id") not in LOCAL_GENESIS_IDS:
        return f"refusing non-local network {params.get('genesis-id')!r}"
    return None


# --- canonical msgpack (only what payment transactions need) -----------------


def _pack(value: Any) -> bytes:
    if isinstance(value, bool):
        raise TypeError("booleans are not used in payment transactions")
    if isinstance(value, int):
        if value < 0:
            raise ValueError("negative integers are not used")
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
        # Canonical: keys sorted, empty values omitted.
        items = [
            (k, v) for k, v in sorted(value.items()) if v not in (0, b"", "", None)
        ]
        if len(items) < 16:
            head = bytes([0x80 | len(items)])
        else:
            head = b"\xde" + struct.pack(">H", len(items))
        return head + b"".join(_pack(k) + _pack(v) for k, v in items)
    raise TypeError(f"cannot pack {type(value).__name__}")


def _sha512_256(data: bytes) -> bytes:
    return hashlib.new("sha512_256", data).digest()


def seed_to_mnemonic(seed: bytes) -> str:
    """Encodes a 32-byte seed as a 25-word Algorand mnemonic (inverse of the agent decoder)."""
    words = _wordlist()
    numbers = _to_11_bit(seed)
    checksum = _to_11_bit(_sha512_256(seed)[:2])[0]
    return " ".join(words[n] for n in numbers + [checksum])


@dataclass(frozen=True)
class SigningAccount:
    """A throwaway localnet account. ``seed`` stays out of ``repr``."""

    address: str
    seed: bytes

    def __repr__(self) -> str:
        return f"SigningAccount(address={self.address!r})"

    @classmethod
    def generate(cls) -> SigningAccount:
        seed = secrets.token_bytes(32)
        public = (
            Ed25519PrivateKey.from_private_bytes(seed).public_key().public_bytes_raw()
        )
        return cls(address=address_from_public_key(public), seed=seed)

    @property
    def mnemonic(self) -> str:
        return seed_to_mnemonic(self.seed)

    def sign(self, txn: dict[str, Any]) -> tuple[str, bytes]:
        encoded = _pack(txn)
        txid = base64.b32encode(_sha512_256(b"TX" + encoded)).decode().rstrip("=")
        signature = Ed25519PrivateKey.from_private_bytes(self.seed).sign(
            b"TX" + encoded
        )
        return txid, _pack({"sig": signature, "txn": txn})


def payment_txn(
    sender: str, receiver: str, amount: int, note: bytes, params: SuggestedParams
) -> dict[str, Any]:
    return {
        "amt": amount,
        "fee": max(params.min_fee, 1000),
        "fv": params.first_valid,
        "gen": params.genesis_id,
        "gh": params.genesis_hash,
        "lv": params.last_valid,
        "note": note,
        "rcv": _decode_algorand_address(receiver),
        "snd": _decode_algorand_address(sender),
        "type": "pay",
    }


# --- AlgodClient / IndexerClient over HTTP ------------------------------------


class LocalnetAlgod(AlgodClient):
    async def get_suggested_params(self) -> SuggestedParams:
        data = await asyncio.to_thread(algod_get, "/v2/transactions/params")
        return SuggestedParams(
            fee=data["fee"],
            min_fee=data["min-fee"],
            first_valid=data["last-round"],
            last_valid=data["last-round"] + 1000,
            genesis_id=data["genesis-id"],
            genesis_hash=base64.b64decode(data["genesis-hash"]),
        )

    async def get_account_info(self, address: str) -> AccountInfo:
        data = await asyncio.to_thread(algod_get, f"/v2/accounts/{address}?exclude=all")
        return AccountInfo(
            address=address, amount=data["amount"], min_balance=data["min-balance"]
        )

    async def submit_transaction(self, signed_txn: bytes) -> str:
        data = await asyncio.to_thread(
            _request,
            ALGOD_URL + "/v2/transactions",
            "X-Algo-API-Token",
            "POST",
            signed_txn,
            "application/x-binary",
        )
        return data["txId"]

    async def wait_for_confirmation(self, txid: str, rounds: int) -> TransactionInfo:
        for _ in range(max(rounds, 1) * 10):
            data = await asyncio.to_thread(
                algod_get, f"/v2/transactions/pending/{txid}"
            )
            if data.get("confirmed-round"):
                return TransactionInfo(
                    txid=txid, confirmed_round=data["confirmed-round"]
                )
            if data.get("pool-error"):
                raise RuntimeError(f"transaction {txid} rejected: {data['pool-error']}")
            await asyncio.sleep(0.2)
        raise TimeoutError(f"transaction {txid} not confirmed")

    async def get_current_round(self) -> int:
        data = await asyncio.to_thread(algod_get, "/v2/status")
        return data["last-round"]


def _note_transaction(tx: dict[str, Any]) -> NoteTransaction | None:
    payment = tx.get("payment-transaction")
    if payment is None or not tx.get("note"):
        return None
    return NoteTransaction(
        txid=tx["id"],
        sender=tx["sender"],
        receiver=payment["receiver"],
        note=base64.b64decode(tx["note"]),
        confirmed_round=tx.get("confirmed-round", 0),
        round_time=tx.get("round-time", 0),
    )


class LocalnetIndexer(IndexerClient):
    async def search_transactions(
        self, address: str, after_round: int | None = None, limit: int | None = None
    ) -> list[NoteTransaction]:
        query = {"address": address, "limit": limit or 100}
        if after_round is not None:
            query["min-round"] = after_round + 1
        data = await asyncio.to_thread(
            indexer_get, "/v2/transactions?" + urllib.parse.urlencode(query)
        )
        notes = (_note_transaction(tx) for tx in data.get("transactions", []))
        return [note for note in notes if note is not None]

    async def search_transactions_between(
        self,
        address1: str,
        address2: str,
        after_round: int | None = None,
        limit: int | None = None,
    ) -> list[NoteTransaction]:
        txs = await self.search_transactions(address1, after_round, limit)
        return [tx for tx in txs if {tx.sender, tx.receiver} == {address1, address2}]

    async def get_transaction(self, txid: str) -> NoteTransaction:
        data = await asyncio.to_thread(indexer_get, f"/v2/transactions/{txid}")
        note = _note_transaction(data["transaction"])
        if note is None:
            raise LookupError(f"{txid} is not a payment with a note")
        return note

    async def wait_for_indexer(self, txid: str, timeout_secs: int) -> NoteTransaction:
        for _ in range(timeout_secs * 5):
            try:
                return await self.get_transaction(txid)
            except LocalnetHTTPError as error:
                if error.status != 404:
                    raise
            await asyncio.sleep(0.2)
        raise TimeoutError(f"indexer did not see {txid} within {timeout_secs}s")


# --- funding from the localnet's own KMD dispenser -----------------------------


def dispenser() -> SigningAccount:
    """The richest account in the localnet's default KMD wallet."""
    wallets = kmd_call("GET", "/v1/wallets")["wallets"]
    wallet = next(w for w in wallets if w["name"] == "unencrypted-default-wallet")
    handle = kmd_call(
        "POST", "/v1/wallet/init", {"wallet_id": wallet["id"], "wallet_password": ""}
    )["wallet_handle_token"]
    try:
        addresses = kmd_call(
            "POST", "/v1/key/list", {"wallet_handle_token": handle}
        ).get("addresses", [])
        richest = max(
            addresses,
            key=lambda a: algod_get(f"/v2/accounts/{a}?exclude=all")["amount"],
        )
        exported = kmd_call(
            "POST",
            "/v1/key/export",
            {"wallet_handle_token": handle, "address": richest, "wallet_password": ""},
        )
    finally:
        kmd_call("POST", "/v1/wallet/release", {"wallet_handle_token": handle})
    seed = base64.b64decode(exported["private_key"])[:32]
    return SigningAccount(address=richest, seed=seed)


async def send_payment(
    algod: LocalnetAlgod,
    sender: SigningAccount,
    receiver: str,
    amount: int,
    note: bytes = b"",
) -> TransactionInfo:
    params = await algod.get_suggested_params()
    txid, signed = sender.sign(
        payment_txn(sender.address, receiver, amount, note, params)
    )
    submitted = await algod.submit_transaction(signed)
    assert submitted == txid, "locally computed txid must match algod's"
    return await algod.wait_for_confirmation(txid, 10)
