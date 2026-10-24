# Godot example

A Godot 4 scene that exchanges everyday AlgoChat notes by calling the Rust library. This is not a seventh protocol implementation. The note is protocol `0x01`, envelope version `0x02`.

The window shows the loaded account address, a recipient, and a message. Send seals an everyday note in the extension, then `ts/scripts/godot-raven.ts` posts it on AlgoKit LocalNet. The fee line says a short note spends 0.001 ALGO and delivers 0.001 ALGO. The notice says that addresses, timing, and amounts are public.

The account file is `user://localnet-wallet.json`, created outside this repository. The bridge reads the LocalNet dispenser from kmd. It does not contain a key. Set `BUN` if `bun` is not on the path Godot uses.

## Build and open

Godot 4.7 is the engine this project was checked with. gdext looks for a binary named `godot4` unless `GODOT4_BIN` is set.

```sh
export GODOT4_BIN="$(command -v godot)"
cargo build --manifest-path godot/extension/Cargo.toml
mkdir -p godot/example/bin/debug godot/example/.godot
cp godot/extension/target/debug/libalgochat_godot.dylib godot/example/bin/debug/
printf 'res://algochat.gdextension\n' > godot/example/.godot/extension_list.cfg
godot --path godot/example
```

On Linux the library is `libalgochat_godot.so`. On Windows it is `algochat_godot.dll`. Copy it to the same `godot/example/bin/debug/` directory. The built library is not committed.

## Parity

The parity command builds the extension and the six existing everyday helpers. It writes logs only under `--output`, which must be a new directory outside the checkout. Kotlin uses JDK 17 from `JAVA_HOME` or Homebrew's `openjdk@17`.

```sh
python3 godot/parity/everyday.py --output /tmp/algochat-godot-parity
```

Exit 0 means Godot's note opened in all six libraries and Godot opened one everyday note from each library. The run does not post a transaction and does not repeat the hybrid mesh.
