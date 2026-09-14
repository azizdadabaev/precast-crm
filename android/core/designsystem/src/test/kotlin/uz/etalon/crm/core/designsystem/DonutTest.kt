package uz.etalon.crm.core.designsystem

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.designsystem.components.donutPercent

/**
 * Design §2.5 / `PaymentDonut.tsx:76`: the one figure the phone computes for the donut. HALF_UP to
 * a whole percent, and a total of zero is 0 % rather than a division that throws — an account with
 * no orders this month opens the tab like any other.
 *
 * The values are the web's own: 317 paid of 353 renders «90%» there, and it must render «90%» here.
 */
class DonutTest {
    @Test fun `the web's own month rounds the way the web rounds it`() {
        assertEquals(90, donutPercent(317, 353))
    }

    @Test fun `a third rounds down and two thirds round up`() {
        assertEquals(33, donutPercent(1, 3))
        assertEquals(67, donutPercent(2, 3))
    }

    @Test fun `no orders is zero percent, not a division by zero`() {
        assertEquals(0, donutPercent(0, 0))
    }

    @Test fun `everything paid is a hundred`() {
        assertEquals(100, donutPercent(353, 353))
    }

    /** Half a percent goes up, the HALF_UP rule the whole app rounds money with. */
    @Test fun `a half percent rounds up`() {
        assertEquals(51, donutPercent(101, 200))
    }
}
