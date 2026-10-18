package com.corvidlabs.algochat

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.io.File
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Protocol 0x03 and 0x06 action 5 against vectors/group-admin-v1.json.
 */
class GroupAdminTest {
    @Test
    fun `drafts match the vector notes`() {
        for (element in root.arr("drafts")) {
            val draft = element.jsonObject
            val note = GroupAdmin.draftAdmin(
                draft.stateOrNull("basis_state"),
                draft.int("op"),
                unhex(draft.str("sender")),
                unhex(draft.str("subject")),
                draft.utf8OrNull("name_utf8"),
                draft.intOrNull("policy"),
                draft.hexOrNull("group_id"),
                draft.hexOrNull("mailbox")
            )
            assertEquals(draft.str("note"), hex(note), draft.str("name"))
        }
    }

    @Test
    fun `draft errors contain the vector sentence`() {
        for (element in root.arr("draft_errors")) {
            val item = element.jsonObject
            val error = assertThrows<RoomAdminException> {
                GroupAdmin.draftAdmin(
                    item.stateOrNull("basis_state"),
                    item.int("op"),
                    unhex(item.str("sender")),
                    unhex(item.str("subject")),
                    item.utf8OrNull("name_utf8"),
                    item.intOrNull("policy"),
                    item.hexOrNull("group_id"),
                    item.hexOrNull("mailbox")
                )
            }
            val expected = item.str("error_includes")
            assertTrue(
                error.message?.contains(expected, ignoreCase = true) == true,
                "${item.str("name")} message \"${error.message}\" does not contain \"$expected\""
            )
        }
    }

    @Test
    fun `reductions match rejected reasons accepted ops and state`() {
        for ((name, element) in root.obj("reductions")) {
            val reduction = element.jsonObject
            val result = reduce(reduction)
            val rejected = reduction.arr("rejected")
            assertEquals(
                rejected.map { it.jsonObject.str("reason") },
                result.rejected.map { it.reason },
                name
            )
            val accepted = reduction.arr("accepted")
            assertEquals(
                accepted.map { it.jsonObject.int("op") },
                result.accepted.map { it.op },
                name
            )
            assertState(name, reduction["state"], result.state)
        }
    }

    @Test
    fun `delivery authorization and posting follow the vector`() {
        val reduced = HashMap<String, ReduceAdminResult>()
        for ((name, element) in root.obj("reductions")) {
            reduced[name] = reduce(element.jsonObject)
        }
        for (element in root.obj("checks").arr("delivery_authorized")) {
            val check = element.jsonObject
            val result = reduced[check.str("reduction")] ?: error("missing ${check.str("reduction")}")
            assertEquals(
                check.bool("allowed"),
                GroupAdmin.deliveryAuthorized(
                    result.accepted,
                    unhex(check.str("admin_tx_id")),
                    unhex(check.str("sender")),
                    unhex(check.str("recipient")),
                    check.int("epoch")
                ),
                check.str("reduction")
            )
        }
        for (element in root.obj("checks").arr("may_post")) {
            val check = element.jsonObject
            val result = reduced[check.str("reduction")] ?: error("missing ${check.str("reduction")}")
            val state = result.state ?: error("no state for ${check.str("reduction")}")
            assertEquals(
                check.bool("allowed"),
                GroupAdmin.senderMayPost(state, unhex(check.str("sender")), check.int("epoch")),
                check.str("reduction")
            )
        }
    }

    @Test
    fun `action 5 delivery matches the vector and is not a legacy membership note`() {
        val delivery = root.obj("delivery")
        val session = PQSession(
            unhex(delivery.str("session_key")),
            unhex(delivery.str("sender_x25519")),
            ByteArray(32),
            unhex(delivery.str("handshake_id"))
        )
        val note = GroupAdmin.sealGroupKeyDelivery(
            session,
            delivery.int("epoch"),
            unhex(delivery.str("group_id")),
            unhex(delivery.str("mailbox")),
            unhex(delivery.str("group_key")),
            unhex(delivery.str("admin_tx_id")),
            unhex(delivery.str("nonce"))
        )
        assertEquals(227, note.size)
        assertEquals(195, GroupProtocol.MEMBERSHIP_NOTE_SIZE)
        assertEquals(false, Group.isGroupMembership(note))
        assertEquals(delivery.str("note"), hex(note))
        val opened = GroupAdmin.openGroupKeyDelivery(note, session)
        assertEquals(delivery.str("group_key"), hex(opened.groupKey))
        assertEquals(delivery.int("epoch"), opened.epoch)
        assertEquals(delivery.str("group_id"), hex(opened.groupId))
        assertEquals(delivery.str("mailbox"), hex(opened.mailbox))
        assertEquals(delivery.str("admin_tx_id"), hex(opened.adminTxId))
    }

