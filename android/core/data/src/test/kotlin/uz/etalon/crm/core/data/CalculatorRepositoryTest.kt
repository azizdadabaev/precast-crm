package uz.etalon.crm.core.data

import app.cash.turbine.test
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.calc.CalculatorDraft
import uz.etalon.crm.core.calc.DEFAULT_PRICE_CONFIG
import uz.etalon.crm.core.calc.PlaceOrderInput
import uz.etalon.crm.core.calc.SlabRow
import uz.etalon.crm.core.calc.recomputeRow
import uz.etalon.crm.core.database.dao.CalculatorDraftDao
import uz.etalon.crm.core.database.entity.CalculatorDraftEntity
import uz.etalon.crm.core.image.PreparedImage
import uz.etalon.crm.core.model.OutboxKind
import uz.etalon.crm.core.network.dto.OrderPlacedDto
import uz.etalon.crm.core.network.dto.PlaceOrderRequest
import uz.etalon.crm.core.network.dto.ProjectSavedDto
import uz.etalon.crm.core.network.dto.SaveProjectDraftRequest
import uz.etalon.crm.core.testing.FakeEtalonApi
import java.math.BigDecimal

/** An in-memory stand-in for the Room DAO — the DAO interface itself is narrow enough to fake
 *  directly, the same way `OrdersRepositoryTest`'s `FakeDao` fakes `OrdersDao`. */
private class FakeDraftDao : CalculatorDraftDao {
    val rows = MutableStateFlow<Map<String, CalculatorDraftEntity>>(emptyMap())
    override fun observe(ownerId: String): Flow<CalculatorDraftEntity?> = rows.map { it[ownerId] }
    override suspend fun upsert(row: CalculatorDraftEntity) { rows.value = rows.value + (row.ownerId to row) }
    override suspend fun deleteFor(ownerId: String) { rows.value = rows.value - ownerId }
}

private open class CalcStubApi : FakeEtalonApi()

private class CalcRecordingApi : CalcStubApi() {
    var lastRequest: SaveProjectDraftRequest? = null
    var lastIdempotencyKey: String? = null
    var response: ProjectSavedDto = ProjectSavedDto("proj-1")
    override suspend fun saveProjectDraft(body: SaveProjectDraftRequest, idempotencyKey: String): ProjectSavedDto {
        lastRequest = body; lastIdempotencyKey = idempotencyKey
        return response
    }
}

/** Records what the queued path wrote, so "the offline order is the SAME order" can be asserted
 *  against the bytes rather than assumed. Mirrors `LogisticsRepositoryTest`'s `SpyOutbox`. */
private class CalcSpyOutbox : OutboxGateway {
    data class Enqueued(val kind: OutboxKind, val orderId: String?, val rowId: String?, val payload: JsonObject)
    val calls = mutableListOf<Enqueued>()
    val failed = MutableStateFlow<List<FailedOutboxRow>>(emptyList())
    val discarded = mutableListOf<String>()
    override suspend fun enqueue(
        kind: OutboxKind, orderId: String?, shipmentId: String?, paymentId: String?,
        photo: PreparedImage?, payload: JsonObject, rowId: String?,
    ): String {
        calls += Enqueued(kind, orderId, rowId, payload)
        return rowId ?: "outbox-${calls.size}"
    }
    override fun observeFailed(kind: OutboxKind): Flow<List<FailedOutboxRow>> = failed
    override suspend fun discard(id: String) { discarded += id }
}

private class CalcPlacingApi : CalcStubApi() {
    var lastRequest: PlaceOrderRequest? = null
    var lastIdempotencyKey: String? = null
    var lastAuthorization: String? = "not-called"
    var failure: Throwable? = null
    override suspend fun placeOrder(body: PlaceOrderRequest, idempotencyKey: String, authorization: String?): OrderPlacedDto {
        lastRequest = body; lastIdempotencyKey = idempotencyKey; lastAuthorization = authorization
        failure?.let { throw it }
        return OrderPlacedDto("order-1", "2609-001")
    }
}

/** The ISO instant `PlaceOrderSheet.scheduledAtInstant` produces for the Tashkent calendar day
 *  2026-09-20. It renders in UTC with a `Z`, not with the `+05:00` offset it was resolved in:
 *  `scheduledAtInstant` ends in `.toInstant().toString()`, and `Instant` has no offset to print.
 *  Tashkent is UTC+5, so start-of-day there is 19:00 the previous day in UTC. */
