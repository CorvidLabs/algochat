---
change: CHG-0006-add-an-opt-in-mailboxroutertransport-speaking-the-raven-mailbox-protocol-per-co
artifact: docs
---

# Docs

- Every new public symbol carries TSDoc: purpose, raven protocol linkage,
  and security notes (view-secret handling, counter ownership, burn
  idempotency, opt-in nature).
- `src/index.ts` gains a mailbox section in its header example showing
  opt-in construction with `mailboxAppId`.
- The package README is intentionally not modified in this change: the
  transport is pre-audit and undeployed, and the user-facing quickstart will
  land with the LocalNet deploy runbook change, which is where deployment
  facts (app id, genesis funding) become concrete.
- The canonical spec receives the new requirements and Public API rows via
  this change's semantic delta; no manual spec edits.
