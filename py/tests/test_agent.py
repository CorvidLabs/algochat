"""Tests for the AlgoChat agent core: bot account, key loading, and the core object.

The mnemonics below are test fixtures built from public, non-secret seeds
(bytes 0..31 and 0xA5 * 32). They are not wallets and must never hold funds.
No test touches a network.
"""

import copy
import dataclasses
import os
import pickle
import shutil
import stat
import subprocess
import types
from pathlib import Path

import pytest

from algochat.agent import (
    MNEMONIC_ENV,
    MNEMONIC_FILE_ENV,
    AgentAccount,
    AgentConfigError,
    AgentCore,
    address_from_public_key,
    load_agent_mnemonic,
    mnemonic_to_seed,
    read_mnemonic_file,
)
from algochat.agent import config as agent_config
from algochat.blockchain import _decode_algorand_address

from .test_client import MockAlgodClient, MockIndexerClient, make_config

# Public test seeds, encoded the way algosdk encodes them (checked against
# py-algorand-sdk 2.12.0 when it was written; see test_matches_algosdk).
SEED_A = bytes(range(32))
MNEMONIC_A = (
    "cactus amount account expect army achieve embark anxiety lift crouch mandate abstract "
    "captain setup party bench tissue gate arrive random deal mansion wedding abandon curtain"
)
ADDRESS_A = "AOQQPP7TZYIL4HLQ3UMOOS6ATFT6JVRQTOSQ2XY53SDGIESVGG4MPFYUMQ"

SEED_B = bytes([0xA5]) * 32
MNEMONIC_B = (
    "regret notable spot fog ensure harvest coffee pizza regret notable spot fog ensure "
    "harvest coffee pizza regret notable spot fog ensure harvest coffee absent youth"
)
ADDRESS_B = "FHSYGOURLJSCTJHDU6KII5ODHDXUG3VYFPUJZEXQLFYEIA63TVKVZ2JG7E"


def _write_key(path: Path, text: str, mode: int = 0o600) -> Path:
    path.write_text(text + "\n", encoding="utf-8")
    os.chmod(path, mode)
    return path


class _OsProxy:
    """Stands in for ``os`` inside ``algochat.agent.config`` only, overriding a few functions."""

    def __init__(self, **overrides: object) -> None:
        self._overrides = overrides

    def __getattr__(self, name: str) -> object:
        if name in self._overrides:
            return self._overrides[name]
        return getattr(os, name)


def _patch_config_os(monkeypatch, **overrides: object) -> None:
    monkeypatch.setattr(agent_config, "os", _OsProxy(**overrides))


def _secret_forms(phrase: str, seed: bytes) -> list[object]:
    """The phrase, every run of three consecutive words, and the seed in its usual encodings."""
    words = phrase.split()
    return [
        phrase,
        *(" ".join(words[i : i + 3]) for i in range(len(words) - 2)),
        seed,
        seed.hex(),
        repr(seed),
    ]


def _assert_text_has_no_secret(text: str, phrase: str, seed: bytes) -> None:
    lowered = text.lower()
    for form in _secret_forms(phrase, seed):
        if isinstance(form, str):
            assert form.lower() not in lowered, "the bot key leaked into text"


def _holds_secret(value: object, phrase: str, seed: bytes, depth: int = 0) -> bool:
    """True if ``value`` (or a container inside it) holds the phrase, a 3-word run, or the seed."""
    if isinstance(value, (bytes, bytearray, memoryview)):
        data = bytes(value)
        return seed in data or phrase.encode() in data.lower()
    if isinstance(value, str):
        lowered = value.lower()
        return any(isinstance(f, str) and f.lower() in lowered for f in _secret_forms(phrase, seed))
    if depth < 3 and isinstance(value, dict):
        return any(_holds_secret(k, phrase, seed, depth + 1) or _holds_secret(v, phrase, seed, depth + 1)
                   for k, v in value.items())
    if depth < 3 and isinstance(value, (list, tuple, set, frozenset)):
        return any(_holds_secret(v, phrase, seed, depth + 1) for v in value)
    if isinstance(value, (types.ModuleType, types.FunctionType, type)):
        return False
    try:
        text = repr(value)
    except AttributeError:
        return False  # a half-built object (e.g. ``self`` in a failed __init__) has no attributes to leak
    return _holds_secret(text, phrase, seed, depth + 1) if depth < 3 else False


