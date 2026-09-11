package uz.etalon.crm.core.data

import kotlinx.serialization.json.Json
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.data.mapper.toCommentThread
import uz.etalon.crm.core.data.mapper.toDomain
import uz.etalon.crm.core.model.Role
import uz.etalon.crm.core.network.dto.CommentDto
import java.time.Instant

/** The wire shape is `GET /api/orders/{id}/comments`: the whole Prisma `Comment` row with its
 *  author joined. These decode the real payload rather than a hand-made one, because what breaks
 *  a client is a field the server sends that the DTO did not expect. */
class CommentMappersTest {
    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false; coerceInputValues = true }

    /** A row exactly as the route returns it — `updatedAt`, `editHistory`, `mentionedUserIds`,
     *  `projectId`, `gazoblokOrderId` and `deletedBy` included, none of them declared on the DTO. */
    private val wire = """
        {
          "id": "cmt_01",
          "createdAt": "2026-09-10T07:15:00.000Z",
          "updatedAt": "2026-09-10T07:15:00.000Z",
          "orderId": "o3",
          "projectId": null,
          "gazoblokOrderId": null,
          "authorId": "u7",
          "body": "@Азиз юкланди, ҳайдовчи йўлда",
          "mentionedUserIds": ["u1"],
          "editHistory": [],
          "deletedAt": null,
          "deletedBy": null,
          "author": { "id": "u7", "name": "Оператор", "role": "SALES" }
        }
    """.trimIndent()

    @Test fun `a real-shaped row decodes and keeps the mention as plain text`() {
        val c = json.decodeFromString(CommentDto.serializer(), wire).toDomain()
        assertEquals("cmt_01", c.id)
        assertEquals("@Азиз юкланди, ҳайдовчи йўлда", c.body)
        assertEquals(Instant.parse("2026-09-10T07:15:00Z"), c.createdAt)
        assertEquals("u7", c.authorId)
        assertEquals("Оператор", c.authorName)
        assertEquals(Role.SALES, c.authorRole)
    }

    /** `deletedAt` is the one optional field the client reads, and the POST response omits it
     *  entirely — a created comment must still decode. */
    @Test fun `a row without the optional deletedAt still decodes`() {
        val created = """
            {"id":"cmt_02","createdAt":"2026-09-10T08:00:00.000Z","body":"Тайёр",
             "author":{"id":"u7","name":"Оператор","role":"SALES"}}
        """.trimIndent()
        val c = json.decodeFromString(CommentDto.serializer(), created)
        assertNull(c.deletedAt)
        assertEquals("Тайёр", c.toDomain().body)
    }

    @Test fun `an unknown role reads as UNKNOWN rather than failing the thread`() {
        val c = json.decodeFromString(CommentDto.serializer(), wire.replace("\"SALES\"", "\"FOREMAN\"")).toDomain()
        assertEquals(Role.UNKNOWN, c.authorRole)
    }

    /** The route filters soft-deleted rows already; the client restates the rule so one that slips
     *  through is never drawn as a live comment. Order is the route's own, oldest first. */
    @Test fun `the thread drops deleted rows and keeps the server's order`() {
        val a = json.decodeFromString(CommentDto.serializer(), wire)
        val thread = listOf(
            a,
            a.copy(id = "cmt_02", deletedAt = "2026-09-10T09:00:00.000Z"),
            a.copy(id = "cmt_03", createdAt = "2026-09-10T10:00:00.000Z"),
        ).toCommentThread()
        assertEquals(listOf("cmt_01", "cmt_03"), thread.map { it.id })
    }
}
