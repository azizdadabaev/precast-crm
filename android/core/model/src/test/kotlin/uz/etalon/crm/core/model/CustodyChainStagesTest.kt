package uz.etalon.crm.core.model

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/**
 * [CustodyChain.stages] is how many people the money has passed through, and the payments queue
 * draws the chain only where that is more than one: a single stage is one avatar standing alone
 * under the row repeating the name the row's own meta line already gives.
 *
 * Pinned here rather than left to the screen, because the screen's rule is `stages > 1` and a
 * miscount by one is the difference between every office payment growing an orphan avatar and a
 * real hand-off going unshown.
 */
class CustodyChainStagesTest {
    @Test fun `a chain nobody touched has no stages`() {
        assertEquals(0, chain().stages)
    }

    /** The office payment: an operator typed it in and that is the whole story. */
    @Test fun `one name is one stage`() {
        assertEquals(1, chain(recordedBy = "Оператор").stages)
    }

    /**
     * The driver case the queue actually draws: somebody collected the cash and somebody recorded
     * it, so there IS a hand-off to show — even when the two names are the same person.
     */
    @Test fun `a driver-collected payment has two stages`() {
        assertEquals(2, chain(collectedBy = "Жасур (ҳайдовчи)", recordedBy = "Жасур").stages)
    }

    @Test fun `a fully settled payment has all four`() {
        val full = chain(
            collectedBy = "Жасур (ҳайдовчи)",
            recordedBy = "Оператор",
            handedOverTo = "Кассир",
            confirmedBy = "Эга",
        )
        assertEquals(4, full.stages)
    }

    /** Position must not matter: it is a count of who is present, not of a prefix. */
    @Test fun `a gap in the middle still counts only the names present`() {
        assertEquals(2, chain(collectedBy = "Жасур", confirmedBy = "Эга").stages)
        assertEquals(1, chain(confirmedBy = "Эга").stages)
    }

    private fun chain(
        collectedBy: String? = null,
        recordedBy: String? = null,
        handedOverTo: String? = null,
        confirmedBy: String? = null,
    ) = CustodyChain(collectedBy, recordedBy, handedOverTo, confirmedBy)
}
