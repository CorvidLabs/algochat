---
change: python-algochat-encryption-public-key-returns-raw-bytes
artifact: tasks
---

# Tasks

- [x] Return raw bytes from `AlgoChat.encryption_public_key` in `py/src/algochat/client.py`.
- [x] Assert type, length and value in `py/tests/test_client.py::TestFromSeed::test_derives_encryption_key`.
- [x] Localnet check: publish the property's bytes with a signature, discover it as verified from a second account, and exchange a message.
