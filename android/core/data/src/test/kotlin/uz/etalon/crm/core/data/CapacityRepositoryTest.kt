package uz.etalon.crm.core.data

import app.cash.turbine.test
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.model.CapacityThresholds
import uz.etalon.crm.core.model.Resource
import uz.etalon.crm.core.network.dto.CapacityDayDto
import uz.etalon.crm.core.network.dto.CapacityDto
import uz.etalon.crm.core.network.dto.CapacityThresholdsDto
import uz.etalon.crm.core.testing.FakeEtalonApi
import java.io.IOException
import java.math.BigDecimal
import java.time.LocalDate
import java.time.YearMonth

private class FakeSessionCapacity(thresholds: CapacityThresholds?) : SessionCapacity {
    override val capacityThresholds: StateFlow<CapacityThresholds?> = MutableStateFlow(thresholds)
}

private open class CapacityStubApi : FakeEtalonApi() {
    var dto: CapacityDto = CapacityDto()
    var fail: Throwable? = null
    var calls = 0
    var lastFrom: String? = null
    var lastTo: String? = null
    override suspend fun capacity(from: String, to: String): CapacityDto {
        calls++; lastFrom = from; lastTo = to
        fail?.let { throw it }
        return dto
    }
}

class CapacityRepositoryTest {
    /** `gridRange(2026-09)` (pinned by `CapacityModelTest`): Sep 1 2026 is a Tuesday, so the
     *  Monday-first grid starts Aug 31 and runs 42 days to Oct 11. */
    private val month = YearMonth.of(2026, 9)

    @Test fun `the visible grid range is requested as YYYY-MM-DD`() = runTest {
        val api = CapacityStubApi()
        CapacityRepository(api, FakeSessionCapacity(null)).observe(month).test {
            awaitItem() // Loading
            awaitItem() // Success
            cancelAndIgnoreRemainingEvents()
        }
        assertEquals("2026-08-31", api.lastFrom)
        assertEquals("2026-10-11", api.lastTo)
    }

    @Test fun `a date the server never sent zero-fills through CapacityMonth day`() = runTest {
        val api = CapacityStubApi().apply {
            dto = CapacityDto(
                days = listOf(CapacityDayDto("2026-09-12", BigDecimal("285.4"), 3, 1216)),
                thresholds = CapacityThresholdsDto(BigDecimal(300), BigDecimal(450), BigDecimal(600)),
            )
        }
        CapacityRepository(api, FakeSessionCapacity(null)).observe(month).test {
            awaitItem()
            val success = awaitItem() as Resource.Success
            assertEquals(BigDecimal("285.4"), success.data.day(LocalDate.of(2026, 9, 12)).totalArea)
            val empty = success.data.day(LocalDate.of(2026, 9, 2))
            assertEquals(BigDecimal.ZERO, empty.totalArea)
            assertEquals(0, empty.totalOrders)
            assertEquals(0, empty.totalBlocks)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test fun `a second observe of the same month does not call the API again`() = runTest {
        val api = CapacityStubApi()
        val repo = CapacityRepository(api, FakeSessionCapacity(null))
        repo.observe(month).test { awaitItem(); awaitItem(); cancelAndIgnoreRemainingEvents() }
        assertEquals(1, api.calls)

        repo.observe(month).test {
            assertTrue(awaitItem() is Resource.Success) // straight to Success, cache-first
            cancelAndIgnoreRemainingEvents()
        }
        assertEquals(1, api.calls)
    }

    @Test fun `a failed month is not cached, so the next observe retries the network`() = runTest {
        val api = CapacityStubApi().apply { fail = IOException("down") }
        val repo = CapacityRepository(api, FakeSessionCapacity(null))
        repo.observe(month).test {
            awaitItem() // Loading
            assertTrue(awaitItem() is Resource.Error<*>)
            cancelAndIgnoreRemainingEvents()
        }
        assertEquals(1, api.calls)

        api.fail = null
        repo.observe(month).test {
            awaitItem() // Loading again — nothing cached from the failed attempt
            assertTrue(awaitItem() is Resource.Success)
            cancelAndIgnoreRemainingEvents()
        }
        assertEquals(2, api.calls)
    }

    @Test fun `clearCache drops a cached month, like OrdersRepository on sign-out`() = runTest {
        val api = CapacityStubApi()
        val repo = CapacityRepository(api, FakeSessionCapacity(null))
        repo.observe(month).test { awaitItem(); awaitItem(); cancelAndIgnoreRemainingEvents() }
        assertEquals(1, api.calls)

        repo.clearCache()
        repo.observe(month).test { awaitItem(); awaitItem(); cancelAndIgnoreRemainingEvents() }
        assertEquals(2, api.calls)
    }

    @Test fun `refresh forces a fetch even for an already-cached month`() = runTest {
        val api = CapacityStubApi()
        val repo = CapacityRepository(api, FakeSessionCapacity(null))
        repo.observe(month).test { awaitItem(); awaitItem(); cancelAndIgnoreRemainingEvents() }
        assertEquals(1, api.calls)

        assertTrue(repo.refresh(month).isSuccess)
        assertEquals(2, api.calls)
    }

    @Test fun `an api failure on refresh surfaces as Result failure`() = runTest {
        val api = CapacityStubApi().apply { fail = IOException("down") }
        assertTrue(CapacityRepository(api, FakeSessionCapacity(null)).refresh(month).isFailure)
    }

    // ── R3: threshold fallback order ────────────────────────────────

    @Test fun `the response's own thresholds win over the session fallback`() = runTest {
        val api = CapacityStubApi().apply {
            dto = CapacityDto(thresholds = CapacityThresholdsDto(BigDecimal(200), BigDecimal(300), BigDecimal(400)))
        }
        CapacityRepository(api, FakeSessionCapacity(CapacityThresholds.DEFAULT)).observe(month).test {
            awaitItem()
            val success = awaitItem() as Resource.Success
            assertEquals(CapacityThresholds(BigDecimal(200), BigDecimal(300), BigDecimal(400)), success.data.thresholds)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test fun `a server that omits thresholds falls back to the session's bootstrap thresholds`() = runTest {
        val api = CapacityStubApi() // dto.thresholds is null
        val sessionThresholds = CapacityThresholds(BigDecimal(1), BigDecimal(2), BigDecimal(3))
        CapacityRepository(api, FakeSessionCapacity(sessionThresholds)).observe(month).test {
            awaitItem()
            val success = awaitItem() as Resource.Success
            assertEquals(sessionThresholds, success.data.thresholds)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test fun `no server thresholds and no session thresholds falls back to DEFAULT`() = runTest {
        val api = CapacityStubApi()
        CapacityRepository(api, FakeSessionCapacity(null)).observe(month).test {
            awaitItem()
            val success = awaitItem() as Resource.Success
            assertEquals(CapacityThresholds.DEFAULT, success.data.thresholds)
            cancelAndIgnoreRemainingEvents()
        }
    }
}