    private fun reduce(reduction: JsonObject): ReduceAdminResult {
        val events = reduction.arr("events").map { element ->
            val item = element.jsonObject
            AdminEvent(
                unhex(item.str("note")),
                unhex(item.str("sender")),
                unhex(item.str("tx_id")),
                item.int("round"),
                item.int("offset")
            )
        }
        return GroupAdmin.reduceAdmin(events)
    }

    private fun assertState(name: String, element: kotlinx.serialization.json.JsonElement?, actual: RoomState?) {
        if (element == null || element is JsonNull) {
            assertEquals(null, actual, name)
            return
        }
        val expected = element.jsonObject
        val state = actual ?: error("$name state is null")
        assertEquals(expected.str("group_id"), hex(state.groupId), name)
        assertEquals(expected.str("mailbox"), hex(state.mailbox), name)
        assertEquals(expected.str("owner"), hex(state.owner), name)
        assertEquals(expected.hexList("admins"), state.admins.map { hex(it) }, name)
        assertEquals(expected.hexList("members"), state.members.map { hex(it) }, name)
        assertEquals(expected.hexList("pending"), state.pending.map { hex(it) }, name)
        assertEquals(expected.int("policy"), state.policy, name)
        assertEquals(expected.str("name_hex"), hex(state.name), name)
        assertEquals(expected.int("epoch"), state.epoch, name)
        assertEquals(expected.str("head_tx_id"), hex(state.headTxId), name)
    }

    companion object {
        private val json = Json { ignoreUnknownKeys = true }
        private val root = loadRoot()

        private fun loadRoot(): JsonObject {
            val dir = File(System.getProperty("user.dir"))
            val file = listOf(
                File(dir, "../vectors/group-admin-v1.json"),
                File(dir, "vectors/group-admin-v1.json")
            ).firstOrNull { it.isFile } ?: error("group-admin-v1.json not found from $dir")
            return json.parseToJsonElement(file.readText()).jsonObject
        }

        private fun unhex(hex: String): ByteArray {
            return hex.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
        }

        private fun hex(bytes: ByteArray): String {
            return bytes.joinToString("") { "%02x".format(it.toInt() and 0xff) }
        }
    }
}

private fun JsonObject.str(name: String): String {
    return this[name]?.jsonPrimitive?.content ?: error("missing $name")
}

private fun JsonObject.int(name: String): Int {
    return this[name]?.jsonPrimitive?.int ?: error("missing $name")
}

private fun JsonObject.bool(name: String): Boolean {
    return this[name]?.jsonPrimitive?.boolean ?: error("missing $name")
}

private fun JsonObject.arr(name: String): JsonArray {
    return this[name]?.jsonArray ?: error("missing $name")
}

private fun JsonObject.obj(name: String): JsonObject {
    return this[name]?.jsonObject ?: error("missing $name")
}

private fun JsonObject.intOrNull(name: String): Int? {
    val value = this[name] ?: return null
    if (value is JsonNull) return null
    return value.jsonPrimitive.int
}

private fun JsonObject.hexOrNull(name: String): ByteArray? {
    val value = this[name] ?: return null
    if (value is JsonNull) return null
    return value.jsonPrimitive.content.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
}

private fun JsonObject.utf8OrNull(name: String): ByteArray? {
    val value = this[name] ?: return null
    if (value is JsonNull) return null
    return value.jsonPrimitive.content.toByteArray(Charsets.UTF_8)
}

private fun JsonObject.hexList(name: String): List<String> {
    return arr(name).map { it.jsonPrimitive.content }
}

private fun JsonObject.stateOrNull(name: String): RoomState? {
    val value = this[name] ?: return null
    if (value is JsonNull) return null
    val state = value.jsonObject
    return RoomState(
        state.str("group_id").chunked(2).map { it.toInt(16).toByte() }.toByteArray(),
        state.str("mailbox").chunked(2).map { it.toInt(16).toByte() }.toByteArray(),
        state.str("owner").chunked(2).map { it.toInt(16).toByte() }.toByteArray(),
        state.hexList("admins").map { it.chunked(2).map { byte -> byte.toInt(16).toByte() }.toByteArray() },
        state.hexList("members").map { it.chunked(2).map { byte -> byte.toInt(16).toByte() }.toByteArray() },
        state.hexList("pending").map { it.chunked(2).map { byte -> byte.toInt(16).toByte() }.toByteArray() },
        state.int("policy"),
        state.str("name_hex").chunked(2).map { it.toInt(16).toByte() }.toByteArray(),
        state.int("epoch"),
        state.str("head_tx_id").chunked(2).map { it.toInt(16).toByte() }.toByteArray()
    )
}
