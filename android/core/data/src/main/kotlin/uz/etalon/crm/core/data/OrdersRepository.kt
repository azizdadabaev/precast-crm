package uz.etalon.crm.core.data

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.Json
import uz.etalon.crm.core.data.mapper.toDomain
import uz.etalon.crm.core.data.mapper.toEntity
import uz.etalon.crm.core.database.dao.OrdersDao
import uz.etalon.crm.core.database.entity.OrderDetailEntity
import uz.etalon.crm.core.model.*
import uz.etalon.crm.core.network.ApiException
import uz.etalon.crm.core.network.EtalonApi
import uz.etalon.crm.core.network.dto.OrderDetailDto
import java.time.Instant
import java.time.LocalDate
import javax.inject.Inject
import javax.inject.Named
import javax.inject.Singleton

data class OrdersFilter(val q: String? = null, val status: OrderStatus? = null, val day: LocalDate? = null, val page: Int = 1) {
    val listKey: String get() = "q=${q.orEmpty()}|status=${status?.name.orEmpty()}|day=${day?.toString().orEmpty()}|page=$page"
}

/** The result of the last refresh attempt for a key, with the fetched rows embedded directly
 *  (not re-derived from the DAO's Flow). `combine()` recomputes independently for every upstream
 *  emission, so a successful refresh that wrote both the DAO row and a separate "loaded" flag
 *  could hand an already-waiting collector a stale in-between snapshot (cache updated, flag not
 *  yet, or vice versa). Folding status+rows into one map, written with a single assignment, keeps
 *  every emission internally consistent. */
private data class ListOutcome(val rows: List<OrderSummary>, val error: AppError?)
private data class DetailOutcome(val detail: OrderDetail?, val error: AppError?)

@Singleton
class OrdersRepository @Inject constructor(
    private val api: EtalonApi, private val dao: OrdersDao, private val json: Json, @Named("apiBaseUrl") private val mediaBase: String,
) {
    private val listOutcomes = MutableStateFlow<Map<String, ListOutcome>>(emptyMap())
    private val detailOutcomes = MutableStateFlow<Map<String, DetailOutcome>>(emptyMap())

    fun list(filter: OrdersFilter): Flow<Resource<List<OrderSummary>>> {
        val key = filter.listKey
        return combine(dao.observeList(key).map { rows -> rows.map { it.toDomain() } }, listOutcomes) { daoRows, outcomes ->
            val outcome = outcomes[key]
            when {
                outcome == null -> Resource.Loading(daoRows.takeIf { it.isNotEmpty() })
                outcome.error != null -> Resource.Error(outcome.rows.takeIf { it.isNotEmpty() }, outcome.error)
                else -> Resource.Success(outcome.rows)
            }
        }
    }

    suspend fun refreshList(filter: OrdersFilter) {
        val key = filter.listKey
        try {
            val page = api.orders(q = filter.q, status = filter.status?.name, day = filter.day?.toString(), page = filter.page)
            val rows = page.items.map { it.toDomain() }
            // Embed the fetched rows in the same write as the outcome so every combine() tick
            // this triggers is already self-consistent; the DAO write below is for persistence only.
            listOutcomes.value = listOutcomes.value + (key to ListOutcome(rows, null))
            val now = System.currentTimeMillis()
            dao.replaceList(key, rows.mapIndexed { i, o -> o.toEntity(key, i, now) })
        } catch (t: Throwable) {
            val prevRows = listOutcomes.value[key]?.rows ?: dao.observeList(key).first().map { it.toDomain() }
            listOutcomes.value = listOutcomes.value + (key to ListOutcome(prevRows, t.toAppError()))
        }
    }

    fun detail(id: String): Flow<Resource<OrderDetail>> =
        combine(dao.observeDetail(id), detailOutcomes) { row, outcomes ->
            val fromDao = row?.let { json.decodeFromString(OrderDetailDto.serializer(), it.json).toDomain(mediaBase, Instant.ofEpochMilli(it.cachedAt)) }
            val outcome = outcomes[id]
            when {
                outcome == null -> Resource.Loading(fromDao)
                outcome.error != null -> Resource.Error(outcome.detail ?: fromDao, outcome.error)
                else -> outcome.detail?.let { Resource.Success(it) } ?: Resource.Loading(fromDao)
            }
        }

    suspend fun refreshDetail(id: String) {
        try {
            val dto = api.order(id)
            val now = System.currentTimeMillis()
            val detail = dto.toDomain(mediaBase, Instant.ofEpochMilli(now))
            detailOutcomes.value = detailOutcomes.value + (id to DetailOutcome(detail, null))
            dao.upsertDetail(OrderDetailEntity(id, json.encodeToString(OrderDetailDto.serializer(), dto), now))
        } catch (t: Throwable) {
            if (t is ApiException && t.status == 404) {
                dao.deleteOrder(id) // hard-deleted on the server (spec §4.3)
                detailOutcomes.value = detailOutcomes.value - id
            } else {
                val prevDetail = detailOutcomes.value[id]?.detail
                detailOutcomes.value = detailOutcomes.value + (id to DetailOutcome(prevDetail, t.toAppError()))
            }
        }
    }
}
