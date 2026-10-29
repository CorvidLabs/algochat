package com.corvidlabs.algochat

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.io.File
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Room bots, ops 13 and 14. vectors/group-admin-bots-v1.json is shared by all six libraries. */
class GroupAdminBotsTest {
    @Test
    fun `constants match the bots vector`() {
        val constants = vector.obj("constants")
        assertEquals(GroupAdmin.OP_ADD_BOT, constants.int("op_add_bot"))
        assertEquals(GroupAdmin.OP_SET_BOT, constants.int("op_set_bot"))
        assertEquals(GroupAdmin.BOT_MODE_MENTIONS, constants.int("mode_mentions"))
        assertEquals(GroupAdmin.BOT_MODE_EVERY_MESSAGE, constants.int("mode_every_message"))
        assertEquals(GroupAdmin.BOT_MODE_COMMANDS, constants.int("mode_commands"))
        assertEquals(GroupAdmin.BOT_SETTINGS_SIZE, constants.int("settings_size"))
        assertEquals(GroupAdmin.BOT_RATE_PRESET_REPLIES, constants.int("preset_replies"))
        assertEquals(GroupAdmin.BOT_RATE_PRESET_SECONDS, constants.int("preset_seconds"))
    }

    @Test
    fun `drafts match byte for byte and bad drafts fail with the shared sentence`() {
        for (element in vector.arr("drafts")) {
            val item = element.jsonObject
            assertEquals(item.str("note"), hex(draft(item)), item.str("name"))
        }
        for (element in vector.arr("draft_errors")) {
            val item = element.jsonObject
            val error = assertThrows<RoomAdminException>(item.str("name")) { draft(item) }
            assertTrue(
                error.message!!.lowercase().contains(item.str("error_includes").lowercase()),
                "${item.str("name")}: ${error.message}"
            )
        }
    }

    @Test
    fun `reductions agree on reasons, ops and state`() {
        for ((name, element) in vector.obj("reductions")) {
            val item = element.jsonObject
            val got = reduce(name)
            assertEquals(
                item.arr("rejected").map { it.jsonObject.str("tx_id") to it.jsonObject.str("reason") },
                got.rejected.map { hex(it.txId) to it.reason },
                name
            )
            assertEquals(item.arr("accepted").map { it.jsonObject.int("op") }, got.accepted.map { it.op }, name)
            assertEquals(item["state"], got.state?.let(::snap) ?: JsonNull, name)
        }
    }

    @Test
    fun `delivery and bot lookups match`() {
        val checks = vector.obj("checks")
        for (element in checks.arr("delivery_authorized")) {
            val item = element.jsonObject
            val got = reduce(item.str("reduction"))
            val allowed = GroupAdmin.deliveryAuthorized(
                got.accepted,
                unhex(item.str("admin_tx_id")),
                unhex(item.str("sender")),
                unhex(item.str("recipient")),
                item.int("epoch")
            )
            assertEquals(item["allowed"]!!.jsonPrimitive.boolean, allowed, item.toString())
        }
        for (element in checks.arr("room_bot")) {
            val item = element.jsonObject
            val state = reduce(item.str("reduction")).state!!
            val found = GroupAdmin.roomBot(state, unhex(item.str("account")))
            val want = item["bot"]
            if (want == null || want is JsonNull) {
                assertNull(found, item.toString())
            } else {
                assertEquals(settings(want.jsonObject), found?.settings, item.toString())
            }
        }
    }

    /** AGENT-7.c: ordinary op 11, a new room key, and op 11 on each channel. */
    @Test
    fun `a removed bot is dropped from the room and its channels`() {
        val checks = vector.obj("checks").arr("channel_departures")
        assertTrue(checks.isNotEmpty())
        for (element in checks) {
            val item = element.jsonObject
            val got = GroupAdmin.channelDepartures(
                reduce(item.str("channel")).state!!,
                reduce(item.str("parent")).state!!
            )
            assertEquals(item.arr("departures").map { it.jsonPrimitive.content }, got.map(::hex), item.toString())
        }
        for (name in listOf("parent_bot_removed", "channel_bot_removed")) {
            val got = reduce(name)
            assertEquals(11, got.accepted.last().op, name) // op 11, ordinary remove
            assertEquals(2, got.state!!.epoch, name)
            assertTrue(got.state!!.bots.isEmpty(), name)
        }
    }

    /** AGENT-7.b: key announcement, chat note, text flag, join request and self op 13 never mark a bot. */
    @Test
    fun `nothing an account posts about itself marks it as a bot`() {
        val account = ByteArray(32) { 5 }
        val events = vector.obj("reductions").obj("self_posts_are_not_a_bot").arr("events")
        assertEquals(5, events.count { it.jsonObject.str("sender") == hex(account) })
        val got = reduce("self_posts_are_not_a_bot")
        val state = got.state!!
        assertTrue(state.members.any { it.contentEquals(account) })
        assertTrue(state.bots.isEmpty())
        assertNull(GroupAdmin.roomBot(state, account))
        assertTrue(got.accepted.none { it.op == GroupAdmin.OP_ADD_BOT })
        val reasons = got.rejected.associate { hex(it.txId) to it.reason }
        assertEquals("Sender cannot add that bot", reasons["57".repeat(32)])
        for (tx in listOf("54", "55", "56")) {
            assertEquals("Not a room administration record", reasons[tx.repeat(32)], tx)
        }
    }

