extends Control

var chat: AlgoChat
var wallet_address := ""
var wallet_mnemonic := ""
var wallet_seed := PackedByteArray()

@onready var address_field: LineEdit = $Center/Card/Address
@onready var to_field: LineEdit = $Center/Card/To
@onready var message_field: LineEdit = $Center/Card/Message
@onready var status: Label = $Center/Card/Status

func _ready() -> void:
	chat = AlgoChat.new()
	_style_fields()
	$Center/Card/Send.pressed.connect(_send)
	message_field.text_submitted.connect(func(_text: String) -> void: _send())
	_load_wallet()

func _style_fields() -> void:
	var field := StyleBoxFlat.new()
	field.bg_color = Color(0.141176, 0.12549, 0.109804)
	field.set_corner_radius_all(8)
	field.content_margin_left = 12
	field.content_margin_right = 12
	field.content_margin_top = 10
	field.content_margin_bottom = 10
	for node in [address_field, to_field, message_field]:
		node.add_theme_stylebox_override("normal", field)
		node.add_theme_color_override("font_color", Color(0.952941, 0.937255, 0.905882))
		node.add_theme_font_size_override("font_size", 16)
	var button := StyleBoxFlat.new()
	button.bg_color = Color(0.901961, 0.701961, 0.352941)
	button.set_corner_radius_all(8)
	var send := $Center/Card/Send
	send.add_theme_stylebox_override("normal", button)
	send.add_theme_color_override("font_color", Color(0.0862745, 0.0784314, 0.0705882))
	send.add_theme_font_size_override("font_size", 18)

func _load_wallet() -> void:
	if not FileAccess.file_exists("user://localnet-wallet.json"):
		status.text = "No account on this machine."
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string("user://localnet-wallet.json"))
	if typeof(parsed) != TYPE_DICTIONARY:
		status.text = "The saved account could not be read."
		return
	wallet_address = str(parsed.get("address", ""))
	wallet_mnemonic = str(parsed.get("mnemonic", ""))
	wallet_seed = _hex_to_bytes(str(parsed.get("seed", "")))
	address_field.text = wallet_address
	status.text = "Account loaded."

func _send() -> void:
	if wallet_seed.size() != 32:
		status.text = "No account loaded."
		return
	var recipient_address := to_field.text.strip_edges()
	var text := message_field.text
	if recipient_address == "" or text == "":
		status.text = "Enter an address and a message."
		return
	status.text = "Sending..."
	var found: Dictionary = _bridge("discover", {"to": recipient_address})
	if not bool(found.get("ok", false)):
		status.text = str(found.get("error", "Could not find that address's key."))
		return
	var sealed: Dictionary = chat.seal_everyday(text, wallet_seed, _hex_to_bytes(str(found["publicKey"])))
	if not bool(sealed.get("ok", false)):
		status.text = str(sealed.get("error", "Could not seal the message."))
		return
	var sent: Dictionary = _bridge("send", {
		"mnemonic": wallet_mnemonic,
		"to": recipient_address,
		"note": _bytes_to_hex(sealed["note"]),
		"amount": 1000,
	})
	if not bool(sent.get("ok", false)):
		status.text = str(sent.get("error", "Send failed."))
		return
	message_field.text = ""
	status.text = "Sent. Fee %s microALGO." % str(sent.get("fee", "1000"))

func _bridge(op: String, body: Dictionary) -> Dictionary:
	var request_path := "user://bridge-%s-request.json" % op
	var result_path := "user://bridge-%s-result.json" % op
	var request := FileAccess.open(request_path, FileAccess.WRITE)
	if request == null:
		return {"ok": false, "error": "Could not write the request."}
	request.store_string(JSON.stringify(body))
	request.close()
	var output: PackedStringArray = []
	OS.execute(_bun(), [
		_repo().path_join("ts/scripts/godot-raven.ts"),
		op,
		ProjectSettings.globalize_path(request_path),
		ProjectSettings.globalize_path(result_path),
	], output, true)
	if not FileAccess.file_exists(result_path):
		return {"ok": false, "error": "LocalNet did not answer."}
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(result_path))
	if typeof(parsed) != TYPE_DICTIONARY:
		return {"ok": false, "error": "LocalNet returned an unreadable result."}
	return parsed

func _repo() -> String:
	return ProjectSettings.globalize_path("res://").path_join("../..").simplify_path()

func _bun() -> String:
	var from_env := OS.get_environment("BUN")
	if from_env != "" and FileAccess.file_exists(from_env):
		return from_env
	var home := OS.get_environment("HOME")
	for path in [home.path_join(".bun/bin/bun"), "/opt/homebrew/bin/bun", "/usr/local/bin/bun"]:
		if path != "" and FileAccess.file_exists(path):
			return path
	return "bun"

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
