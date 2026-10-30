# Lesson bundle — python-bot-raven-identity-nft

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Python bot Raven identity NFT
- **Kind**: Feature
- **Paths**: py/specs, py/src/algochat, py/tests, py/README.md, py/docs, py/scripts, hi/agent.md, INTENT.md
- **Acceptance**: AGENT-2 and AGENT-2.a to AGENT-2.f in hi/agent.md, as scoped by algochat#59: the operator gives the bot its own Raven identity NFT from the command line or MCP and the bot's own wallet pays for it; it is the same 1-of-1 RAVEN asset with Raven's ARC-69 note that a person makes in Raven, so Raven shows it like anyone else's; its picture is one emoji or an NFT the bot's wallet holds (never a custom picture or link) and its public name is the bot's @name, and either can change later without a second NFT; a bot has only one, and asking again updates it; having it never makes an account a bot, and a bot without one still works; the bot's 25 words never leave its machine; on localnet the bot mints with an emoji, switches to a held NFT, an ARC-19 NFT and back, always the same asset, read back the way Raven reads it, a look-alike by another creator is ignored, a link, two emoji and an NFT not held are refused, the holder added to a room as a plain member is not a bot and a bot with no identity answers it, the CLI and MCP make and show it, and no recorded HTTP request carries the mnemonic or seed; encoded transactions match py-algorand-sdk byte for byte; unit tests use public non-secret seeds and an in-memory ledger only.

## Evidence

- Verification commit: `2c4eea858c1c5b62b40fba7c8b7cf580bf3f61a3`
- Base commit: `e0810da99cdf485e19b1645d538040c78de242b0`
- Verified by: `specsync check (no spec in scope)`

## From the change's context.md

# Context

hi/agent.md AGENT-2 (the bot has its own wallet and its own Raven identity NFT) and its sub-criteria AGENT-2.a to AGENT-2.f, which Leif confirmed on 2026-10-30 (algochat#59): the operator gives the bot its identity NFT from the command line or MCP and the bot's wallet pays (a); it is the same kind of identity NFT a person makes in Raven (b); its picture is an NFT its wallet holds or an emoji, its public name its `@name`, and either can change later without a second NFT (c); only one per bot, and asking again updates it (d); having it never makes an account a bot, and a bot without one still works (e); the bot's 25 words never leave its machine to make it (f). Leif also ruled out custom pictures: only an NFT or an emoji.

Before this change the bot had a wallet but no identity: Raven showed it as a bare address. A person makes an identity in Raven's UI; a bot has no UI, and its key must stay on its host.

Raven (commit 67b4275) defines the format: a 1-of-1 asset, unit `RAVEN`, named after the `.algo` name or `Raven identity`, managed by the account, no reserve, freeze or clawback, with an ARC-69 note under `properties.raven`; updates are asset configs with a new note; Raven finds the newest undeleted `RAVEN` asset the account created and the newest note that account sent naming its own address. The emoji picture (`picture: "emoji"`, `emoji`, no `media_url`) is the format shared with the Raven emoji-avatar work.

Out of scope: custom image uploads or links, `.algo` names, payments or tips (AGENT-9), and any protocol change.

## From the change's design.md

# Design

- `algochat.transaction` gains hand-written `build_asset_create` and `build_asset_config` (canonical msgpack, empty fields dropped), signed by the existing `sign_payment`; `cryptography` stays the only runtime dependency, and tests compare bytes and ids with `py-algorand-sdk`.
- `HttpAlgodClient` gains `pending_transaction` (the created asset id after confirmation), `account_created_assets`, `asset_holding`, `asset_params`; `HttpIndexerClient` gains `account_created_assets` and `asset_config_history`.
- `algochat.agent.identity` holds the note format, the emoji check, Raven's name rule, the NFT picture pointer, the reader and the send. `AgentCore.identity` and `AgentCore.make_identity` use it; `identity` and `make-identity` join the shared command table, so the CLI and MCP get both.
- One per account: algod (no indexer lag) decides mint or update; the reader follows Raven on the indexer.

Design choices that are not confirmed intent, listed for Leif:

- The asset name is always `Raven identity` (a bot has no `.algo` name); an emoji identity has an empty asset URL.
- The NFT picture link comes from the NFT's on-chain URL with no fetch: ARC-19 templates resolve to their CID, IPFS links are normalized to `ipfs://`, other image or media links are kept when they fit 96 bytes. An asset Raven would not count as a picture NFT (0 decimals and total 1, or up to 100000 with a media URL), one the bot does not hold, or the bot's own identity is refused.
- Commands: `identity` (show it as Raven reads it) and `make-identity --emoji X | --nft ID` (mint, or update when one exists). No separate update command. With no picture and an existing identity it keeps the picture (an NFT must still be held) and refreshes the name; a bot without `--name` keeps the name on its identity.
- Before sending, the wallet must cover the fee, plus the 0.1 ALGO minimum balance a new asset locks.
- The low-funds logic is unchanged: it already counts only the balance above the minimum balance, so the locked 0.1 ALGO is left out, and identity fees are not counted toward a refill (errs toward no false refill).
- The native localnet script runs the indexer with `--enable-all-parameters`, as AlgoKit's localnet does, so the `asset-id` and `tx-type` searches Raven uses work.

## From the change's testing.md

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

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
