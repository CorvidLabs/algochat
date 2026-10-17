---
change: CHG-0003-migrate-the-typescript-algochat-package-to-nodenext-module-resolution-so-the-com
artifact: docs
---

# Docs

No documentation changes: the migration alters neither the public API nor documented behavior. The canonical `algochat` spec remains accurate because every public export and contract is unchanged. The fix for issue #33 is self-describing through the `tsconfig` setting and the resulting importable `dist/` output.
