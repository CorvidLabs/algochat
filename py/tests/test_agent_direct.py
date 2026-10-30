"""One-to-one reading and replying in the agent core (AGENT-5).

A small in-memory chain stands in for algod and the indexer: it decodes each
signed payment the core submits and indexes it. Seeds are public test values
(bytes 0..31 for the bot, 0xA5 * 32 for the person), not wallets.
No test touches a network.
"""

from __future__ import annotations

import json
import struct

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from algochat.agent import (
    AgentAccount,
    AgentCore,
    DirectMessage,
    encode_reply,
    reply_preview,
)
from algochat.agent.account import address_from_public_key
from algochat.blockchain import (
    AccountInfo,
    AlgodClient,
    IndexerClient,
    NoteTransaction,
    SuggestedParams,
    TransactionInfo,
)
from algochat.client import AlgoChat, AlgoChatConfig
from algochat.signature import sign_encryption_key
from algochat.transaction import build_payment, sign_payment

BOT_SEED = bytes(range(32))
PERSON_SEED = bytes([0xA5]) * 32
STRANGER_SEED = bytes([0x3C]) * 32


def _address(seed: bytes) -> str:
    return address_from_public_key(Ed25519PrivateKey.from_private_bytes(seed).public_key().public_bytes_raw())


def _unpack(data: bytes, at: int = 0):
    """Just enough msgpack to read a signed payment back."""
    head = data[at]
    if head < 0x80:
        return head, at + 1
    if 0x80 <= head <= 0x8F or head == 0xDE:
        count, at = (head & 0x0F, at + 1) if head != 0xDE else (struct.unpack(">H", data[at + 1 : at + 3])[0], at + 3)
        out = {}
        for _ in range(count):
            key, at = _unpack(data, at)
            out[key], at = _unpack(data, at)
        return out, at
    if 0xA0 <= head <= 0xBF:
        size = head & 0x1F
        return data[at + 1 : at + 1 + size].decode(), at + 1 + size
    sizes = {0xC4: 1, 0xC5: 2, 0xC6: 4, 0xD9: 1, 0xDA: 2, 0xCC: 1, 0xCD: 2, 0xCE: 4, 0xCF: 8}
    width = sizes[head]
    value = int.from_bytes(data[at + 1 : at + 1 + width], "big")
    if head in (0xCC, 0xCD, 0xCE, 0xCF):
        return value, at + 1 + width
    raw = data[at + 1 + width : at + 1 + width + value]
    return (raw.decode() if head in (0xD9, 0xDA) else raw), at + 1 + width + value


class Chain(AlgodClient, IndexerClient):
    """algod and indexer in one object. Every submitted payment lands in the next round."""

    def __init__(self) -> None:
        self.round = 10
        self.txs: list[NoteTransaction] = []
        self.submitted = 0
        self.time_base = 1_800_000_000
        """Block time of round 0; each later round is one second later."""

    def _params(self) -> SuggestedParams:
        return SuggestedParams(1000, 1000, self.round, self.round + 1000, "dockernet-v1", bytes(32))

    def pay(self, seed: bytes, receiver: str, note: bytes) -> NoteTransaction:
        signed = sign_payment(seed, build_payment(_address(seed), receiver, 0, note, self._params()))
        return self._land(signed.txid, signed.blob)

    def _land(self, txid: str, blob: bytes) -> NoteTransaction:
        txn = _unpack(blob)[0]["txn"]
        self.round += 1
        tx = NoteTransaction(
            txid=txid,
            sender=address_from_public_key(txn["snd"]),
            receiver=address_from_public_key(txn["rcv"]),
            note=txn.get("note", b""),
            confirmed_round=self.round,
            round_time=self.time_base + self.round,
        )
        self.txs.append(tx)
        return tx

    async def get_suggested_params(self) -> SuggestedParams:
        return self._params()

    async def get_account_info(self, address: str) -> AccountInfo:
        return AccountInfo(address, 10_000_000, 100_000)

    async def submit_transaction(self, signed_txn: bytes) -> str:
        import base64

        from algochat.transaction import _pack, _sha512_256

        txn = _unpack(signed_txn)[0]["txn"]
        txid = base64.b32encode(_sha512_256(b"TX" + _pack(txn))).decode().rstrip("=")
        self.submitted += 1
        self._land(txid, signed_txn)
        return txid

    async def wait_for_confirmation(self, txid: str, rounds: int) -> TransactionInfo:
        return TransactionInfo(txid=txid, confirmed_round=self.round)

    async def get_current_round(self) -> int:
        return self.round

    async def search_transactions(self, address, after_round=None, limit=None):
        # Newest first, like a real indexer; no limit means everything.
        found = [tx for tx in reversed(self.txs) if address in (tx.sender, tx.receiver)]
        if after_round is not None:
            found = [tx for tx in found if tx.confirmed_round > after_round]
        return found if limit is None else found[:limit]

    async def search_transactions_between(self, address1, address2, after_round=None, limit=None):
        found = await self.search_transactions(address1, after_round, limit)
        return [tx for tx in found if {tx.sender, tx.receiver} == {address1, address2}]

    async def get_transaction(self, txid):
        return next(tx for tx in self.txs if tx.txid == txid)

    async def wait_for_indexer(self, txid, timeout_secs):
        return await self.get_transaction(txid)


def _config() -> AlgoChatConfig:
    config = AlgoChatConfig.localnet()
    config.allow_unverified_keys = False
    return config


async def _person(chain: Chain, seed: bytes = PERSON_SEED) -> AlgoChat:
    chat = await AlgoChat.from_seed(seed=seed, address=_address(seed), config=_config(), algod=chain, indexer=chain)
    key = chat.encryption_public_key
    chain.pay(seed, _address(seed), key + sign_encryption_key(key, Ed25519PrivateKey.from_private_bytes(seed)))
    return chat


