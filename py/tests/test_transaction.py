"""Payment transactions built, signed and encoded without an Algorand SDK.

The expected txids and blob hashes were produced with py-algorand-sdk 2.x
from the same public test seed (bytes 0..31), which is not a wallet.
No test touches a network.
"""

import hashlib

import pytest

from algochat.blockchain import SuggestedParams, TransactionInfo
from algochat.transaction import build_payment, send_payment, sign_payment
from algochat.types import MAX_NOTE_SIZE, TransactionError

SEED = bytes(range(32))
SENDER = "AOQQPP7TZYIL4HLQ3UMOOS6ATFT6JVRQTOSQ2XY53SDGIESVGG4MPFYUMQ"
RECEIVER = "A4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DVZ36IB4"


def _params() -> SuggestedParams:
    return SuggestedParams(
        fee=1000,
        min_fee=1000,
        first_valid=1000,
        last_valid=2000,
        genesis_id="dockernet-v1",
        genesis_hash=bytes([9]) * 32,
    )


@pytest.mark.parametrize(
    ("amount", "note", "fee", "txid", "blob_sha256"),
    [
        (
            0,
            b"hello",
            1000,
            "MBBTICUPQIZCFEXFERLEOHPGZVMW472UFF6JCVXYOGKBMGDXR2PA",
            "58e1cb53cc3ffeedd67919b14771b47677d100eb2be863274ae6bd76dff9e600",
        ),
        (
            123456,
            bytes(range(200)) * 6,
            1018,
            "TBRUNNMGKIFYKMQSYRT2GSTQKPUH4CSZET3DPD5AXJAMIH6KF2HA",
            "dd8166e7786181b8bb4981e49a9390583b7adc4e847574b6624f597d85fce335",
        ),
    ],
)
def test_matches_algosdk(amount, note, fee, txid, blob_sha256):
    signed = sign_payment(SEED, build_payment(SENDER, RECEIVER, amount, note, _params()))
    assert signed.fee == fee
    assert signed.txid == txid
    assert hashlib.sha256(signed.blob).hexdigest() == blob_sha256


def _fee(note_length: int, params: SuggestedParams) -> int:
    return build_payment(SENDER, RECEIVER, 0, bytes(note_length), params)["fee"]


def test_fee_is_minimum_up_to_1024_note_bytes():
    params = _params()
    assert _fee(0, params) == 1000
    assert _fee(1024, params) == 1000
    assert _fee(1025, params) == 1001
    assert _fee(2366, params) == 1135


def test_fee_never_below_1000():
    params = _params()
    params.min_fee = 0
    assert _fee(10, params) == 1000


def test_rejects_an_oversized_note():
    with pytest.raises(TransactionError, match="limit is 4096"):
        build_payment(SENDER, RECEIVER, 0, b"x" * (MAX_NOTE_SIZE + 1), _params())


def test_rejects_a_negative_amount():
    with pytest.raises(TransactionError, match="negative"):
        build_payment(SENDER, RECEIVER, -1, b"", _params())


def test_refuses_to_sign_for_another_sender():
    txn = build_payment(RECEIVER, SENDER, 0, b"", _params())
    with pytest.raises(TransactionError, match="does not belong"):
        sign_payment(SEED, txn)


class _Algod:
    def __init__(self, answer: str | None = None) -> None:
        self.blobs: list[bytes] = []
        self.answer = answer

    async def get_suggested_params(self):
        return _params()

    async def submit_transaction(self, blob: bytes) -> str:
        self.blobs.append(blob)
        return self.answer or sign_payment(SEED, build_payment(SENDER, RECEIVER, 0, b"hi", _params())).txid

    async def wait_for_confirmation(self, txid: str, rounds: int) -> TransactionInfo:
        return TransactionInfo(txid=txid, confirmed_round=1001)


async def test_send_payment_submits_and_confirms():
    algod = _Algod()
    info = await send_payment(algod, SEED, SENDER, RECEIVER, 0, b"hi")
    assert info.confirmed_round == 1001
    assert len(algod.blobs) == 1


async def test_send_payment_checks_the_txid_algod_returns():
    with pytest.raises(TransactionError, match="expected"):
        await send_payment(_Algod(answer="WRONG"), SEED, SENDER, RECEIVER, 0, b"hi")
