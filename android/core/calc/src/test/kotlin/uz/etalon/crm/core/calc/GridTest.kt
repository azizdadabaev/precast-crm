package uz.etalon.crm.core.calc

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class GridTest {
    @Test fun `the grid helpers mirror src-lib-utils`() {
        assertEquals(4.1, roundUpToGrid(4.0, 0.1)); assertEquals(4.05, roundUpToGrid(4.0, 0.05))
        assertEquals(3.9, roundDownToGrid(4.0, 0.1)); assertEquals(4.2, roundUpToGrid(4.13, 0.1))
        assertEquals(4.0, roundUpToGrid(4.0, 0.0), "a non-positive grid is a no-op")
        assertEquals(Double.NaN, roundUpToGrid(Double.NaN, 0.1))
    }
}