def _assert_no_secret_in_traceback(error: BaseException, phrase: str, seed: bytes) -> None:
    """Walks every library frame on the traceback (and any chained exception) and checks its locals.

    The first frame is the test's own frame, which naturally holds its inputs,
    so the walk starts at the frame after it.
    """
    pending: list[BaseException] = [error]
    checked = 0
    while pending:
        current = pending.pop()
        _assert_text_has_no_secret(str(current), phrase, seed)
        _assert_text_has_no_secret(repr(current), phrase, seed)
        assert not _holds_secret(vars(current), phrase, seed), "an exception attribute holds the bot key"
        for arg in current.args:
            assert not _holds_secret(arg, phrase, seed), "an exception argument holds the bot key"
        tb = current.__traceback__
        tb = tb.tb_next if tb is not None and current is error else tb
        while tb is not None:
            for name, value in tb.tb_frame.f_locals.items():
                assert not _holds_secret(value, phrase, seed), (
                    f"local {name!r} in {tb.tb_frame.f_code.co_name} holds the bot key"
                )
            checked += 1
            tb = tb.tb_next
        pending += [e for e in (current.__cause__, current.__context__) if e is not None]
    assert checked, "the traceback had no library frames to check"


# ---------------------------------------------------------------------------
# AGENT-2: the bot has its own Algorand account
# ---------------------------------------------------------------------------


