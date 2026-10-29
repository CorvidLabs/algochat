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


def read_mnemonic_file(path: str | os.PathLike[str]) -> str:
    """Reads the bot mnemonic from a local file on the bot host.

    Design choice: the file must be a regular file that only its owner can
    access (no group or other permission bits, like ``chmod 600``), the way
    ``ssh`` treats private keys.

    Raises:
        AgentConfigError: If the file is missing, not a regular file, readable
            or writable by group or others, too large, or empty.
    """
    file_path = Path(path)
    try:
        info = file_path.stat()
    except FileNotFoundError:
        raise AgentConfigError(f"Bot mnemonic file not found: {file_path}") from None
    if not stat.S_ISREG(info.st_mode):
        raise AgentConfigError(f"Bot mnemonic path is not a regular file: {file_path}")
    if info.st_mode & 0o077:
        raise AgentConfigError(
            f"Bot mnemonic file {file_path} is accessible by group or others "
            f"(mode {stat.S_IMODE(info.st_mode):o}); run chmod 600 on it"
        )
    if info.st_size > _MAX_FILE_SIZE:
        raise AgentConfigError(f"Bot mnemonic file is too large: {file_path}")
    text = file_path.read_text(encoding="utf-8").strip()
    if not text:
        raise AgentConfigError(f"Bot mnemonic file is empty: {file_path}")
    return text


def load_agent_mnemonic(
    environ: Mapping[str, str] | None = None,
    path: str | os.PathLike[str] | None = None,
) -> str:
    """Loads the bot mnemonic from an explicit file, the environment, or a file named there.

    Order: ``path`` if given, otherwise ``ALGOCHAT_AGENT_MNEMONIC``, otherwise
    the file named by ``ALGOCHAT_AGENT_MNEMONIC_FILE``. Setting both
    environment variables is refused as ambiguous (design choice).

    Raises:
        AgentConfigError: If no source is set, both are set, or the source is unsafe or empty.
    """
    if path is not None:
        return read_mnemonic_file(path)
    env = os.environ if environ is None else environ
    inline = env.get(MNEMONIC_ENV, "").strip()
    file_name = env.get(MNEMONIC_FILE_ENV, "").strip()
    if inline and file_name:
        raise AgentConfigError(f"Set only one of {MNEMONIC_ENV} or {MNEMONIC_FILE_ENV}, not both")
    if inline:
        return inline
    if file_name:
        return read_mnemonic_file(file_name)
    raise AgentConfigError(f"No bot mnemonic: set {MNEMONIC_ENV} or {MNEMONIC_FILE_ENV}")
