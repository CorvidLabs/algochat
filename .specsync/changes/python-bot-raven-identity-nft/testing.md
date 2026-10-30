---
change: python-bot-raven-identity-nft
artifact: testing
---

# Testing

Unit tests use public non-secret seeds and an in-memory asset ledger (algod and indexer in one object).

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| Encoding | `py/tests/test_agent_identity.py::test_asset_create_matches_algosdk_byte_for_byte`, `test_asset_config_matches_algosdk_byte_for_byte`, `test_a_per_byte_fee_is_charged_on_the_signed_size_like_algosdk`, `test_asset_fields_over_algorand_limits_are_refused`. |
| AGENT-2.a | `test_minting_with_an_emoji_makes_ravens_asset_shape`, `test_identity_commands_are_shared_by_the_cli_and_mcp`; localnet `test_the_bots_identity_nft_on_localnet` (fee paid by the bot, 0.1 ALGO locked), `test_the_cli_and_mcp_make_and_show_the_identity`. |
| AGENT-2.b | `test_emoji_note_is_the_shared_raven_format`, `test_an_emoji_note_from_another_client_is_read_name_optional`, `test_an_emoji_note_that_breaks_the_shared_format_is_refused`, `test_ravens_edge_cases_count_the_same_here`, `test_nft_note_matches_ravens_build_identity_note`, `test_reading_takes_the_newest_self_authored_self_naming_note_on_the_newest_raven_asset`, `test_a_look_alike_by_another_creator_is_ignored`; localnet asset params from algod and the raw note from the indexer, and another account's look-alike. |
| AGENT-2.c | `test_minting_with_a_held_nft_points_at_it`, `test_one_emoji_is_accepted`, `test_a_link_text_or_several_emoji_are_refused`, `test_the_name_is_trimmed_to_32_bytes_and_cleaned_like_raven`, `test_an_oversized_name_read_back_is_trimmed_not_trusted`, `test_nft_links_become_raven_pointers_and_nothing_is_fetched`, `test_should_reject_bad_pictures_and_mints_nothing`, `test_a_held_nft_must_still_be_held_when_the_picture_is_kept`, `test_with_no_picture_given_the_existing_picture_stays_and_the_name_follows_the_bot`; localnet emoji, held NFT, ARC-19 NFT, refusals. |
| AGENT-2.d | `test_asking_again_updates_the_one_identity_instead_of_minting_another`; localnet: four configs, one created asset, also from fresh cores and the CLI/MCP. |
| AGENT-2.e | `test_holding_an_identity_never_marks_anyone_a_bot`; localnet `test_an_identity_never_makes_an_account_a_bot_and_a_bot_without_one_still_answers`. |
| AGENT-2.f | `test_the_signed_bytes_never_carry_the_key`; localnet records every HTTP request and checks none carries the mnemonic, the seed or three words of it; CLI and MCP output carry no key. |
| Funds | `test_a_wallet_without_the_locked_minimum_is_told_before_anything_is_sent`; localnet `check_funds` leaves the locked minimum out. |

## Localnet run

Local network only (`py/docs/localnet-testing.md`), Linux x86_64, `py/scripts/native-localnet.sh` layout with the indexer's `--enable-all-parameters` (as AlgoKit), AlgoKit ports and token.

```
cd py
ALGOCHAT_REQUIRE_LOCALNET=1 python -m pytest
```

Results are recorded in the pull request.

Cross-checks against Raven (raven#614 at d38c9a24), run outside both repos: `is_one_emoji` agrees with Raven's `identityEmoji` under Node 20 (V8/ICU) on 60,024 strings (Raven's own cases plus random emoji-part sequences); and Raven's `AssetMetadataService` reader, run against LocalNet, accepts identity NFTs the Python bot minted (a mint, an update with a new emoji and name, no name, a tag flag): empty asset URL, the note byte for byte what Raven's `buildIdentityNote` writes, the emoji picture and name drawn, the asset found, nothing fetched.
