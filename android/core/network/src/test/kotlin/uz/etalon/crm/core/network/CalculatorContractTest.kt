package uz.etalon.crm.core.network

import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.File

/**
 * The room DTO names fields the server's Zod parses. A rename in validation.ts today passes every
 * other check — vitest never asserts the key names, `openapi:check` reads the same schema object,
 * and the first failure is a 422 in front of a customer with the quote already typed in.
 *
 * Reads the REAL `validation.ts` source rather than the generated OpenAPI document, for the same
 * reason `ServerContractTest` does — see that class's own KDoc. This file duplicates its tiny
 * regex-based parser rather than sharing it: each contract test owns its own, exactly as
 * `ServerContractTest` already does, and neither is a general-purpose TS parser.
 */
class CalculatorContractTest {

    private fun repoRoot(): File {
        var dir: File? = File(System.getProperty("user.dir") ?: ".").absoluteFile
        while (dir != null) {
            if (File(dir, "precast-crm/src/lib/validation.ts").isFile) return dir
            dir = dir.parentFile
        }
        bail(
            "Could not find precast-crm/src from ${System.getProperty("user.dir")}. This test " +
                "reads the real server sources; the Android modules live in the same repository.",
        )
    }

    private fun serverFile(relative: String): String {
        val f = File(repoRoot(), relative)
        assertTrue(f.isFile, "missing server source: $relative")
        return f.readText()
    }

    private val validation by lazy { serverFile("precast-crm/src/lib/validation.ts") }

    @Test fun `RoomCalcInputBaseSchema still carries every field RoomCalcInputDto sends`() {
        val body = zodObjectBody(validation, "RoomCalcInputBaseSchema")
        for (f in listOf(
            "name", "innerWidth", "innerLength", "bearing", "correction", "extraBeams",
            "forceStartBeam", "patternOverride", "m2PriceOverride", "m2PriceOverrideValue", "m2PriceReason",
        )) assertField(body, f, "RoomCalcInputDto.$f")
    }

    /** Why an extras-only room (`innerLength == 0`, `extraBeams >= 1`) computes and counts on
     *  screen but `SlabRow.canPersist` is false — see that property's own KDoc. */
    @Test fun `innerLength is still positive, which is why an extras-only room cannot be saved`() {
        assertTrue(
            Regex("""innerLength:\s*z\.coerce\.number\(\)\.positive\(\)""").containsMatchIn(validation),
            "innerLength is no longer `.positive()` in RoomCalcInputBaseSchema — SlabRow.canPersist's reasoning needs updating too",
        )
    }

    @Test fun `SaveProjectDraftSchema and PlaceOrderSchema still carry what this client sends`() {
        val draft = zodObjectBody(validation, "SaveProjectDraftSchema")
        for (f in listOf("projectId", "clientName", "clientPhone", "clientAddress", "rooms", "discountPercent", "discountAmount")) {
            assertField(draft, f, "SaveProjectDraftRequest.$f")
        }
        // `PlaceOrderRequest` sends every one of these, and `SaveProjectDraftRequest`'s shape is a
        // deliberate subset of the same object — a divergence between the two server-side is
        // exactly the kind of change this pins.
        val order = zodObjectBody(validation, "PlaceOrderSchema")
        for (f in listOf(
            "clientName", "clientPhone", "clientAddress", "rooms", "discountPercent", "discountAmount",
            "deliveryCost", "otherCost", "scheduledAt", "notes", "paidAmount", "receiptUrls",
        )) assertField(order, f, "PlaceOrderRequest.$f")
    }

    /**
     * `scheduledAt` is the one field on `PlaceOrderSchema` with no default and no `.optional()`,
     * which is why `PlaceOrderSheet` refuses to submit without a date instead of quietly sending
     * "today" — a real production commitment nobody chose. If the server ever grows a default here,
     * that refusal becomes needless friction and this test is where that is noticed.
     */
    @Test fun `scheduledAt is still required, which is why the sheet demands a date`() {
        val order = zodObjectBody(validation, "PlaceOrderSchema")
        assertTrue(
            Regex("""scheduledAt:\s*z\.coerce\.date\(\),""").containsMatchIn(order),
            "PlaceOrderSchema.scheduledAt is no longer a bare required `z.coerce.date()` — " +
                "PlaceOrderSheet's mandatory date picker needs revisiting.\nSearched:\n$order",
        )
    }

    /**
     * `PlaceOrderRequest` deliberately omits `paymentMethod` and pins `paidAmount` at 0, because
     * the refinement below only DEMANDS a method once a payment is actually attached. Prepayment
     * at placement is a later slice; if that refinement ever becomes unconditional, an order this
     * client places would start 422-ing — offline, hours later, with nobody watching.
     */
    @Test fun `paymentMethod is still required only when paidAmount is positive`() {
        assertTrue(
            Regex("""!\(v\.paidAmount\s*>\s*0\)\s*\|\|\s*!!v\.paymentMethod""").containsMatchIn(validation),
            "PlaceOrderSchema's paymentMethod refinement changed — PlaceOrderRequest omits the " +
                "field entirely and sends paidAmount = 0 on the strength of it.",
        )
    }

    // ── the crudest parser that can still fail honestly — mirrors ServerContractTest's own ──

    private fun bail(message: String): Nothing = throw AssertionError(message)

    private fun assertField(objectBody: String, field: String, dependant: String) {
        assertTrue(
            Regex("""(^|[{;,\s])$field\s*:""").containsMatchIn(objectBody),
            "$dependant has no matching server field `$field`. The server shape changed; fix the DTO rather than this test.\nSearched:\n$objectBody",
        )
    }

    /** The body of `export const <name> = z.object({ … })` in validation.ts. */
    private fun zodObjectBody(source: String, name: String): String {
        val head = Regex("""export\s+const\s+$name\s*=\s*z\.object\(\s*\{""").find(source)
            ?: bail("no `export const $name = z.object({` in validation.ts")
        return stripComments(braced(source, head.range.last))
    }

    /** The text between the `{` at [open] and its matching `}`. */
    private fun braced(source: String, open: Int): String {
        var depth = 0
        for (i in open until source.length) {
            when (source[i]) {
                '{' -> depth++
                '}' -> if (--depth == 0) return source.substring(open + 1, i)
            }
        }
        bail("unbalanced braces from offset $open")
    }

    private fun stripComments(s: String): String = s
        .replace(Regex("""/\*.*?\*/""", RegexOption.DOT_MATCHES_ALL), "")
        .replace(Regex("""(?m)//.*$"""), "")
}
