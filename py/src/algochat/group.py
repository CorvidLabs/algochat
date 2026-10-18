"""Group mailbox notes (protocols 0x06 and 0x07).

A 0x06 note is 195 bytes. It delivers a 32-byte group key under a hybrid
session key. The header is 78 bytes and is the AEAD associated data.
A 0x07 note is one mailbox message. Its 54-byte header is the associated
data. The message key is HKDF-SHA256. Protocol 0x03 room administration is in group_admin.py.
"""

from __future__ import annotations

import os
from collections.abc import Iterable, Mapping
from dataclasses import dataclass

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import ChaCha20Poly1305
from cryptography.hazmat.primitives.hashes import SHA256
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from .pq import PQ_VERSION, PQSession
from .types import MAX_NOTE_SIZE, NONCE_SIZE, TAG_SIZE, PQError

GROUP_MEMBERSHIP_ID = 0x06
GROUP_MESSAGE_ID = 0x07
GROUP_INFO_LABEL = b"AlgoChat-group-v1"
GROUP_MEMBERSHIP_HEADER_SIZE = 78
GROUP_MEMBERSHIP_PLAINTEXT_SIZE = 101
GROUP_MEMBERSHIP_NOTE_SIZE = (
    GROUP_MEMBERSHIP_HEADER_SIZE + GROUP_MEMBERSHIP_PLAINTEXT_SIZE + TAG_SIZE
)
GROUP_MESSAGE_HEADER_SIZE = 54
GROUP_MAX_PAYLOAD_SIZE = MAX_NOTE_SIZE - GROUP_MESSAGE_HEADER_SIZE - TAG_SIZE

_ACTIONS = frozenset({1, 2, 3, 4})


@dataclass
class GroupMembership:
    """One membership record carried in a 0x06 plaintext."""

    action: int
    epoch: int
    group_id: bytes
    mailbox: bytes
    group_key: bytes


@dataclass
class GroupCounter:
    """A sender's already accepted epoch and counter."""

    epoch: int
    counter: int


@dataclass
class OpenedGroupMessage:
    """A 0x07 plaintext plus the header fields that bound it."""

    plaintext: bytes
    group_id: bytes
    epoch: int
    counter: int


def is_group_membership(note: bytes) -> bool:
    """Return whether ``note`` is a 195-byte 0x06 membership note."""
    return (
        isinstance(note, (bytes, bytearray))
        and len(note) == GROUP_MEMBERSHIP_NOTE_SIZE
        and note[0] == PQ_VERSION
        and note[1] == GROUP_MEMBERSHIP_ID
    )


def is_group_message(note: bytes) -> bool:
    """Return whether ``note`` is a 0x07 message with room for a tag."""
    return (
        isinstance(note, (bytes, bytearray))
        and GROUP_MESSAGE_HEADER_SIZE + TAG_SIZE <= len(note) <= MAX_NOTE_SIZE
        and note[0] == PQ_VERSION
        and note[1] == GROUP_MESSAGE_ID
    )


def seal_group_membership(
    session: PQSession,
    membership: GroupMembership,
    nonce: bytes | None = None,
) -> bytes:
    """Seal a 101-byte membership record into a 195-byte 0x06 note.

    ``session.session_key`` is the established hybrid session key. This
    function does not run a handshake.
    """
    session_key, sender, handshake_id = _require_session(session)
    plaintext = _encode_membership(membership)
    if nonce is None:
        nonce = os.urandom(NONCE_SIZE)
    nonce = _require_len("nonce", nonce, NONCE_SIZE)
    header = _membership_header(sender, handshake_id, nonce)
    sealed = ChaCha20Poly1305(session_key).encrypt(nonce, plaintext, header)
    note = header + sealed
    if len(note) != GROUP_MEMBERSHIP_NOTE_SIZE:
        raise PQError(f"Group membership note is {len(note)} bytes")
    return note


def open_group_membership(note: bytes, session: PQSession) -> GroupMembership:
    """Open a 0x06 note with the hybrid session that wrapped it."""
    session_key, sender, handshake_id = _require_session(session)
    if isinstance(note, bytearray):
        note = bytes(note)
    if not is_group_membership(note):
        raise PQError("Not a group membership note")
    note_sender = note[2:34]
    note_handshake = note[34:66]
    nonce = note[66:78]
    if note_sender != sender:
        raise PQError("Membership sender does not match the handshake")
    if note_handshake != handshake_id:
        raise PQError("Membership is for a different handshake")
    try:
        plaintext = ChaCha20Poly1305(session_key).decrypt(
            nonce,
            note[GROUP_MEMBERSHIP_HEADER_SIZE:],
            note[:GROUP_MEMBERSHIP_HEADER_SIZE],
        )
    except InvalidTag as exc:
        raise PQError("Group membership authentication failed") from exc
    return _decode_membership(plaintext)


