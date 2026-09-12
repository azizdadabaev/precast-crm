package uz.etalon.crm.feature.payments

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.model.AppError
import uz.etalon.crm.core.model.ClientRef
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.OrderDetail
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.OrderSummary
import uz.etalon.crm.core.model.PaymentLine
import uz.etalon.crm.core.model.PaymentMethod
import uz.etalon.crm.core.model.PaymentSource
import uz.etalon.crm.core.model.PaymentState
import uz.etalon.crm.core.model.PaymentStatus
import uz.etalon.crm.feature.payments.record.RecordPaymentScreen
import uz.etalon.crm.feature.payments.record.RecordPaymentUiState
import uz.etalon.crm.feature.payments.record.validateRecord
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate

/** `action_record_payment`, and `:core:designsystem`'s `ds_action_cancel`. «Бекор қилиш» exists ONLY
 *  on the navy gate — the screen's own bar is a single «Қайд этиш» — so its presence IS "the gate is
 *  open". «Қайд этиш» appears twice once it is: the bar's button and the gate's confirm. */
private const val RECORD = "Қайд этиш"
private const val GATE_DISMISS = "Бекор қилиш"

/**
 * Ruling R3's summary gate is a CONFIRMATION, and there is nothing to confirm while the screen is
 * still holding something `POST /api/payments` — or [RecordPaymentViewModel.submit] itself — would
 * refuse. The sibling [ApproveGateTest] pins the same rule one screen over, for the same reason: a
 * gate that opens on an unsendable form asks the operator to agree on the navy panel in front of the
 * customer, takes the tap, and then shows the reason on the screen BEHIND the gate they were
 * looking at.
 *
 * The refusals come from two places and the button has to read both. [validateRecord] is the form's
 * own validator; `isOffline` is checked by `submit()` BEFORE it validates, and a cached order beside
 * a failed fetch is a state this screen is built to be in — so a form the validator is perfectly
 * happy with can still be unsendable. Every refusal below must reach the ViewModel, which writes the
 * Uzbek reason into the screen's error banner.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w411dp-h891dp")
class RecordGateTest {
    @get:Rule val rule = createComposeRule()

    @Test fun `an amount over the cap never opens the gate`() {
        val submits = mutableListOf<Unit>()
        // The cap is 25 000 000 — see [state]. Thirty million is the 422 the server would answer.
        show(state(amountDigits = "30000000")) { submits += Unit }

        rule.onNodeWithText(RECORD).performClick()
        rule.waitForIdle()

        rule.onNodeWithText(GATE_DISMISS).assertDoesNotExist()
        // The tap is not swallowed: it goes to the ViewModel, which refuses it and writes the
        // reason into the screen's own error banner.
        assertEquals(1, submits.size)
    }

    @Test fun `no amount never opens the gate`() {
        val submits = mutableListOf<Unit>()
        show(state(amountDigits = "")) { submits += Unit }

        rule.onNodeWithText(RECORD).performClick()
        rule.waitForIdle()

        rule.onNodeWithText(GATE_DISMISS).assertDoesNotExist()
        assertEquals(1, submits.size)
    }

    @Test fun `a driver-collected payment with no driver never opens the gate`() {
        val submits = mutableListOf<Unit>()
        show(
            state(
                source = PaymentSource.FROM_DRIVER_AT_DELIVERY,
                canSeeDrivers = true,
                // The picker was opened and nothing was chosen — `PaymentRecordSchema` refuses it.
            ),
        ) { submits += Unit }

        rule.onNodeWithText(RECORD).performClick()
        rule.waitForIdle()

        rule.onNodeWithText(GATE_DISMISS).assertDoesNotExist()
        assertEquals(1, submits.size)
    }

    /**
     * The regression this test exists for. Everything on the form is valid — the validator has
     * nothing to say — and the order is on screen because it came from the cache; only the fetch
     * beside it failed for want of a network. `submit()` refuses on exactly that, before it
     * validates, so the gate must stay shut and the tap must reach the ViewModel.
     */
    @Test fun `an offline screen never opens the gate even with a valid form`() {
        val submits = mutableListOf<Unit>()
        val s = state().copy(detailError = AppError.Network("Интернет йўқ"))
        assertNull("the fixture's form is meant to be valid", validateRecord(s))
        show(s) { submits += Unit }

        rule.onNodeWithText(RECORD).performClick()
        rule.waitForIdle()

        rule.onNodeWithText(GATE_DISMISS).assertDoesNotExist()
        assertEquals(1, submits.size)
    }

    @Test fun `a sendable form opens the gate instead of recording`() {
        val submits = mutableListOf<Unit>()
        val s = state()
        assertNull("the fixture is meant to be sendable", validateRecord(s))
        show(s) { submits += Unit }

        rule.onNodeWithText(RECORD).performClick()
        rule.waitForIdle()

        rule.onNodeWithText(GATE_DISMISS).assertIsDisplayed()
        // Nothing is recorded by opening the gate — the record is the tap INSIDE it.
        assertEquals(0, submits.size)
    }

    @Test fun `confirming the gate records once`() {
        val submits = mutableListOf<Unit>()
        show(state()) { submits += Unit }

        rule.onNodeWithText(RECORD).performClick()
        rule.waitForIdle()

        // Two now: the bar's button and the gate's confirm, in window order. Clicking the wrong one
        // would merely re-open an already-open gate and leave `submits` empty, so the count below
        // catches a mistake here rather than passing quietly.
        val buttons = rule.onAllNodesWithText(RECORD)
        buttons.assertCountEquals(2)
        buttons[1].performClick()
        rule.waitForIdle()

        assertEquals(1, submits.size)
        // The gate closes and the screen behind it carries the outcome.
        rule.onNodeWithText(GATE_DISMISS).assertDoesNotExist()
    }

    private fun show(s: RecordPaymentUiState, onSubmit: () -> Unit) {
        rule.setContent {
            EtalonTheme {
                RecordPaymentScreen(
                    s = s, onLeave = {}, onSetAmountDigits = {}, onSetMethod = {}, onSetSource = {},
                    onSetHandOverNow = {}, onSetDriverId = {}, onSetNotes = {}, onSetPaidOn = {},
                    onCaptureReceipt = {}, onRemoveReceipt = {}, onSubmit = onSubmit,
                    onFinishWithoutReceipts = {}, onRetryLoad = {}, barVisible = true,
                )
            }
        }
    }

    /**
     * A partly-paid order with one payment already awaiting confirmation, so `recordableRemaining`
     * — the cap — is 25 000 000 against a raw 30 000 000 balance. Eight million is comfortably
     * inside it, which makes the default state sendable.
     */
    private fun state(
        amountDigits: String = "8000000",
        source: PaymentSource = PaymentSource.IN_OFFICE_CASH,
        canSeeDrivers: Boolean = false,
    ) = RecordPaymentUiState(
        order = order(),
        amountDigits = amountDigits,
        method = PaymentMethod.CASH,
        source = source,
        today = LocalDate.parse("2026-09-04"),
        canRecord = true,
        permissionsResolved = true,
        canSeeDrivers = canSeeDrivers,
    )

    private fun order() = OrderDetail(
        summary = OrderSummary(
            id = "o1", orderNumber = "2026-09-0031", status = OrderStatus.PLACED,
            paymentState = PaymentState.PARTIALLY_PAID,
            totalPrice = Money.parse("40000000.00"), confirmedPaid = Money.parse("10000000.00"),
            totalArea = BigDecimal("220.000"), totalBlocks = 440, totalBeams = 30,
            scheduledAt = Instant.parse("2026-09-08T00:00:00Z"), placedAt = Instant.parse("2026-09-01T00:00:00Z"),
            client = ClientRef("c1", "Раҳимов Аброр Тоҳирович", "998901112233", "Тошкент, Юнусобод"),
        ),
        notes = null,
        deliveryLat = null, deliveryLng = null, deliveryLocationUrl = null, deliveryLocationLabel = null,
        discountAmount = Money.ZERO, deliveryCost = Money.ZERO, otherCost = Money.ZERO,
        roomsSubtotal = Money.ZERO, writeOffAmount = Money.ZERO,
        rooms = emptyList(),
        payments = listOf(
            PaymentLine(
                id = "p0", amount = Money.parse("5000000.00"), method = PaymentMethod.CASH,
                status = PaymentStatus.PENDING_CONFIRMATION,
                recordedAt = Instant.parse("2026-09-03T12:00:00Z"),
                recordedByName = "Баҳодир", receiptUrls = emptyList(),
            ),
        ),
        shipments = emptyList(), loadedPhotos = emptyList(), deliveryProofUrl = null,
        events = emptyList(), dispatch = null, fetchedAt = Instant.parse("2026-09-04T09:00:00Z"),
    )
}
