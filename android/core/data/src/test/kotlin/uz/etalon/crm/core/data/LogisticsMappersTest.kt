package uz.etalon.crm.core.data

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.data.mapper.normaliseBeamKeys

/**
 * The spelling every beam count is posted under. `POST /shipments/{id}/load` builds its per-length
 * totals with `Number(beamLength).toFixed(2)` and compares the posted map's keys against them, so a
 * key spelt any other way compares against a total of ZERO and every positive count takes a
 * permanent 422 in the yard — with the photo already in the outbox and the truck already loaded.
 *
 * `LogisticsRepositoryTest` proves the repository calls this; these are the function's own edges.
 */
class LogisticsMappersTest {

    @Test fun `a short key is padded to two decimals`() {
        assertEquals(mapOf("3.30" to 5, "4.00" to 2), normaliseBeamKeys(mapOf("3.3" to 5, "4" to 2)))
    }

    @Test fun `a key already spelt the server's way is left alone`() {
        assertEquals(mapOf("3.30" to 5), normaliseBeamKeys(mapOf("3.30" to 5)))
    }

    /** The server stores `beamLength` as `Decimal(10,3)`, so a third decimal really arrives, and
     *  `toFixed(2)` rounds the BINARY value — 3.505 is 3.504999… and reads «3.50», where decimal
     *  HALF_UP would read «3.51» and miss the total by a whole beam length. */
    @Test fun `a third decimal rounds the way the server's toFixed does`() {
        assertEquals(mapOf("3.50" to 4), normaliseBeamKeys(mapOf("3.505" to 4)))
        assertEquals(mapOf("2.67" to 1), normaliseBeamKeys(mapOf("2.675" to 1)))
    }

    @Test fun `an empty map stays empty`() {
        assertEquals(emptyMap<String, Int>(), normaliseBeamKeys(emptyMap()))
    }

    /**
     * Two spellings of ONE length collapse to one key — and `mapKeys` keeps the LAST, it does not
     * add them. Harmless in practice because the stepper this is fed from is itself keyed by the
     * normalised length (`OrderDetail.loadList`), so a duplicate cannot be built; pinned here so
     * that it is a decision on the record rather than a surprise if a caller ever hand-builds one.
     */
    @Test fun `two spellings of one length collapse to the last, not the sum`() {
        assertEquals(mapOf("3.30" to 2), normaliseBeamKeys(linkedMapOf("3.3" to 5, "3.30" to 2)))
    }
}
