package uz.etalon.crm.core.data

import uz.etalon.crm.core.data.mapper.toDomain
import uz.etalon.crm.core.model.Discrepancy
import uz.etalon.crm.core.model.DiscrepancyStatus
import uz.etalon.crm.core.network.EtalonApi
import uz.etalon.crm.core.network.dto.DiscrepancyUpdateRequest
import javax.inject.Inject
import javax.inject.Singleton

/** The permission `PATCH /api/discrepancies/{id}` is wrapped in server-side. */
private const val DISCREPANCY_RESOLVE = "discrepancy.resolve"

@Singleton
class DiscrepanciesRepository @Inject constructor(
    private val api: EtalonApi,
    private val orders: OrdersGateway,
    private val permissions: PermissionGate,
) {
    suspend fun list(status: DiscrepancyStatus? = null): Result<List<Discrepancy>> =
        runCatchingCancellable { api.discrepancies(status?.name).map { it.toDomain() } }

    /**
     * `PATCH /api/discrepancies/{id}` carries no server-side idempotency wrapper, so this is
     * online only — never queued. It also appends an OrderEvent on the affected order, so the
     * order is refreshed afterward the same way a LogisticsRepository write is.
     */
    suspend fun resolve(id: String, status: DiscrepancyStatus, resolutionNote: String): Result<Discrepancy> =
        runCatchingCancellable {
            if (!permissions.can(DISCREPANCY_RESOLVE)) error("Низони ҳал қилишга рухсат йўқ")
            val dto = api.updateDiscrepancy(id, DiscrepancyUpdateRequest(status.name, resolutionNote))
            orders.refreshDetail(dto.orderId)
            dto.toDomain()
        }
}
