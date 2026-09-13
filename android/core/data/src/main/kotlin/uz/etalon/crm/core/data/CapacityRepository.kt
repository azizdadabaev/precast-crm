package uz.etalon.crm.core.data

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.update
import uz.etalon.crm.core.data.mapper.toDomain
import uz.etalon.crm.core.model.CapacityMonth
import uz.etalon.crm.core.model.CapacityThresholds
import uz.etalon.crm.core.model.Resource
import uz.etalon.crm.core.model.gridRange
import uz.etalon.crm.core.network.EtalonApi
import java.time.LocalDate
import java.time.YearMonth
import java.util.concurrent.atomic.AtomicLong
import javax.inject.Inject
import javax.inject.Singleton

/**
 * One month's capacity grid (design §4.3), cached in memory for the session — no Room: this is a
 * read-heavy planning aid, not something a driver in a yard with no signal needs the way an
 * order's own detail is (`OrdersRepository`).
 */
@Singleton
class CapacityRepository @Inject constructor(
    private val api: EtalonApi,
    private val sessionCapacity: SessionCapacity,
) {
    private val cache = MutableStateFlow<Map<YearMonth, CapacityMonth>>(emptyMap())

    /** Bumped by [clearCache] — the same guard [OrdersRepository.clearCache] uses: a fetch already
     *  in flight when a sign-out clears the cache must not resurrect the previous user's month. */
    private val epoch = AtomicLong(0)

    /** Called on sign-out, alongside `OrdersRepository.clearCache()`: the grid otherwise survives
     *  into the next signed-in user's session unchanged. */
    fun clearCache() {
        epoch.incrementAndGet()
        cache.value = emptyMap()
    }

    /** [Resource.Loading] only while [month] has never been fetched this session; a month already
     *  cached answers with [Resource.Success] immediately, with no network call. */
    fun observe(month: YearMonth): Flow<Resource<CapacityMonth>> = flow {
        cache.value[month]?.let { emit(Resource.Success(it)); return@flow }
        emit(Resource.Loading())
        try {
            emit(Resource.Success(fetch(month)))
        } catch (t: Throwable) {
            if (t is CancellationException) throw t // a cancelled scope is not an app error
            emit(Resource.Error(null, t.toAppError()))
        }
    }

    /** Forces a network fetch for [month] — pull-to-refresh in the calendar view. */
    suspend fun refresh(month: YearMonth): Result<Unit> = runCatchingCancellable { fetch(month); Unit }

    /** Throws on failure, so a failed month is never written to [cache] — a later [observe] or
     *  [refresh] simply tries the network again instead of being stuck behind a cached error. */
    private suspend fun fetch(month: YearMonth): CapacityMonth {
        val started = epoch.get()
        val range = gridRange(month)
        val dto = api.capacity(from = range.start.toString(), to = range.endInclusive.toString())
        // R3: the response's own thresholds win; a server old enough to omit them falls back to
        // the session's bootstrap thresholds, and only then to the client-side DEFAULT.
        val thresholds = dto.thresholds?.toDomain() ?: sessionCapacity.capacityThresholds.value ?: CapacityThresholds.DEFAULT
        val days = dto.days.associate { LocalDate.parse(it.date) to it.toDomain() }
        val result = CapacityMonth(month, range, days, thresholds)
        if (epoch.get() == started) cache.update { it + (month to result) }
        return result
    }
}
