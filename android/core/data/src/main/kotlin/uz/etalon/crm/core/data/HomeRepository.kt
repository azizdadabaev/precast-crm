package uz.etalon.crm.core.data

import uz.etalon.crm.core.data.mapper.toDomain
import uz.etalon.crm.core.model.HomeSummary
import uz.etalon.crm.core.network.EtalonApi
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class HomeRepository @Inject constructor(
    private val api: EtalonApi,
) {
    // ── Queued: none. GET /api/dashboard is a read; there is nothing to enqueue and no
    // OutboxGateway in the constructor to reach one with.

    // ── Online only: sent live, never queued ───────────────────────

    suspend fun home(): Result<HomeSummary> =
        runCatchingCancellable { api.dashboard().toDomain() }
}
