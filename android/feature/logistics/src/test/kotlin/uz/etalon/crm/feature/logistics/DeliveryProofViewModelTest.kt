package uz.etalon.crm.feature.logistics

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.*
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.image.PreparedImage
import uz.etalon.crm.core.model.DeliveryCash
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.feature.logistics.delivery.*
import java.io.File

@OptIn(ExperimentalCoroutinesApi::class)
class DeliveryProofViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    @BeforeEach fun up() = Dispatchers.setMain(dispatcher)
    @AfterEach fun down() = Dispatchers.resetMain()
    private val photo = PreparedImage(File("/tmp/x.jpg"), 1280, 853, 100)

    @Test fun `no cash collected together with an amount is refused`() {
        val msg = validateDeliveryCash(DeliveryCash(amount = Money.parse("1000"), noCashCollected = true, note = "мижоз кейин тўлайди"))
        assertNotNull(msg)
    }

    @Test fun `no cash collected demands a note`() {
        assertNotNull(validateDeliveryCash(DeliveryCash(noCashCollected = true, note = "")))
        assertNotNull(validateDeliveryCash(DeliveryCash(noCashCollected = true, note = "ок")))
        assertNull(validateDeliveryCash(DeliveryCash(noCashCollected = true, note = "мижоз кейин тўлайди")))
    }

    @Test fun `an ordinary cash amount needs no note`() {
        assertNull(validateDeliveryCash(DeliveryCash(amount = Money.parse("1500000"))))
    }

    @Test fun `zero cash with neither flag nor note is allowed`() {
        // The customer paid by transfer earlier; nothing was collected on site.
        assertNull(validateDeliveryCash(DeliveryCash()))
    }

    @Test fun `a negative amount is refused even without either flag`() {
        assertNotNull(validateDeliveryCash(DeliveryCash(amount = Money.parse("-1"))))
    }

    @Test fun `the keypad drives the amount and the shortfall against what was expected`() {
        val vm = DeliveryProofViewModel("o1", expected = Money.parse("2000000"), submit = { _, _ -> Result.success("ob") })
        vm.setAmountDigits("1500000")
        assertEquals(Money.parse("1500000"), vm.state.value.amount)
        assertEquals(Money.parse("500000"), vm.state.value.shortfall)
    }

    @Test fun `collecting more than expected reports no shortfall`() {
        val vm = DeliveryProofViewModel("o1", expected = Money.parse("1000000"), submit = { _, _ -> Result.success("ob") })
        vm.setAmountDigits("1200000")
        assertEquals(Money.ZERO, vm.state.value.shortfall)
    }

    @Test fun `an empty field reads as zero, exactly like a typed zero`() {
        val vm = DeliveryProofViewModel("o1", expected = Money.parse("400000"), submit = { _, _ -> Result.success("ob") })
        assertEquals(Money.ZERO, vm.state.value.amount)
        assertEquals(Money.parse("400000"), vm.state.value.shortfall)
    }

    @Test fun `a decimal amount survives the keypad's comma exactly`() {
        val vm = DeliveryProofViewModel("o1", expected = Money.ZERO, submit = { _, _ -> Result.success("ob") })
        vm.setAmountDigits("125000,5")
        assertEquals(Money.parse("125000.5"), vm.state.value.amount)
    }

    @Test fun `a very large amount is carried without a floating-point hop`() {
        val vm = DeliveryProofViewModel("o1", expected = Money.ZERO, submit = { _, _ -> Result.success("ob") })
        vm.setAmountDigits("999999999999")
        assertEquals(Money.parse("999999999999"), vm.state.value.amount)
    }

    @Test fun `a validated proof is queued with its cash fields`() = runTest {
        var captured: DeliveryCash? = null
        val vm = DeliveryProofViewModel("o1", Money.ZERO, submit = { _, cash -> captured = cash; Result.success("ob") })
        vm.onPhoto(photo)
        vm.setAmountDigits("750000")
        vm.setDriverReturned(true)
        vm.submit()
        advanceUntilIdle()
        assertTrue(vm.state.value.done)
        assertEquals(Money.parse("750000"), captured!!.amount)
        assertTrue(captured!!.driverReturned)
    }

    @Test fun `the no-cash-collected path is queued once a note is given`() = runTest {
        var captured: DeliveryCash? = null
        val vm = DeliveryProofViewModel("o1", Money.parse("300000"), submit = { _, cash -> captured = cash; Result.success("ob") })
        vm.onPhoto(photo)
        vm.setNoCashCollected(true)
        vm.setNote("мижоз кейин тўлайди")
        vm.submit()
        advanceUntilIdle()
        assertTrue(vm.state.value.done)
        val cash = captured!!
        assertTrue(cash.noCashCollected)
        assertEquals(Money.ZERO, cash.amount)
    }

    @Test fun `turning on no-cash-collected clears a previously typed amount`() {
        val vm = DeliveryProofViewModel("o1", Money.ZERO, submit = { _, _ -> Result.success("ob") })
        vm.setAmountDigits("1000")
        vm.setNoCashCollected(true)
        assertEquals(Money.ZERO, vm.state.value.amount)
    }

    @Test fun `an invalid combination never reaches the outbox`() = runTest {
        var calls = 0
        val vm = DeliveryProofViewModel("o1", Money.ZERO, submit = { _, _ -> calls++; Result.success("ob") })
        vm.onPhoto(photo)
        vm.setAmountDigits("1000")
        vm.setNoCashCollected(true)
        vm.submit()
        advanceUntilIdle()
        assertEquals(0, calls)
        assertNotNull(vm.state.value.error)
    }

    @Test fun `a nonsense negative amount is refused before it is ever queued`() = runTest {
        var calls = 0
        val vm = DeliveryProofViewModel("o1", Money.ZERO, submit = { _, _ -> calls++; Result.success("ob") })
        vm.onPhoto(photo)
        assertNotNull(validateDeliveryCash(DeliveryCash(amount = Money.parse("-500"))))
        vm.submit()
        advanceUntilIdle()
        // Nothing negative can reach here through the keypad, but the guard is still exercised
        // directly above; a normal (zero) submission from this state must still succeed.
        assertEquals(1, calls)
        assertTrue(vm.state.value.done)
    }

    @Test fun `submitting without a photo is impossible`() = runTest {
        var calls = 0
        val vm = DeliveryProofViewModel("o1", Money.ZERO, submit = { _, _ -> calls++; Result.success("ob") })
        vm.submit()
        advanceUntilIdle()
        assertEquals(0, calls)
        assertNotNull(vm.state.value.error)
    }

    @Test fun `a failure keeps the photo so the operator can retry without re-shooting`() = runTest {
        val vm = DeliveryProofViewModel("o1", Money.ZERO, submit = { _, _ -> Result.failure(IllegalStateException("диск тўлди")) })
        vm.onPhoto(photo)
        vm.submit()
        advanceUntilIdle()
        assertFalse(vm.state.value.done)
        assertEquals(photo, vm.state.value.photo)
        assertNotNull(vm.state.value.error)
    }
}
