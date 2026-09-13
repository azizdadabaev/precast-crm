package uz.etalon.crm.feature.logistics

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.*
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.image.PreparedImage
import uz.etalon.crm.feature.logistics.shipments.Allowance
import uz.etalon.crm.feature.logistics.shipments.ShipmentLoadUseCase
import uz.etalon.crm.feature.logistics.shipments.ShipmentLoadViewModel
import java.io.File

@OptIn(ExperimentalCoroutinesApi::class)
class ShipmentLoadViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    @BeforeEach fun up() = Dispatchers.setMain(dispatcher)
    @AfterEach fun down() = Dispatchers.resetMain()

    private val photo = PreparedImage(File("/tmp/x.jpg"), 1280, 853, 100)
    private val allowance = Allowance(beams = mapOf("4.30" to 5, "3.30" to 3), blocks = 100)

    private fun vm(allowance: Allowance = this.allowance, load: ShipmentLoadUseCase) =
        ShipmentLoadViewModel("o1", "s1", allowance, load)

    @Test fun `submitting without a photo is impossible`() = runTest {
        var calls = 0
        val v = vm { _, _, _, _, _ -> calls++; Result.success("sh1") }
        v.submit()
        advanceUntilIdle()
        assertEquals(0, calls)
        assertNotNull(v.state.value.error)
    }

    @Test fun `a count above the allowance is clamped to it`() = runTest {
        val v = vm { _, _, _, _, _ -> Result.success("sh1") }
        v.setBeam("4.30", 999)
        assertEquals(5, v.state.value.beams["4.30"])
        v.setBlocks(999)
        assertEquals(100, v.state.value.blocks)
    }

    @Test fun `zero-count lengths are dropped from the payload`() = runTest {
        var seenBeams: Map<String, Int>? = null
        val v = vm { _, _, _, beams, _ -> seenBeams = beams; Result.success("sh1") }
        v.onPhoto(photo)
        v.setBeam("4.30", 4)
        v.setBeam("3.30", 0)
        v.submit()
        advanceUntilIdle()
        assertEquals(mapOf("4.30" to 4), seenBeams)
    }

    @Test fun `success reports done`() = runTest {
        val v = vm { id, sid, p, _, _ -> assertEquals("o1", id); assertEquals("s1", sid); assertEquals(photo, p); Result.success("sh1") }
        v.onPhoto(photo)
        v.setBeam("4.30", 2)
        v.submit()
        advanceUntilIdle()
        assertTrue(v.state.value.done)
        assertFalse(v.state.value.submitting)
    }

    /**
     * The button stays on screen for ruling R5's 1,2 s result dwell, so a second tap is a thing a
     * driver can actually do. It must enqueue nothing: the outbox has already MOVED the photo file
     * out of the cache, and a second load would also double-count this truck against the order.
     */
    @Test fun `submitting again after the load is queued does nothing`() = runTest {
        var calls = 0
        val v = vm { _, _, _, _, _ -> calls++; Result.success("sh1") }
        v.onPhoto(photo)
        v.setBeam("4.30", 2)
        v.submit()
        advanceUntilIdle()
        assertTrue(v.state.value.done)

        v.submit()
        advanceUntilIdle()

        assertEquals(1, calls)
        assertNull(v.state.value.error)
    }

    @Test fun `a failure keeps the photo and the counts so the operator can retry`() = runTest {
        val v = vm { _, _, _, _, _ -> Result.failure(IllegalStateException("сервер хатоси")) }
        v.onPhoto(photo)
        v.setBeam("4.30", 2)
        v.setBlocks(10)
        v.submit()
        advanceUntilIdle()
        assertFalse(v.state.value.done)
        assertEquals(photo, v.state.value.photo)
        assertEquals(2, v.state.value.beams["4.30"])
        assertEquals(10, v.state.value.blocks)
        assertNotNull(v.state.value.error)
    }
}
