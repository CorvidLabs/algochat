---
spec: godot.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `godot/parity/everyday.py` | Local cross-language driver | Godot seals one version `0x02` everyday note. Six libraries open it. Godot opens one everyday note from each library. |
| `godot/example/parity_check.gd` | Headless Godot | Seal, self-open as sender and recipient, and open the foreign notes named in the inbox. |

## Manual Testing

- [ ] Open `godot/example` in Godot 4.7, send from Alice, and confirm Bob's pane shows the text.
- [ ] Confirm the notice "Addresses, timing, and amounts are public." stays visible.

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| Seed or public key length is not 32 | Seal or open returns `ok: false` |
| Plaintext exceeds the everyday maximum | Seal returns `ok: false` |
| One ciphertext byte is flipped | Open returns `ok: false` |
| Foreign note is envelope version `0x01` | Open still returns the plaintext |
| Empty plaintext | Seal and open succeed with empty text |
