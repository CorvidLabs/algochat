---
spec: godot.spec.md
---

## Key Decisions

- Godot calls the Rust `algochat` crate through a GDExtension. GDScript does not implement the protocol.
- The first example ships everyday protocol `0x01` at envelope version `0x02` only.
- Parity reuses the six libraries' existing `write01` and `read01` helpers. Godot is not added to the hybrid mesh.

## Files to Read First

- `hi/godot.md`
- `specs/godot/godot.spec.md`
- `godot/extension/src/lib.rs`
- `godot/example/chat.gd`
- `godot/parity/everyday.py`

## Current Status

- The everyday example is implemented. A local parity run on this machine opened the Godot note in all six libraries and opened one everyday note from each library in Godot. That run is local evidence, not a release qualification.

## Notes

- Human Intent ids are GODOT-1 through GODOT-9. GODOT-6, GODOT-7, and GODOT-8 stay open.
- Installed engine for the local check is Godot 4.7.2.
