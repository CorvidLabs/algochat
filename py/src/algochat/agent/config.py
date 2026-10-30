"""
Where the bot's key comes from (AGENT-4).

The 25-word mnemonic lives in an environment variable or a local file on the
machine that runs the bot. It is never read from the repository or sent
anywhere by this module.
"""

from __future__ import annotations

import os
import stat
from collections.abc import Mapping
from pathlib import Path

MNEMONIC_ENV = "ALGOCHAT_AGENT_MNEMONIC"
"""Environment variable that holds the bot's 25-word mnemonic."""

MNEMONIC_FILE_ENV = "ALGOCHAT_AGENT_MNEMONIC_FILE"
"""Environment variable that holds the path of a local file with the mnemonic."""

_MAX_FILE_SIZE = 4096


class AgentConfigError(ValueError):
    """The bot's key or configuration is missing, unsafe, or malformed."""


def _acl_entries(fd: int) -> bool:
    """True if the open file carries a POSIX access ACL (extra users or groups)."""
    listxattr = getattr(os, "listxattr", None)
    if listxattr is None:
        return False
    try:
        names = listxattr(fd)
    except OSError:
        # No xattr support on this file system means no ACL can be set either.
        return False
    return "system.posix_acl_access" in names


def _check_open_file(fd: int, file_path: Path, label: str) -> None:
    """Refuses an opened secret file that is not owner-only. Reads nothing."""
    info = os.fstat(fd)
    if not stat.S_ISREG(info.st_mode):
        raise AgentConfigError(f"{label} path is not a regular file: {file_path}")
    if info.st_mode & 0o077:
        raise AgentConfigError(
            f"{label} file {file_path} is accessible by group or others "
            f"(mode {stat.S_IMODE(info.st_mode):o}); run chmod 600 on it"
        )
    geteuid = getattr(os, "geteuid", None)
    if geteuid is not None and info.st_uid not in (geteuid(), 0):
        raise AgentConfigError(
            f"{label} file {file_path} is owned by another user (uid {info.st_uid}); "
            "it must be owned by the user running the bot or by root"
        )
    if _acl_entries(fd):
        raise AgentConfigError(
            f"{label} file {file_path} has a POSIX ACL that may grant other users access; "
            "remove it with setfacl -b and chmod 600"
        )
    if info.st_size > _MAX_FILE_SIZE:
        raise AgentConfigError(f"{label} file is too large: {file_path}")


def _read_fd(fd: int) -> bytes:
    chunks: list[bytes] = []
    total = 0
    while total <= _MAX_FILE_SIZE:
        chunk = os.read(fd, _MAX_FILE_SIZE + 1 - total)
        if not chunk:
            break
        chunks.append(chunk)
        total += len(chunk)
    return b"".join(chunks)


def read_mnemonic_file(path: str | os.PathLike[str]) -> str:
    """Reads the bot mnemonic from a local file on the bot host.

    Same checks as :func:`read_owner_only_file`.

    Raises:
        AgentConfigError: As :func:`read_owner_only_file`, with ``Bot mnemonic`` in the message.
    """
    return read_owner_only_file(path, "Bot mnemonic")


def read_owner_only_file(path: str | os.PathLike[str], label: str) -> str:
    """Reads a short secret from a local file on the bot host (the mnemonic, a webhook secret).

    ``label`` names the secret in error messages, for example ``"Bot mnemonic"``.

    Design choice, following the ``ssh`` private-key rule: the file must be a
    regular file with no group or other permission bits (like ``chmod 600``),
    owned by the user running the bot or by root, and without a POSIX access
    ACL. Symlinks are followed and the target is checked. The checks run with
    ``fstat`` on the opened descriptor and only that descriptor is read, so the
    file cannot be swapped between the check and the read. Nothing is read
    before the checks pass.

    Raises:
        AgentConfigError: If the file is missing, unreadable, not a regular
            file, open to group or others, owned by another user, has an ACL,
            is too large, is not valid UTF-8, or is empty. The message names
            the path only, never the contents.
    """
    file_path = Path(path)
    flags = os.O_RDONLY | getattr(os, "O_NOCTTY", 0) | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NONBLOCK", 0)
    try:
        fd = os.open(file_path, flags)
    except FileNotFoundError:
        raise AgentConfigError(f"{label} file not found: {file_path}") from None
    except OSError as error:
        raise AgentConfigError(
            f"{label} file cannot be opened: {file_path} ({error.strerror or type(error).__name__})"
        ) from None
    data: bytes | None = None
    failure: str | None = None
    try:
        _check_open_file(fd, file_path, label)
        data = _read_fd(fd)
    except OSError as error:
        data = None
        failure = error.strerror or type(error).__name__
    finally:
        os.close(fd)
    # Raise outside the except blocks so no exception chain carries file bytes.
    if data is None:
        raise AgentConfigError(f"{label} file cannot be read: {file_path} ({failure})")
    if len(data) > _MAX_FILE_SIZE:
        data = None
        raise AgentConfigError(f"{label} file is too large: {file_path}")
    text: str | None
    try:
        text = data.decode("utf-8").strip()
    except UnicodeDecodeError:
        text = None
    data = None
    if text is None:
        raise AgentConfigError(f"{label} file is not valid UTF-8: {file_path}")
    if not text:
        raise AgentConfigError(f"{label} file is empty: {file_path}")
    return text


def load_agent_mnemonic(
    environ: Mapping[str, str] | None = None,
    path: str | os.PathLike[str] | None = None,
) -> str:
    """Loads the bot mnemonic from an explicit file, the environment, or a file named there.

    Order: ``path`` if given, otherwise ``ALGOCHAT_AGENT_MNEMONIC``, otherwise
    the file named by ``ALGOCHAT_AGENT_MNEMONIC_FILE``. Setting both
    environment variables (non-empty after stripping whitespace) is refused as
    ambiguous, even when ``path`` is given (design choice).

    Raises:
        AgentConfigError: If no source is set, both are set, or the source is
            unsafe or empty. No frame on the traceback keeps the phrase or the
            environment mapping in a local.
    """
    env: Mapping[str, str] | None = os.environ if environ is None else environ
    assert env is not None
    inline: str | None = env.get(MNEMONIC_ENV, "").strip()
    file_name = env.get(MNEMONIC_FILE_ENV, "").strip()
    env = None
    environ = None
    if inline and file_name:
        inline = None
        raise AgentConfigError(f"Set only one of {MNEMONIC_ENV} or {MNEMONIC_FILE_ENV}, not both")
    if path is not None:
        inline = None
        return read_mnemonic_file(path)
    if inline:
        return inline
    inline = None
    if file_name:
        return read_mnemonic_file(file_name)
    raise AgentConfigError(f"No bot mnemonic: set {MNEMONIC_ENV} or {MNEMONIC_FILE_ENV}")