private const val SCHEDULED_AT = "2026-09-19T19:00:00Z"

private fun placeInput(
    rows: List<SlabRow>, notes: String = "", scheduledAt: String = SCHEDULED_AT,
    deliveryCost: Double = 0.0, otherCost: Double = 0.0, clientName: String = "Aziz",
    clientAddress: String = "Тошкент, Юнусобод, 12-уй", clientPhone: String = "901234567",
    projectId: String? = null,
) = PlaceOrderInput(
    draft = CalculatorDraft(
        rows = rows, clientPhone = clientPhone, clientName = clientName, clientAddress = clientAddress,
        discountPercent = 0.0, discountAmount = 0.0, deliveryCost = deliveryCost, otherCost = otherCost,
        projectId = projectId,
    ),
    scheduledAt = scheduledAt,
    notes = notes,
)

private val CALC_GRANTED = PermissionGate { true }
private fun user(id: String?) = CurrentUser { id }
private fun jsonInstance() = Json { ignoreUnknownKeys = true }

/** A room the engine has actually priced, so `SlabRow.canPersist` is true — `saveDraft` refuses
 *  anything else before the network. */
private fun room(name: String, width: Double = 4.0, length: Double = 6.0) =
    recomputeRow(SlabRow(id = "id-$name", name = name, innerWidth = width, innerLength = length), DEFAULT_PRICE_CONFIG)

/** Priced but extras-only — `canPersist` is false because `innerLength` is not `.positive()`. */
private fun extrasOnlyRoom(name: String) =
    recomputeRow(SlabRow(id = "id-$name", name = name, innerWidth = 4.0, innerLength = 0.0, extraBeams = 2), DEFAULT_PRICE_CONFIG)

private fun draft(
    rows: List<SlabRow>, clientPhone: String = "901234567", projectId: String? = null,
    discountPercent: Double = 0.0, discountAmount: Double = 0.0,
) = CalculatorDraft(
    rows = rows, clientPhone = clientPhone, clientName = "Aziz", clientAddress = "Тошкент, Юнусобод, 12-уй",
    discountPercent = discountPercent, discountAmount = discountAmount, deliveryCost = 0.0, otherCost = 0.0,
    projectId = projectId,
)

class CalculatorRepositoryTest {

    private fun repo(
        api: FakeEtalonApi, permissions: PermissionGate = CALC_GRANTED,
        currentUser: CurrentUser = user("u1"), dao: CalculatorDraftDao = FakeDraftDao(),
        outbox: OutboxGateway = CalcSpyOutbox(),
    ) = CalculatorRepository(dao, api, permissions, currentUser, jsonInstance(), outbox)

    // ── saveDraft: the wire request ─────────────────────────────────

    @Test fun `saveDraft normalises the phone, keeps room order, and sends the caller's idempotency key`() = runTest {
        val api = CalcRecordingApi()
        val id = repo(api).saveDraft(draft(rows = listOf(room("A"), room("B")), clientPhone = "901234567"), "idem-1").getOrThrow()

        assertEquals("proj-1", id)
        val sent = api.lastRequest!!
        assertEquals("998901234567", sent.clientPhone)
        assertEquals(listOf("A", "B"), sent.rooms.map { it.name })
        assertEquals("idem-1", api.lastIdempotencyKey)
    }

    @Test fun `an overridden row carries both the value and the reason`() = runTest {
        val api = CalcRecordingApi()
        val overridden = room("A").copy(m2PriceOverride = true, m2PriceOverrideValue = 160000.0, m2PriceReason = "чегирма")
        repo(api).saveDraft(draft(rows = listOf(overridden)), "idem-1").getOrThrow()

        val sentRoom = api.lastRequest!!.rooms.single()
        assertTrue(sentRoom.m2PriceOverride)
        // tierPriceMoney always sets scale 2 (Boundary.kt's moneyOf) — compareTo, not equals, so
        // the assertion is about the VALUE, not incidental scale.
        assertEquals(0, BigDecimal("160000").compareTo(sentRoom.m2PriceOverrideValue))
        assertEquals("чегирма", sentRoom.m2PriceReason)
    }

    @Test fun `a non-overridden row carries m2PriceOverride false with both other fields null`() = runTest {
        val api = CalcRecordingApi()
        repo(api).saveDraft(draft(rows = listOf(room("A"))), "idem-1").getOrThrow()

        val sentRoom = api.lastRequest!!.rooms.single()
        assertFalse(sentRoom.m2PriceOverride)
        assertNull(sentRoom.m2PriceOverrideValue)
        assertNull(sentRoom.m2PriceReason)
    }

