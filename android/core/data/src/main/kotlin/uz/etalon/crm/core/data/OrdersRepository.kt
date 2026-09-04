package uz.etalon.crm.core.data

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
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
import java.util.concurrent.atomic.AtomicLong
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
/** [rows] is null only on a failed refresh with no rows of its own to offer (nothing was fetched
 *  in this process yet); `list()` then falls back to the DAO's cached rows. An empty list is a
 *  real answer ("the server has none") and is never overridden by the cache. */
private data class ListOutcome(val rows: List<OrderSummary>?, val error: AppError?)
private data class DetailOutcome(val detail: OrderDetail?, val error: AppError?)

@Singleton
class OrdersRepository @Inject constructor(
    private val api: EtalonApi, private val dao: OrdersDao, private val json: Json, @Named("apiBaseUrl") private val mediaBase: String,
) {
    private val listOutcomes = MutableStateFlow<Map<String, ListOutcome>>(emptyMap())
    private val detailOutcomes = MutableStateFlow<Map<String, DetailOutcome>>(emptyMap())

    /** Bumped by [clearCache]. A refresh captures the epoch before its network call and drops its
     *  write if the epoch moved meanwhile — otherwise an in-flight request started by user A can
     *  land after the sign-out that cleared the maps and resurrect A's rows for user B. */
    private val epoch = AtomicLong(0)

    /** Called on sign-out, alongside `EtalonDatabase.wipe()`: these outcome maps are `@Singleton`
     *  in-memory state, so the next signed-in user would otherwise see whatever the previous
     *  user last fetched (wipe() only clears the Room tables, not this in-memory cache). */
    fun clearCache() {
        epoch.incrementAndGet()
        listOutcomes.value = emptyMap()
        detailOutcomes.value = emptyMap()
    }

    fun list(filter: OrdersFilter): Flow<Resource<List<OrderSummary>>> {
        val key = filter.listKey
        val daoRows = dao.observeList(key).map { rows -> rows.map { it.toDomain() } }
            .catch { emit(emptyList()) } // a broken DB read must not take the whole Flow down; fall back to "no cache"
        return combine(daoRows, listOutcomes) { rows, outcomes ->
            val outcome = outcomes[key]
            when {
                outcome == null -> Resource.Loading(rows.takeIf { it.isNotEmpty() })
                // Cache-first has to survive process death: after a restart the in-memory outcome
                // carries no rows of its own, so the DAO rows collected here are the only cache left.
                outcome.error != null -> Resource.Error(outcome.rows ?: rows.takeIf { it.isNotEmpty() }, outcome.error)
                else -> Resource.Success(outcome.rows.orEmpty())
            }
        }.distinctUntilChanged()
    }

    suspend fun refreshList(filter: OrdersFilter) {
        val key = filter.listKey
        val started = epoch.get()
        try {
            val page = api.orders(q = filter.q, status = filter.status?.name, day = filter.day?.toString(), page = filter.page)
            val rows = page.items.map { it.toDomain() }
            if (epoch.get() != started) return // signed out mid-flight; these rows belong to the old session
            // Embed the fetched rows in the same write as the outcome so every combine() tick
            // this triggers is already self-consistent; the DAO write below is for persistence only.
            listOutcomes.update { m -> if (epoch.get() != started) m else m + (key to ListOutcome(rows, null)) }
            val now = System.currentTimeMillis()
            dao.replaceList(key, rows.mapIndexed { i, o -> o.toEntity(key, i, now) })
        } catch (t: Throwable) {
            if (t is CancellationException) throw t // a cancelled scope is not an app error
            // No DAO read here on purpose: it would be a second suspending call that can itself
            // fail (DB wiped concurrently, disk error) inside a catch block. Recording null instead
            // lets list() fall back to the DAO rows off the Flow it is already collecting.
            listOutcomes.update { m ->
                if (epoch.get() != started) m else m + (key to ListOutcome(m[key]?.rows, t.toAppError()))
            }
        }
    }

    fun detail(id: String): Flow<Resource<OrderDetail>> =
        combine(dao.observeDetail(id), detailOutcomes) { row, outcomes ->
            // Cached JSON can predate a schema change; a decode failure must read as "no cache", not crash the flow.
            val fromDao = row?.let { runCatching { json.decodeFromString(OrderDetailDto.serializer(), it.json).toDomain(mediaBase, Instant.ofEpochMilli(it.cachedAt)) }.getOrNull() }
            val outcome = outcomes[id]
            when {
                outcome == null -> Resource.Loading(fromDao)
                outcome.error != null -> Resource.Error(outcome.detail ?: fromDao, outcome.error)
                else -> outcome.detail?.let { Resource.Success(it) } ?: Resource.Loading(fromDao)
            }
        }.distinctUntilChanged()

    suspend fun refreshDetail(id: String) {
        val started = epoch.get()
        try {
            val dto = api.order(id)
            val now = System.currentTimeMillis()
            val detail = dto.toDomain(mediaBase, Instant.ofEpochMilli(now))
            if (epoch.get() != started) return // signed out mid-flight; this detail belongs to the old session
            detailOutcomes.update { m -> if (epoch.get() != started) m else m + (id to DetailOutcome(detail, null)) }
            dao.upsertDetail(OrderDetailEntity(id, json.encodeToString(OrderDetailDto.serializer(), dto), now))
        } catch (t: Throwable) {
            if (t is CancellationException) throw t // a cancelled scope is not an app error
            if (t is ApiException && t.status == 404) {
                dao.deleteOrder(id) // hard-deleted on the server (spec §4.3)
                // Record the error (not just evict) so detail() reports it instead of spinning forever,
                // and strip the id from every cached list page so list() stops showing the deleted order.
                detailOutcomes.update { m -> if (epoch.get() != started) m else m + (id to DetailOutcome(null, t.toAppError())) }
                listOutcomes.update { m ->
                    if (epoch.get() != started) m
                    else m.mapValues { (_, v) -> v.copy(rows = v.rows?.filterNot { it.id == id }) }
                }
            } else {
                detailOutcomes.update { m ->
                    if (epoch.get() != started) m else m + (id to DetailOutcome(m[id]?.detail, t.toAppError()))
                }
            }
        }
    }
}
