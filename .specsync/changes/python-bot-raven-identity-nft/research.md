---
change: python-bot-raven-identity-nft
artifact: research
---

# Research

Raven 67b4275: `identity-asset.ts` (`buildIdentityNote`, `decodeIdentityNote`, `identityDisplayName`, 32-byte names, 96-byte URL pointers), `identity-mint.service.ts` (create with total 1, decimals 0, unit `RAVEN`, manager self; update by asset config with a new note), `asset-metadata.service.ts` (`ownIdentityAssetId`: newest undeleted created `RAVEN` asset; `createdIdentityAssetId`: newest self-sent acfg note naming the address; `isPictureNft`; ARC-19 `template-ipfs` resolution), `payment.service.ts` (`createSingleAsset`, `updateAssetNote`). Algorand: asset params `t`, `dc`, `un` (8 bytes), `an` (32), `au` (96), `m`; notes up to 1024 bytes; each created asset raises the minimum balance by 0.1 ALGO; algod `/v2/transactions/pending/{txid}` reports `asset-index`; indexer `/v2/accounts/{addr}/created-assets` and `/v2/transactions?asset-id=&tx-type=acfg`. Unicode emoji grammar (UTS #51): Extended_Pictographic bases, FE0F, skin modifiers, ZWJ sequences, regional-indicator flags, tag flags, keycaps.