async def _bot(chain: Chain) -> AgentCore:
    core = await AgentCore.create(AgentAccount.from_seed(BOT_SEED), _config(), chain, chain)
    await core.publish_key()
    return core


async def _say(chain: Chain, person: AlgoChat, seed: bytes, to: str, text: str) -> NoteTransaction:
    key = await person.discover_key(to)
    return chain.pay(seed, to, person.encrypt(text, key.public_key))


# --- reply payload (PROTOCOL.md section 9.2) --------------------------------


def test_reply_payload_is_compact_json_with_a_cut_preview():
    payload = encode_reply("sure", "TXID", "x" * 100)
    data = json.loads(payload)
    assert payload.startswith('{"text":"sure","replyTo":{"txid":"TXID","preview":"')
    assert data["replyTo"]["preview"] == "x" * 77 + "..."
    assert reply_preview("short") == "short"
    assert len(reply_preview("y" * 80)) == 80


# --- AGENT-5: read and reply ------------------------------------------------


async def test_the_chat_client_and_the_core_give_the_key_as_32_raw_bytes():
    # algochat#50: AlgoChat.encryption_public_key itself is bytes, so the core
    # passes it through with no type check of its own.
    chain = Chain()
    core = await AgentCore.create(AgentAccount.from_seed(BOT_SEED), _config(), chain, chain)
    key = core.chat.encryption_public_key
    assert type(key) is bytes and len(key) == 32
    assert type(core.encryption_public_key) is bytes and core.encryption_public_key == key


async def test_publish_key_is_signed_and_not_repeated():
    chain = Chain()
    core = await AgentCore.create(AgentAccount.from_seed(BOT_SEED), _config(), chain, chain)
    first = await core.publish_key()
    assert first is not None
    assert await core.publish_key() is None
    found = await core.chat.discover_key(core.address)
    assert found.is_verified and found.public_key == core.encryption_public_key
    assert await core.publish_key(force=True) is not None


async def test_bot_reads_a_message_and_replies_to_the_sender():
    chain = Chain()
    person = await _person(chain)
    core = await _bot(chain)
    sent = await _say(chain, person, PERSON_SEED, core.address, "hello bot")

    messages = await core.read_direct()
    assert [(m.txid, m.sender, m.text) for m in messages] == [(sent.txid, person.address, "hello bot")]

    reply_txid = await core.reply(messages[0], "hello human")
    landed = await chain.get_transaction(reply_txid)
    assert landed.sender == core.address and landed.receiver == person.address
    opened = await person.process_transaction(landed)
    assert opened.content == "hello human"
    assert (opened.reply_context.message_id, opened.reply_context.preview) == (sent.txid, "hello bot")


async def test_each_message_is_returned_once_and_own_messages_never():
    chain = Chain()
    person = await _person(chain)
    core = await _bot(chain)
    await _say(chain, person, PERSON_SEED, core.address, "one")
    assert [m.text for m in await core.read_direct()] == ["one"]
    assert await core.read_direct() == []
    await core.send_direct(person.address, "unprompted")
    await _say(chain, person, PERSON_SEED, core.address, "two")
    assert [m.text for m in await core.read_direct()] == ["two"]


async def test_a_restarted_bot_does_not_answer_twice():
    chain = Chain()
    person = await _person(chain)
    core = await _bot(chain)
    await _say(chain, person, PERSON_SEED, core.address, "answered")
    await _say(chain, person, PERSON_SEED, core.address, "pending")
    first = await core.read_direct()
    await core.reply(first[0], "done")

    restarted = await AgentCore.create(AgentAccount.from_seed(BOT_SEED), _config(), chain, chain)
    assert [m.text for m in await restarted.read_direct()] == ["pending"]


async def test_serve_direct_replies_skips_silence_and_isolates_failures():
    chain = Chain()
    person = await _person(chain)
    core = await _bot(chain)
    for text in ("echo me", "ignore me", "break me"):
        await _say(chain, person, PERSON_SEED, core.address, text)

    async def handler(message: DirectMessage):
        if message.text == "ignore me":
            return None
        if message.text == "break me":
            raise RuntimeError("handler failed with secret details")
        return "you said: " + message.text

    results = await core.serve_direct(handler)
    assert [(r.message.text, r.reply_txid is not None, r.error) for r in results] == [
        ("echo me", True, None),
        ("ignore me", False, None),
        ("break me", False, "RuntimeError"),
    ]
    assert await core.serve_direct(handler) == []


async def test_unreadable_notes_are_skipped():
    chain = Chain()
    await _person(chain)
    core = await _bot(chain)
    # A stranger who never published a key, and a note that is not AlgoChat at all.
    chain.pay(STRANGER_SEED, core.address, b"\x01\x01" + bytes(200))
    chain.pay(STRANGER_SEED, core.address, b"just a memo")
    assert await core.read_direct() == []


async def test_send_needs_a_published_key_and_another_address():
    chain = Chain()
    core = await _bot(chain)
    with pytest.raises(LookupError, match="has not published"):
        await core.send_direct(_address(STRANGER_SEED), "hi")
    with pytest.raises(ValueError, match="does not message itself"):
        await core.send_direct(core.address, "hi")


async def test_a_core_without_clients_cannot_send():
    chain = Chain()
    built = await AgentCore.create(AgentAccount.from_seed(BOT_SEED), _config(), chain, chain)
    bare = AgentCore(built.account, built.chat)
    with pytest.raises(RuntimeError, match="AgentCore.create"):
        await bare.read_direct()
