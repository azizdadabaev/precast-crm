package uz.etalon.crm.feature.payments

import androidx.lifecycle.SavedStateHandle
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.*
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.image.PreparedImage
import uz.etalon.crm.core.model.*
import uz.etalon.crm.core.ui.format.formatMoney
import uz.etalon.crm.feature.payments.record.*
import java.io.File
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate

@OptIn(ExperimentalCoroutinesApi::class)
class RecordPaymentViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    @BeforeEach fun up() = Dispatchers.setMain(dispatcher)
    @AfterEach fun down() = Dispatchers.resetMain()

    private val today = LocalDate.of(2026, 9, 7)
    private val receipt = PreparedImage(File("/tmp/receipt-1.jpg"), 1280, 853, 120)
    private val secondReceipt = PreparedImage(File("/tmp/receipt-2.jpg"), 1280, 853, 130)

    // ── validateRecord: the pure gate in front of the money ───────────────────

    @Test fun `an amount above what may still be recorded is refused before the network`() {
        val s = form(total = "10000000", confirmed = "0", amount = "10000001")
        assertNotNull(validateRecord(s))
    }

    @Test fun `an amount exactly at what may still be recorded is allowed`() {
        val s = form(total = "10000000", confirmed = "0", amount = "10000000")
        assertNull(validateRecord(s))
    }

    @Test fun `zero and negative amounts are refused`() {
        assertNotNull(validateRecord(form(amount = "")))
        assertNotNull(validateRecord(form(amount = "0")))
        assertNotNull(validateRecord(form(amount = "-1")))
    }

    @Test fun `a driver-collected payment requires a driver`() {
        val s = form(amount = "500000").copy(source = PaymentSource.FROM_DRIVER_AT_DELIVERY, driverId = null)
        assertNotNull(validateRecord(s))
        assertNull(validateRecord(s.copy(driverId = "d1")))
    }

    @Test fun `a driver may only be set on a driver-collected payment`() {
        val s = form(amount = "500000").copy(source = PaymentSource.IN_OFFICE_CASH, driverId = "d1")
        assertNotNull(validateRecord(s))
        assertNotNull(validateRecord(s.copy(source = PaymentSource.BANK_OR_ONLINE)))
    }

    @Test fun `a bank or online payment cannot carry a hand-over`() {
        val s = form(amount = "500000").copy(source = PaymentSource.BANK_OR_ONLINE, handOverNow = true)
        assertNotNull(validateRecord(s))
        assertNull(validateRecord(s.copy(handOverNow = false)))
        // The same hand-over is perfectly legal on office cash — the rule is about the source.
        assertNull(validateRecord(s.copy(source = PaymentSource.IN_OFFICE_CASH)))
    }

    /**
     * The bug this whole design exists to prevent. With 1 500 000 already awaiting confirmation,
     * the customer still owes 6 000 000 (what the order screen shows) but the server will only
     * accept 4 500 000. An amount between the two looks perfectly valid on screen and 422s at
     * the counter.
     */
    @Test fun `the cap is the recordable remaining, not the displayed remaining`() {
        val s = form(total = "10000000", confirmed = "4000000", pending = listOf("1500000"), amount = "5000000")
        assertEquals(Money.parse("6000000"), s.order!!.remaining)
        assertEquals(Money.parse("4500000"), s.cap)
        assertNotNull(validateRecord(s))
        assertEquals(Money.parse("500000"), s.overCap)
        assertNull(validateRecord(s.copy(amountDigits = "4500000")))
    }

    @Test fun `a canceled order takes no payment`() {
        val s = form(amount = "500000")
        val order = requireNotNull(s.order)
        val canceled = s.copy(order = order.copy(summary = order.summary.copy(status = OrderStatus.CANCELED)))
        assertNotNull(validateRecord(canceled))
    }

    @Test fun `a note longer than the server allows is refused`() {
        assertNotNull(validateRecord(form(amount = "500000").copy(notes = "ж".repeat(501))))
        assertNull(validateRecord(form(amount = "500000").copy(notes = "ж".repeat(500))))
    }

    @Test fun `a payment date in the future or too far back is refused`() {
        val s = form(amount = "500000")
        assertNotNull(validateRecord(s.copy(paidOn = today.plusDays(1))))
        assertNotNull(validateRecord(s.copy(paidOn = today.minusDays(121))))
        assertNull(validateRecord(s.copy(paidOn = today)))
        assertNull(validateRecord(s.copy(paidOn = today.minusDays(120))))
    }

    @Test fun `every refusal is written in Uzbek Cyrillic`() {
        val cyrillic = Regex("[\\u0400-\\u04FF]")
        listOf(
            form(amount = "0"),
            form(total = "1000", confirmed = "0", amount = "2000"),
            form(amount = "500").copy(source = PaymentSource.FROM_DRIVER_AT_DELIVERY),
            form(amount = "500").copy(driverId = "d1"),
            form(amount = "500").copy(source = PaymentSource.BANK_OR_ONLINE, handOverNow = true),
            form(amount = "500").copy(notes = "ж".repeat(501)),
            form(amount = "500").copy(paidOn = today.plusDays(1)),
            RecordPaymentUiState(today = today),
        ).forEach { s ->
            val message = validateRecord(s)
            assertNotNull(message, "expected a refusal for $s")
            assertTrue(cyrillic.containsMatchIn(message!!), "not Uzbek Cyrillic: $message")
        }
    }

    /**
     * The two quick chips are the fastest way to a wrong figure — one tap and the whole balance
     * is entered — so both are pinned to the cap, and to the cap AFTER the pending queue is
     * subtracted. Rounded DOWN, so "full" can never land a hair above what the server accepts.
     */
    @Test fun `the quick chips fill the recordable cap and half of it`() {
        val s = form(total = "10000000", confirmed = "4000000", pending = listOf("1500001"), amount = "")
        assertEquals(Money.parse("4499999"), s.cap)
        assertEquals("4499999", s.fullAmountDigits)
        assertEquals("2249999", s.halfAmountDigits)
        // And what the chips produce is itself accepted — a chip that fills an invalid amount
        // would be worse than no chip at all.
        assertNull(validateRecord(s.copy(amountDigits = s.fullAmountDigits)))
        assertNull(validateRecord(s.copy(amountDigits = s.halfAmountDigits)))
    }

    /**
     * A cap with a fraction — the state a write-off or a discount leaves — is where the chip's
     * label and the chip's effect used to disagree: `formatMoney(cap)` rounds HALF_UP and printed
     * one UZS more than `fullAmountDigits` puts in the field. The screen labels the chip with
     * [RecordPaymentUiState.fullAmount] for exactly that reason.
     */
    @Test fun `the full chip is labelled with the figure it sets, not the rounded cap`() {
        val s = form(total = "4499999.60", confirmed = "0", amount = "")
        assertEquals(Money.parse("4499999.60"), s.cap)
        assertEquals("4499999", s.fullAmountDigits)
        assertEquals(Money.parse("4499999"), s.fullAmount)
        // The defect, pinned: the two figures differ, so labelling with `cap` overstated the tap.
        assertEquals("4 499 999", formatMoney(s.fullAmount))
        assertEquals("4 500 000", formatMoney(s.cap))
    }

    /** Mirrors DeliveryProofUiState.amount: read during composition, so it must never throw. */
    @Test fun `an unparsable amount reads as zero rather than crashing the screen`() {
        assertEquals(Money.ZERO, RecordPaymentUiState(amountDigits = "").amount)
        assertEquals(Money.ZERO, RecordPaymentUiState(amountDigits = "-").amount)
        assertEquals(Money.ZERO, RecordPaymentUiState(amountDigits = "1 2 3").amount)
    }

    // ── the ViewModel ─────────────────────────────────────────────────────────

    @Test fun `a valid submission reaches the repository exactly once`() = runTest {
        var calls = 0
        var captured: PaymentRecordInput? = null
        val vm = viewModel(record = { input -> calls++; captured = input; Result.success("pay-1") })
        advanceUntilIdle()
        vm.applyOrder(Resource.Success(detail(total = "10000000", confirmed = "0")))
        vm.setAmountDigits("2500000")
        vm.setNotes("олдиндан")
        vm.submit()
        advanceUntilIdle()

        assertEquals(1, calls)
        val sent = requireNotNull(captured)
        assertEquals(Money.parse("2500000"), sent.amount)
        assertEquals("o1", sent.orderId)
        assertEquals(PaymentMethod.CASH, sent.method)
        assertEquals(PaymentSource.IN_OFFICE_CASH, sent.source)
        assertEquals("олдиндан", sent.notes)
        assertNull(sent.paidOn)
        assertTrue(vm.state.value.done)
    }

    @Test fun `a second tap while the first call is in flight is a no-op`() = runTest {
        var calls = 0
        val vm = viewModel(record = { calls++; Result.success("pay-1") })
        advanceUntilIdle()
        vm.applyOrder(Resource.Success(detail()))
        vm.setAmountDigits("1000000")
        vm.submit()
        vm.submit()
        advanceUntilIdle()

        assertEquals(1, calls)
    }

    @Test fun `a failure keeps the entered amount and the captured receipts`() = runTest {
        val vm = viewModel(record = { Result.failure(IllegalStateException("сервер хатоси")) })
        advanceUntilIdle()
        vm.applyOrder(Resource.Success(detail()))
        vm.setAmountDigits("1750000")
        vm.addReceipt(receipt)
        vm.submit()
        advanceUntilIdle()

        val s = vm.state.value
        assertFalse(s.done)
        assertFalse(s.submitting)
        assertEquals("1750000", s.amountDigits)
        assertEquals(listOf(receipt), s.receipts)
        assertNotNull(s.error)
        assertNull(s.paymentId)
    }

    @Test fun `receipts attach after the record, against the id the server returned`() = runTest {
        val attached = mutableListOf<Pair<String, PreparedImage>>()
        val vm = viewModel(
            record = { Result.success("pay-7") },
            attach = { id, photo -> attached += id to photo; Result.success("outbox-${attached.size}") },
        )
        advanceUntilIdle()
        vm.applyOrder(Resource.Success(detail()))
        vm.setAmountDigits("900000")
        vm.addReceipt(receipt)
        vm.addReceipt(secondReceipt)
        vm.submit()
        advanceUntilIdle()

        assertEquals(listOf("pay-7" to receipt, "pay-7" to secondReceipt), attached)
        assertTrue(vm.state.value.done)
    }

    @Test fun `a receipt that fails to attach never records the payment a second time`() = runTest {
        var records = 0
        var attempts = 0
        val vm = viewModel(
            record = { records++; Result.success("pay-9") },
            attach = { _, _ -> attempts++; Result.failure(IllegalStateException("навбатга қўшилмади")) },
        )
        advanceUntilIdle()
        vm.applyOrder(Resource.Success(detail()))
        vm.setAmountDigits("300000")
        vm.addReceipt(receipt)
        vm.submit()
        advanceUntilIdle()
        assertEquals(1, records)
        assertEquals(1, attempts)
        assertFalse(vm.state.value.done)
        assertEquals(listOf(receipt), vm.state.value.receipts)
        assertEquals("pay-9", vm.state.value.paymentId)

        // The retry re-tries only the receipt — the payment row already exists.
        vm.submit()
        advanceUntilIdle()
        assertEquals(1, records)
        assertEquals(2, attempts)

        // ...and the operator can walk away from a receipt that will not attach.
        vm.finishWithoutReceipts()
        assertTrue(vm.state.value.done)
    }

    /**
     * The client half of the duplicate-payment defence. A retry after a LOST response must carry
     * the key the first attempt used, or `withIdempotency` has nothing to match and the second
     * attempt writes a second real payment.
     */
    @Test fun `a retry of the same submission sends the same idempotency key`() = runTest {
        val keys = mutableListOf<String>()
        val vm = viewModel(record = { Result.failure(java.io.IOException("dropped")) }, keys = keys)
        advanceUntilIdle()
        vm.applyOrder(Resource.Success(detail()))
        vm.setAmountDigits("1200000")
        vm.submit()
        advanceUntilIdle()
        vm.submit()
        advanceUntilIdle()

        assertEquals(2, keys.size)
        assertEquals(keys[0], keys[1])
        assertTrue(keys[0].isNotBlank())
    }

    /**
     * ...and the other half of the same rule. `withIdempotency` caches refusals too, so a key
     * held across a CORRECTED figure would replay the original 422 forever — the operator lowers
     * an over-cap amount and is refused for an amount they no longer typed.
     */
    @Test fun `editing the submission mints a new idempotency key`() = runTest {
        val keys = mutableListOf<String>()
        val vm = viewModel(record = { Result.failure(IllegalStateException("сумма ортиқча")) }, keys = keys)
        advanceUntilIdle()
        vm.applyOrder(Resource.Success(detail()))
        vm.setAmountDigits("1200000")
        vm.submit()
        advanceUntilIdle()
        vm.setAmountDigits("900000")
        vm.submit()
        advanceUntilIdle()

        assertEquals(2, keys.size)
        assertNotEquals(keys[0], keys[1])
    }

    /** Process death between the send and the response is the case the key exists for: a fresh
     *  key there would let the retry write a second payment against the same order. */
    @Test fun `the idempotency key survives process death`() = runTest {
        val saved = SavedStateHandle()
        val first = mutableListOf<String>()
        val vm = viewModel(record = { Result.failure(java.io.IOException("dropped")) }, saved = saved, keys = first)
        advanceUntilIdle()
        vm.applyOrder(Resource.Success(detail()))
        vm.setAmountDigits("1200000")
        vm.submit()
        advanceUntilIdle()

        val second = mutableListOf<String>()
        val restored = viewModel(record = { Result.success("pay-1") }, saved = saved, keys = second)
        advanceUntilIdle()
        restored.applyOrder(Resource.Success(detail()))
        restored.submit()
        advanceUntilIdle()

        assertEquals(first, second)
    }

    /**
     * The button no longer hides the validator behind `enabled`, so every message it produces has
     * to reach the banner on the tap. A note the server would refuse is the plainest case: the
     * form looks complete and only the tap can explain the refusal.
     */
    @Test fun `a submission the validator refuses puts its reason on screen`() = runTest {
        var calls = 0
        val vm = viewModel(record = { calls++; Result.success("pay-1") })
        advanceUntilIdle()
        vm.applyOrder(Resource.Success(detail()))
        vm.setAmountDigits("1000000")
        vm.setNotes("ж".repeat(501))
        vm.submit()
        advanceUntilIdle()

        assertEquals(0, calls)
        assertEquals(validateRecord(vm.state.value), vm.state.value.error)
        assertNotNull(vm.state.value.error)
    }

    /** The receipts are the one thing on this screen designed to survive a lost network — they
     *  are queued, not sent. Refusing the retry as "online only" once the payment already exists
     *  left the operator with nothing but the control that throws the photos away. */
    @Test fun `an offline retry still attaches receipts to a payment already recorded`() = runTest {
        var attempts = 0
        val restored = SavedStateHandle(mapOf("record.paymentId" to "pay-3"))
        val vm = viewModel(
            attach = { _, _ -> attempts++; Result.success("outbox-1") },
            drivers = { Result.failure(java.io.IOException("no net")) },
            saved = restored,
        )
        advanceUntilIdle()
        assertTrue(vm.state.value.isOffline)
        vm.addReceipt(receipt)
        vm.submit()
        advanceUntilIdle()

        assertEquals(1, attempts)
        assertTrue(vm.state.value.done)
        assertTrue(vm.state.value.receipts.isEmpty())
    }

    @Test fun `recording is refused while offline instead of being queued`() = runTest {
        var calls = 0
        val vm = viewModel(record = { calls++; Result.success("pay-1") })
        advanceUntilIdle()
        vm.applyOrder(Resource.Error(detail(), AppError.Network("Интернет йўқ")))
        vm.setAmountDigits("1000000")
        assertTrue(vm.state.value.isOffline)
        vm.submit()
        advanceUntilIdle()

        assertEquals(0, calls)
        assertNotNull(vm.state.value.error)
        assertFalse(vm.state.value.done)
    }

    @Test fun `without payment record the form refuses to submit`() = runTest {
        var calls = 0
        val vm = viewModel(record = { calls++; Result.success("pay-1") }, permissions = { false })
        advanceUntilIdle()
        vm.applyOrder(Resource.Success(detail()))
        vm.setAmountDigits("1000000")
        assertFalse(vm.state.value.canRecord)
        vm.submit()
        advanceUntilIdle()

        assertEquals(0, calls)
        assertNotNull(vm.state.value.error)
    }

    /**
     * "Not yet known" is not "no". Rendering the notice off a bare `!canRecord` showed it to
     * every operator for a frame on entry, and it stayed permanently for an accountant holding
     * view-without-write by design — as a red error, for an account working exactly as intended.
     */
    @Test fun `the no-permission notice waits until the permission is actually known`() = runTest {
        val denied = viewModel(permissions = { false })
        assertFalse(denied.state.value.permissionsResolved)
        assertFalse(denied.state.value.showNoRecordPermission) // nothing before the answer arrives
        advanceUntilIdle()
        assertTrue(denied.state.value.showNoRecordPermission)

        val granted = viewModel(permissions = { true })
        advanceUntilIdle()
        assertTrue(granted.state.value.permissionsResolved)
        assertFalse(granted.state.value.showNoRecordPermission)
    }

    @Test fun `the confirm permission decides whether the payment lands confirmed`() = runTest {
        val owner = viewModel(permissions = { true })
        advanceUntilIdle()
        assertTrue(owner.state.value.canAutoConfirm)

        val operator = viewModel(permissions = { action -> action == "payment.record" })
        advanceUntilIdle()
        assertFalse(operator.state.value.canAutoConfirm)
        assertTrue(operator.state.value.canRecord)
    }

    @Test fun `leaving the driver source clears the driver, and bank clears the hand-over`() = runTest {
        val vm = viewModel()
        advanceUntilIdle()
        vm.setSource(PaymentSource.FROM_DRIVER_AT_DELIVERY)
        vm.setDriverId("d1")
        vm.setSource(PaymentSource.IN_OFFICE_CASH)
        assertNull(vm.state.value.driverId)

        vm.setHandOverNow(true)
        vm.setSource(PaymentSource.BANK_OR_ONLINE)
        assertFalse(vm.state.value.handOverNow)
    }

    @Test fun `the driver-collected source sends the driver the operator picked`() = runTest {
        var captured: PaymentRecordInput? = null
        val vm = viewModel(record = { captured = it; Result.success("pay-1") })
        advanceUntilIdle()
        vm.applyOrder(Resource.Success(detail()))
        vm.setSource(PaymentSource.FROM_DRIVER_AT_DELIVERY)
        vm.setDriverId("d1")
        vm.setAmountDigits("400000")
        vm.setPaidOn(today.minusDays(2))
        vm.submit()
        advanceUntilIdle()

        val sent = requireNotNull(captured)
        assertEquals("d1", sent.collectedByDriverId)
        assertEquals(PaymentSource.FROM_DRIVER_AT_DELIVERY, sent.source)
        assertEquals("2026-09-05", sent.paidOn)
    }

    /**
     * Process death after the record lands is the one case where the cap is no defence: it does
     * not stop a duplicate PARTIAL payment. The already-recorded id has to come back with the
     * ViewModel, or the operator's next tap writes a second row against a real order.
     */
    @Test fun `a payment already recorded before process death is never recorded again`() = runTest {
        var records = 0
        var attached = 0
        val restored = SavedStateHandle(mapOf("record.paymentId" to "pay-3", "record.amountDigits" to "800000"))
        val vm = viewModel(
            record = { records++; Result.success("pay-4") },
            attach = { _, _ -> attached++; Result.success("outbox-1") },
            saved = restored,
        )
        advanceUntilIdle()
        assertEquals("pay-3", vm.state.value.paymentId)
        assertEquals("800000", vm.state.value.amountDigits)

        vm.applyOrder(Resource.Success(detail()))
        vm.submit()
        advanceUntilIdle()

        assertEquals(0, records)
        assertEquals(0, attached) // nothing left to attach: the photos did not survive either
        assertTrue(vm.state.value.done)
    }

    @Test fun `the entered amount and the new payment id are both handed to saved state`() = runTest {
        val saved = SavedStateHandle()
        val vm = viewModel(record = { Result.success("pay-5") }, saved = saved)
        advanceUntilIdle()
        vm.applyOrder(Resource.Success(detail()))
        vm.setAmountDigits("650000")
        assertEquals("650000", saved.get<String>("record.amountDigits"))

        vm.submit()
        advanceUntilIdle()
        assertEquals("pay-5", saved.get<String>("record.paymentId"))
    }

    /** The retry must be able to clear the very condition it is offered for. In the base
     *  ViewModel the drivers are the only fetch; the Hilt subclass overrides it to refresh the
     *  order detail too, which is the case that was permanently stuck. */
    @Test fun `retrying the load re-fetches and can clear an offline drivers failure`() = runTest {
        var attempts = 0
        val vm = viewModel(drivers = {
            attempts++
            if (attempts == 1) Result.failure(java.io.IOException("no net")) else Result.success(emptyList())
        })
        advanceUntilIdle()
        assertTrue(vm.state.value.isOffline)

        vm.retryLoad()
        advanceUntilIdle()
        assertEquals(2, attempts)
        assertFalse(vm.state.value.isOffline)
        assertNull(vm.state.value.loadErrorMessage)
    }

    /**
     * SALES and DRIVER both hold payment.record WITHOUT driver.view — exactly the people who
     * record payments. Firing the fetch anyway earned them a 403, which is Forbidden rather than
     * Network, so the form still submitted while a permanent banner sat over it offering a retry
     * that could only ever earn the same 403.
     */
    @Test fun `an operator without driver view never fetches the drivers`() = runTest {
        var fetches = 0
        val vm = viewModel(
            drivers = { fetches++; Result.success(emptyList()) },
            permissions = { action -> action != "driver.view" },
        )
        advanceUntilIdle()

        assertEquals(0, fetches)
        assertFalse(vm.state.value.canSeeDrivers)
        assertTrue(vm.state.value.canRecord)
        assertNull(vm.state.value.loadErrorMessage)

        // ...and the retry behind the banner cannot re-fire it either.
        vm.retryLoad()
        advanceUntilIdle()
        assertEquals(0, fetches)
    }

    @Test fun `the active drivers are loaded for the picker`() = runTest {
        val vm = viewModel(drivers = { Result.success(listOf(driver("d1", "Аброр"))) })
        advanceUntilIdle()
        assertEquals(1, vm.state.value.drivers.size)

        val offline = viewModel(drivers = { Result.failure(java.io.IOException("no net")) })
        advanceUntilIdle()
        assertNotNull(offline.state.value.loadErrorMessage)
    }

    // ── fixtures ──────────────────────────────────────────────────────────────

    private fun viewModel(
        record: suspend (PaymentRecordInput) -> Result<String> = { Result.success("pay-1") },
        attach: suspend (String, PreparedImage) -> Result<String> = { _, _ -> Result.success("outbox-1") },
        drivers: suspend () -> Result<List<Driver>> = { Result.success(emptyList()) },
        permissions: suspend (String) -> Boolean = { true },
        saved: SavedStateHandle = SavedStateHandle(),
        /** Every Idempotency-Key the ViewModel handed the repository, in order. */
        keys: MutableList<String> = mutableListOf(),
    ) = RecordPaymentViewModel(
        orderId = "o1",
        record = RecordPaymentUseCase { input, key -> keys += key; record(input) },
        attach = AttachReceiptUseCase { id, photo -> attach(id, photo) },
        drivers = PaymentDriversUseCase { drivers() },
        permissions = PaymentPermissionsUseCase { permissions(it) },
        today = today,
        saved = saved,
    )

    private fun form(
        total: String = "10000000",
        confirmed: String = "0",
        pending: List<String> = emptyList(),
        amount: String = "1000000",
    ) = RecordPaymentUiState(
        order = detail(total = total, confirmed = confirmed, pending = pending),
        amountDigits = amount,
        today = today,
    )

    private fun driver(id: String, name: String) = Driver(
        id = id, name = name, phone = "+998900000000", notes = null, active = true,
        activeDispatchCount = 0, discrepancyCount30d = 0, lastDispatchAt = null,
    )

    private fun detail(
        total: String = "10000000",
        confirmed: String = "0",
        writeOff: String = "0",
        pending: List<String> = emptyList(),
    ): OrderDetail {
        val summary = OrderSummary(
            id = "o1", orderNumber = "ORD-1", status = OrderStatus.PLACED, paymentState = PaymentState.PARTIALLY_PAID,
            totalPrice = Money.parse(total), confirmedPaid = Money.parse(confirmed),
            totalArea = BigDecimal.ZERO, totalBlocks = 0, totalBeams = 0,
            scheduledAt = Instant.EPOCH, placedAt = Instant.EPOCH,
            client = ClientRef(id = "c1", name = "Мижоз", phone = "+998900000000", address = null),
        )
        return OrderDetail(
            summary = summary, notes = null,
            deliveryLat = null, deliveryLng = null, deliveryLocationUrl = null, deliveryLocationLabel = null,
            discountAmount = Money.ZERO, deliveryCost = Money.ZERO, otherCost = Money.ZERO, roomsSubtotal = Money.ZERO,
            writeOffAmount = Money.parse(writeOff),
            rooms = emptyList(),
            payments = pending.mapIndexed { i, a ->
                PaymentLine(
                    id = "p$i", amount = Money.parse(a), method = PaymentMethod.CASH,
                    status = PaymentStatus.PENDING_CONFIRMATION, recordedAt = Instant.EPOCH,
                    recordedByName = null, receiptUrls = emptyList(),
                )
            },
            shipments = emptyList(), loadedPhotos = emptyList(), deliveryProofUrl = null,
            events = emptyList(), dispatch = null, fetchedAt = Instant.EPOCH,
        )
    }
}
