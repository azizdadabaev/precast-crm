package uz.etalon.crm.feature.payments

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.model.ClientRef
import uz.etalon.crm.core.model.CustodyChain
import uz.etalon.crm.core.model.Discrepancy
import uz.etalon.crm.core.model.DiscrepancyStatus
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.OrderDetail
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.OrderSummary
import uz.etalon.crm.core.model.PaymentLine
import uz.etalon.crm.core.model.PaymentMethod
import uz.etalon.crm.core.model.PaymentQueueItem
import uz.etalon.crm.core.model.PaymentSource
import uz.etalon.crm.core.model.PaymentState
import uz.etalon.crm.core.model.PaymentStatus
import uz.etalon.crm.feature.payments.discrepancies.DiscrepanciesScreen
import uz.etalon.crm.feature.payments.discrepancies.DiscrepanciesUiState
import uz.etalon.crm.feature.payments.queue.ConfirmQueueScreen
import uz.etalon.crm.feature.payments.queue.ConfirmQueueUiState
import uz.etalon.crm.feature.payments.record.RecordPaymentScreen
import uz.etalon.crm.feature.payments.record.RecordPaymentUiState
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate

/**
 * Three baselines: the record sheet, a confirm-queue card with a shortfall, and the discrepancies
 * list. Every clock and every figure below is fixed — a baseline must not change meaning with the
 * day it happens to be recorded.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36])
class PaymentScreenshotTest {
    @get:Rule val rule = createComposeRule()

    private val fixedToday: LocalDate = LocalDate.parse("2026-09-04")
    private val fixedInstant: Instant = Instant.parse("2026-09-04T09:00:00Z")

    // ── Record sheet: a partly-paid order with one payment already pending confirmation, so
    // the cap sits below the raw remaining balance and the screen explains why. ──────────────

    private val client = ClientRef("c1", "Раҳимов Аброр Тоҳирович", "998901112233", "Тошкент, Юнусобод")

    private fun recordOrder() = OrderDetail(
        summary = OrderSummary(
            id = "o1", orderNumber = "2026-09-0031", status = OrderStatus.PLACED,
            paymentState = PaymentState.PARTIALLY_PAID,
            totalPrice = Money.parse("40000000.00"), confirmedPaid = Money.parse("10000000.00"),
            totalArea = BigDecimal("220.000"), totalBlocks = 440, totalBeams = 30,
            scheduledAt = Instant.parse("2026-09-08T00:00:00Z"), placedAt = Instant.parse("2026-09-01T00:00:00Z"),
            client = client,
        ),
        notes = null,
        deliveryLat = null, deliveryLng = null, deliveryLocationUrl = null, deliveryLocationLabel = null,
        discountAmount = Money.ZERO, deliveryCost = Money.ZERO, otherCost = Money.ZERO,
        roomsSubtotal = Money.ZERO, writeOffAmount = Money.ZERO,
        rooms = emptyList(),
        payments = listOf(
            PaymentLine(
                id = "p0", amount = Money.parse("5000000.00"), method = PaymentMethod.CASH,
                status = PaymentStatus.PENDING_CONFIRMATION, recordedAt = Instant.parse("2026-09-03T12:00:00Z"),
                recordedByName = "Баҳодир", receiptUrls = emptyList(),
            ),
        ),
        shipments = emptyList(), loadedPhotos = emptyList(), deliveryProofUrl = null,
        events = emptyList(), dispatch = null, fetchedAt = fixedInstant,
    )

    private fun recordState() = RecordPaymentUiState(
        order = recordOrder(),
        amountDigits = "8000000",
        method = PaymentMethod.CASH,
        source = PaymentSource.IN_OFFICE_CASH,
        today = fixedToday,
        canRecord = true,
        canAutoConfirm = false,
        // An operator holding driver.view, so the baseline keeps all three source chips. Without
        // it «Ҳайдовчидан» is withheld, and the baseline would stop showing the whole row.
        canSeeDrivers = true,
    )

    private fun shootRecord(name: String, dark: Boolean, fontScale: Float? = null) {
        rule.setContent {
            EtalonTheme(darkTheme = dark) {
                RecordPaymentScreen(
                    s = recordState(), onLeave = {}, onSetAmountDigits = {}, onSetMethod = {}, onSetSource = {},
                    onSetHandOverNow = {}, onSetDriverId = {}, onSetNotes = {}, onSetPaidOn = {},
                    onCaptureReceipt = {}, onRemoveReceipt = {}, onSubmit = {}, onFinishWithoutReceipts = {},
                    onRetryLoad = {},
                )
            }
        }
        rule.onRoot().captureRoboImage("screenshots/record_sheet_$name.png")
    }

    @Test @Config(qualifiers = "w411dp-h891dp") fun recordLight() = shootRecord("light", false)
    @Test @Config(qualifiers = "w411dp-h891dp") fun recordDark() = shootRecord("dark", true)
    @Test @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f) fun recordLargeFont() = shootRecord("font13", false)

    // ── Confirm queue: a driver-collected payment that came back short of what the dispatch
    // expected, so the card renders the shortfall line in the danger colour. ────────────────

    private fun queueItem() = PaymentQueueItem(
        id = "pay1", orderId = "o2", orderNumber = "2026-09-0028", clientName = "Юсупова Дилноза Акрамовна",
        amount = Money.parse("7500000.00"), originalAmount = null, method = PaymentMethod.CASH,
        status = PaymentStatus.PENDING_CONFIRMATION, recordedAt = Instant.parse("2026-09-03T15:20:00Z"),
        paidOn = Instant.parse("2026-09-03T15:20:00Z"), expectedCollection = Money.parse("9000000.00"),
        fromDriver = true,
        custody = CustodyChain(collectedBy = "Жасур (ҳайдовчи)", recordedBy = "Жасур", handedOverTo = null, confirmedBy = null),
        receiptUrls = emptyList(), orderReceiptUrls = emptyList(), rejectionReason = null,
    )

    private fun queueState() = ConfirmQueueUiState(
        tab = PaymentStatus.PENDING_CONFIRMATION,
        items = listOf(queueItem()),
        loading = false,
        canConfirm = true,
    )

    private fun shootQueue(name: String, dark: Boolean) {
        rule.setContent {
            EtalonTheme(darkTheme = dark) {
                ConfirmQueueScreen(
                    s = queueState(), onOpenOrder = {}, onRefresh = {}, onSetTab = {}, onApprove = {}, onReject = {},
                    onCloseSheet = {}, onSetAmountDigits = {}, onSetAdjustmentNote = {}, onSetAction = {},
                    onSetNote = {}, onSetRejectReason = {}, onSubmitApprove = {}, onSubmitReject = {},
                )
            }
        }
        rule.onRoot().captureRoboImage("screenshots/queue_card_shortfall_$name.png")
    }

    @Test @Config(qualifiers = "w411dp-h891dp") fun queueLight() = shootQueue("light", false)
    @Test @Config(qualifiers = "w411dp-h891dp") fun queueDark() = shootQueue("dark", true)
    @Test @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f) fun queueLargeFont() = shootQueue("font13", false)

    // ── Discrepancies list: one still open, one already resolved as a discount. ─────────────

    private fun discrepancies() = listOf(
        Discrepancy(
            id = "d1", orderId = "o3", orderNumber = "2026-09-0019", clientName = "Тошматов Илҳом Каримович",
            driverName = "Жасур", expectedAmount = Money.parse("9000000.00"), receivedAmount = Money.parse("7500000.00"),
            status = DiscrepancyStatus.OPEN, reportedAt = Instant.parse("2026-09-03T15:25:00Z"), resolutionNote = null,
        ),
        Discrepancy(
            id = "d2", orderId = "o4", orderNumber = "2026-09-0004", clientName = "Эргашева Нигора Собировна",
            driverName = "Отабек", expectedAmount = Money.parse("4200000.00"), receivedAmount = Money.parse("4000000.00"),
            status = DiscrepancyStatus.RESOLVED_DISCOUNT, reportedAt = Instant.parse("2026-08-29T10:10:00Z"),
            resolutionNote = "Мижоз билан келишилди — чегирма сифатида ёпилди",
        ),
    )

    private fun discrepanciesState() = DiscrepanciesUiState(
        items = discrepancies(),
        loading = false,
        canResolve = true,
    )

    private fun shootDiscrepancies(name: String, dark: Boolean) {
        rule.setContent {
            EtalonTheme(darkTheme = dark) {
                DiscrepanciesScreen(
                    s = discrepanciesState(), onOpenOrder = {}, onBack = {}, onRefresh = {}, onOpenResolve = {},
                    onCloseSheet = {}, onSetStatus = {}, onSetNote = {}, onSubmitResolve = {},
                )
            }
        }
        rule.onRoot().captureRoboImage("screenshots/discrepancies_list_$name.png")
    }

    @Test @Config(qualifiers = "w411dp-h891dp") fun discrepanciesLight() = shootDiscrepancies("light", false)
    @Test @Config(qualifiers = "w411dp-h891dp") fun discrepanciesDark() = shootDiscrepancies("dark", true)
    @Test @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f) fun discrepanciesLargeFont() = shootDiscrepancies("font13", false)
}
