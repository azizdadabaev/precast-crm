package uz.etalon.crm.core.calc

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import uz.etalon.crm.core.model.beamLengthKey as modelBeamLengthKey

/**
 * The app spells a beam length two ways — [beamLengthKey] for the engine's `Double` and
 * `core.model.beamLengthKey` for the `BigDecimal` a placed order carries back — and they must
 * produce the SAME string for the same beam. The calculator's production schedule and the order's
 * load list label the same beam from the two of them; a disagreement means the yard cuts to one
 * list and loads from another, and the load route's over-load guard 422s every count on a key it
 * has no total for.
 *
 * This suite is here rather than in `:core:model` because only `:core:calc` can see both.
 */
class BeamLengthKeyAgreementTest {

    /** `beamLength` is `Decimal(10,3)` server-side, so three decimals is the whole input space —
     *  including the exact halves where JS `toFixed(2)` and decimal HALF_UP famously disagree. */
    private val lengths = listOf(
        "3.30", "3.505", "3.515", "4.30", "2.675", "5.005", "0.005", "12.345", "7.000", "3.999",
    )

    @Test fun `both spellings of a beam length agree`() {
        lengths.forEach { s ->
            val d = BigDecimal(s)
            assertEquals(modelBeamLengthKey(d), beamLengthKey(d.toDouble()), "beam $s")
        }
    }

    /** The rule itself, stated once so a change to either function that keeps them equal but wrong
     *  still fails: 3.505 is the nearest double to 3.504999…, so `toFixed(2)` reads «3.50». */
    @Test fun `an exact half rounds the way the server's toFixed does`() {
        assertEquals("3.50", beamLengthKey(3.505))
        assertEquals("3.50", modelBeamLengthKey(BigDecimal("3.505")))
    }
}
