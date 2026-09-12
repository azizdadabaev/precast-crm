package uz.etalon.crm.feature.payments

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.github.takahirom.roborazzi.ExperimentalRoborazziApi
import com.github.takahirom.roborazzi.captureRoboImage
import com.github.takahirom.roborazzi.captureScreenRoboImage
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import uz.etalon.crm.core.designsystem.components.LocalNavPillInset
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.model.ClientRef
import uz.etalon.crm.core.model.CustodyChain
import uz.etalon.crm.core.model.Discrepancy
import uz.etalon.crm.core.model.DiscrepancyStatus
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.OrderDetail
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.OrderSummary
import uz.etalon.crm.core.model.PaymentCounts
import uz.etalon.crm.core.model.PaymentLine
import uz.etalon.crm.core.model.PaymentMethod
import uz.etalon.crm.core.model.PaymentQueueItem
import uz.etalon.crm.core.model.PaymentSource
import uz.etalon.crm.core.model.PaymentState
import uz.etalon.crm.core.model.PaymentStatus
import uz.etalon.crm.feature.payments.discrepancies.DiscrepanciesScreen
import uz.etalon.crm.feature.payments.discrepancies.DiscrepanciesUiState
import uz.etalon.crm.feature.payments.queue.ConfirmMode
import uz.etalon.crm.feature.payments.queue.ConfirmQueueScreen
import uz.etalon.crm.feature.payments.queue.ConfirmQueueUiState
import uz.etalon.crm.feature.payments.queue.ConfirmSheetState
import uz.etalon.crm.feature.payments.queue.DiscrepancyAction
import uz.etalon.crm.feature.payments.record.RecordPaymentScreen
import uz.etalon.crm.feature.payments.record.RecordPaymentUiState
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate

/** What `SignedInShell` provides into [LocalNavPillInset] at Robolectric's 0 dp system navigation
 *  inset: the pill's 84 dp band alone, so a frame carries the clearance a real phone shows. The
 *  discrepancies frame does not take it yet — that screen is rebuilt in its own task. */
private val SHELL_NAV_PILL_INSET = 84.dp

/** `:core:designsystem`'s `action_confirm`, written out because a Robolectric test reads the
 *  merged resources of the module under test and this string is defined one module down. */
private const val CONFIRM = "Тасдиқлаш"

