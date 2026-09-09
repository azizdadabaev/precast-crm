package uz.etalon.crm.core.data

import app.cash.turbine.test
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.calc.CalculatorDraft
import uz.etalon.crm.core.calc.DEFAULT_PRICE_CONFIG
import uz.etalon.crm.core.calc.SlabRow
import uz.etalon.crm.core.calc.recomputeRow
import uz.etalon.crm.core.database.dao.CalculatorDraftDao
import uz.etalon.crm.core.database.entity.CalculatorDraftEntity
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
    ) = CalculatorRepository(dao, api, permissions, currentUser, jsonInstance())

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
}