    @Test fun `a save with an extras-only row never reaches the API`() = runTest {
        val api = CalcRecordingApi()
        val r = repo(api).saveDraft(draft(rows = listOf(room("A"), extrasOnlyRoom("B"))), "idem-1")

        assertTrue(r.isFailure)
        assertNull(api.lastRequest, "the unpersistable row must block the whole save, not just be dropped")
    }

    @Test fun `saveDraft is refused without order_create, before the network`() = runTest {
        val api = CalcRecordingApi()
        val r = repo(api, permissions = PermissionGate { false }).saveDraft(draft(rows = listOf(room("A"))), "idem-1")

        assertTrue(r.isFailure)
        assertNull(api.lastRequest)
    }

    /** `SaveProjectDraftSchema.clientPhone` is `min(3)` and REQUIRED, unlike the name and the
     *  address. `normalizePhone("")` is `""`, so without this the empty string goes on the wire and
     *  comes back a 422 whose message names no field at all. */
    @Test fun `a save with no phone never reaches the API`() = runTest {
        val api = CalcRecordingApi()
        val r = repo(api).saveDraft(draft(rows = listOf(room("A")), clientPhone = ""), "idem-1")

        assertTrue(r.isFailure)
        assertNull(api.lastRequest)
    }

    /** `rooms` DEFAULTS to `[]` on the draft route, so the server would happily create a project
     *  holding nothing. */
    @Test fun `a save with no rooms never reaches the API`() = runTest {
        val api = CalcRecordingApi()
        val r = repo(api).saveDraft(draft(rows = emptyList()), "idem-1")

        assertTrue(r.isFailure)
        assertNull(api.lastRequest)
    }

    @Test fun `discountPercent and discountAmount reach the wire the way the engine boundary keeps them`() = runTest {
        val api = CalcRecordingApi()
        repo(api).saveDraft(draft(rows = listOf(room("A")), discountAmount = 50_000.0), "idem-1").getOrThrow()

        assertEquals(0.0, api.lastRequest!!.discountPercent)
        assertEquals(BigDecimal("50000"), api.lastRequest!!.discountAmount)
    }

    // ── local draft persistence: owner-stamped ──────────────────────

