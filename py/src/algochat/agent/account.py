"""
The bot's own Algorand account (AGENT-2, the Ed25519 wallet half).

Decodes a classic 25-word Algorand mnemonic into the 32-byte Ed25519 seed and
derives the account address. This mirrors ``algosdk`` mnemonic handling,
including its unique 4-letter word prefixes, without adding it as a runtime
dependency.

Secret hygiene: the phrase and the seed never appear in an error message, and
no frame left on a traceback raised from this module holds them in a local.
Decoding happens in a helper that returns ``(seed, error)`` instead of
raising, so its frame (with the words and the seed) is gone before any
exception is raised.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
from dataclasses import dataclass
from functools import lru_cache
from importlib import resources
from typing import Any, NoReturn

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from .config import AgentConfigError

_WORD_COUNT = 25
_SEED_SIZE = 32
_CHECKSUM_SIZE = 4
_MIN_PREFIX = 4


@lru_cache(maxsize=1)
def _wordlist() -> tuple[str, ...]:
    text = resources.files(__package__).joinpath("wordlist.txt").read_text(encoding="utf-8")
    words = tuple(text.split())
    if len(words) != 2048:
        raise RuntimeError("The bundled mnemonic word list must have 2048 words")
    return words


@lru_cache(maxsize=1)
def _word_index() -> dict[str, int]:
    """Maps each word, and each of its prefixes of 4 or more letters, to its index.

    Same table as ``algosdk.mnemonic.word_to_index``: in the BIP-39 English
    list every 4-letter prefix is unique, so people who wrote down only the
    first letters of each word can still recover the key.
    """
    index: dict[str, int] = {}
    for number, word in enumerate(_wordlist()):
        for length in range(_MIN_PREFIX, len(word)):
            prefix = word[:length]
            if prefix in index:
                raise RuntimeError("The bundled mnemonic word list has a non-unique prefix")
            index[prefix] = number
        index[word] = number
    return index


def _to_11_bit(data: bytes) -> list[int]:
    buffer = 0
    bits = 0
    output: list[int] = []
    for byte in data:
        buffer |= byte << bits
        bits += 8
        if bits >= 11:
            output.append(buffer & 0x7FF)
            buffer >>= 11
            bits -= 11
    if bits:
        output.append(buffer & 0x7FF)
    return output


def _to_bytes(numbers: list[int]) -> bytes:
    buffer = 0
    bits = 0
    output = bytearray()
    for number in numbers:
        buffer |= number << bits
        bits += 11
        while bits >= 8:
            output.append(buffer & 0xFF)
            buffer >>= 8
            bits -= 8
    if bits:
        output.append(buffer & 0xFF)
    return bytes(output)


def _sha512_256(data: bytes) -> bytes:
    return hashlib.new("sha512_256", data).digest()


def _decode_mnemonic(mnemonic: str) -> tuple[bytes | None, str | None]:
    """Decodes the phrase without raising: ``(seed, None)`` or ``(None, error message)``.

    Never raises on bad input, so no traceback ever carries this frame's
    locals (the words and the seed). The error message never contains the
    phrase.
    """
    words = mnemonic.lower().split()
    if len(words) != _WORD_COUNT:
        return None, f"The bot mnemonic must be {_WORD_COUNT} words, got {len(words)}"
    index = _word_index()
    numbers = [index.get(word, -1) for word in words]
    if -1 in numbers:
        return None, "The bot mnemonic contains a word that is not in the word list"
    raw = _to_bytes(numbers[:-1])
    if len(raw) != _SEED_SIZE + 1 or raw[-1] != 0:
        return None, "The bot mnemonic does not decode to a 32-byte key"
    seed = raw[:_SEED_SIZE]
    if _to_11_bit(_sha512_256(seed)[:2])[0] != numbers[-1]:
        return None, "The bot mnemonic checksum word does not match"
    return seed, None


def mnemonic_to_seed(mnemonic: str) -> bytes:
    """Decodes a 25-word Algorand mnemonic into its 32-byte Ed25519 seed.

    Accepts full words and, like ``algosdk``, unique word prefixes of four or
    more letters. Case and whitespace are ignored.

    Raises:
        AgentConfigError: If the phrase is not 25 known words or its checksum
            word does not match. The phrase is never included in the message,
            and no local of this frame holds it when the error is raised.
    """
    seed, error = _decode_mnemonic(mnemonic)
    mnemonic = ""
    if seed is None:
        raise AgentConfigError(error or "The bot mnemonic is not valid")
    return seed


def address_from_public_key(public_key: bytes) -> str:
    """Encodes a 32-byte Ed25519 public key as an Algorand address."""
    if len(public_key) != _SEED_SIZE:
        raise ValueError("An Algorand public key must be 32 bytes")
    checksum = _sha512_256(public_key)[-_CHECKSUM_SIZE:]
    return base64.b32encode(public_key + checksum).decode("ascii").rstrip("=")


def _public_key_from_seed(seed: bytes) -> bytes:
    return Ed25519PrivateKey.from_private_bytes(seed).public_key().public_bytes_raw()


def _check_account(seed: bytes, address: str, public_key: bytes) -> str | None:
    """Returns why ``address`` and ``public_key`` do not belong to ``seed``, or ``None``. Never raises."""
    if len(seed) != _SEED_SIZE:
        return "The bot seed must be 32 bytes"
    derived = _public_key_from_seed(seed)
    if not hmac.compare_digest(derived, bytes(public_key)):
        return "The bot public key does not match its seed"
    if address != address_from_public_key(derived):
        return "The bot address does not match its seed"
    return None


class _Seed:
    """Holds the seed bytes behind a redacting ``repr`` that cannot be pickled."""

    __slots__ = ("value",)

    def __init__(self, value: bytes) -> None:
        self.value = value

    def __repr__(self) -> str:
        return "<redacted>"

    __str__ = __repr__

    def __reduce__(self) -> NoReturn:
        raise TypeError("The bot seed cannot be pickled")


@dataclass(frozen=True, init=False)
class AgentAccount:
    """The bot's own Ed25519 Algorand account.

    ``address`` and ``ed25519_public_key`` are the only dataclass fields, so
    ``repr``, ``str``, equality and :func:`dataclasses.asdict` never involve
    the seed. The constructor takes the seed, re-derives the public key and
    address from it and refuses a mismatch, then keeps it in a private
    redacting holder that is not a field. Read it with :attr:`seed`. Pickling
    is refused. Because the fields are checked against the seed, two equal
    accounts always have the same seed.
    """

    address: str
    ed25519_public_key: bytes

    def __init__(self, address: str, ed25519_public_key: bytes, seed: bytes) -> None:
        holder: _Seed | None = _Seed(bytes(seed))
        seed = b""
        assert holder is not None
        problem = _check_account(holder.value, address, ed25519_public_key)
        if problem is not None:
            holder = None
            raise AgentConfigError(problem)
        object.__setattr__(self, "address", address)
        object.__setattr__(self, "ed25519_public_key", bytes(ed25519_public_key))
        object.__setattr__(self, "_seed", holder)

    @property
    def seed(self) -> bytes:
        """The 32-byte Ed25519 seed. Never log or print it."""
        holder: _Seed = object.__getattribute__(self, "_seed")
        return holder.value

    def __getstate__(self) -> NoReturn:
        raise TypeError("AgentAccount holds the bot's key and cannot be pickled")

    def __reduce_ex__(self, protocol: Any) -> NoReturn:
        raise TypeError("AgentAccount holds the bot's key and cannot be pickled")

    def __copy__(self) -> AgentAccount:
        return self

    def __deepcopy__(self, memo: dict[int, Any]) -> AgentAccount:
        return self

    @classmethod
    def from_mnemonic(cls, mnemonic: str) -> AgentAccount:
        """Builds the account from the bot's 25-word mnemonic."""
        seed, error = _decode_mnemonic(mnemonic)
        mnemonic = ""
        if seed is None:
            raise AgentConfigError(error or "The bot mnemonic is not valid")
        return cls.from_seed(seed)

    @classmethod
    def from_seed(cls, seed: bytes) -> AgentAccount:
        """Builds the account from a 32-byte Ed25519 seed."""
        if len(seed) != _SEED_SIZE:
            seed = b""
            raise AgentConfigError("The bot seed must be 32 bytes")
        public_key = _public_key_from_seed(bytes(seed))
        return cls(address=address_from_public_key(public_key), ed25519_public_key=public_key, seed=bytes(seed))

