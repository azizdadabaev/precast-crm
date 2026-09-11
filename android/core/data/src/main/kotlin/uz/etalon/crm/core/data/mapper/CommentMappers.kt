package uz.etalon.crm.core.data.mapper

import uz.etalon.crm.core.model.OrderComment
import uz.etalon.crm.core.network.dto.CommentDto
import java.time.Instant

fun CommentDto.toDomain() = OrderComment(
    id = id,
    body = body,
    createdAt = Instant.parse(createdAt),
    authorId = author.id,
    authorName = author.name,
)

/** The thread as the screen draws it: oldest first, exactly as the route orders it, with any
 *  soft-deleted row dropped. The route filters `deletedAt: null` itself; this restates the rule so
 *  a comment the server one day stops filtering does not surface as a ghost. */
fun List<CommentDto>.toCommentThread(): List<OrderComment> =
    filter { it.deletedAt == null }.map { it.toDomain() }
