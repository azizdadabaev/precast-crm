package uz.etalon.crm.core.data

import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.model.DiscrepancyStatus
import uz.etalon.crm.core.network.dto.*
import uz.etalon.crm.core.testing.FakeEtalonApi

/** Every member of [FakeEtalonApi] throws, so a call this suite did not arrange fails by name. */
private open class DiscStubApi : FakeEtalonApi()

/** Any direct call fails the test. */
private class DiscFailingApi : DiscStubApi()

private class DiscRecordingApi : DiscStubApi() {
    val calls = mutableListOf<String>()
    var row = DiscrepancyDto(
        id = "d1", orderId = "o1", expectedAmount = "1000000", receivedAmount = "800000",
        shortfall = "200000", status = "RESOLVED_RECOVERED", reportedAt = "2026-01-01T00:00:00Z",
    )
    override suspend fun discrepancies(status: String?): List<DiscrepancyDto> { calls += "discrepancies:$status"; return listOf(row) }
    override suspend fun updateDiscrepancy(id: String, body: DiscrepancyUpdateRequest): DiscrepancyDto {
        calls += "updateDiscrepancy:$id:${body.status}:${body.resolutionNote}"; return row
    }
}

private class DiscNoopOrders : OrdersGateway {
    val refreshed = mutableListOf<String>()
    override suspend fun refreshDetail(id: String) { refreshed += id }
}

private val DISC_GRANTED = PermissionGate { true }

class DiscrepanciesRepositoryTest {

    @Test fun `resolve is refused for an operator without discrepancy resolve`() = runTest {
        // DiscRecordingApi, not DiscFailingApi: a FailingApi cannot tell a refusal from a network
        // error — either way the call throws and the Result comes back failed. Only a recording
        // double that would have SUCCEEDED can prove the guard, not the exception, stopped it.
        val api = DiscRecordingApi()
        val repo = DiscrepanciesRepository(api, DiscNoopOrders(), PermissionGate { it != "discrepancy.resolve" })
        val res = repo.resolve("d1", DiscrepancyStatus.RESOLVED_RECOVERED, "Мижоз тўлади")
        assertTrue(res.isFailure, "a write the server would answer 403 to must fail before the network")
        assertEquals(0, api.calls.size, "the guard must refuse before the network: ${api.calls}")
    }

    @Test fun `resolve calls the api and refreshes the order the response row names`() = runTest {
        val api = DiscRecordingApi()
        val orders = DiscNoopOrders()
        DiscrepanciesRepository(api, orders, DISC_GRANTED)
            .resolve("d1", DiscrepancyStatus.RESOLVED_RECOVERED, "Мижоз тўлади")
            .getOrThrow()
        assertEquals(listOf("updateDiscrepancy:d1:RESOLVED_RECOVERED:Мижоз тўлади"), api.calls)
        assertEquals(listOf("o1"), orders.refreshed)
    }

    @Test fun `an api failure comes back as a Result failure, not an exception`() = runTest {
        val res = DiscrepanciesRepository(DiscFailingApi(), DiscNoopOrders(), DISC_GRANTED).resolve("d1", DiscrepancyStatus.OPEN, "note")
        assertTrue(res.isFailure)
    }

    @Test fun `list passes the status filter through untranslated`() = runTest {
        val api = DiscRecordingApi()
        DiscrepanciesRepository(api, DiscNoopOrders(), DISC_GRANTED).list(DiscrepancyStatus.OPEN).getOrThrow()
        assertEquals(listOf("discrepancies:OPEN"), api.calls)
    }

    /**
     * `DiscrepanciesRepository` has no constructor path to the outbox at all — resolving a
     * discrepancy is always online-only, so there is no seam to check with a spy the way
     * PaymentsRepository's `attachReceipt` is. The absence itself is the guarantee; assert it
     * structurally, mirroring LogisticsRepositoryTest's DriversRepository check, so a future
     * change that adds one fails this test instead of compiling in silently.
     */
    @Test fun `DiscrepanciesRepository has no constructor path to the outbox`() {
        val params = DiscrepanciesRepository::class.java.declaredConstructors.single().parameterTypes.toList()
        assertFalse(params.contains(OutboxGateway::class.java))
    }
}
