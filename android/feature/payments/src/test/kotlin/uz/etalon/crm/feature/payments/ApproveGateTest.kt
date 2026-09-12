package uz.etalon.crm.feature.payments

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.model.CustodyChain
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.PaymentMethod
import uz.etalon.crm.core.model.PaymentQueueItem
import uz.etalon.crm.core.model.PaymentStatus
import uz.etalon.crm.feature.payments.queue.ConfirmMode
import uz.etalon.crm.feature.payments.queue.ConfirmQueueScreen
import uz.etalon.crm.feature.payments.queue.ConfirmQueueUiState
import uz.etalon.crm.feature.payments.queue.ConfirmSheetState
import uz.etalon.crm.feature.payments.queue.DiscrepancyAction
import java.time.Instant

/** `:core:designsystem`'s `action_confirm` and `ds_action_cancel`. «Бекор қилиш» exists ONLY on
 *  the navy gate — the approve sheet's own footer is «Рад этиш» / «Тасдиқлаш» — so its presence
 *  is exactly "the gate is open". */
private const val CONFIRM = "Тасдиқлаш"
private const val GATE_DISMISS = "Бекор қилиш"

/**
 * Ruling R3's gate is a CONFIRMATION, and there is nothing to confirm while the sheet is still
 * missing something `POST /api/payments/{id}/confirm` would refuse. It used to open regardless:
 * the owner approved on the navy panel, the request never went, and the reason appeared as a red
 * banner on the sheet *behind* the gate they were looking at.
 *
 * `ConfirmSheetState.blocker` is the one rule both sides read — the ViewModel guards the send with
 * it ([ConfirmQueueViewModelTest] covers that half), and the button decides with it here.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w411dp-h891dp")
class ApproveGateTest {
    @get:Rule val rule = createComposeRule()

    @Test fun `a shortfall with no action chosen never opens the gate`() {
        val submits = mutableListOf<Unit>()
        show(ConfirmSheetState(item = shortPayment(), mode = ConfirmMode.APPROVE)) { submits += Unit }

        rule.onNodeWithText(CONFIRM).performClick()
        rule.waitForIdle()

        rule.onNodeWithText(GATE_DISMISS).assertDoesNotExist()
        // The tap is not swallowed: it goes to the ViewModel, which refuses it and writes the
        // reason into the sheet's own error banner.
        assertEquals(1, submits.size)
    }

    @Test fun `an adjusted amount with no note never opens the gate`() {
        val submits = mutableListOf<Unit>()
        val item = officePayment()
        show(
            ConfirmSheetState(item = item, mode = ConfirmMode.APPROVE, amountDigits = "2750000"),
        ) { submits += Unit }

        rule.onNodeWithText(CONFIRM).performClick()
        rule.waitForIdle()

        rule.onNodeWithText(GATE_DISMISS).assertDoesNotExist()
        assertEquals(1, submits.size)
    }

    @Test fun `a complete sheet opens the gate instead of submitting`() {
        val submits = mutableListOf<Unit>()
        val sheet = ConfirmSheetState(
            item = shortPayment(),
            mode = ConfirmMode.APPROVE,
            action = DiscrepancyAction.TRACK,
            note = "Мижоз жумагача тўлайди",
        )
        assertTrue("the fixture is meant to be sendable", sheet.blocker == null)
        show(sheet) { submits += Unit }

        rule.onNodeWithText(CONFIRM).performClick()
        rule.waitForIdle()

        rule.onNodeWithText(GATE_DISMISS).assertIsDisplayed()
        // Nothing is sent by opening the gate — the approval is the tap INSIDE it.
        assertEquals(0, submits.size)
    }

    private fun show(sheet: ConfirmSheetState, onSubmitApprove: () -> Unit) {
        rule.setContent {
            EtalonTheme {
                ConfirmQueueScreen(
                    s = ConfirmQueueUiState(
                        items = listOf(sheet.item), loading = false, canConfirm = true,
                        permissionsResolved = true, sheet = sheet,
                    ),
                    now = Instant.parse("2026-09-04T09:00:00Z"),
                    onOpenOrder = {}, onOpenDiscrepancies = {}, onRefresh = {}, onSetTab = {},
                    onApprove = {}, onReject = {}, onCloseSheet = {}, onSetAmountDigits = {},
                    onSetAdjustmentNote = {}, onSetAction = {}, onSetNote = {}, onSetRejectReason = {},
                    onSubmitApprove = onSubmitApprove, onSubmitReject = {}, onToastShown = {},
                )
            }
        }
    }

    /** Driver-collected and 1 500 000 short of the dispatch, so the confirm route demands an
     *  action and a note. */
    private fun shortPayment() = payment(amount = "7500000.00", expected = "9000000.00", fromDriver = true)

    /** Office cash: nothing to be short of, so only an adjustment can block it. */
    private fun officePayment() = payment(amount = "3000000.00", expected = null, fromDriver = false)

    private fun payment(amount: String, expected: String?, fromDriver: Boolean) = PaymentQueueItem(
        id = "pay1", orderId = "o1", orderNumber = "2026-09-0003", clientName = "Yusupov & Sons",
        amount = Money.parse(amount), originalAmount = null, method = PaymentMethod.CASH,
        status = PaymentStatus.PENDING_CONFIRMATION,
        recordedAt = Instant.parse("2026-09-03T15:20:00Z"), paidOn = null,
        expectedCollection = expected?.let(Money::parse), fromDriver = fromDriver,
        custody = CustodyChain(
            collectedBy = if (fromDriver) "Жасур (ҳайдовчи)" else null,
            recordedBy = "Азиз Рашидов", handedOverTo = null, confirmedBy = null,
        ),
        receiptUrls = emptyList(), orderReceiptUrls = emptyList(), rejectionReason = null,
    )
}
