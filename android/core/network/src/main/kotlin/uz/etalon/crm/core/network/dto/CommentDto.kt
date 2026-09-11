package uz.etalon.crm.core.network.dto

import kotlinx.serialization.Serializable

/**
 * `GET`/`POST /api/orders/{id}/comments` hands back the whole Prisma `Comment` row with its author
 * joined (`src/app/api/orders/[id]/comments/route.ts`). Only the fields this client draws are
 * declared; `EtalonJson` ignores the rest (`updatedAt`, `editHistory`, `mentionedUserIds`,
 * `projectId`, `deletedBy`…) — the mentions are resolved server-side and the phone has no edit,
 * delete or mention-picker surface to spend them on. The author's `role` is ignored for the same
 * reason: a comment row on the phone is a name, a time and a note, with no role badge to draw.
 *
 * [deletedAt] is the exception: the list route already filters `deletedAt: null`, and it is kept
 * so the client states the rule itself rather than trusting a query it cannot see.
 */
@Serializable data class CommentAuthorDto(val id: String, val name: String)

@Serializable data class CommentDto(
    val id: String,
    val body: String,
    val createdAt: String,
    val author: CommentAuthorDto,
    val deletedAt: String? = null,
)

/** `CommentCreateSchema` in src/lib/validation.ts: one trimmed body, 1–4 000 characters. */
@Serializable data class CommentCreateRequest(val body: String)
