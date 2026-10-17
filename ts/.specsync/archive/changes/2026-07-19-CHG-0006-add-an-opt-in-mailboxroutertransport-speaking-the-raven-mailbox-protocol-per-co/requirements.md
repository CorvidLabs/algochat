---
change: CHG-0006-add-an-opt-in-mailboxroutertransport-speaking-the-raven-mailbox-protocol-per-co
artifact: requirements
---

# Requirements

This change adds three canonical requirements to the algochat spec via the
semantic delta in `deltas/algochat.md` (REQ-algochat-021 … 023). Summary:

1. **Derivation fidelity.** The SDK's mailbox key derivation must be
   byte-identical to the raven normative construction
   (HMAC-SHA256 msg_key, SHA-256 mailbox id), proven against an independent
   implementation, with strict input validation.
2. **Planning exactness.** Put planning must fund exactly the contract's MBR
   formula per leg and reject every invalid input the contract would reject
   (empty/oversized envelope) plus groups the AVM would reject (> 16
   transactions ⇒ > 8 put legs).
3. **Opt-in transport.** The transport must be inert unless configured, must
   route all chain I/O through the injected algod client, and must implement
   put, atomic fan-out, burn, reclaim, and off-chain reads with correct ABI
   arguments and box references.

Every new requirement is exercised by deterministic offline tests; the
existing 454-test suite must remain green.
