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
import org.bouncycastle.crypto.modes.ChaCha20Poly1305
import org.bouncycastle.crypto.params.AEADParameters
import org.bouncycastle.crypto.params.KeyParameter
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

    @Test
    fun `action 5 binds version session and a positive epoch`() {
        val session = PQSession(ByteArray(32) { 0x42 }, ByteArray(32) { 0x11 }, ByteArray(32), ByteArray(32) { 0x43 })
        val nonce = ByteArray(12) { 0x55 }
        val groupId = ByteArray(32) { 7 }
        val mailbox = ByteArray(32) { 9 }
        val note = GroupAdmin.sealGroupKeyDelivery(session, 1, groupId, mailbox, ByteArray(32) { 4 }, ByteArray(32) { 10 }, nonce)
        assertEquals(1, GroupAdmin.openGroupKeyDelivery(note, session).epoch)
        val senderError = assertThrows<RoomAdminException> {
            GroupAdmin.openGroupKeyDelivery(note, PQSession(session.sessionKey, ByteArray(32) { 0x22 }, ByteArray(32), session.handshakeId))
        }
        assertTrue(senderError.message?.contains("sender") == true, senderError.message)
        val handshakeError = assertThrows<RoomAdminException> {
            GroupAdmin.openGroupKeyDelivery(note, PQSession(session.sessionKey, session.senderPublicKey, ByteArray(32), ByteArray(32) { 0x44 }))
        }
        assertTrue(handshakeError.message?.contains("handshake") == true, handshakeError.message)
        val flipped = note.copyOf()
        flipped[flipped.size - 1] = (flipped[flipped.size - 1].toInt() xor 1).toByte()
        val tagError = assertThrows<RoomAdminException> { GroupAdmin.openGroupKeyDelivery(flipped, session) }
        assertTrue(tagError.message?.contains("authentication") == true, tagError.message)
        val plain = ByteArray(133)
        plain[0] = 5
        groupId.copyInto(plain, 5)
        mailbox.copyInto(plain, 37)
        ByteArray(32) { 4 }.copyInto(plain, 69)
        ByteArray(32) { 10 }.copyInto(plain, 101)
        for (version in listOf(0, 1, 3, 255)) {
            val error = assertThrows<RoomAdminException> {
                GroupAdmin.openGroupKeyDelivery(sealRaw(session, plain, version, nonce), session)
            }
            assertTrue(error.message?.contains("Not a group key delivery") == true, "version $version ${error.message}")
        }
        val epochError = assertThrows<RoomAdminException> {
            GroupAdmin.openGroupKeyDelivery(sealRaw(session, plain, PQProtocol.VERSION.toInt(), nonce), session)
        }
        assertTrue(epochError.message?.contains("epoch") == true, epochError.message)
    }

    @Test
    fun `undefined joining policies are rejected and leave the room unchanged`() {
        val owner = ByteArray(32) { 1 }
        val groupId = ByteArray(32) { 7 }
        val mailbox = ByteArray(32) { 9 }
        val create = GroupAdmin.draftAdmin(null, 1, owner, ByteArray(32), "team".toByteArray(), 1, groupId, mailbox)
        for (policy in listOf(0, 3, 255)) {
            val reduced = GroupAdmin.reduceAdmin(listOf(AdminEvent(withPolicy(create, policy), owner, ByteArray(32) { 10 }, 1, 0)))
            assertEquals(null, reduced.state)
            assertEquals(0, reduced.accepted.size)
            assertTrue(reduced.rejected[0].reason.contains("invite-only or ask-to-join"))
        }
        val created = GroupAdmin.reduceAdmin(listOf(AdminEvent(create, owner, ByteArray(32) { 10 }, 1, 0)))
        val state = created.state ?: error("create")
        val setPolicy = GroupAdmin.draftAdmin(state, 3, owner, policy = 2)
        for (policy in listOf(0, 3, 255)) {
            val reduced = GroupAdmin.reduceAdmin(listOf(
                AdminEvent(create, owner, ByteArray(32) { 10 }, 1, 0),
                AdminEvent(withPolicy(setPolicy, policy), owner, ByteArray(32) { 11 }, 1, 1)
            ))
            assertEquals(1, reduced.state?.policy)
            assertTrue(reduced.state?.headTxId.contentEquals(ByteArray(32) { 10 }) == true)
            assertEquals(1, reduced.rejected.size)
            assertTrue(reduced.rejected[0].reason.contains("invite-only or ask-to-join"))
        }
    }

    @Test
    fun `a join request must cite an accepted administration transaction`() {
        val owner = ByteArray(32) { 1 }
        val friend = ByteArray(32) { 2 }
        val groupId = ByteArray(32) { 7 }
        val mailbox = ByteArray(32) { 9 }
        val create = GroupAdmin.draftAdmin(null, 1, owner, ByteArray(32), "general".toByteArray(), 2, groupId, mailbox)
        val created = GroupAdmin.reduceAdmin(listOf(AdminEvent(create, owner, ByteArray(32) { 10 }, 1, 0)))
        val state = created.state ?: error("create")
        val real = GroupAdmin.draftAdmin(state, 8, friend, friend)
        val zero = real.copyOf()
        ByteArray(32).copyInto(zero, 2)
        val unknown = real.copyOf()
        ByteArray(32) { 0x99.toByte() }.copyInto(unknown, 2)
        val base = AdminEvent(create, owner, ByteArray(32) { 10 }, 1, 0)
        val zeroed = GroupAdmin.reduceAdmin(listOf(base, AdminEvent(zero, friend, ByteArray(32) { 11 }, 1, 1)))
        assertEquals(0, zeroed.state?.pending?.size)
        assertTrue(zeroed.state?.headTxId.contentEquals(ByteArray(32) { 10 }) == true)
        assertTrue(zeroed.rejected[0].reason.contains("cite"))
        val missed = GroupAdmin.reduceAdmin(listOf(base, AdminEvent(unknown, friend, ByteArray(32) { 11 }, 1, 1)))
        assertEquals(0, missed.state?.pending?.size)
        assertEquals(2, missed.state?.policy)
        assertTrue(missed.rejected[0].reason.contains("cite"))
        val accepted = GroupAdmin.reduceAdmin(listOf(base, AdminEvent(real, friend, ByteArray(32) { 11 }, 1, 1)))
        assertEquals(0, accepted.rejected.size)
        assertEquals(1, accepted.state?.pending?.size)
        assertTrue(accepted.state?.pending?.get(0)?.contentEquals(friend) == true)
        assertTrue(accepted.state?.headTxId.contentEquals(ByteArray(32) { 10 }) == true)
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

private fun withPolicy(note: ByteArray, policy: Int): ByteArray {
    val out = note.copyOf()
    val nameLen = out[103].toInt() and 0xff
    out[104 + nameLen] = policy.toByte()
    return out
}

private fun sealRaw(session: PQSession, plain: ByteArray, version: Int, nonce: ByteArray): ByteArray {
    val header = ByteArray(PQProtocol.DATA_HEADER_SIZE)
    header[0] = version.toByte()
    header[1] = GroupProtocol.MEMBERSHIP_ID
    session.senderPublicKey.copyInto(header, 2)
    session.handshakeId.copyInto(header, 34)
    nonce.copyInto(header, 66)
    val cipher = ChaCha20Poly1305()
    cipher.init(true, AEADParameters(KeyParameter(session.sessionKey), 128, nonce, header))
    val output = ByteArray(cipher.getOutputSize(plain.size))
    val written = cipher.processBytes(plain, 0, plain.size, output, 0)
    cipher.doFinal(output, written)
    return header + output
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