class TestAgentAccount:
    def test_mnemonic_decodes_to_seed(self):
        assert mnemonic_to_seed(MNEMONIC_A) == SEED_A
        assert mnemonic_to_seed(MNEMONIC_B) == SEED_B

    def test_account_address(self):
        assert AgentAccount.from_mnemonic(MNEMONIC_A).address == ADDRESS_A
        assert AgentAccount.from_mnemonic(MNEMONIC_B).address == ADDRESS_B

    def test_address_round_trips_through_library_decoder(self):
        account = AgentAccount.from_seed(SEED_A)
        assert _decode_algorand_address(account.address) == account.ed25519_public_key

    def test_mnemonic_tolerates_case_and_whitespace(self):
        messy = "  " + "\n".join(MNEMONIC_A.upper().split()) + "\t"
        assert mnemonic_to_seed(messy) == SEED_A

    def test_each_bot_has_its_own_account(self):
        assert AgentAccount.from_mnemonic(MNEMONIC_A).address != AgentAccount.from_mnemonic(MNEMONIC_B).address

    def test_seed_is_hidden_from_repr(self):
        account = AgentAccount.from_seed(SEED_A)
        for text in (repr(account), str(account), repr(dataclasses.asdict(account)), repr(vars(account))):
            assert ADDRESS_A in text
            assert repr(SEED_A) not in text
            assert repr(SEED_A)[2:-1] not in text
            assert SEED_A.hex() not in text
            _assert_text_has_no_secret(text, MNEMONIC_A, SEED_A)
        assert "seed" not in repr(account)

    def test_seed_is_not_a_dataclass_field(self):
        account = AgentAccount.from_seed(SEED_A)
        assert account.seed == SEED_A
        assert [f.name for f in dataclasses.fields(account)] == ["address", "ed25519_public_key"]
        assert dataclasses.asdict(account) == {"address": ADDRESS_A, "ed25519_public_key": account.ed25519_public_key}
        assert not any(_holds_secret(v, MNEMONIC_A, SEED_A) for v in vars(account).values())

    def test_account_cannot_be_pickled(self):
        account = AgentAccount.from_seed(SEED_A)
        for protocol in range(pickle.HIGHEST_PROTOCOL + 1):
            with pytest.raises(TypeError, match="cannot be pickled"):
                pickle.dumps(account, protocol)
        with pytest.raises(TypeError):
            account.__getstate__()

    def test_copies_are_the_same_account(self):
        account = AgentAccount.from_seed(SEED_A)
        assert copy.copy(account) is account
        assert copy.deepcopy(account) is account

    def test_account_is_frozen(self):
        account = AgentAccount.from_seed(SEED_A)
        with pytest.raises(dataclasses.FrozenInstanceError):
            account.address = ADDRESS_B  # type: ignore[misc]

    def test_constructor_checks_fields_against_seed(self):
        good = AgentAccount.from_seed(SEED_A)
        other = AgentAccount.from_seed(SEED_B)
        assert AgentAccount(ADDRESS_A, good.ed25519_public_key, SEED_A) == good
        with pytest.raises(AgentConfigError, match="public key does not match"):
            AgentAccount(ADDRESS_A, good.ed25519_public_key, SEED_B)
        with pytest.raises(AgentConfigError, match="public key does not match"):
            AgentAccount(ADDRESS_A, other.ed25519_public_key, SEED_A)
        with pytest.raises(AgentConfigError, match="address does not match"):
            AgentAccount(ADDRESS_B, good.ed25519_public_key, SEED_A)
        with pytest.raises(AgentConfigError, match="32 bytes"):
            AgentAccount(ADDRESS_A, good.ed25519_public_key, SEED_A[:31])

    def test_mismatch_error_does_not_leak_seed(self):
        good = AgentAccount.from_seed(SEED_A)
        with pytest.raises(AgentConfigError) as caught:
            AgentAccount(ADDRESS_A, good.ed25519_public_key, SEED_B)
        _assert_no_secret_in_traceback(caught.value, MNEMONIC_B, SEED_B)

    def test_equal_accounts_have_the_same_seed(self):
        assert AgentAccount.from_seed(SEED_A) == AgentAccount.from_mnemonic(MNEMONIC_A)
        assert AgentAccount.from_seed(SEED_A) != AgentAccount.from_seed(SEED_B)
        assert hash(AgentAccount.from_seed(SEED_A)) == hash(AgentAccount.from_mnemonic(MNEMONIC_A))

    def test_unique_four_letter_prefixes_decode_like_algosdk(self):
        prefixed = " ".join(word[:4] for word in MNEMONIC_A.split())
        assert mnemonic_to_seed(prefixed) == SEED_A
        mixed = " ".join(word if i % 2 else word[: max(4, len(word) - 1)] for i, word in enumerate(MNEMONIC_B.split()))
        assert mnemonic_to_seed(mixed) == SEED_B
        assert AgentAccount.from_mnemonic(prefixed.upper()).address == ADDRESS_A

    def test_prefixes_shorter_than_four_letters_are_refused(self):
        words = MNEMONIC_A.split()
        words[0] = words[0][:3]  # "cac" is not a word and too short to be a prefix
        with pytest.raises(AgentConfigError, match="not in the word list"):
            mnemonic_to_seed(" ".join(words))

    def test_every_four_letter_prefix_is_unique(self):
        from algochat.agent.account import _wordlist

        words = _wordlist()
        prefixes = [w[:4] for w in words if len(w) > 4]
        assert len(prefixes) == len(set(prefixes))

    def test_wrong_word_count(self):
        with pytest.raises(AgentConfigError, match="25 words"):
            mnemonic_to_seed(" ".join(MNEMONIC_A.split()[:24]))

    def test_unknown_word(self):
        words = MNEMONIC_A.split()
        words[3] = "notaword"
        with pytest.raises(AgentConfigError, match="not in the word list") as error:
            mnemonic_to_seed(" ".join(words))
        assert "notaword" not in str(error.value)

    def test_bad_checksum(self):
        words = MNEMONIC_A.split()
        words[-1] = "abandon" if words[-1] != "abandon" else "ability"
        with pytest.raises(AgentConfigError, match="checksum"):
            mnemonic_to_seed(" ".join(words))

    def test_non_zero_padding_is_rejected(self):
        words = MNEMONIC_A.split()
        words[23] = "zoo"
        with pytest.raises(AgentConfigError):
            mnemonic_to_seed(" ".join(words))

    def test_seed_size(self):
        with pytest.raises(AgentConfigError):
            AgentAccount.from_seed(b"\x00" * 31)

    def test_public_key_size(self):
        with pytest.raises(ValueError):
            address_from_public_key(b"\x00" * 31)

    def test_word_index_matches_algosdk(self):
        algosdk_mnemonic = pytest.importorskip("algosdk.mnemonic")
        from algochat.agent.account import _word_index

        # algosdk also maps "" (from the word list's trailing newline); a split phrase never has an empty word.
        expected = {k: v for k, v in algosdk_mnemonic.word_to_index.items() if k}
        assert _word_index() == expected

    def test_matches_algosdk(self):
        algosdk_mnemonic = pytest.importorskip("algosdk.mnemonic")
        algosdk_account = pytest.importorskip("algosdk.account")
        for seed in (SEED_A, SEED_B, bytes([7]) * 32, bytes(range(255, 223, -1))):
            phrase = algosdk_mnemonic._from_key(seed)
            assert mnemonic_to_seed(phrase) == seed
            prefixed = " ".join(word[:4] for word in phrase.split())
            assert algosdk_mnemonic._to_key(prefixed) == mnemonic_to_seed(prefixed) == seed
            private_key = algosdk_mnemonic.to_private_key(phrase)
            assert AgentAccount.from_seed(seed).address == algosdk_account.address_from_private_key(private_key)


