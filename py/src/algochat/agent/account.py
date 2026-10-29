"""
The bot's own Algorand account (AGENT-2).

Decodes a classic 25-word Algorand mnemonic into the 32-byte Ed25519 seed and
derives the account address. This mirrors ``algosdk`` mnemonic handling without
adding it as a runtime dependency.
"""

from __future__ import annotations

import base64
import hashlib
from dataclasses import dataclass, field
from functools import lru_cache
from importlib import resources

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from .config import AgentConfigError

_WORD_COUNT = 25
_SEED_SIZE = 32
_CHECKSUM_SIZE = 4


@lru_cache(maxsize=1)
def _wordlist() -> tuple[str, ...]:
    text = resources.files(__package__).joinpath("wordlist.txt").read_text(encoding="utf-8")
    words = tuple(text.split())
    if len(words) != 2048:
        raise RuntimeError("The bundled mnemonic word list must have 2048 words")
    return words


@lru_cache(maxsize=1)
def _word_index() -> dict[str, int]:
    return {word: index for index, word in enumerate(_wordlist())}


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


def mnemonic_to_seed(mnemonic: str) -> bytes:
    """Decodes a 25-word Algorand mnemonic into its 32-byte Ed25519 seed.

    Raises:
        AgentConfigError: If the phrase is not 25 known words or its checksum
            word does not match. The phrase is never included in the message.
    """
    words = mnemonic.lower().split()
    if len(words) != _WORD_COUNT:
        raise AgentConfigError(f"The bot mnemonic must be {_WORD_COUNT} words, got {len(words)}")
    index = _word_index()
    try:
        numbers = [index[word] for word in words]
    except KeyError:
        raise AgentConfigError("The bot mnemonic contains a word that is not in the word list") from None
    raw = _to_bytes(numbers[:-1])
    if len(raw) != _SEED_SIZE + 1 or raw[-1] != 0:
        raise AgentConfigError("The bot mnemonic does not decode to a 32-byte key")
    seed = raw[:_SEED_SIZE]
    if _to_11_bit(_sha512_256(seed)[:2])[0] != numbers[-1]:
        raise AgentConfigError("The bot mnemonic checksum word does not match")
    return seed


def address_from_public_key(public_key: bytes) -> str:
    """Encodes a 32-byte Ed25519 public key as an Algorand address."""
    if len(public_key) != _SEED_SIZE:
        raise ValueError("An Algorand public key must be 32 bytes")
    checksum = _sha512_256(public_key)[-_CHECKSUM_SIZE:]
    return base64.b32encode(public_key + checksum).decode("ascii").rstrip("=")


@dataclass(frozen=True)
class AgentAccount:
    """The bot's own Ed25519 Algorand account.

    ``seed`` is excluded from ``repr`` and equality so it does not end up in
    logs or tracebacks by accident.
    """

    address: str
    ed25519_public_key: bytes
    seed: bytes = field(repr=False, compare=False)

    @classmethod
    def from_mnemonic(cls, mnemonic: str) -> AgentAccount:
        """Builds the account from the bot's 25-word mnemonic."""
        return cls.from_seed(mnemonic_to_seed(mnemonic))

    @classmethod
    def from_seed(cls, seed: bytes) -> AgentAccount:
        """Builds the account from a 32-byte Ed25519 seed."""
        if len(seed) != _SEED_SIZE:
            raise AgentConfigError("The bot seed must be 32 bytes")
        public_key = Ed25519PrivateKey.from_private_bytes(seed).public_key().public_bytes_raw()
        return cls(address=address_from_public_key(public_key), ed25519_public_key=public_key, seed=bytes(seed))
