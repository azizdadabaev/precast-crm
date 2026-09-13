package uz.etalon.crm.feature.calculator.calendar

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.model.CapacityTier
import uz.etalon.crm.core.testing.CalendarFixtures
import java.time.LocalDate

/**
 * The one rule behind the tag beside «Етказиб бериш санаси» (design §7): which band the picked
 * delivery day falls in. Read against the shared September every calendar in the app is drawn
 * from, so this test and the grid's own baselines can never disagree about a day.
 */
class TierOfDateTest {
    private val september = CalendarFixtures.september

    @Test fun `each band of the fixture's September`() {
        // 300 / 450 / 600, each band inclusive of its threshold (`tierFor`).
        assertEquals(CapacityTier.AVAILABLE, tierOfDate(september, LocalDate.of(2026, 9, 2)))    // 204
        assertEquals(CapacityTier.MODERATE, tierOfDate(september, LocalDate.of(2026, 9, 6)))     // 334
        assertEquals(CapacityTier.HEAVY, tierOfDate(september, LocalDate.of(2026, 9, 8)))        // 525
        assertEquals(CapacityTier.OVERBOOKED, tierOfDate(september, LocalDate.of(2026, 9, 12)))  // 685
    }

    /** A day the server never reported is an EMPTY day, and an empty delivery day is available —
     *  which is the whole answer the seller opened the grid for. */
    @Test fun `a day with no orders is available`() {
        assertEquals(CapacityTier.AVAILABLE, tierOfDate(september, LocalDate.of(2026, 9, 20)))
    }

    /** The month has to be the day's own. September's grid also carries 31 August and 1 October,
     *  and answering «мавжуд» for them out of `CapacityMonth.day`'s zero bucket would label days
     *  whose real load this month never reported. */
    @Test fun `a day outside the month is unknown`() {
        assertNull(tierOfDate(september, LocalDate.of(2026, 8, 31)))
        assertNull(tierOfDate(september, LocalDate.of(2026, 10, 1)))
    }

    @Test fun `no month is no tier`() {
        assertNull(tierOfDate(null, LocalDate.of(2026, 9, 12)))
    }

    /** The bands are the SERVER's, not a constant: the same day under the tighter factory
     *  (200/300/400) is a band warmer. */
    @Test fun `the thresholds come from the month`() {
        val d = LocalDate.of(2026, 9, 2) // 204 м²
        assertEquals(CapacityTier.AVAILABLE, tierOfDate(september, d))
        assertEquals(CapacityTier.MODERATE, tierOfDate(CalendarFixtures.septemberTight, d))
    }
}
