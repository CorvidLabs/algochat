extends SceneTree

const NOTICE := "Addresses, timing, and amounts are public."

func _initialize() -> void:
	quit(_run())

func _run() -> int:
	var inbox := ""
	var outbox := ""
	var args := OS.get_cmdline_user_args()
	var index := 0
	while index < args.size():
		if args[index] == "--inbox" and index + 1 < args.size():
			inbox = args[index + 1]
			index += 2
		elif args[index] == "--outbox" and index + 1 < args.size():
			outbox = args[index + 1]
			index += 2
		else:
			index += 1
	if inbox == "" or outbox == "":
		push_error("missing --inbox or --outbox")
		return 2
	var chat := AlgoChat.new()
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(inbox))
	if typeof(parsed) != TYPE_DICTIONARY:
		push_error("inbox is not a dictionary")
		return 2
	var body: Dictionary = parsed
	var alice := _hex_to_bytes(str(body["alice_seed"]))
	var bob := _hex_to_bytes(str(body["bob_seed"]))
	var text := str(body["seal_text"])
	var bob_public := chat.encryption_public_key(bob)
	var sealed: Dictionary = chat.seal_everyday(text, alice, bob_public)
	if not bool(sealed.get("ok", false)):
		push_error(str(sealed.get("error", "seal failed")))
		return 1
	var note: PackedByteArray = sealed["note"]
	if note.size() < 2 or note[0] != 0x02 or note[1] != 0x01:
		push_error("sealed note header is not version 0x02 protocol 0x01")
		return 1
	var as_bob: Dictionary = chat.open_everyday(note, bob)
	var as_alice: Dictionary = chat.open_everyday(note, alice)
	if str(as_bob.get("text", "")) != text or str(as_alice.get("text", "")) != text:
		push_error("sender and recipient did not both open the Godot note")
		return 1
	var opened: Array = []
	var all_ok := true
	for item in body["notes"]:
		var foreign := _hex_to_bytes(str(item["note"]))
		var recipient: Dictionary = chat.open_everyday(foreign, bob)
		var sender: Dictionary = chat.open_everyday(foreign, alice)
		var expected := str(item["text"])
		var ok := bool(recipient.get("ok", false)) and bool(sender.get("ok", false)) and str(recipient.get("text", "")) == expected and str(sender.get("text", "")) == expected
		if not ok:
			all_ok = false
			push_error("open failed for " + str(item["writer"]))
		opened.append({
			"writer": str(item["writer"]),
			"ok": ok,
			"recipient": str(recipient.get("text", "")),
			"sender": str(sender.get("text", "")),
		})
	var result := {
		"ok": all_ok,
		"note": _bytes_to_hex(note),
		"opened_own_sender": str(as_alice.get("text", "")),
		"opened_own_recipient": str(as_bob.get("text", "")),
		"opened": opened,
		"notice": NOTICE,
	}
	var file := FileAccess.open(outbox, FileAccess.WRITE)
	if file == null:
		push_error("could not write outbox")
		return 2
	file.store_string(JSON.stringify(result))
	return 0 if all_ok else 1

func _hex_to_bytes(hex_text: String) -> PackedByteArray:
	var out := PackedByteArray()
	var index := 0
	while index + 1 < hex_text.length():
		out.append(("0x" + hex_text.substr(index, 2)).hex_to_int())
		index += 2
	return out

func _bytes_to_hex(raw: PackedByteArray) -> String:
	var out := ""
	for byte in raw:
		out += "%02x" % int(byte)
	return out