def derive_group_message_key(
    group_key: bytes,
    epoch: int,
    counter: int,
    group_id: bytes,
    sender_address: bytes,
) -> bytes:
    """Derive the 32-byte 0x07 message key for one sender, epoch, and counter."""
    group_key = _require_len("group key", group_key, 32)
    group_id = _require_len("group id", group_id, 32)
    sender_address = _require_len("sender address", sender_address, 32)
    epoch_value = _require_epoch(epoch)
    counter_value = _require_counter(counter)
    salt = epoch_value.to_bytes(4, "big") + counter_value.to_bytes(4, "big")
    info = GROUP_INFO_LABEL + group_id + sender_address
    derived = HKDF(algorithm=SHA256(), length=32, salt=salt, info=info).derive(group_key)
    if len(derived) != 32:
        raise PQError("Group message key must be 32 bytes")
    return derived


def seal_group_message(
    plaintext: bytes,
    group_key: bytes,
    group_id: bytes,
    epoch: int,
    counter: int,
    sender_address: bytes,
    nonce: bytes | None = None,
) -> bytes:
    """Seal one 0x07 mailbox note under the derived message key."""
    plaintext = _plaintext_bytes(plaintext)
    if len(plaintext) > GROUP_MAX_PAYLOAD_SIZE:
        raise PQError(
            f"Group message too large: {len(plaintext)} bytes, max {GROUP_MAX_PAYLOAD_SIZE}"
        )
    if nonce is None:
        nonce = os.urandom(NONCE_SIZE)
    nonce = _require_len("nonce", nonce, NONCE_SIZE)
    group_key = _require_len("group key", group_key, 32)
    group_id = _require_len("group id", group_id, 32)
    sender_address = _require_len("sender address", sender_address, 32)
    epoch_value = _require_epoch(epoch)
    counter_value = _require_counter(counter)
    message_key = derive_group_message_key(
        group_key,
        epoch_value,
        counter_value,
        group_id,
        sender_address,
    )
    header = _message_header(group_id, epoch_value, counter_value, nonce)
    sealed = ChaCha20Poly1305(message_key).encrypt(nonce, plaintext, header)
    note = header + sealed
    if len(note) > MAX_NOTE_SIZE:
        raise PQError(f"Group message note is {len(note)} bytes")
    return note


def open_group_message(
    note: bytes,
    group_key: bytes,
    sender_address: bytes,
    accepted: Iterable[object],
) -> OpenedGroupMessage:
    """Open a 0x07 note, rejecting a repeated epoch and counter."""
    if isinstance(note, bytearray):
        note = bytes(note)
    if not is_group_message(note):
        raise PQError("Not a group message")
    group_id = bytes(note[2:34])
    epoch = int.from_bytes(note[34:38], "big")
    counter = int.from_bytes(note[38:42], "big")
    nonce = bytes(note[42:54])
    if _is_repeated(accepted, epoch, counter):
        raise PQError("repeated group counter")
    _require_epoch(epoch)
    _require_counter(counter)
    message_key = derive_group_message_key(group_key, epoch, counter, group_id, sender_address)
    try:
        plaintext = ChaCha20Poly1305(message_key).decrypt(
            nonce,
            note[GROUP_MESSAGE_HEADER_SIZE:],
            note[:GROUP_MESSAGE_HEADER_SIZE],
        )
    except InvalidTag as exc:
        raise PQError("Group message authentication failed") from exc
    return OpenedGroupMessage(
        plaintext=plaintext,
        group_id=group_id,
        epoch=epoch,
        counter=counter,
    )


def _require_session(session: PQSession) -> tuple[bytes, bytes, bytes]:
    if not isinstance(session, PQSession):
        raise PQError("Group membership needs a hybrid session")
    return (
        _require_len("session key", session.session_key, 32),
        _require_len("sender public key", session.sender_public_key, 32),
        _require_len("handshake id", session.handshake_id, 32),
    )


