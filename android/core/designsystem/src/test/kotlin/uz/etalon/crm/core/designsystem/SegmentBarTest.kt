package uz.etalon.crm.core.designsystem

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.designsystem.components.segmentBarFilled

/**
 * Design §2.4's one arithmetic rule: today's deliveries are a share of today's orders drawn on
 * seven segments. The two ends are what the spec calls out — «all seven filled when count = 0
 * reads as empty, not full» — and the middle must never round a part-done day up to a finished one
 * or down to a day nothing has left the yard on.
 */
class SegmentBarTest {
    @Test fun `no orders today lights nothing`() {
        assertEquals(0, segmentBarFilled(filled = 0, total = 0, segments = 7))
    }

    @Test fun `nothing dispatched yet lights nothing`() {
        assertEquals(0, segmentBarFilled(filled = 0, total = 9, segments = 7))
    }

    @Test fun `every order out lights every segment`() {
        assertEquals(7, segmentBarFilled(filled = 9, total = 9, segments = 7))
    }

    @Test fun `a share rounds to its nearest segment`() {
        assertEquals(4, segmentBarFilled(filled = 4, total = 7, segments = 7))
        assertEquals(4, segmentBarFilled(filled = 5, total = 9, segments = 7))
        assertEquals(2, segmentBarFilled(filled = 3, total = 10, segments = 7))
    }

    /** One of a hundred is still a start: it never rounds away to an empty bar. */
    @Test fun `one order out of many still lights one segment`() {
        assertEquals(1, segmentBarFilled(filled = 1, total = 100, segments = 7))
    }

    /** And one order short of done never reads as done. */
    @Test fun `one order short of done never fills the bar`() {
        assertEquals(6, segmentBarFilled(filled = 99, total = 100, segments = 7))
    }
}