# ---------------------------------------------------------------------------
# AGENT-4: the key lives in an env var or a local file on the bot host
# ---------------------------------------------------------------------------


class TestLoadMnemonic:
    def test_from_env_var(self):
        assert load_agent_mnemonic({MNEMONIC_ENV: MNEMONIC_A}) == MNEMONIC_A

    def test_from_file_named_in_env(self, tmp_path):
        key = _write_key(tmp_path / "bot.mnemonic", MNEMONIC_A)
        assert load_agent_mnemonic({MNEMONIC_FILE_ENV: str(key)}) == MNEMONIC_A

    def test_explicit_path_wins(self, tmp_path):
        key = _write_key(tmp_path / "bot.mnemonic", MNEMONIC_B)
        assert load_agent_mnemonic({MNEMONIC_ENV: MNEMONIC_A}, path=key) == MNEMONIC_B

    def test_defaults_to_process_environment(self, monkeypatch):
        monkeypatch.setenv(MNEMONIC_ENV, MNEMONIC_A)
        monkeypatch.delenv(MNEMONIC_FILE_ENV, raising=False)
        assert load_agent_mnemonic() == MNEMONIC_A

    def test_missing(self):
        with pytest.raises(AgentConfigError, match="No bot mnemonic"):
            load_agent_mnemonic({})

    def test_blank_env_counts_as_missing(self):
        with pytest.raises(AgentConfigError, match="No bot mnemonic"):
            load_agent_mnemonic({MNEMONIC_ENV: "   "})

    def test_both_sources_is_ambiguous(self, tmp_path):
        key = _write_key(tmp_path / "bot.mnemonic", MNEMONIC_A)
        with pytest.raises(AgentConfigError, match="not both"):
            load_agent_mnemonic({MNEMONIC_ENV: MNEMONIC_A, MNEMONIC_FILE_ENV: str(key)})

    def test_both_sources_is_ambiguous_even_with_a_path(self, tmp_path):
        key = _write_key(tmp_path / "bot.mnemonic", MNEMONIC_A)
        explicit = _write_key(tmp_path / "explicit.mnemonic", MNEMONIC_B)
        with pytest.raises(AgentConfigError, match="not both") as caught:
            load_agent_mnemonic({MNEMONIC_ENV: MNEMONIC_A, MNEMONIC_FILE_ENV: str(key)}, path=explicit)
        _assert_text_has_no_secret(str(caught.value), MNEMONIC_A, SEED_A)
        _assert_text_has_no_secret(str(caught.value), MNEMONIC_B, SEED_B)
        _assert_no_secret_in_traceback(caught.value, MNEMONIC_A, SEED_A)

    @pytest.mark.parametrize("blank", ["", "   ", "\t\n"])
    def test_whitespace_only_variable_counts_as_unset(self, tmp_path, blank):
        key = _write_key(tmp_path / "bot.mnemonic", MNEMONIC_A)
        assert load_agent_mnemonic({MNEMONIC_ENV: blank, MNEMONIC_FILE_ENV: str(key)}) == MNEMONIC_A
        assert load_agent_mnemonic({MNEMONIC_ENV: MNEMONIC_B, MNEMONIC_FILE_ENV: blank}) == MNEMONIC_B
        explicit = _write_key(tmp_path / "explicit.mnemonic", MNEMONIC_B)
        assert load_agent_mnemonic({MNEMONIC_ENV: MNEMONIC_A, MNEMONIC_FILE_ENV: blank}, path=explicit) == MNEMONIC_B

    def test_non_utf8_file_is_refused_without_contents(self, tmp_path):
        key = tmp_path / "bot.mnemonic"
        key.write_bytes(MNEMONIC_A.encode() + b" \xff\xfe")
        key.chmod(0o600)
        with pytest.raises(AgentConfigError, match="not valid UTF-8") as caught:
            read_mnemonic_file(key)
        assert str(caught.value) == f"Bot mnemonic file is not valid UTF-8: {key}"
        assert caught.value.__cause__ is None and caught.value.__context__ is None
        _assert_no_secret_in_traceback(caught.value, MNEMONIC_A, SEED_A)

    def test_file_owned_by_another_user_is_refused(self, tmp_path, monkeypatch):
        key = _write_key(tmp_path / "bot.mnemonic", MNEMONIC_A)
        owner = key.stat().st_uid
        if owner == 0:
            pytest.skip("running as root: root-owned files are allowed, like ssh")
        _patch_config_os(monkeypatch, geteuid=lambda: owner + 1)
        with pytest.raises(AgentConfigError, match="owned by another user") as caught:
            read_mnemonic_file(key)
        _assert_text_has_no_secret(str(caught.value), MNEMONIC_A, SEED_A)

    def test_root_owned_file_is_allowed(self, tmp_path, monkeypatch):
        key = _write_key(tmp_path / "bot.mnemonic", MNEMONIC_A)
        real_fstat = os.fstat
        owner = key.stat().st_uid

        def fstat_as_root(fd):
            info = real_fstat(fd)
            return os.stat_result((info.st_mode, info.st_ino, info.st_dev, info.st_nlink, 0, *tuple(info)[5:10]))

        _patch_config_os(monkeypatch, geteuid=lambda: owner + 1, fstat=fstat_as_root)
        assert read_mnemonic_file(key) == MNEMONIC_A

    @pytest.mark.skipif(shutil.which("setfacl") is None, reason="setfacl is not installed")
    def test_file_with_posix_acl_is_refused(self, tmp_path):
        key = _write_key(tmp_path / "bot.mnemonic", MNEMONIC_A)
        result = subprocess.run(["setfacl", "-m", "u:nobody:r", str(key)], check=False, capture_output=True, text=True)
        if result.returncode != 0:
            pytest.skip(f"this file system does not take ACLs: {result.stderr.strip()}")
        key.chmod(0o600)  # mask the ACL entry so only the ACL check can catch it
        assert stat.S_IMODE(key.stat().st_mode) == 0o600
        with pytest.raises(AgentConfigError, match="POSIX ACL") as caught:
            read_mnemonic_file(key)
        _assert_text_has_no_secret(str(caught.value), MNEMONIC_A, SEED_A)

    def test_acl_check_uses_the_open_descriptor(self, tmp_path, monkeypatch):
        key = _write_key(tmp_path / "bot.mnemonic", MNEMONIC_A)
        seen: list[object] = []

        def listxattr(target):
            seen.append(target)
            return ["system.posix_acl_access"]

        _patch_config_os(monkeypatch, listxattr=listxattr)
        with pytest.raises(AgentConfigError, match="POSIX ACL"):
            read_mnemonic_file(key)
        assert seen and all(isinstance(target, int) for target in seen)

    def test_checks_run_before_any_read(self, tmp_path, monkeypatch):
        key = _write_key(tmp_path / "bot.mnemonic", MNEMONIC_A, 0o644)
        reads: list[int] = []
        real_read = os.read
        _patch_config_os(monkeypatch, read=lambda fd, n: reads.append(fd) or real_read(fd, n))
        with pytest.raises(AgentConfigError, match="chmod 600"):
            read_mnemonic_file(key)
        assert reads == []

    def test_checks_and_read_use_the_same_descriptor(self, tmp_path, monkeypatch):
        key = _write_key(tmp_path / "bot.mnemonic", MNEMONIC_A)
        fstat_fds: list[int] = []
        read_fds: list[int] = []
        real_fstat, real_read = os.fstat, os.read
        _patch_config_os(
            monkeypatch,
            fstat=lambda fd: fstat_fds.append(fd) or real_fstat(fd),
            read=lambda fd, n: read_fds.append(fd) or real_read(fd, n),
        )
        assert read_mnemonic_file(key) == MNEMONIC_A
        assert fstat_fds and set(read_fds) == set(fstat_fds)

    def test_fifo_is_refused_without_blocking(self, tmp_path):
        fifo = tmp_path / "bot.mnemonic"
        os.mkfifo(fifo, 0o600)
        with pytest.raises(AgentConfigError, match="regular file"):
            read_mnemonic_file(fifo)

    def test_unreadable_file(self, tmp_path):
        key = _write_key(tmp_path / "bot.mnemonic", MNEMONIC_A, 0o000)
        if os.access(key, os.R_OK):
            pytest.skip("running with privileges that ignore file modes")
        with pytest.raises(AgentConfigError, match="cannot be opened"):
            read_mnemonic_file(key)

    @pytest.mark.parametrize("mode", [0o640, 0o604, 0o644, 0o660, 0o602, 0o620])
    def test_file_open_to_group_or_others_is_refused(self, tmp_path, mode):
        key = _write_key(tmp_path / "bot.mnemonic", MNEMONIC_A, mode)
        with pytest.raises(AgentConfigError, match="chmod 600") as error:
            read_mnemonic_file(key)
        assert MNEMONIC_A.split()[0] not in str(error.value)

    @pytest.mark.parametrize("mode", [0o600, 0o400])
    def test_owner_only_file_is_read(self, tmp_path, mode):
        key = _write_key(tmp_path / "bot.mnemonic", MNEMONIC_A, mode)
        assert read_mnemonic_file(key) == MNEMONIC_A

    def test_missing_file(self, tmp_path):
        with pytest.raises(AgentConfigError, match="not found"):
            read_mnemonic_file(tmp_path / "nope")

    def test_directory_is_refused(self, tmp_path):
        folder = tmp_path / "dir"
        folder.mkdir(mode=0o700)
        with pytest.raises(AgentConfigError, match="regular file"):
            read_mnemonic_file(folder)

    def test_empty_file(self, tmp_path):
        key = _write_key(tmp_path / "bot.mnemonic", "   ")
        with pytest.raises(AgentConfigError, match="empty"):
            read_mnemonic_file(key)

    def test_oversized_file(self, tmp_path):
        key = _write_key(tmp_path / "bot.mnemonic", "a" * 5000)
        with pytest.raises(AgentConfigError, match="too large"):
            read_mnemonic_file(key)

    def test_symlink_to_owner_only_file_uses_target_mode(self, tmp_path):
        key = _write_key(tmp_path / "bot.mnemonic", MNEMONIC_A)
        link = tmp_path / "link"
        link.symlink_to(key)
        assert stat.S_IMODE(key.stat().st_mode) == 0o600
        assert read_mnemonic_file(link) == MNEMONIC_A

    def test_symlink_to_world_readable_file_is_refused(self, tmp_path):
        key = _write_key(tmp_path / "bot.mnemonic", MNEMONIC_A, 0o644)
        link = tmp_path / "link"
        link.symlink_to(key)
        with pytest.raises(AgentConfigError, match="chmod 600") as caught:
            read_mnemonic_file(link)
        assert "644" in str(caught.value)
        _assert_text_has_no_secret(str(caught.value), MNEMONIC_A, SEED_A)

    def test_repo_gitignore_covers_mnemonic_files(self):
        root = Path(__file__).resolve().parents[2]
        patterns = (root / ".gitignore").read_text(encoding="utf-8").splitlines()
        assert "*.mnemonic" in patterns
        assert ".algochat-agent/" in patterns