/**
 * The module's frames: the record sheet, the confirm queue in its three states with its two
 * sheets, and the discrepancies list. Every clock and every figure below is fixed — a baseline
 * must not change meaning with the day it happens to be recorded.
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
                CompositionLocalProvider(LocalNavPillInset provides SHELL_NAV_PILL_INSET) {
                    RecordPaymentScreen(
                        s = recordState(), onLeave = {}, onSetAmountDigits = {}, onSetMethod = {}, onSetSource = {},
                        onSetHandOverNow = {}, onSetDriverId = {}, onSetNotes = {}, onSetPaidOn = {},
                        onCaptureReceipt = {}, onRemoveReceipt = {}, onSubmit = {}, onFinishWithoutReceipts = {},
                        onRetryLoad = {},
                    )
                }
            }
        }
        rule.onRoot().captureRoboImage("screenshots/record_sheet_$name.png")
    }

    @Test @Config(qualifiers = "w411dp-h891dp") fun recordLight() = shootRecord("light", false)
    @Test @Config(qualifiers = "w411dp-h891dp") fun recordDark() = shootRecord("dark", true)
    @Test @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f) fun recordLargeFont() = shootRecord("font13", false)

    // ── Confirm queue: `2b-payments.png`'s own three rows, then the two cases the capture does
    // not draw (the confirmed tab's tags, a driver shortfall) and the two sheets. ───────────

    /**
     * The capture's three payments, in its order, with the counts it shows on the switch. The
     * clock below is fixed for the same reason every other figure in this file is — and it is
     * passed to the screen rather than read inside it, so the meta line's date cannot change with
     * the day the baseline happens to be recorded.
     */
    private fun pending() = listOf(
        queueItem(
            id = "pay1", orderNumber = "2026-09-0003", client = "Yusupov & Sons",
            amount = "3000000.00", method = PaymentMethod.CASH, recordedBy = "Азиз Рашидов",
        ),
        queueItem(
            id = "pay2", orderNumber = "2026-09-0002", client = "BuildPro Group",
            amount = "1500000.00", method = PaymentMethod.CLICK, recordedBy = "Дилноза Акрамовна",
        ),
        queueItem(
            id = "pay3", orderNumber = "2026-07-0001", client = "Rahimov Construction",
            amount = "4500000.00", method = PaymentMethod.CASH, recordedBy = "Жасур Тошматов",
        ),
    )

    private fun queueItem(
        id: String,
        orderNumber: String,
        client: String,
        amount: String,
        method: PaymentMethod,
        recordedBy: String,
        status: PaymentStatus = PaymentStatus.PENDING_CONFIRMATION,
        expected: String? = null,
        fromDriver: Boolean = false,
    ) = PaymentQueueItem(
        id = id, orderId = "o-$id", orderNumber = orderNumber, clientName = client,
        amount = Money.parse(amount), originalAmount = null, method = method,
        status = status, recordedAt = Instant.parse("2026-09-03T15:20:00Z"),
        paidOn = Instant.parse("2026-09-03T15:20:00Z"),
        expectedCollection = expected?.let(Money::parse), fromDriver = fromDriver,
        custody = CustodyChain(
            collectedBy = if (fromDriver) "$recordedBy (ҳайдовчи)" else null,
            recordedBy = recordedBy, handedOverTo = null, confirmedBy = null,
        ),
        receiptUrls = emptyList(), orderReceiptUrls = emptyList(), rejectionReason = null,
    )

    /** The one payment that came back short of what the dispatch expected — the kept lines the
     *  capture has no row for: «Кутилган …», «Камомад …» in red, and the custody chain. */
    private fun shortfallItem() = queueItem(
        id = "pay9", orderNumber = "2026-09-0028", client = "Юсупова Дилноза Акрамовна",
        amount = "7500000.00", method = PaymentMethod.CASH, recordedBy = "Жасур",
        expected = "9000000.00", fromDriver = true,
    )

    private fun queueState(
        items: List<PaymentQueueItem> = pending(),
        tab: PaymentStatus = PaymentStatus.PENDING_CONFIRMATION,
        sheet: ConfirmSheetState? = null,
        openDiscrepancies: Int = 0,
    ) = ConfirmQueueUiState(
        tab = tab,
        items = items,
        counts = PaymentCounts(pending = 3, confirmed = 3, rejected = 1),
        openDiscrepancies = openDiscrepancies,
        loading = false,
        canConfirm = true,
        permissionsResolved = true,
        sheet = sheet,
    )

    @Composable
    private fun Queue(s: ConfirmQueueUiState) = CompositionLocalProvider(
        LocalNavPillInset provides SHELL_NAV_PILL_INSET,
    ) {
        ConfirmQueueScreen(
            s = s, now = fixedInstant, onOpenOrder = {}, onOpenDiscrepancies = {}, onRefresh = {},
            onSetTab = {}, onApprove = {}, onReject = {}, onCloseSheet = {}, onSetAmountDigits = {},
            onSetAdjustmentNote = {}, onSetAction = {}, onSetNote = {}, onSetRejectReason = {},
            onSubmitApprove = {}, onSubmitReject = {}, onToastShown = {},
        )
    }

    private fun shootQueue(name: String, s: ConfirmQueueUiState) {
        rule.setContent { EtalonTheme { Queue(s) } }
        rule.onRoot().captureRoboImage("screenshots/queue_$name.png")
    }

    /** `2b-payments.png` itself: three pending rows, 3/3/1 on the switch, one «Кўриб чиқиш» pill
     *  per row — plus R9's «Тафовутлар 2», which the capture has no open discrepancy for. */
    @Test @Config(qualifiers = "w411dp-h891dp") fun queuePendingLight() =
        shootQueue("pending_light", queueState(openDiscrepancies = 2))

    /**
     * The other side of the switch: a settled tab, where the pill gives way to the state tag.
     *
     * Every row is CONFIRMED, because the tab IS a server-side status filter — a rejected row
     * inside «Тасдиқланган» is a state `GET /api/payments?status=CONFIRMED` cannot return, and a
     * baseline that draws one teaches a reviewer to expect something the app never shows.
     */
    @Test @Config(qualifiers = "w411dp-h891dp") fun queueConfirmedLight() = shootQueue(
        "confirmed_light",
        queueState(tab = PaymentStatus.CONFIRMED, items = pending().map { it.copy(status = PaymentStatus.CONFIRMED) }),
    )

    /** The third tab, and the only place the rejection reason is ever drawn. */
    @Test @Config(qualifiers = "w411dp-h891dp") fun queueRejectedLight() = shootQueue(
        "rejected_light",
        queueState(
            tab = PaymentStatus.REJECTED,
            items = listOf(
                pending()[0].copy(
                    status = PaymentStatus.REJECTED,
                    rejectionReason = "Квитанциядаги сумма бошқача — ходим билан аниқланмоқда",
                ),
            ),
        ),
    )

    /** The kept lines: expected, the red shortfall, and the custody chain under them. */
    @Test @Config(qualifiers = "w411dp-h891dp") fun queueShortfallLight() =
        shootQueue("shortfall_light", queueState(items = listOf(shortfallItem())))

    @Test @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f) fun queueLargeFont() =
        shootQueue("font13", queueState(openDiscrepancies = 2))

    // ── The two sheets. `captureScreenRoboImage`, not `onRoot()`: a ModalBottomSheet lives in a
    // window of its own, which `onRoot()` does not photograph. ───────────────────────────────

    /** The approve sheet on the short payment, so every block it can carry is on one frame: the
     *  editable hero, the recorded and expected figures, the three discrepancy options with one
     *  chosen, the note, and the «Рад этиш» / «Тасдиқлаш» pair. */
    @OptIn(ExperimentalRoborazziApi::class)
    @Test @Config(qualifiers = "w411dp-h891dp") fun approveSheetLight() {
        val item = shortfallItem()
        rule.setContent {
            EtalonTheme {
                Queue(
                    queueState(
                        items = listOf(item),
                        sheet = ConfirmSheetState(
                            item = item,
                            mode = ConfirmMode.APPROVE,
                            action = DiscrepancyAction.TRACK,
                            note = "Мижоз жумагача қолганини тўлашга рози бўлди",
                        ),
                    ),
                )
            }
        }
        rule.waitForIdle()
        captureScreenRoboImage("screenshots/approve_sheet_light.png")
    }

    /**
     * R3's final gate, over the sheet that opened it. The figure on the navy panel is the
     * ADJUSTED one — 2 750 000 against the 3 000 000 «Қайд этилди» line still visible behind it —
     * because that is the number the confirmation will actually put on the order.
     *
     * Reached by tapping «Тасдиқлаш» rather than by a flag: the gate is the button's own state,
     * and a frame that composed it directly would not prove the button opens it.
     */
    @OptIn(ExperimentalRoborazziApi::class)
    @Test @Config(qualifiers = "w411dp-h891dp") fun approveGateLight() {
        val item = pending()[0]
        rule.setContent {
            EtalonTheme {
                Queue(
                    queueState(
                        items = listOf(item),
                        sheet = ConfirmSheetState(
                            item = item,
                            mode = ConfirmMode.APPROVE,
                            amountDigits = "2750000",
                            adjustmentNote = "Квитанциядан тузатилди",
                        ),
                    ),
                )
            }
        }
        rule.onNodeWithText(CONFIRM).performClick()
        rule.waitForIdle()
        captureScreenRoboImage("screenshots/approve_gate_light.png")
    }

    /** The reject sheet: the recorded figure read-only over the mandatory reason. */
    @OptIn(ExperimentalRoborazziApi::class)
    @Test @Config(qualifiers = "w411dp-h891dp") fun rejectSheetLight() {
        val item = pending()[0]
        rule.setContent {
            EtalonTheme {
                Queue(
                    queueState(
                        items = listOf(item),
                        sheet = ConfirmSheetState(
                            item = item,
                            mode = ConfirmMode.REJECT,
                            rejectReason = "Квитанциядаги сумма бошқача",
                        ),
                    ),
                )
            }
        }
        rule.waitForIdle()
        captureScreenRoboImage("screenshots/reject_sheet_light.png")
    }

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
