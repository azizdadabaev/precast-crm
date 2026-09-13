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

    // Distinct from the case above: a note does not buy a negative amount its way past the
    // guard — the sign check is unconditional, not just a fallback for the flag-less path.
    @Test fun `a negative amount is refused even with a note explaining it`() {
        assertNotNull(validateDeliveryCash(DeliveryCash(amount = Money.parse("-250000"), note = "хатолик билан киритилди")))
    }

    @Test fun `the keypad drives the amount and the shortfall against what was expected`() {
        val vm = DeliveryProofViewModel("o1", expected = Money.parse("2000000"), submit = { _, _ -> Result.success("ob") })
        vm.setAmountDigits("1500000")
        assertEquals(Money.parse("1500000"), vm.state.value.amount)
        assertEquals(Money.parse("500000"), vm.state.value.shortfall)
    }

    @Test fun `collecting more than expected reports no shortfall, but reports being over`() {
        val vm = DeliveryProofViewModel("o1", expected = Money.parse("1000000"), submit = { _, _ -> Result.success("ob") })
        vm.setAmountDigits("1200000")
        assertEquals(Money.ZERO, vm.state.value.shortfall)
        assertEquals(Money.parse("200000"), vm.state.value.overCollected)
    }

    @Test fun `an amount at or under expected reports no over-collection`() {
        val vm = DeliveryProofViewModel("o1", expected = Money.parse("1000000"), submit = { _, _ -> Result.success("ob") })
        vm.setAmountDigits("1000000")
        assertEquals(Money.ZERO, vm.state.value.overCollected)
    }

    @Test fun `an empty field reads as zero, exactly like a typed zero`() {
        val vm = DeliveryProofViewModel("o1", expected = Money.parse("400000"), submit = { _, _ -> Result.success("ob") })
        assertEquals(Money.ZERO, vm.state.value.amount)
        assertEquals(Money.parse("400000"), vm.state.value.shortfall)
    }

    // What this proves, and what it does not: the comma-to-dot swap and the resulting
    // BigDecimal's value/scale match a string built with '.' directly. It does NOT prove no
    // Double was ever involved — no equality check on a value a Decimal(14,2) column can hold
    // could prove that, since every such value round-trips losslessly through a Double too.
    // The real guarantee is structural (see the `amount` getter): replace(',', '.') feeds
    // straight into a BigDecimal constructor, with no arithmetic ever performed as Double.
    @Test fun `a decimal amount survives the keypad's comma exactly`() {
        val vm = DeliveryProofViewModel("o1", expected = Money.ZERO, submit = { _, _ -> Result.success("ob") })
        vm.setAmountDigits("125000,5")
        assertEquals(Money.parse("125000.5"), vm.state.value.amount)
    }

    // Same caveat as the decimal test above: this is a regression guard on the string-to-
    // BigDecimal path (12 digits is the keypad's own cap), not proof a Double was never near it.
    @Test fun `a very large amount is carried without a floating-point hop`() {
        val vm = DeliveryProofViewModel("o1", expected = Money.ZERO, submit = { _, _ -> Result.success("ob") })
        vm.setAmountDigits("999999999999")
        assertEquals(Money.parse("999999999999"), vm.state.value.amount)
    }

    // The server always sends money as a scale-2 decimal string (e.g. "2000000.00"), never the
    // scale-0 fixtures the rest of this file uses for brevity. Money.equals is BigDecimal.equals,
    // which is scale-sensitive, so this exercises shortfall/overCollected's subtraction against
    // real server-shaped data rather than only against round test numbers of the same scale.
    @Test fun `shortfall and over-collection hold against a real scale-2 server fixture`() {
        val vm = DeliveryProofViewModel("o1", expected = Money.parse("1000000.00"), submit = { _, _ -> Result.success("ob") })
        vm.setAmountDigits("700000")
        assertEquals(Money.parse("300000.00"), vm.state.value.shortfall)
        assertEquals(Money.ZERO, vm.state.value.overCollected)
        vm.setAmountDigits("1200000")
        assertEquals(Money.ZERO, vm.state.value.shortfall)
        assertEquals(Money.parse("200000.00"), vm.state.value.overCollected)
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

    // Renamed from a name that claimed to test the negative-amount guard: it never entered a
    // negative amount, and its one guard assertion was a verbatim duplicate of the dedicated
    // negative-amount test above. What it actually exercises is the ordinary zero-amount,
    // neither-flag path going all the way through submit() to the outbox, matching what
    // `validateDeliveryCash(DeliveryCash())` above already says must be allowed.
    @Test fun `a plain zero-amount submission reaches the outbox, exactly as validateDeliveryCash allows`() = runTest {
        var calls = 0
        val vm = DeliveryProofViewModel("o1", Money.ZERO, submit = { _, _ -> calls++; Result.success("ob") })
        vm.onPhoto(photo)
        vm.submit()
        advanceUntilIdle()
        assertEquals(1, calls)
        assertTrue(vm.state.value.done)
    }

    @Test fun `a second tap while the first submission is still in flight is a no-op`() = runTest {
        var calls = 0
        val vm = DeliveryProofViewModel("o1", Money.ZERO, submit = { _, _ -> calls++; Result.success("ob") })
        vm.onPhoto(photo)
        vm.submit() // enters submitting=true synchronously, then suspends on the coroutine
        vm.submit() // a second tap before the first has resolved must not enqueue a second proof
        advanceUntilIdle()
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

    /**
     * The button stays on screen for ruling R5's 1,2 s result dwell, so a second tap is a thing a
     * driver can actually do. It must enqueue nothing: the outbox has already MOVED the photo file
     * out of the cache, and a second proof would raise a second cash row against the same delivery.
     */
    @Test fun `submitting again after the proof is queued does nothing`() = runTest {
        var calls = 0
        val vm = DeliveryProofViewModel("o1", Money.ZERO, submit = { _, _ -> calls++; Result.success("ob") })
        vm.onPhoto(photo)
        vm.submit()
        advanceUntilIdle()
        assertTrue(vm.state.value.done)

        vm.submit()
        advanceUntilIdle()

        assertEquals(1, calls)
        assertNull(vm.state.value.error)
    }

    /**
     * `POST /orders/{id}/delivery-proof` writes `noCashCollectedNote` in the `noCashCollected`
     * branch and nowhere else. So the note is kept in state across a toggle — a driver who
     * fat-fingers the switch must not have to retype his sentence — but it is only ever SENT
     * under the switch, and the screen only ever SHOWS the field there.
     */
    @Test fun `the reason survives toggling the switch but is only sent under it`() = runTest {
        var sent: DeliveryCash? = null
        val vm = DeliveryProofViewModel("o1", Money.ZERO, submit = { _, cash -> sent = cash; Result.success("ob") })
        vm.onPhoto(photo)
        vm.setNoCashCollected(true)
        vm.setNote("мижоз жойида йўқ эди")
        vm.setNoCashCollected(false)

        assertEquals("мижоз жойида йўқ эди", vm.state.value.note)

        vm.setAmountDigits("1000000")
        vm.submit()
        advanceUntilIdle()

        assertEquals("", sent?.note)
        assertFalse(sent!!.noCashCollected)
    }

    /** And back on, the reason is still there and does go out. */
    @Test fun `toggling back on keeps the reason and sends it`() = runTest {
        var sent: DeliveryCash? = null
        val vm = DeliveryProofViewModel("o1", Money.ZERO, submit = { _, cash -> sent = cash; Result.success("ob") })
        vm.onPhoto(photo)
        vm.setNoCashCollected(true)
        vm.setNote("мижоз жойида йўқ эди")
        vm.setNoCashCollected(false)
        vm.setNoCashCollected(true)
        vm.submit()
        advanceUntilIdle()

        assertEquals("мижоз жойида йўқ эди", sent?.note)
        assertTrue(sent!!.noCashCollected)
    }
}