    @Test
    fun `bot settings ride only on a bot delta record`() {
        val preset = BotSettings(
            GroupAdmin.BOT_MODE_MENTIONS,
            GroupAdmin.BOT_RATE_PRESET_REPLIES,
            GroupAdmin.BOT_RATE_PRESET_SECONDS
        )
        fun encode(op: Int, omitted: Boolean, bot: BotSettings?): ByteArray = GroupAdmin.encodeAdminRecord(
            ByteArray(32), ByteArray(32) { 7 }, ByteArray(32) { 9 }, 1, op, ByteArray(0), 1,
            ByteArray(32) { 1 }, emptyList(), emptyList(), ByteArray(32) { 5 }, omitted, ByteArray(32), bot
        )
        val onAdd = assertThrows<RoomAdminException> { encode(7, true, preset) }
        assertTrue(onAdd.message!!.contains("Only a bot record"))
        val missing = assertThrows<RoomAdminException> { encode(GroupAdmin.OP_ADD_BOT, true, null) }
        assertTrue(missing.message!!.contains("needs a reply mode"))
        val full = assertThrows<RoomAdminException> { encode(GroupAdmin.OP_ADD_BOT, false, preset) }
        assertTrue(full.message!!.contains("delta note"))
        val note = encode(GroupAdmin.OP_ADD_BOT, true, preset)
        assertEquals(205 + GroupAdmin.BOT_SETTINGS_SIZE, note.size)
        assertEquals("01000500" + "3c", hex(note.copyOfRange(note.size - 5, note.size)))
    }

    private fun draft(item: JsonObject): ByteArray {
        return GroupAdmin.draftAdmin(
            state(item["basis_state"]),
            item.int("op"),
            unhex(item.str("sender")),
            unhex(item.str("subject")),
            item["name_utf8"]?.let { if (it is JsonNull) null else it.jsonPrimitive.content.toByteArray() },
            item["policy"]?.let { if (it is JsonNull) null else it.jsonPrimitive.int },
            item["group_id"]?.let { if (it is JsonNull) null else unhex(it.jsonPrimitive.content) },
            item["mailbox"]?.let { if (it is JsonNull) null else unhex(it.jsonPrimitive.content) },
            state(item["parent_room"]),
            item["bot"]?.let { if (it is JsonNull) null else settings(it.jsonObject) }
        )
    }

    private fun reduce(name: String): ReduceAdminResult {
        val item = vector.obj("reductions").obj(name)
        val parent = item["parent_events"]
        return GroupAdmin.reduceAdmin(
            item.arr("events").map(::event),
            if (parent == null || parent is JsonNull) null else parent.jsonArray.map(::event)
        )
    }

    private fun event(element: JsonElement): AdminEvent {
        val item = element.jsonObject
        return AdminEvent(
            unhex(item.str("note")),
            unhex(item.str("sender")),
            unhex(item.str("tx_id")),
            item.int("round"),
            item.int("offset")
        )
    }

    private fun state(element: JsonElement?): RoomState? {
        if (element == null || element is JsonNull) return null
        val item = element.jsonObject
        return RoomState(
            unhex(item.str("group_id")),
            unhex(item.str("mailbox")),
            unhex(item.str("owner")),
            item.arr("admins").map { unhex(it.jsonPrimitive.content) },
            item.arr("members").map { unhex(it.jsonPrimitive.content) },
            item.arr("pending").map { unhex(it.jsonPrimitive.content) },
            item.int("policy"),
            unhex(item.str("name_hex")),
            item.int("epoch"),
            unhex(item.str("head_tx_id")),
            item["parent_group_id"]?.let { if (it is JsonNull) ByteArray(32) else unhex(it.jsonPrimitive.content) }
                ?: ByteArray(32),
            item["bots"]?.let { bots ->
                if (bots is JsonNull) {
                    emptyList()
                } else {
                    bots.jsonArray.map { RoomBot(unhex(it.jsonObject.str("account")), settings(it.jsonObject)) }
                }
            } ?: emptyList()
        )
    }

    private fun settings(item: JsonObject): BotSettings =
        BotSettings(item.int("mode"), item.int("replies"), item.int("seconds"))

    private fun snap(state: RoomState): JsonObject = buildJsonObject {
        put("group_id", hex(state.groupId))
        put("mailbox", hex(state.mailbox))
        put("owner", hex(state.owner))
        put("admins", JsonArray(state.admins.map { JsonPrimitive(hex(it)) }))
        put("members", JsonArray(state.members.map { JsonPrimitive(hex(it)) }))
        put("pending", JsonArray(state.pending.map { JsonPrimitive(hex(it)) }))
        put("policy", state.policy)
        put("name_hex", hex(state.name))
        put("epoch", state.epoch)
        put("head_tx_id", hex(state.headTxId))
        put("parent_group_id", hex(state.parentGroupId))
        put(
            "bots",
            JsonArray(
                state.bots.map { bot ->
                    buildJsonObject {
                        put("account", hex(bot.account))
                        put("mode", bot.settings.mode)
                        put("replies", bot.settings.replies)
                        put("seconds", bot.settings.seconds)
                    }
                }
            )
        )
    }

    private fun JsonObject.str(name: String): String = this[name]?.jsonPrimitive?.content ?: error("missing $name")
    private fun JsonObject.int(name: String): Int = this[name]?.jsonPrimitive?.int ?: error("missing $name")
    private fun JsonObject.arr(name: String): JsonArray = this[name]?.jsonArray ?: error("missing $name")
    private fun JsonObject.obj(name: String): JsonObject = this[name]?.jsonObject ?: error("missing $name")

    private fun hex(bytes: ByteArray): String = bytes.joinToString("") { "%02x".format(it) }
    private fun unhex(text: String): ByteArray = text.chunked(2).map { it.toInt(16).toByte() }.toByteArray()

    companion object {
        private val vector: JsonObject = Json.parseToJsonElement(
            listOf("../vectors/group-admin-bots-v1.json", "vectors/group-admin-bots-v1.json")
                .map(::File).first { it.exists() }.readText()
        ).jsonObject
    }
}
