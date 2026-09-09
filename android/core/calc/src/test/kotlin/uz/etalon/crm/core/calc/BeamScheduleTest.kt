package uz.etalon.crm.core.calc

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class BeamScheduleTest {
    @Test fun `beamLengthKey matches JS toFixed(2), which String_format does not`() {
        assertEquals("2.67", beamLengthKey(2.675))   // String.format would give "2.68"
        assertEquals("5.00", beamLengthKey(5.005))   // String.format would give "5.01"
        assertEquals("4.61", beamLengthKey(4.605))
        assertEquals("4.30", beamLengthKey(4.3))
        assertEquals("8.30", beamLengthKey(8.3))
    }
    @Test fun `the schedule groups by two-decimal length, descending, summing beam counts`() {
        val rows = listOf(4.0, 4.0, 6.0).mapIndexed { i, w ->
            recomputeRow(SlabRow(id = "r$i", name = "Хона", innerWidth = w, innerLength = 6.0))
        }
        val s = beamSchedule(rows)
        assertEquals(s.map { it.lengthKey }, s.map { it.lengthKey }.sortedByDescending { it.toDouble() })
        assertEquals(rows.sumOf { it.result!!.beamCount }, s.sumOf { it.beams })
    }
    @Test fun `rows with no result contribute nothing`() = assertEquals(emptyList<BeamScheduleLine>(), beamSchedule(listOf(SlabRow("a", "Хона"))))
}