    @Test fun `persistDraft and observeDraft round-trip through the DAO for the signed-in owner`() = runTest {
        val repo = repo(CalcRecordingApi(), currentUser = user("u1"))
        repo.persistDraft(draft(rows = listOf(room("A")), clientPhone = "901234567", projectId = "proj-9"))

        repo.observeDraft().test {
            val restored = awaitItem()
            assertEquals(listOf("A"), restored?.rows?.map { it.name })
            // Stored exactly as handed in — normalisation happens only at saveDraft's wire boundary.
            assertEquals("901234567", restored?.clientPhone)
            assertEquals("proj-9", restored?.projectId)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test fun `with nobody signed in, observeDraft emits null and persistDraft is a no-op`() = runTest {
        val dao = FakeDraftDao()
        val repo = repo(CalcRecordingApi(), currentUser = user(null), dao = dao)

        repo.persistDraft(draft(rows = listOf(room("A"))))
        assertTrue(dao.rows.value.isEmpty(), "nothing signed in means nothing to stamp the row's owner with")

        repo.observeDraft().test { assertNull(awaitItem()); cancelAndIgnoreRemainingEvents() }
    }

    @Test fun `clearDraft removes only the signed-in owner's row`() = runTest {
        val dao = FakeDraftDao()
        dao.upsert(CalculatorDraftEntity(ownerId = "u1", draftJson = "{}", updatedAt = 1))
        dao.upsert(CalculatorDraftEntity(ownerId = "u2", draftJson = "{}", updatedAt = 1))
        repo(CalcRecordingApi(), currentUser = user("u1"), dao = dao).clearDraft()

        assertNull(dao.rows.value["u1"])
        assertNotNull(dao.rows.value["u2"])
    }

    @Test fun `a draft this build cannot parse restores as no draft rather than crashing`() = runTest {
        val dao = FakeDraftDao()
        dao.upsert(CalculatorDraftEntity(ownerId = "u1", draftJson = "not json", updatedAt = 1))
        repo(CalcRecordingApi(), currentUser = user("u1"), dao = dao).observeDraft().test {
            assertNull(awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }

    // ── placeOrder: the wire request ────────────────────────────────

    @Test fun `placeOrder sends the whole body, the caller's key, and no pinned credential`() = runTest {
        val api = CalcPlacingApi()
        val id = repo(api).placeOrder(
            placeInput(rows = listOf(room("A"), room("B")), notes = " иккинчи қават ", deliveryCost = 150_000.0, otherCost = 25_000.0),
            "idem-order-1",
        ).getOrThrow()

        assertEquals("order-1", id)
        val sent = api.lastRequest!!
        assertEquals("998901234567", sent.clientPhone)
        assertEquals("Aziz", sent.clientName)
        assertEquals(listOf("A", "B"), sent.rooms.map { it.name })
        assertEquals(SCHEDULED_AT, sent.scheduledAt)
        assertEquals("иккинчи қават", sent.notes)
        assertEquals(0, BigDecimal("150000").compareTo(sent.deliveryCost))
        assertEquals(0, BigDecimal("25000").compareTo(sent.otherCost))
        assertEquals("idem-order-1", api.lastIdempotencyKey)
        // Null, not a placeholder: the interceptor supplies the live token for an online tap.
        // Only the outbox drain pins a credential.
        assertNull(api.lastAuthorization)
    }

    /** Prepayment at placement is a later slice, designed for offline — see `PlaceOrderRequest`'s
     *  own KDoc. Zero here is a decision, and `PlaceOrderSchema`'s refinement only demands a
     *  `paymentMethod` once this is positive. */
    @Test fun `placeOrder never attaches a payment`() = runTest {
        val api = CalcPlacingApi()
        repo(api).placeOrder(placeInput(rows = listOf(room("A"))), "idem-order-1").getOrThrow()

        assertEquals(0, BigDecimal.ZERO.compareTo(api.lastRequest!!.paidAmount))
        assertEquals(emptyList<String>(), api.lastRequest!!.receiptUrls)
    }

    /**
     * Save, then order: the placement must name the project the save created. Without this the
     * route's `if (input.projectId)` branch never runs and `POST /api/orders` creates a SECOND
     * `DRAFT` Project for the same quote — one duplicate row in production per save-then-order.
     */
    @Test fun `placeOrder sends the saved draft's projectId so the order reuses that project`() = runTest {
        val api = CalcPlacingApi()
        repo(api).placeOrder(placeInput(rows = listOf(room("A")), projectId = "proj-9"), "idem-order-1").getOrThrow()

        assertEquals("proj-9", api.lastRequest!!.projectId)
    }

    /** A quote that was never saved has no project to attach to — null, not an empty string, which
     *  `z.string().optional()` would take as a real (missing) id. */
    @Test fun `placeOrder sends no projectId when the quote was never saved as a draft`() = runTest {
        val api = CalcPlacingApi()
        repo(api).placeOrder(placeInput(rows = listOf(room("A"))), "idem-order-1").getOrThrow()

        assertNull(api.lastRequest!!.projectId)
    }

    @Test fun `placeOrder is refused without order_create, before the network`() = runTest {
        val api = CalcPlacingApi()
        val r = repo(api, permissions = PermissionGate { false }).placeOrder(placeInput(rows = listOf(room("A"))), "idem-order-1")

        assertTrue(r.isFailure)
        assertNull(api.lastRequest)
    }

    @Test fun `placing with an extras-only room never reaches the API`() = runTest {
        val api = CalcPlacingApi()
        val r = repo(api).placeOrder(placeInput(rows = listOf(room("A"), extrasOnlyRoom("B"))), "idem-order-1")

        assertTrue(r.isFailure)
        assertNull(api.lastRequest, "the unpersistable room must block the whole order, not just be dropped")
    }

    /** `PlaceOrderSchema.rooms` is `min(1)`. */
    @Test fun `placing with no rooms never reaches the API`() = runTest {
        val api = CalcPlacingApi()
        assertTrue(repo(api).placeOrder(placeInput(rows = emptyList()), "idem-order-1").isFailure)
        assertNull(api.lastRequest)
    }

    /** All three client fields are required here, unlike on the draft route — a quote that saves
     *  perfectly well as a project can still be unplaceable. */
    @Test fun `placing without a full client never reaches the API`() = runTest {
        for (input in listOf(
            placeInput(rows = listOf(room("A")), clientName = "  "),
            placeInput(rows = listOf(room("A")), clientAddress = ""),
            placeInput(rows = listOf(room("A")), clientPhone = ""),
        )) {
            val api = CalcPlacingApi()
            assertTrue(repo(api).placeOrder(input, "idem-order-1").isFailure)
            assertNull(api.lastRequest)
        }
    }

    @Test fun `placing without a date never reaches the API`() = runTest {
        val api = CalcPlacingApi()
        assertTrue(repo(api).placeOrder(placeInput(rows = listOf(room("A")), scheduledAt = ""), "idem-order-1").isFailure)
        assertNull(api.lastRequest)
    }

    // ── queuePlaceOrder: the SAME order, sent later ─────────────────

    /**
     * The equality this whole offline path rests on: what the queue stores must round-trip to
     * exactly the `PlaceOrderRequest` the online path would have sent. Anything else and the
     * order the customer signed off on is not the order that eventually reaches the server.
     */
    @Test fun `the queued JSON round-trips to the same request the online path would send`() = runTest {
        val input = placeInput(
            rows = listOf(room("A"), room("B").copy(m2PriceOverride = true, m2PriceOverrideValue = 160000.0, m2PriceReason = "чегирма")),
            notes = "тезкор", deliveryCost = 150_000.0, otherCost = 25_000.0,
        )
        val online = CalcPlacingApi()
        repo(online).placeOrder(input, "idem-order-1").getOrThrow()

        val outbox = CalcSpyOutbox()
        repo(CalcPlacingApi(), outbox = outbox).queuePlaceOrder(input, "idem-order-1").getOrThrow()

        val queued = jsonInstance().decodeFromJsonElement(PlaceOrderRequest.serializer(), outbox.calls.single().payload)
        assertEquals(online.lastRequest, queued)
    }

    /** The row's id IS the key the worker sends, so it must be the caller's — the same one the
     *  online attempt used. A fresh one would place a second real order against a server that had
     *  already committed the first attempt whose response was lost. */
    @Test fun `the queued row carries no order id and takes the caller's key as its id`() = runTest {
        val outbox = CalcSpyOutbox()
        val rowId = repo(CalcPlacingApi(), outbox = outbox)
            .queuePlaceOrder(placeInput(rows = listOf(room("A"))), "idem-order-1").getOrThrow()

        val call = outbox.calls.single()
        assertEquals(OutboxKind.PLACE_ORDER, call.kind)
        assertNull(call.orderId, "the order is what this row is going to create")
        assertEquals("idem-order-1", call.rowId)
        assertEquals("idem-order-1", rowId)
    }

    /** Every refusal the online path makes, the queued path makes too — a row that could only ever
     *  422 would fail hours later with the operator nowhere near the customer. */
    @Test fun `a refused order is never queued either`() = runTest {
        val outbox = CalcSpyOutbox()
        val r = repo(CalcPlacingApi(), permissions = PermissionGate { false }, outbox = outbox)
            .queuePlaceOrder(placeInput(rows = listOf(room("A"))), "idem-order-1")

        assertTrue(r.isFailure)
        assertTrue(outbox.calls.isEmpty())
    }

    // ── rejections: findable, not silent ────────────────────────────

    @Test fun `a rejected queued order surfaces with its customer and the server's message`() = runTest {
        val outbox = CalcSpyOutbox()
        val repo = repo(CalcPlacingApi(), outbox = outbox)
        outbox.failed.value = listOf(
            FailedOutboxRow(
                id = "row-1",
                error = "Мижоз манзили керак",
                payload = jsonInstance().encodeToJsonElement(
                    PlaceOrderRequest.serializer(),
                    PlaceOrderRequest(
                        clientName = "Aziz", clientPhone = "998901234567", clientAddress = "Тошкент",
                        rooms = emptyList(), scheduledAt = SCHEDULED_AT,
                    ),
                ).jsonObject,
            ),
        )

        repo.observeRejectedOrders().test {
            val rejected = awaitItem().single()
            assertEquals("row-1", rejected.id)
            assertEquals("Aziz", rejected.clientName)
            assertEquals("Мижоз манзили керак", rejected.message)
            cancelAndIgnoreRemainingEvents()
        }

        repo.discardRejectedOrder("row-1")
        assertEquals(listOf("row-1"), outbox.discarded)
    }

    // ── «Калькуляторда очиш»: the rejection re-hydrates the quote ───

    /**
     * Ruling I3's own equality, and the mirror of the queued-JSON round trip above: the payload a
     * rejected row holds must come back as the SAME quote the operator typed. Anything less and
     * re-opening a refusal quietly reprices somebody's order.
     *
     * The quote goes out through `queuePlaceOrder` — the real encoder — and comes back through
     * `reopenRejectedOrder`, so nothing here trusts a hand-built payload. The two fields that
     * cannot survive (`scheduledAt` and `notes`, both typed on the place-order sheet and held by
     * no draft) are not part of a [CalculatorDraft] to begin with, and the room ids are this
     * client's own handles, which the server never saw — so the comparison replaces them.
     */
    @Test fun `a rejected payload re-opens as the quote it was built from`() = runTest {
        val rows = listOf(
            room("Зал", width = 5.2, length = 7.1),
            room("Ошхона").copy(
                bearing = 0.2, correction = 0.05, extraBeams = 3, forceStartBeam = true,
                m2PriceOverride = true, m2PriceOverrideValue = 160000.0, m2PriceReason = "чегирма",
            ),
        )
        val input = placeInput(
            rows = rows, notes = "тезкор", deliveryCost = 150_000.0, otherCost = 25_000.0,
            projectId = "proj-7",
        ).let { it.copy(draft = it.draft.copy(discountPercent = 2.5, discountAmount = 300_000.0)) }

        val outbox = CalcSpyOutbox()
        val dao = FakeDraftDao()
        val repo = repo(CalcPlacingApi(), dao = dao, outbox = outbox)
        repo.queuePlaceOrder(input, "row-1").getOrThrow()
        outbox.failed.value = listOf(
            FailedOutboxRow(id = "row-1", error = "Мижоз топилмади", payload = outbox.calls.single().payload),
        )

        repo.reopenRejectedOrder("row-1").getOrThrow()

        val restored = repo.observeDraft().first()!!
        // The phone comes back NORMALISED — `toRequest` is what normalised it on the way out, and
        // 998901234567 is the number the order was actually placed against.
        assertEquals(
            input.draft.copy(clientPhone = "998901234567", rows = emptyList()),
            restored.copy(rows = emptyList()),
        )
        // Room for room, every input the operator typed. The local id is minted fresh (the server
        // never saw the old one) and the engine result is recomputed on restore, so neither takes
        // part in the comparison.
        assertEquals(
            rows.map { it.copy(id = "", result = null) },
            restored.rows.map { it.copy(id = "", result = null) },
        )
        assertTrue(restored.rows.map { it.id }.toSet().size == rows.size, "each restored room has its own id")
        assertEquals(listOf("row-1"), outbox.discarded, "the row goes only once the draft is written")
    }

    /** A payload this build cannot read must not cost the operator the rejection as well as the
     *  quote: nothing is written, nothing is deleted, and «Тушунарли» is still their way out. */
    @Test fun `an unreadable payload leaves the rejection where it is`() = runTest {
        val outbox = CalcSpyOutbox()
        val dao = FakeDraftDao()
        val repo = repo(CalcPlacingApi(), dao = dao, outbox = outbox)
        outbox.failed.value = listOf(
            FailedOutboxRow(id = "row-1", error = "Мижоз топилмади", payload = JsonObject(emptyMap())),
        )

        assertTrue(repo.reopenRejectedOrder("row-1").isFailure)
        assertTrue(outbox.discarded.isEmpty(), "the row must survive a payload that could not be read")
        assertNull(repo.observeDraft().first())
    }

    /** Nobody signed in: `persistDraft` is a no-op by design, so re-opening would delete the row
     *  and write the quote nowhere at all. */
    @Test fun `re-opening with nobody signed in deletes nothing`() = runTest {
        val outbox = CalcSpyOutbox()
        val repo = repo(CalcPlacingApi(), currentUser = user(null), outbox = outbox)
        outbox.failed.value = listOf(
            FailedOutboxRow(
                id = "row-1", error = "Мижоз топилмади",
                payload = jsonInstance().encodeToJsonElement(
                    PlaceOrderRequest.serializer(),
                    PlaceOrderRequest(
                        clientName = "Aziz", clientPhone = "998901234567", clientAddress = "Тошкент",
                        rooms = emptyList(), scheduledAt = SCHEDULED_AT,
                    ),
                ).jsonObject,
            ),
        )

        assertTrue(repo.reopenRejectedOrder("row-1").isFailure)
        assertTrue(outbox.discarded.isEmpty())
    }
}