# ---------------------------------------------------------------------------
# AGENT-4: no traceback frame keeps the phrase or the seed in a local
# ---------------------------------------------------------------------------


def _bad_checksum(phrase: str) -> str:
    words = phrase.split()
    words[-1] = "abandon" if words[-1] != "abandon" else "ability"
    return " ".join(words)


def _bad_padding(phrase: str) -> str:
    words = phrase.split()
    words[23] = "zoo"
    return " ".join(words)


def _unknown_word(phrase: str) -> str:
    words = phrase.split()
    words[3] = "notaword"
    return " ".join(words)


def _too_short(phrase: str) -> str:
    return " ".join(phrase.split()[:24])


class TestTracebackLocals:
    """Walks ``tb.tb_frame.f_locals`` for every library frame; does not rely on formatted tracebacks."""

    @pytest.mark.parametrize("damage", [_bad_checksum, _bad_padding, _unknown_word, _too_short])
    def test_mnemonic_to_seed(self, damage):
        with pytest.raises(AgentConfigError) as caught:
            mnemonic_to_seed(damage(MNEMONIC_A))
        # A bad checksum word still decodes the first 24 words to the real seed.
        _assert_no_secret_in_traceback(caught.value, MNEMONIC_A, SEED_A)

    @pytest.mark.parametrize("damage", [_bad_checksum, _bad_padding, _unknown_word, _too_short])
    def test_account_from_mnemonic(self, damage):
        with pytest.raises(AgentConfigError) as caught:
            AgentAccount.from_mnemonic(damage(MNEMONIC_B))
        _assert_no_secret_in_traceback(caught.value, MNEMONIC_B, SEED_B)

    def test_short_seed(self):
        with pytest.raises(AgentConfigError) as caught:
            AgentAccount.from_seed(SEED_A[:31])
        _assert_no_secret_in_traceback(caught.value, MNEMONIC_A, SEED_A[:31])

    def test_both_env_vars(self, tmp_path):
        key = _write_key(tmp_path / "bot.mnemonic", MNEMONIC_B)
        with pytest.raises(AgentConfigError, match="not both") as caught:
            load_agent_mnemonic({MNEMONIC_ENV: MNEMONIC_A, MNEMONIC_FILE_ENV: str(key)})
        _assert_no_secret_in_traceback(caught.value, MNEMONIC_A, SEED_A)

    def test_both_env_vars_from_process_environment(self, tmp_path, monkeypatch):
        key = _write_key(tmp_path / "bot.mnemonic", MNEMONIC_B)
        monkeypatch.setenv(MNEMONIC_ENV, MNEMONIC_A)
        monkeypatch.setenv(MNEMONIC_FILE_ENV, str(key))
        with pytest.raises(AgentConfigError, match="not both") as caught:
            load_agent_mnemonic()
        _assert_no_secret_in_traceback(caught.value, MNEMONIC_A, SEED_A)

    @pytest.mark.parametrize("damage", [_bad_checksum, _unknown_word])
    async def test_core_from_environment(self, damage):
        with pytest.raises(AgentConfigError) as caught:
            await AgentCore.from_environment(
                make_config(), MockAlgodClient(), MockIndexerClient(), environ={MNEMONIC_ENV: damage(MNEMONIC_A)}
            )
        _assert_no_secret_in_traceback(caught.value, MNEMONIC_A, SEED_A)

    @pytest.mark.parametrize("damage", [_bad_checksum, _unknown_word])
    async def test_core_from_file(self, tmp_path, damage):
        key = _write_key(tmp_path / "bot.mnemonic", damage(MNEMONIC_A))
        with pytest.raises(AgentConfigError) as caught:
            await AgentCore.from_environment(
                make_config(), MockAlgodClient(), MockIndexerClient(), environ={MNEMONIC_FILE_ENV: str(key)}
            )
        _assert_no_secret_in_traceback(caught.value, MNEMONIC_A, SEED_A)

    def test_non_utf8_file(self, tmp_path):
        key = tmp_path / "bot.mnemonic"
        key.write_bytes(b"\xff" + MNEMONIC_A.encode())
        key.chmod(0o600)
        with pytest.raises(AgentConfigError) as caught:
            load_agent_mnemonic({MNEMONIC_FILE_ENV: str(key)})
        _assert_no_secret_in_traceback(caught.value, MNEMONIC_A, SEED_A)

    def test_the_walker_catches_a_leak(self):
        def leaky(phrase: str) -> None:
            raise AgentConfigError("bad")

        with pytest.raises(AgentConfigError) as caught:
            leaky(MNEMONIC_A)
        with pytest.raises(AssertionError, match="holds the bot key"):
            _assert_no_secret_in_traceback(caught.value, MNEMONIC_A, SEED_A)

        def leaky_seed(seed: bytes) -> None:
            raise AgentConfigError("bad")

        with pytest.raises(AgentConfigError) as caught:
            leaky_seed(SEED_A)
        with pytest.raises(AssertionError, match="holds the bot key"):
            _assert_no_secret_in_traceback(caught.value, MNEMONIC_A, SEED_A)

    def test_the_walker_catches_an_exception_attribute(self):
        error = AgentConfigError("bad")
        error.detail = SEED_A
        try:
            raise error
        except AgentConfigError as caught:
            with pytest.raises(AssertionError, match="exception attribute holds the bot key"):
                _assert_no_secret_in_traceback(caught, MNEMONIC_A, SEED_A)


