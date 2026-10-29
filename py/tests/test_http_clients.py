"""The stdlib algod and indexer clients, against a fake server on loopback."""

from __future__ import annotations

import base64
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import ClassVar
from urllib.parse import parse_qs, urlparse

import pytest

from algochat.http_clients import HttpAlgodClient, HttpError, HttpIndexerClient
from algochat.types import TransactionError

TOKEN = "t" * 64
ADDRESS = "AOQQPP7TZYIL4HLQ3UMOOS6ATFT6JVRQTOSQ2XY53SDGIESVGG4MPFYUMQ"


def _tx(n: int) -> dict:
    return {
        "id": f"TX{n}",
        "sender": ADDRESS,
        "confirmed-round": n,
        "round-time": 100 + n,
        "note": base64.b64encode(bytes([n])).decode(),
        "payment-transaction": {"receiver": ADDRESS},
    }


# Seven matches, newest first, served three at a time; one is a payment without a note.
HISTORY = [_tx(n) for n in range(7, 0, -1)]
HISTORY[3] = {**HISTORY[3], "note": ""}


class _Handler(BaseHTTPRequestHandler):
    seen: ClassVar[list[tuple[str, dict, str | None]]] = []

    def log_message(self, *args) -> None:
        pass

    def _send(self, status: int, body: dict) -> None:
        raw = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:
        url = urlparse(self.path)
        query = {k: v[0] for k, v in parse_qs(url.query).items()}
        _Handler.seen.append((url.path, query, self.headers.get("X-Indexer-API-Token")))
        if url.path == "/v2/transactions":
            rows = [t for t in HISTORY if t["confirmed-round"] >= int(query.get("min-round", 0))]
            start = int(query.get("next", "0"))
            size = min(int(query["limit"]), 3)
            page = rows[start : start + size]
            body = {"transactions": page}
            if start + size < len(rows):
                body["next-token"] = str(start + size)
            self._send(200, body)
        elif url.path == "/v2/status":
            self._send(200, {"last-round": 50})
        elif url.path == "/v2/transactions/pending/GOOD":
            self._send(200, {"confirmed-round": 51})
        elif url.path == "/v2/transactions/pending/BAD":
            self._send(200, {"pool-error": "overspend"})
        elif url.path == "/v2/transactions/MISSING":
            self._send(404, {"message": "no transaction found"})
        else:
            self._send(500, {"message": "unexpected " + url.path})

    def do_POST(self) -> None:
        length = int(self.headers["Content-Length"])
        self.rfile.read(length)
        _Handler.seen.append((self.path, {}, self.headers.get("X-Algo-API-Token")))
        self._send(400, {"message": "TransactionPool.Remember: overspend"})


@pytest.fixture
def server():
    _Handler.seen = []
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{httpd.server_address[1]}"
    httpd.shutdown()


async def test_unlimited_search_follows_next_tokens(server):
    found = await HttpIndexerClient(server, TOKEN).search_transactions(ADDRESS)
    assert [tx.confirmed_round for tx in found] == [7, 6, 5, 3, 2, 1]  # round 4 has no note
    assert [q.get("next") for _, q, _ in _Handler.seen] == [None, "3", "6"]
    assert all(token == TOKEN for _, _, token in _Handler.seen)


async def test_limited_search_is_one_page_after_the_round(server):
    found = await HttpIndexerClient(server, TOKEN).search_transactions(ADDRESS, after_round=4, limit=2)
    assert [tx.confirmed_round for tx in found] == [7, 6]
    assert _Handler.seen[0][1]["min-round"] == "5"
    assert len(_Handler.seen) == 1


async def test_errors_carry_status_and_never_the_token(server):
    algod = HttpAlgodClient(server, TOKEN)
    with pytest.raises(HttpError) as caught:
        await algod.submit_transaction(b"\x80")
    assert caught.value.status == 400
    assert _Handler.seen[-1][2] == TOKEN
    assert TOKEN not in str(caught.value) and TOKEN not in repr(algod)
    with pytest.raises(HttpError) as missing:
        await HttpIndexerClient(server, TOKEN).get_transaction("MISSING")
    assert missing.value.status == 404
    with pytest.raises(TimeoutError):
        await HttpIndexerClient(server, TOKEN).wait_for_indexer("MISSING", 0)


async def test_confirmation_reports_rejection(server):
    algod = HttpAlgodClient(server, TOKEN)
    assert (await algod.wait_for_confirmation("GOOD", 5)).confirmed_round == 51
    with pytest.raises(TransactionError, match="overspend"):
        await algod.wait_for_confirmation("BAD", 5)


def test_urls_must_be_http():
    for bad in ("ftp://example", "file:///etc/passwd", "127.0.0.1:4001", ""):
        with pytest.raises(ValueError):
            HttpAlgodClient(bad)
        with pytest.raises(ValueError):
            HttpIndexerClient(bad)
