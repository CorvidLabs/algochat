"""
HTTP implementations of :class:`AlgodClient` and :class:`IndexerClient`.

They speak the algod and indexer REST APIs with the standard library only.
The operator chooses the URLs and tokens; there is no default endpoint.
Tokens are never included in ``repr`` or error messages.
"""

from __future__ import annotations

import asyncio
import base64
import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from .blockchain import (
    AccountInfo,
    AlgodClient,
    IndexerClient,
    NoteTransaction,
    SuggestedParams,
    TransactionInfo,
)
from .transaction import VALIDITY_ROUNDS
from .types import TransactionError

INDEXER_PAGE_LIMIT = 1000
"""Largest page the indexer serves."""


class HttpError(RuntimeError):
    """An algod or indexer request failed."""

    def __init__(self, status: int, body: str) -> None:
        super().__init__(f"HTTP {status}: {body[:500]}")
        self.status = status
        self.body = body


def _call(
    url: str,
    header: str,
    token: str,
    method: str = "GET",
    body: bytes | None = None,
    content_type: str = "application/json",
    timeout: float = 10.0,
) -> Any:
    request = urllib.request.Request(url, data=body, method=method)
    if token:
        request.add_header(header, token)
    if body is not None:
        request.add_header("Content-Type", content_type)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = response.read()
    except urllib.error.HTTPError as error:
        raise HttpError(error.code, error.read().decode("utf-8", "replace")) from None
    return json.loads(payload) if payload else {}


def _base(url: str) -> str:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError("URL must be http:// or https:// with a host")
    return url.rstrip("/")


class HttpAlgodClient(AlgodClient):
    """algod over HTTP."""

    def __init__(self, url: str, token: str = "") -> None:
        self._url = _base(url)
        self._token = token

    def __repr__(self) -> str:
        return f"HttpAlgodClient(url={self._url!r})"

    async def _get(self, path: str) -> Any:
        return await asyncio.to_thread(_call, self._url + path, "X-Algo-API-Token", self._token)

    async def get_suggested_params(self) -> SuggestedParams:
        data = await self._get("/v2/transactions/params")
        return SuggestedParams(
            fee=data["fee"],
            min_fee=data["min-fee"],
            first_valid=data["last-round"],
            last_valid=data["last-round"] + VALIDITY_ROUNDS,
            genesis_id=data["genesis-id"],
            genesis_hash=base64.b64decode(data["genesis-hash"]),
        )

    async def get_account_info(self, address: str) -> AccountInfo:
        data = await self._get(f"/v2/accounts/{urllib.parse.quote(address)}?exclude=all")
        return AccountInfo(address=address, amount=data["amount"], min_balance=data["min-balance"])

    async def submit_transaction(self, signed_txn: bytes) -> str:
        data = await asyncio.to_thread(
            _call,
            self._url + "/v2/transactions",
            "X-Algo-API-Token",
            self._token,
            "POST",
            signed_txn,
            "application/x-binary",
        )
        return data["txId"]

    async def wait_for_confirmation(self, txid: str, rounds: int) -> TransactionInfo:
        start = await self.get_current_round()
        while True:
            data = await self._get(f"/v2/transactions/pending/{urllib.parse.quote(txid)}")
            if data.get("confirmed-round"):
                return TransactionInfo(txid=txid, confirmed_round=data["confirmed-round"])
            if data.get("pool-error"):
                raise TransactionError(f"Transaction {txid} was rejected: {data['pool-error']}")
            current = await self.get_current_round()
            if current > start + max(rounds, 1):
                raise TransactionError(f"Transaction {txid} was not confirmed within {rounds} rounds")
            await asyncio.sleep(0.25)

    async def get_current_round(self) -> int:
        return (await self._get("/v2/status"))["last-round"]


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


class HttpIndexerClient(IndexerClient):
    """The Algorand indexer over HTTP. Results are payments with a note."""

    def __init__(self, url: str, token: str = "") -> None:
        self._url = _base(url)
        self._token = token

    def __repr__(self) -> str:
        return f"HttpIndexerClient(url={self._url!r})"

    async def _get(self, path: str) -> Any:
        return await asyncio.to_thread(_call, self._url + path, "X-Indexer-API-Token", self._token)

    async def search_transactions(
        self, address: str, after_round: int | None = None, limit: int | None = None
    ) -> list[NoteTransaction]:
        """Payments with a note to or from ``address``, newest first, as the indexer orders them.

        With a ``limit`` this is one page of at most ``limit`` results. Without one it
        follows the indexer's next tokens and returns every match after ``after_round``.
        """
        query: dict[str, Any] = {"address": address, "limit": limit or INDEXER_PAGE_LIMIT}
        if after_round is not None:
            query["min-round"] = after_round + 1
        found: list[NoteTransaction] = []
        while True:
            data = await self._get("/v2/transactions?" + urllib.parse.urlencode(query))
            batch = data.get("transactions", [])
            found += [note for note in map(_note_transaction, batch) if note is not None]
            token = data.get("next-token")
            if limit is not None or not token or not batch:
                return found
            query["next"] = token

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
        data = await self._get(f"/v2/transactions/{urllib.parse.quote(txid)}")
        note = _note_transaction(data["transaction"])
        if note is None:
            raise LookupError(f"{txid} is not a payment with a note")
        return note

    async def wait_for_indexer(self, txid: str, timeout_secs: int) -> NoteTransaction:
        loop = asyncio.get_running_loop()
        deadline = loop.time() + timeout_secs
        while True:
            try:
                return await self.get_transaction(txid)
            except HttpError as error:
                if error.status != 404:
                    raise
            if loop.time() >= deadline:
                raise TimeoutError(f"The indexer did not see {txid} within {timeout_secs}s")
            await asyncio.sleep(0.2)