# ---------------------------------------------------------------------------
# AGENT-1 / AGENT-1.b / AGENT-1.d: the shared Python core, self-hosted
# ---------------------------------------------------------------------------


class TestAgentCore:
    async def test_create_binds_chat_to_bot_account(self):
        account = AgentAccount.from_mnemonic(MNEMONIC_A)
        core = await AgentCore.create(account, make_config(), MockAlgodClient(), MockIndexerClient())
        assert core.address == ADDRESS_A
        assert core.account is account
        assert core.chat.address == ADDRESS_A
        assert core.chat._ed25519_public_key == account.ed25519_public_key

    async def test_from_environment_with_env_var(self):
        core = await AgentCore.from_environment(
            make_config(), MockAlgodClient(), MockIndexerClient(), environ={MNEMONIC_ENV: MNEMONIC_B}
        )
        assert core.address == ADDRESS_B

    async def test_from_environment_with_file(self, tmp_path):
        key = _write_key(tmp_path / "bot.mnemonic", MNEMONIC_A)
        core = await AgentCore.from_environment(
            make_config(), MockAlgodClient(), MockIndexerClient(), environ={}, path=key
        )
        assert core.address == ADDRESS_A

    async def test_from_environment_refuses_unsafe_file(self, tmp_path):
        key = _write_key(tmp_path / "bot.mnemonic", MNEMONIC_A, 0o644)
        with pytest.raises(AgentConfigError):
            await AgentCore.from_environment(
                make_config(), MockAlgodClient(), MockIndexerClient(), environ={MNEMONIC_FILE_ENV: str(key)}
            )

    async def test_repr_hides_key(self):
        core = await AgentCore.create(
            AgentAccount.from_seed(SEED_A), make_config(), MockAlgodClient(), MockIndexerClient()
        )
        assert repr(core) == f"AgentCore(address={ADDRESS_A!r})"

    async def test_chat_signing_key_must_belong_to_bot(self):
        core = await AgentCore.create(
            AgentAccount.from_seed(SEED_A), make_config(), MockAlgodClient(), MockIndexerClient()
        )
        core.chat._ed25519_public_key = AgentAccount.from_seed(SEED_B).ed25519_public_key
        with pytest.raises(ValueError, match="bot's own account"):
            AgentCore(AgentAccount.from_seed(SEED_A), core.chat)

    async def test_chat_must_belong_to_bot(self):
        other = await AgentCore.create(
            AgentAccount.from_seed(SEED_B), make_config(), MockAlgodClient(), MockIndexerClient()
        )
        with pytest.raises(ValueError, match="bot's own account"):
            AgentCore(AgentAccount.from_seed(SEED_A), other.chat)

    async def test_operator_supplies_the_network_clients(self):
        algod, indexer = MockAlgodClient(), MockIndexerClient()
        core = await AgentCore.create(AgentAccount.from_seed(SEED_A), make_config(), algod, indexer)
        assert core.chat._algod is algod
        assert core.chat._indexer is indexer
