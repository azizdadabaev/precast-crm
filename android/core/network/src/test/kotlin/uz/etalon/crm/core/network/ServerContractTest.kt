package uz.etalon.crm.core.network

import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.File

/**
 * The DTOs in this module name server fields, and until now nothing tied the two together.
 *
 * Rename `outstandingReceivables.total` in `src/lib/dashboard-data.ts` today and EVERY check
 * passes — vitest never asserts the payload's field names, the Kotlin tests decode hand-written
 * literals that were copied from the same wrong assumption, and `openapi:check` is blind because
 * `GET /api/dashboard`'s response is registered as `Any`. The first thing that fails is Home, at
 * runtime, in front of an operator, with a raw English `MissingFieldException`.
 *
 * So this reads the REAL server sources — the TypeScript that builds the payload and the Prisma
 * schema whose rows the client routes serialize — and asserts that every field the DTOs depend on
 * is still there. It is deliberately not a check against the generated OpenAPI document: that
 * document is hand-written in `src/lib/openapi/registry.ts` and would keep agreeing with the
 * Kotlin long after the server had stopped agreeing with both. Only the source the server
 * actually runs can fail when the server actually changes.
 *
 * It asserts NAMES, not types or values — that is the whole failure mode, and a shape assertion
 * over TypeScript text would be brittle without catching anything more. A field this client does
 * not read is deliberately absent: `todayDeliveries.count` and `.date` are not asserted because
 * no DTO models them.
 */
class ServerContractTest {

    // ── locating the server sources ───────────────────────────────

    /**
     * Walks up from this module to the repo root. The Gradle test working directory is the module
     * directory, but that is not relied on — any ancestor holding `precast-crm/src` will do.
     */
    private fun repoRoot(): File {
        var dir: File? = File(System.getProperty("user.dir") ?: ".").absoluteFile
        while (dir != null) {
            if (File(dir, "precast-crm/src/lib/dashboard-data.ts").isFile) return dir
            dir = dir.parentFile
        }
        // Never skipped silently: a guard that quietly passes when it cannot find what it guards
        // is worse than no guard, because it reads as coverage.
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

    // ── GET /api/dashboard → DashboardDto ─────────────────────────

    @Test fun `the dashboard payload still carries every field the Home DTOs read`() {
        val payload = tsInterfaceBody(serverFile("precast-crm/src/lib/dashboard-data.ts"), "DashboardPayload")

        // DashboardDto's four members.
        val todayDeliveries = member(payload, "todayDeliveries")
        val openDiscrepancies = member(payload, "openDiscrepancies")
        val outstandingReceivables = member(payload, "outstandingReceivables")
        val ordersByPaymentState = member(payload, "ordersByPaymentState")

        // TodayDeliveriesDto + TodayDeliveryOrderDto.
        assertField(todayDeliveries, "totalArea", "TodayDeliveriesDto.totalArea")
        assertField(todayDeliveries, "orders", "TodayDeliveriesDto.orders")
        val order = member(todayDeliveries, "orders")
        for (f in listOf("id", "orderNumber", "clientName", "totalArea")) {
            assertField(order, f, "TodayDeliveryOrderDto.$f")
        }

        // OpenDiscrepanciesDto.
        assertField(openDiscrepancies, "count", "OpenDiscrepanciesDto.count")
        assertField(openDiscrepancies, "totalAmount", "OpenDiscrepanciesDto.totalAmount")

        // OutstandingReceivablesDto — the field named in the finding that prompted this test.
        assertField(outstandingReceivables, "total", "OutstandingReceivablesDto.total")
        assertField(outstandingReceivables, "orderCount", "OutstandingReceivablesDto.orderCount")

        // OrdersByPaymentStateDto.
        for (f in listOf("paid", "partial", "awaiting")) {
            assertField(ordersByPaymentState, f, "OrdersByPaymentStateDto.$f")
        }
    }

    // ── /api/clients → ClientRowDto / ClientDetailDto ─────────────

    /**
     * Both client routes serialize a raw Prisma row with no `select`, so the columns on the model
     * ARE the wire shape. `_count.orders` comes from the route's `include` rather than the model,
     * and is covered by the relation assertion below.
     */
    @Test fun `the Client model still carries every column the client DTOs read`() {
        val client = prismaModelBody(serverFile("precast-crm/prisma/schema.prisma"), "Client")
        for (column in listOf("id", "name", "phone", "address", "notes")) {
            assertPrismaField(client, column, "ClientRowDto/ClientDetailDto.$column")
        }
        // `_count: { select: { orders: true } }` in src/app/api/clients/route.ts counts THIS
        // relation; renaming it renames the key ClientCountsDto reads.
        assertPrismaField(client, "orders", "ClientCountsDto.orders (the _count relation)")
    }

    @Test fun `the Order model still carries every column the client's order list reads`() {
        val order = prismaModelBody(serverFile("precast-crm/prisma/schema.prisma"), "Order")
        for (column in listOf("id", "orderNumber", "status", "totalPrice", "scheduledAt")) {
            assertPrismaField(order, column, "ClientOrderLineDto.$column")
        }
    }

    // ── the crudest parsers that can still fail honestly ──────────

    /** A failure of the test itself (source moved, braces unbalanced), never of the contract. */
    private fun bail(message: String): Nothing = throw AssertionError(message)

    private fun assertField(objectBody: String, field: String, dependant: String) {
        assertTrue(
            Regex("""(^|[{;,\s])$field\s*:""").containsMatchIn(objectBody),
            "$dependant has no matching server field `$field`. The server shape changed; " +
                "fix the DTO rather than this test.\nSearched:\n$objectBody",
        )
    }

    private fun assertPrismaField(modelBody: String, column: String, dependant: String) {
        assertTrue(
            Regex("""(?m)^\s*$column\s+\S""").containsMatchIn(modelBody),
            "$dependant has no matching column `$column` on the Prisma model.",
        )
    }

    /** The body of `export interface <name> { … }`, comments stripped. */
    private fun tsInterfaceBody(source: String, name: String): String {
        val head = Regex("""interface\s+$name\s*\{""").find(source)
            ?: bail("no `interface $name` in dashboard-data.ts")
        return stripComments(braced(source, head.range.last))
    }

    /** The body of `model <name> { … }` in schema.prisma. */
    private fun prismaModelBody(source: String, name: String): String {
        val head = Regex("""(?m)^model\s+$name\s*\{""").find(source)
            ?: bail("no `model $name` in schema.prisma")
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

    /**
     * One member of an object body, as its own text: everything after `<name>:` up to the `;` or
     * `,` that closes it at the same nesting depth. An inline object literal or an
     * `Array<{ … }>` therefore comes back whole, which is what lets a nested field be asserted.
     */
    private fun member(objectBody: String, name: String): String {
        val head = Regex("""(^|[{;,\s])$name\s*:""").find(objectBody)
            ?: bail("no `$name` field — the server shape changed")
        var depth = 0
        for (i in head.range.last + 1 until objectBody.length) {
            when (objectBody[i]) {
                '{', '<', '[' -> depth++
                '}', '>', ']' -> depth--
                ';', ',' -> if (depth == 0) return objectBody.substring(head.range.last + 1, i)
            }
        }
        return objectBody.substring(head.range.last + 1)
    }

    /** Doc comments carry field names too (`[loginResponse]`, prose), so they must not count. */
    private fun stripComments(s: String): String = s
        .replace(Regex("""/\*.*?\*/""", RegexOption.DOT_MATCHES_ALL), "")
        .replace(Regex("""(?m)//.*$"""), "")
}
