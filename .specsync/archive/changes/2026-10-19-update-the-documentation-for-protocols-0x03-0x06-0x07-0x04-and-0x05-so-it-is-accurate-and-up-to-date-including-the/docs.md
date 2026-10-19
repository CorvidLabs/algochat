---
change: update-the-documentation-for-protocols-0x03-0x06-0x07-0x04-and-0x05-so-it-is-accurate-and-up-to-date-including-the
artifact: docs
---

# Docs

Update PROTOCOL.md and its protocol spec to provide complete byte offsets, sizes, validation and application responsibilities for 0x03/04/05/06/07. Align README, IMPLEMENTATION, SECURITY, TEST-VECTORS and PARITY references where they describe these protocols. Add a focused protocol-flow guide if that makes the diagrams readable.

Audit every Mermaid fence in the repository's Markdown. Update relevant root, TypeScript and Swift architecture/flow diagrams, retain accurate classical-only diagrams with explicit scope, and link detailed flows instead of cramming all information into each figure. Record the diagram inventory and validation evidence outside the repository.

Distinguish merged implementation behavior from normative requirements, pending fixes, author-reported LocalNet runs and independently executed checks. Do not modify vector JSON, language source, package identities, publication workflows or released-version boundaries.
