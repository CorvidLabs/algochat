"""
Test-only helpers for the localnet integration tests.

Talks to an AlgoKit-compatible local network (``algokit localnet start`` or
``py/scripts/native-localnet.sh start``): algod on 4001, kmd on 4002 and
the indexer on 8980, all with the 64 x "a" token. Funds come only from the
localnet's own default KMD wallet. Nothing here talks to TestNet or MainNet:
``require_localnet`` refuses any genesis id other than a local one.

Transactions go through the library's own ``algochat.transaction`` and
``algochat.http_clients``, so these tests exercise the code a bot runs.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import secrets
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from algochat.agent.account import _to_11_bit, _wordlist, address_from_public_key
from algochat.blockchain import AlgodClient, TransactionInfo
from algochat.http_clients import HttpAlgodClient, HttpIndexerClient
from algochat.transaction import send_payment as library_send_payment

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



# --- the library's own HTTP clients, pointed at the localnet ----------------------


class LocalnetAlgod(HttpAlgodClient):
    def __init__(self) -> None:
        super().__init__(ALGOD_URL, TOKEN)


class LocalnetIndexer(HttpIndexerClient):
    def __init__(self) -> None:
        super().__init__(INDEXER_URL, TOKEN)


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
    algod: AlgodClient,
    sender: SigningAccount,
    receiver: str,
    amount: int,
    note: bytes = b"",
) -> TransactionInfo:
    """Sends through the library's payment path, so the tests exercise it too."""
    return await library_send_payment(algod, sender.seed, sender.address, receiver, amount, note)
