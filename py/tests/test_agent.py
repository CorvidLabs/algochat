"""Tests for the AlgoChat agent core: bot account, key loading, and the core object.

The mnemonics below are test fixtures built from public, non-secret seeds
(bytes 0..31 and 0xA5 * 32). They are not wallets and must never hold funds.
No test touches a network.
"""

import os
import stat
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
        text = repr(AgentAccount.from_seed(SEED_A))
        assert ADDRESS_A in text
        assert SEED_A.hex() not in text
        assert "seed" not in text

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

    def test_matches_algosdk(self):
        algosdk_mnemonic = pytest.importorskip("algosdk.mnemonic")
        algosdk_account = pytest.importorskip("algosdk.account")
        for seed in (SEED_A, SEED_B, bytes([7]) * 32, bytes(range(255, 223, -1))):
            phrase = algosdk_mnemonic._from_key(seed)
            assert mnemonic_to_seed(phrase) == seed
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

    def test_repo_gitignore_covers_mnemonic_files(self):
        root = Path(__file__).resolve().parents[2]
        patterns = (root / ".gitignore").read_text(encoding="utf-8").splitlines()
        assert "*.mnemonic" in patterns
        assert ".algochat-agent/" in patterns


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