def _encode_membership(membership: GroupMembership) -> bytes:
    action = _require_action(membership.action)
    epoch = _require_epoch(membership.epoch)
    group_id = _require_len("group id", membership.group_id, 32)
    mailbox = _require_len("mailbox", membership.mailbox, 32)
    group_key = _require_len("group key", membership.group_key, 32)
    plaintext = (
        bytes([action])
        + epoch.to_bytes(4, "big")
        + group_id
        + mailbox
        + group_key
    )
    if len(plaintext) != GROUP_MEMBERSHIP_PLAINTEXT_SIZE:
        raise PQError("Group membership plaintext is the wrong length")
    return plaintext


def _decode_membership(plaintext: bytes) -> GroupMembership:
    if len(plaintext) != GROUP_MEMBERSHIP_PLAINTEXT_SIZE:
        raise PQError("Group membership plaintext is the wrong length")
    membership = GroupMembership(
        action=plaintext[0],
        epoch=int.from_bytes(plaintext[1:5], "big"),
        group_id=plaintext[5:37],
        mailbox=plaintext[37:69],
        group_key=plaintext[69:101],
    )
    _encode_membership(membership)
    return membership


def _membership_header(sender: bytes, handshake_id: bytes, nonce: bytes) -> bytes:
    header = bytes([PQ_VERSION, GROUP_MEMBERSHIP_ID]) + sender + handshake_id + nonce
    if len(header) != GROUP_MEMBERSHIP_HEADER_SIZE:
        raise PQError(f"Group membership header is {len(header)} bytes")
    return header


def _message_header(group_id: bytes, epoch: int, counter: int, nonce: bytes) -> bytes:
    header = (
        bytes([PQ_VERSION, GROUP_MESSAGE_ID])
        + group_id
        + epoch.to_bytes(4, "big")
        + counter.to_bytes(4, "big")
        + nonce
    )
    if len(header) != GROUP_MESSAGE_HEADER_SIZE:
        raise PQError(f"Group message header is {len(header)} bytes")
    return header


def _plaintext_bytes(plaintext: bytes) -> bytes:
    if isinstance(plaintext, bytearray):
        return bytes(plaintext)
    if not isinstance(plaintext, bytes):
        raise PQError("Group message plaintext must be bytes")
    return plaintext


def _require_len(name: str, value: object, length: int) -> bytes:
    if isinstance(value, bytearray):
        value = bytes(value)
    if not isinstance(value, bytes) or len(value) != length:
        got = len(value) if isinstance(value, (bytes, bytearray)) else "not bytes"
        raise PQError(f"{name} must be {length} bytes, got {got}")
    return value


def _require_action(action: object) -> int:
    if isinstance(action, bool) or action not in _ACTIONS:
        raise PQError("Group action is not create, add, remove, or rekey")
    return int(action)


def _require_epoch(epoch: object) -> int:
    if isinstance(epoch, bool) or not isinstance(epoch, int) or epoch < 1 or epoch > 0xFFFFFFFF:
        raise PQError("Group epoch must be from 1 through 4294967295")
    return epoch


def _require_counter(counter: object) -> int:
    if (
        isinstance(counter, bool)
        or not isinstance(counter, int)
        or counter < 0
        or counter > 0xFFFFFFFF
    ):
        raise PQError("Group counter must be from 0 through 4294967295")
    return counter


def _as_int(value: object) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise PQError("accepted epoch and counter must be integers")
    return value


def _counter_pair(item: object) -> tuple[int, int]:
    if isinstance(item, GroupCounter):
        return _as_int(item.epoch), _as_int(item.counter)
    if isinstance(item, Mapping):
        try:
            return _as_int(item["epoch"]), _as_int(item["counter"])
        except KeyError as exc:
            raise PQError("accepted entry must include an epoch and a counter") from exc
    if isinstance(item, tuple) and len(item) == 2:
        return _as_int(item[0]), _as_int(item[1])
    raise PQError("accepted entry must include an epoch and a counter")


def _is_repeated(accepted: Iterable[object] | None, epoch: int, counter: int) -> bool:
    if accepted is None:
        return False
    try:
        items = list(accepted)
    except TypeError as exc:
        raise PQError("accepted counters must be a sequence") from exc
    for item in items:
        seen_epoch, seen_counter = _counter_pair(item)
        if seen_epoch == epoch and seen_counter == counter:
            return True
    return False
