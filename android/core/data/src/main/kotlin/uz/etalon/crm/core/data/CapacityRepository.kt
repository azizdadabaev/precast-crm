package uz.etalon.crm.core.data

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
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
 * «Something on the calendar changed» — told by every write that adds, moves or removes an order's
 * m² (placing an order, online or from the outbox, and cancelling one). A narrow interface rather
 * than [CapacityRepository] itself, so those writers and their tests need not build the grid.
 */
fun interface CapacityInvalidator {
    fun invalidate()

    companion object {
        /** For a test that does not care about the calendar. */
        val None = CapacityInvalidator { }
    }
}

/**
 * One month's capacity grid (design §4.3), cached in memory for the session — no Room: this is a
 * read-heavy planning aid, not something a driver in a yard with no signal needs the way an
 * order's own detail is (`OrdersRepository`).
 *
 * The cache is for drawing at once, never for trusting: every [observe] asks the server again, and
 * every [invalidate] re-asks for each month still on screen. A month cached once and believed for
 * the whole session showed a new order on 28 Oct in the day sheet's list (fetched fresh) and not
 * in the grid above it — «0 м² мавжуд» over the order itself.
 */
@Singleton
class CapacityRepository @Inject constructor(
    private val api: EtalonApi,
    private val sessionCapacity: SessionCapacity,
) : CapacityInvalidator {
    private val cache = MutableStateFlow<Map<YearMonth, CapacityMonth>>(emptyMap())

    /** Bumped by [invalidate]; each live [observe] re-fetches its month on every value, the
     *  initial one included — which is the fetch every collection starts with. */
    private val generation = MutableStateFlow(0L)

    /** Bumped by [clearCache] — the same guard [OrdersRepository.clearCache] uses: a fetch already
     *  in flight when a sign-out clears the cache must not resurrect the previous user's month. */
    private val epoch = AtomicLong(0)

    /** Called on sign-out, alongside `OrdersRepository.clearCache()`: the grid otherwise survives
     *  into the next signed-in user's session unchanged. */
    fun clearCache() {
        epoch.incrementAndGet()
        cache.value = emptyMap()
    }

    /**
     * Stale-while-revalidate. [Resource.Loading] only while [month] has never been fetched this
     * session; a cached month answers with [Resource.Success] at once, and the server is asked
     * again behind it. Never completes: whatever lands in the cache later — this collection's own
     * fetch, a pull-to-refresh, an [invalidate] — reaches the collector, and a re-fetch that
     * answers the same figures emits nothing.
     *
     * A failure is reported only when there is nothing to show instead. Over a cached month it
     * stays silent: offline, the grid the planner already had is still the best answer there is.
     */
    fun observe(month: YearMonth): Flow<Resource<CapacityMonth>> = channelFlow {
        if (cache.value[month] == null) send(Resource.Loading())
        launch {
            cache.map { it[month] }.filterNotNull().distinctUntilChanged()
                .collect { send(Resource.Success(it)) }
        }
        generation.collect {
            try {
                fetch(month)
            } catch (t: Throwable) {
                if (t is CancellationException) throw t // a cancelled scope is not an app error
                if (cache.value[month] == null) send(Resource.Error(null, t.toAppError()))
            }
        }
    }

    /** Re-fetches every month being observed right now. Months nobody is looking at need nothing:
     *  their next [observe] asks the server anyway. */
    override fun invalidate() {
        generation.update { it + 1 }
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
