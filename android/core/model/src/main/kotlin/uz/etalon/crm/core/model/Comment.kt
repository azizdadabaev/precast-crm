package uz.etalon.crm.core.model

import java.time.Instant

/**
 * One «Шарҳлар» line on an order — the deal's whole thread, which on the server is the comments
 * left on the order PLUS the ones left on its source draft before it was placed.
 *
 * [body] is the raw text the author typed, `@mentions` and all: the server resolves them to user
 * ids at write time (for the `COMMENT_MENTION` push) and the thread stays raw prose, so the phone
 * draws an `@name` as plain text rather than inventing a link it has no screen for.
 *
 * There is no `deletedAt` here: the list route filters soft-deleted rows out, and this client
 * neither edits nor deletes, so a comment that reaches the model is one that exists. Nor is there
 * an author role: a row draws the name, the time and the note, and §5.1a puts no role badge on the
 * phone — a field nothing reads is one more thing to keep in step with the server for nothing.
 */
data class OrderComment(
    val id: String,
    val body: String,
    val createdAt: Instant,
    val authorId: String,
    val authorName: String,
)
