package uz.etalon.crm.nav

import androidx.navigation3.runtime.NavBackStack
import androidx.navigation3.runtime.NavKey
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/** `RESULT_DWELL_MS`, which is `internal` to `:feature:logistics` and so cannot be named here.
 *  Only its existence matters to these tests, not its length. */
private const val DWELL_MS = 1_200L

/**
 * Defect I1. The three camera-first routes hold ruling R5's result grid with
 * `LaunchedEffect(s.done) { delay(RESULT_DWELL_MS); onDone() }`, and `NavDisplay` keeps an outgoing
 * entry composed for the length of its exit transition — so a back press during the dwell popped
 * the entry, the delay then resumed inside the leaving screen and popped a second one. The driver
 * who tapped back expecting «Буюртма» landed on the orders list, mid-job.
 *
 * These drive the order of events rather than the rendering: the route's own effect is reproduced
 * as a coroutine over virtual time, and the back press is the same `popIfTop` call the nav host
 * wires into `onCancel`. With an unconditional `removeLastOrNull()` in [popIfTop] the first test
 * leaves the stack empty.
 */
class PopIfTopTest {
    private val order: NavKey = OrderDetail("o1")
    private val loadTruck: NavKey = LoadTruck("o1", extra = false)

    private fun stack() = NavBackStack<NavKey>(order, loadTruck)

    /** The dwell running out on a screen nobody left: the ordinary path, one pop. */
    @Test fun `the dwell pops the screen it was shown on`() = runTest {
        val bs = stack()
        val dwell = launch { delay(DWELL_MS); popIfTop(bs, loadTruck) }
        dwell.join()
        assertEquals(listOf(order), bs.toList())
    }

    /** Back pressed while the grid is still up. The dwell is still running behind the exit
     *  transition and must find nothing of its own left to pop. */
    @Test fun `back during the dwell pops one entry, not two`() = runTest {
        val bs = stack()
        val dwell = launch { delay(DWELL_MS); popIfTop(bs, loadTruck) }
        popIfTop(bs, loadTruck)
        assertEquals(listOf(order), bs.toList())

        dwell.join()
        assertEquals(listOf(order), bs.toList())
    }

    /** And the order detail underneath is not what the late callback takes instead: the guard is
     *  identity, not depth. A stack the operator has moved on from is left alone entirely. */
    @Test fun `a dwell that resumes under a different screen pops nothing`() = runTest {
        val bs = stack()
        val dwell = launch { delay(DWELL_MS); popIfTop(bs, loadTruck) }
        popIfTop(bs, loadTruck)
        bs.add(RecordPayment("o1"))

        dwell.join()
        assertEquals(listOf(order, RecordPayment("o1")), bs.toList())
    }
}
