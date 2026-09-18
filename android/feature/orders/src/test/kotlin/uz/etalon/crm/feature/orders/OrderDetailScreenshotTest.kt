package uz.etalon.crm.feature.orders

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.filterToOne
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.unit.dp
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import uz.etalon.crm.core.designsystem.components.LocalNavPillInset
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.model.ClientRef
import uz.etalon.crm.core.model.DispatchInfo
import uz.etalon.crm.core.model.Me
import uz.etalon.crm.core.model.AppError
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.OrderComment
import uz.etalon.crm.core.model.OrderDetail
import uz.etalon.crm.core.model.OrderEventLine
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.OrderSummary
import uz.etalon.crm.core.model.OutboxKind
import uz.etalon.crm.core.model.PaymentLine
import uz.etalon.crm.core.model.PaymentMethod
import uz.etalon.crm.core.model.PaymentState
import uz.etalon.crm.core.model.PaymentStatus
import uz.etalon.crm.core.model.PendingUpload
import uz.etalon.crm.core.model.Resource
import uz.etalon.crm.core.model.Role
import uz.etalon.crm.core.model.RoomLine
import uz.etalon.crm.core.model.ShipmentLine
import uz.etalon.crm.core.model.ShipmentStatus
import uz.etalon.crm.core.ui.format.formatMoney
import uz.etalon.crm.feature.orders.detail.OrderDetailScreen
import uz.etalon.crm.feature.orders.detail.TAG_COMMENTS_ALL
import uz.etalon.crm.feature.orders.detail.TAG_EVENTS_ALL
import java.math.BigDecimal
import java.time.Instant

/** What `SignedInShell` provides into [LocalNavPillInset] at Robolectric's 0 dp system navigation
 *  inset: the pill's 84 dp band alone, so these frames carry the clearance a real phone shows. */
private val SHELL_NAV_PILL_INSET = 84.dp

/**
 * `2b-order-detail.png` reproduced element for element, so the reviewer can lay the two images
 * side by side: the navy panel with the back circle, «30 авг 2026» and the phone circle; the
 * indigo card «Буюртма / № 09‑0003 / Жўнатилган»; the avatar with «Yusupov & Sons» over its
 * address; the three room tiles; Майдон / Жами / Қолди; the «Тўлов ҳолати» card at 45 %; and the
 * «Етказиш» card over the sticky «Етказилди» + «Тўлов қайд қилиш».
 *
 * Nothing here reads the clock: every instant is fixed, so a baseline recorded in March is the one
 * recorded in September.
 *
 * **The nav pill is not drawn in these frames, but its band is.** `OrderDetailScreen` is stateless
 * and knows nothing about the shell; the frame provides [SHELL_NAV_PILL_INSET] so the empty strip
 * the sticky bar keeps below itself is the one the shell reserves on a real phone. The pill's own
 * picture is `ds_bottom_nav_light.png`.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36])
class OrderDetailScreenshotTest {
    @get:Rule val rule = createComposeRule()

    /** ROLE_TEMPLATES.SALES: `order.edit` and `payment.record`, and deliberately NOT
     *  `dispatch.create` — the largest operator role, and the one the capture's bar belongs to. */
    private val me = Me(
        "u1", "Оператор", Role.SALES,
        setOf("order.view", "order.edit", "payment.record"), false,
    )

    /** The same operator with the permission every shipment route is wrapped in, so one frame
     *  records the shipments *door* — the chevron and «Жўнатмаларга бўлиш» — rather than the
     *  read-only card. */
    private val dispatcher = Me("u2", "Диспетчер", Role.SALES, me.permissions + "dispatch.create", false)

    private fun room(
        name: String, w: String, l: String, area: String, subtotal: String,
        beamLength: String, beams: Int, blocks: Int,
    ) = RoomLine(
        name = name, innerWidth = BigDecimal(w), innerLength = BigDecimal(l), pattern = "Г-Б",
        beamLength = BigDecimal(beamLength), beamCount = beams, totalBlocks = blocks,
        billedArea = BigDecimal(area), subtotal = Money.parse(subtotal),
    )

    /** Two beam lengths across three rooms, so «Юклаш рўйхати» records both the grouping (two
     *  3,80 m rooms summed into one row) and the first-appearance order: 3,80 m × 14, 5,05 m × 3,
     *  282 blocks — the owner's own screenshot of the web page. */
    private val rooms = listOf(
        room("Зал", "5.80", "6.40", "37.10", "6293000.00", beamLength = "3.80", beams = 8, blocks = 132),
        room("Хона 1", "4.40", "5.20", "22.90", "3884500.00", beamLength = "5.05", beams = 3, blocks = 60),
        room("Хона 2", "4.00", "4.80", "19.20", "3172500.00", beamLength = "3.80", beams = 6, blocks = 90),
    )

    private val payment = PaymentLine(
        id = "p1", amount = Money.parse("6000000.00"), method = PaymentMethod.CASH,
        status = PaymentStatus.CONFIRMED, recordedAt = Instant.parse("2026-09-02T09:20:00Z"),
        recordedByName = "Оператор", receiptUrls = emptyList(),
    )

    private val shipment = ShipmentLine(
        id = "s1", number = 1, status = ShipmentStatus.DISPATCHED, loadedBlocks = 96,
        loadedPhotoUrl = null, dispatchedAt = Instant.parse("2026-09-03T05:00:00Z"),
        driverName = "Азиз", truckIdentifier = "01A777AA",
    )

    private val events = listOf(
        OrderEventLine("e1", "DISPATCHED", "Жўнатилди", "Азиз", Instant.parse("2026-09-03T05:00:00Z")),
        OrderEventLine("e2", "PAYMENT", "Тўлов қайд қилинди", "Оператор", Instant.parse("2026-09-02T09:20:00Z")),
    )

    /**
     * Six, so «Тарих» has something to collapse. The last one is the `STOCK_WARNING` rule:
     * the server writes that event's `message` as English prose for the desk, and the phone shows
     * the type's Uzbek wording instead — the only type whose message is dropped.
     */
    private val sixEvents = events + listOf(
        OrderEventLine("e3", "ORDER_LOADED", null, "Азиз", Instant.parse("2026-09-02T04:10:00Z")),
        OrderEventLine("e4", "SCHEDULED_DATE_CHANGED", "Сана 30 авг га кўчирилди", "Оператор", Instant.parse("2026-09-01T11:00:00Z")),
        OrderEventLine("e5", "ORDER_PLACED", null, "Оператор", Instant.parse("2026-08-30T06:00:00Z")),
        OrderEventLine("e6", "STOCK_WARNING", "Reserved stock exceeds available inventory", null, Instant.parse("2026-08-30T06:00:10Z")),
    )

    /**
     * The capture's order: 78,7 м² over three rooms, 13 350 000 total, 6 000 000 confirmed
     * (45 %), DISPATCHED on 3 September with Азиз at the wheel.
     *
     * @param shipments deliberately empty by default. With a shipment on the order `nextStepFor`
     *   sends a `dispatch.create` holder to the shipment list and a SALES operator nowhere at all,
     *   and the bar would then read «Жўнатмалар» or vanish — the capture's bar is «Етказилди», the
     *   whole-order delivery proof, which is the step an unsplit order is on. The shipments card
     *   is exercised by [blockedLight] instead.
     */
    private fun order(
        status: OrderStatus = OrderStatus.DISPATCHED,
        paid: String = "6000000.00",
        payments: List<PaymentLine> = listOf(payment),
        shipments: List<ShipmentLine> = emptyList(),
        // The breakdown balances: roomsSubtotal − discount + delivery = totalPrice.
        roomsSubtotal: String = "13350000.00",
        discount: String = "0.00",
        discountPercent: String = "0",
        delivery: String = "0.00",
        /** The server's own `Order.totalPrice`, which is where a half hides — see
         *  [theCostColumnAddsUpOnADiscountThatLandsOnAHalf]. */
        total: String = "13350000.00",
        events: List<OrderEventLine> = this.events,
        cancelReason: String? = null,
        canceledAt: Instant? = null,
    ) = OrderDetail(
        summary = OrderSummary(
            id = "o3", orderNumber = "2026-09-0003", status = status,
            paymentState = when {
                Money.parse(paid).isZero -> PaymentState.AWAITING_PAYMENT
                Money.parse(paid) >= Money.parse("13350000.00") -> PaymentState.FULLY_PAID
                else -> PaymentState.PARTIALLY_PAID
            },
            totalPrice = Money.parse(total), confirmedPaid = Money.parse(paid),
            totalArea = BigDecimal("78.70"), totalBlocks = 282, totalBeams = 17,
            scheduledAt = Instant.parse("2026-08-30T06:00:00Z"),
            placedAt = Instant.parse("2026-08-30T06:00:00Z"),
            client = ClientRef("c3", "Yusupov & Sons", "998901112233", "Бухоро, Эски шаҳар, Хўжа Нуробод кўч. 7"),
        ),
        notes = null,
        deliveryLat = null, deliveryLng = null, deliveryLocationUrl = null, deliveryLocationLabel = null,
        discountAmount = Money.parse(discount), deliveryCost = Money.parse(delivery), otherCost = Money.ZERO,
        roomsSubtotal = Money.parse(roomsSubtotal), writeOffAmount = Money.ZERO,
        rooms = rooms, payments = payments, shipments = shipments,
        loadedPhotos = emptyList(), deliveryProofUrl = null, events = events,
        dispatch = if (status == OrderStatus.DISPATCHED || status == OrderStatus.DELIVERED) {
            DispatchInfo(
                id = "d1", driverName = "Азиз", truckIdentifier = "01A777AA",
                expectedCollection = Money.ZERO,
                dispatchedAt = Instant.parse("2026-09-03T05:00:00Z"), returnedAt = null,
            )
        } else {
            null
        },
        fetchedAt = Instant.parse("2026-09-04T00:00:00Z"),
        cancelReason = cancelReason,
        canceledAt = canceledAt,
        discountPercent = BigDecimal(discountPercent),
    )

    /** Three notes on the deal, oldest first as the route hands them back. The middle one carries
     *  an «@Азиз» — the server resolved it into a `COMMENT_MENTION` push at write time, and the
     *  phone draws exactly what was typed. */
    private val comments = listOf(
        OrderComment("k1", "Мижоз эртага тўлайман деди", Instant.parse("2026-09-02T10:05:00Z"), "u1", "Оператор"),
        OrderComment("k2", "@Азиз юкни соат 8 да олиб кетинг", Instant.parse("2026-09-03T04:30:00Z"), "u2", "Диспетчер"),
        OrderComment("k3", "Юкланди, ҳайдовчи йўлда", Instant.parse("2026-09-03T05:10:00Z"), "u3", "Азиз"),
    )

    /** Five, so «Шарҳлар» has something to collapse: the card draws the LAST three and offers
     *  «Барчаси (5)». */
    private val fiveComments = listOf(
        OrderComment("k0", "Ўлчов олинди, ҳисоб тайёр", Instant.parse("2026-09-01T06:00:00Z"), "u1", "Оператор"),
        OrderComment("k01", "Мижоз чизмани тасдиқлади", Instant.parse("2026-09-01T11:20:00Z"), "u2", "Диспетчер"),
    ) + comments

    private fun show(
        o: OrderDetail,
        pending: List<PendingUpload> = emptyList(),
        who: Me = me,
        comments: Resource<List<OrderComment>> = Resource.Success(emptyList()),
        commentDraft: String = "",
        imeVisible: Boolean = false,
    ) {
        rule.setContent {
            EtalonTheme {
                CompositionLocalProvider(LocalNavPillInset provides SHELL_NAV_PILL_INSET) {
                    OrderDetailScreen(
                        r = Resource.Success(o), me = who, pending = pending, actionError = null,
                        onBack = {}, onRefresh = {}, onLoadTruck = {}, onAddPhoto = {}, onDeliveryProof = {},
                        onOpenShipments = {}, onOpenLocation = {}, onRecordPayment = {},
                        onDeletePhoto = {}, onRetryUpload = {}, onCancelUpload = {},
                        comments = comments, commentDraft = commentDraft,
                        barVisible = !imeVisible,
                    )
                }
            }
        }
    }

    /** The screen's own list. A bare `hasScrollAction()` also matches the photo strip's `LazyRow`
     *  on any frame that draws one, so the vertical axis is what picks the column out. */
    private fun list() = rule.onNode(
        hasScrollAction() and SemanticsMatcher.keyIsDefined(SemanticsProperties.VerticalScrollAxisRange),
    )

    private fun shoot(
        name: String,
        o: OrderDetail,
        pending: List<PendingUpload> = emptyList(),
        who: Me = me,
    ) {
        show(o, pending, who)
        rule.onRoot().captureRoboImage("screenshots/$name.png")
    }

    /** The capture itself. */
    @Test @Config(qualifiers = "w411dp-h891dp")
    fun dispatchedLight() = shoot("order_detail_dispatched_light", order())

    /**
     * Nothing paid yet and nothing loaded: the bar's next step is «Юклаш», the progress card reads
     * 0 % and the timeline is on its first column.
     *
     * This is also the frame that records the two things the capture's order has no occasion to
     * show: the cost breakdown (13 550 000 − 500 000 + 300 000 = 13 350 000) and, through
     * [dispatcher], the shipments door with its chevron and «Жўнатмаларга бўлиш».
     *
     * The discount line carries its rate: 500 000 off 13 550 000 is 3,69 %, which the card writes
     * «Чегирма 3,7 %» at the web's one decimal.
     */
    @Test @Config(qualifiers = "w411dp-h891dp")
    fun placedLight() = shoot(
        "order_detail_placed_light",
        order(
            status = OrderStatus.PLACED, paid = "0.00", payments = emptyList(),
            roomsSubtotal = "13550000.00", discount = "500000.00", discountPercent = "3.69",
            delivery = "300000.00",
        ),
        who = dispatcher,
    )

    /** Finished and settled: no bar at all (no next step, no debt to record against), the progress
     *  card green, «Қолди» green on the panel and all four timeline columns navy. */
    @Test @Config(qualifiers = "w411dp-h891dp")
    fun deliveredPaidLight() = shoot(
        "order_detail_delivered_paid_light",
        order(
            status = OrderStatus.DELIVERED, paid = "13350000.00",
            payments = listOf(payment, payment.copy(id = "p2", amount = Money.parse("7350000.00"))),
            shipments = listOf(shipment.copy(status = ShipmentStatus.DELIVERED, deliveredAt = Instant.parse("2026-09-05T07:00:00Z"))),
        ),
    )

    /** A photo still in the outbox: the banner at the top, the bar's secondary disabled with
     *  «Юборилмоқда…», and the shipment row saying the same thing so nobody loads it twice. */
    @Test @Config(qualifiers = "w411dp-h891dp")
    fun blockedLight() = shoot(
        "order_detail_blocked_light",
        order(shipments = listOf(shipment)),
        listOf(
            PendingUpload(
                id = "q1", kind = OutboxKind.ADD_LOADED_PHOTO, orderId = "o3", shipmentId = "s1",
                failed = false, attempts = 0, error = null,
            ),
        ),
    )

    /**
     * Defect C2. A canceled order owes nothing (`OrderStatus.owesNothing`), so the panel's «Қолди»
     * is a muted «—» rather than its untouched 13 350 000, and neither the «Тўлов ҳолати» progress
     * card nor the cost breakdown is drawn — the Orders and Home rows already draw nothing for a
     * canceled order, and the screen they open must agree with them.
     *
     * A cost breakdown that *would* render on any live status, so the frame records both absences
     * at once; the red «Бекор қилинган» tag sits on the panel.
     *
     * It also carries what §5.1a adds for a canceled order: the red notice with the date and the
     * reason, «Юклаш рўйхати» collapsed behind its chevron — the list is history now, not a job —
     * and, because 6 000 000 really was taken before the cancellation, the payments card's
     * «Тасдиқланган: 6 000 000 / 13 350 000». That footer is the only denominator left on the
     * screen once the progress and cost cards are gone.
     */
    @Test @Config(qualifiers = "w411dp-h891dp")
    fun canceledLight() = shoot(
        "order_detail_canceled_light",
        order(
            status = OrderStatus.CANCELED, paid = "6000000.00",
            roomsSubtotal = "13550000.00", discount = "500000.00", delivery = "300000.00",
            cancelReason = "Мижоз бекор қилишни сўради",
            canceledAt = Instant.parse("2026-09-03T09:00:00Z"),
        ),
    )

    /**
     * Spec §5.1a's disable-with-a-reason. The whole 13 350 000 is sitting in the confirmation
     * queue, so `POST /api/payments` would take nothing more: «Тўлов қайд қилиш» stays where the
     * thumb expects it, greyed, with «Тасдиқ кутилмоқда: 13 350 000» under it. Hiding it would
     * read as a bug to the operator who recorded that very payment.
     */
    @Test @Config(qualifiers = "w411dp-h891dp")
    fun pendingCapLight() = shoot(
        "order_detail_pending_cap_light",
        order(
            status = OrderStatus.PLACED, paid = "0.00",
            payments = listOf(
                payment.copy(
                    id = "p9", amount = Money.parse("13350000.00"),
                    status = PaymentStatus.PENDING_CONFIRMATION,
                    recordedAt = Instant.parse("2026-09-03T12:40:00Z"),
                ),
            ),
        ),
    )

    /**
     * «Тарих» collapsed: three of six lines and «Барчаси (6)». The last of the six is a
     * `STOCK_WARNING` whose server `message` is English prose — it is below the fold here, and
     * [theStockWarningShowsItsUzbekLabelNotTheServersEnglish] asserts the rule directly.
     *
     * The card is the last thing on the screen, so the frame scrolls to it: a `LazyColumn` does
     * not compose what it does not draw, and a frame of the panel would record nothing.
     */
    @Test @Config(qualifiers = "w411dp-h891dp")
    fun historyLight() {
        show(order(events = sixEvents))
        list().performScrollToNode(hasTestTag(TAG_EVENTS_ALL))
        rule.onRoot().captureRoboImage("screenshots/order_detail_history_light.png")
    }

    /** The expansion goes both ways. An order can carry up to a hundred events (the route's own
     *  `take: 100`), and «Барчаси» with no way back leaves the composer and the sticky bar a
     *  hundred rows away from the operator who only wanted to check the last delivery. */
    @Test @Config(qualifiers = "w411dp-h891dp")
    fun theHistoryFoldsBackUp() {
        show(order(events = sixEvents))
        val row = hasTestTag(TAG_EVENTS_ALL)
        list().performScrollToNode(row)
        rule.onNode(row).assertTextEquals("Барчаси (6)")
        rule.onNode(row).performClick()
        rule.onNode(row).assertTextEquals("Камроқ")
        rule.onNode(row).performClick()
        rule.onNode(row).assertTextEquals("Барчаси (6)")
    }

    /**
     * The rate beside the discount sum, which [placedLight]'s viewport cuts off: 500 000 off
     * 13 550 000 is 3,69 %, written at the web's one decimal. A client who negotiated a percentage
     * asks about the percentage, and the sum alone does not answer.
     */
    @Test @Config(qualifiers = "w411dp-h891dp")
    fun theDiscountLineCarriesItsRate() {
        show(
            order(
                status = OrderStatus.PLACED, paid = "0.00", payments = emptyList(),
                roomsSubtotal = "13550000.00", discount = "500000.00", discountPercent = "3.69",
                delivery = "300000.00",
            ),
        )
        val line = hasText("Чегирма 3,7%")
        list().performScrollToNode(line)
        rule.onNode(line).assertIsDisplayed()
        // Then down to the delivery card's footer for the picture. `performScrollToNode` moves the
        // minimum needed, and the breakdown is ALREADY in the viewport — behind the sticky bar,
        // which `assertIsDisplayed` does not know about and a baseline would show as nothing. The
        // footer of the card after it is the first unambiguous node far enough down to pull the
        // whole breakdown clear («Етказиш» itself matches the breakdown's own delivery row too).
        list().performScrollToNode(hasText("Ҳайдовчи"))
        rule.onRoot().captureRoboImage("screenshots/order_detail_discount_light.png")
    }

    /**
     * …and the column that rate belongs to has to ADD UP. A real order placed from the calculator:
     * 2,5 % of 15 456 460 is 386 411,50, which printed on its own reads «386 412» against a «Жами»
     * struck from 15 370 048,50 — «15 370 049». The operator reading the price back to a customer
     * would be a UZS out. `OrderDetail.displayedDiscount` derives the printed figure from its
     * printed neighbours; this is that rule on the screen.
     */
    @Test @Config(qualifiers = "w411dp-h891dp")
    fun theCostColumnAddsUpOnADiscountThatLandsOnAHalf() {
        show(
            order(
                status = OrderStatus.PLACED, paid = "0.00", payments = emptyList(),
                roomsSubtotal = "15456460.00", discount = "386411.50", discountPercent = "2.50",
                delivery = "300000.00", total = "15370048.50",
            ),
        )
        list().performScrollToNode(hasText("Чегирма 2,5%"))
        // Built, never spelt: the group separator is U+202F, which a hand-typed literal gets wrong
        // in a way that reads as a passing test.
        rule.onNode(hasText(uzs(15_456_460))).assertExists()
        rule.onNode(hasText("−${uzs(386_411)}")).assertExists()
        rule.onNode(hasText(uzs(300_000))).assertExists()
        // The bottom line reads three times on this screen and must be one figure everywhere: the
        // panel's «Жами», the panel's «Қолди» (nothing is paid) and this card's own «Жами».
        rule.onAllNodes(hasText(uzs(15_370_049))).assertCountEquals(3)
    }

    /** A whole-UZS figure as every money row writes it. */
    private fun uzs(whole: Long) = formatMoney(Money(BigDecimal.valueOf(whole)))

    /**
     * A cancellation the server recorded no date for: the notice keeps its sentence and simply
     * drops the «· 3 сен 2026». `canceledAt` is nullable on the wire, and an order canceled
     * before that column existed reads exactly this way — the reason is the part nobody can
     * reconstruct from the rest of the screen, so it must not be lost with the date.
     */
    @Test @Config(qualifiers = "w411dp-h891dp")
    fun aCancellationWithNoDateStillSaysItWasCanceled() {
        show(order(status = OrderStatus.CANCELED, cancelReason = "Мижоз бекор қилишни сўради", canceledAt = null))
        val notice = hasText("Бекор қилинди")
        list().performScrollToNode(notice)
        rule.onNode(notice).assertIsDisplayed()
        rule.onNode(hasText("Сабаб: Мижоз бекор қилишни сўради")).assertIsDisplayed()
    }

    /** …and one with a date but no grounds: «Сабаб кўрсатилмаган», said plainly, rather than a
     *  blank line that reads as a rendering bug. A blank string is the same case as a null one —
     *  the server stores both. */
    @Test @Config(qualifiers = "w411dp-h891dp")
    fun aCancellationWithNoReasonSaysSoRatherThanNothing() {
        show(
            order(
                status = OrderStatus.CANCELED, cancelReason = "   ",
                canceledAt = Instant.parse("2026-09-03T09:00:00Z"),
            ),
        )
        val reason = hasText("Сабаб: Сабаб кўрсатилмаган")
        list().performScrollToNode(reason)
        rule.onNode(reason).assertIsDisplayed()
    }

    /** §5.1a: the stock-reserve warning is resolved at the desk and its server message is written
     *  in English for the desk, so «Тарих» shows the type's Uzbek wording instead. Every other
     *  type keeps its message — which is why «Жўнатилди» is still asserted beside it. */
    @Test @Config(qualifiers = "w411dp-h891dp")
    fun theStockWarningShowsItsUzbekLabelNotTheServersEnglish() {
        show(order(events = sixEvents))
        val all = hasTestTag(TAG_EVENTS_ALL)
        list().performScrollToNode(all)
        rule.onNode(all).performClick()
        list().performScrollToNode(hasText("Қолдиқ огоҳлантириши", substring = true))
        rule.onNode(hasText("Reserved stock exceeds available inventory", substring = true)).assertDoesNotExist()
    }

    /**
     * The other half of that rule, and the defect `orderEventLabel` exists for: most events carry
     * NO `message` at all, and «Тарих» used to print the raw enum name at an operator who reads
     * Uzbek. `ORDER_LOADED` is one of them — it must read «Юк ортилди», and the identifier must
     * not be on the screen anywhere.
     */
    @Test @Config(qualifiers = "w411dp-h891dp")
    fun anEventWithNoMessageReadsInUzbekRatherThanAsItsEnumName() {
        show(order(events = sixEvents))
        val all = hasTestTag(TAG_EVENTS_ALL)
        list().performScrollToNode(all)
        rule.onNode(all).performClick()
        list().performScrollToNode(hasText("Юк ортилди", substring = true))
        rule.onNode(hasText("Юк ортилди", substring = true)).assertIsDisplayed()
        rule.onNode(hasText("ORDER_LOADED", substring = true)).assertDoesNotExist()
    }

    /**
     * §5.1a's disabled-with-a-reason bar has TWO lines where every other bar has one, and the list
     * pays for the second out of its own bottom clearance (`blockedBarExtra`). If that clearance
     * were ever measured for the one-line bar the reason — the whole point of disabling rather
     * than hiding — would be the thing covering the card the operator scrolled down to read.
     *
     * So: with the door blocked, scroll the list to its last card and assert that card ends ABOVE
     * the greyed button, with both of the bar's lines on screen.
     */
    @Test @Config(qualifiers = "w411dp-h891dp")
    fun theBlockedPaymentBarNeverCoversTheLastCard() {
        show(
            order(
                status = OrderStatus.PLACED, paid = "0.00",
                events = sixEvents,
                payments = listOf(
                    payment.copy(
                        id = "p9", amount = Money.parse("13350000.00"),
                        status = PaymentStatus.PENDING_CONFIRMATION,
                        recordedAt = Instant.parse("2026-09-03T12:40:00Z"),
                    ),
                ),
            ),
        )
        val lastCard = hasTestTag(TAG_EVENTS_ALL)
        list().performScrollToNode(lastCard)
        rule.waitForIdle()

        val button = rule.onNode(hasText("Тўлов қайд қилиш")).getUnclippedBoundsInRoot()
        val card = rule.onNode(lastCard).getUnclippedBoundsInRoot()
        rule.onNode(hasText("Тўлов қайд қилиш")).assertIsDisplayed()
        // «Тасдиқ кутилмоқда: …» reads twice on this screen — the payments card says it about the
        // payment, the sticky bar says it about the button. The bar's copy is the one OUTSIDE the
        // scrolling list, and it is the one that has to be on screen.
        rule.onAllNodes(hasText("Тасдиқ кутилмоқда", substring = true))
            .filterToOne(!hasAnyAncestor(hasScrollAction()))
            .assertIsDisplayed()
        assertTrue(
            "«Барчаси» ends at ${card.bottom}, the blocked bar starts at ${button.top}",
            card.bottom <= button.top,
        )
    }

    /**
     * I1. «Шарҳлар» is near the bottom of the list and the sticky bar is bottom-aligned over it, so
     * with the keyboard up the bar sat on the field being typed into — and on the card's own
     * «Юбориш» under it. The root's `imePadding` shortens the screen and the bar steps aside; the
     * keyboard's own Send key and that «Юбориш» are what post the note meanwhile.
     *
     * The IME cannot be raised under Robolectric — `WindowInsets.isImeVisible` reports absent
     * whatever is focused — so the screen is driven through `barVisible`, which is exactly what
     * that inset feeds on a phone.
     */
    @Test @Config(qualifiers = "w411dp-h891dp")
    fun theStickyBarIsNotDrawnWhileTheKeyboardIsUp() {
        show(order(), imeVisible = true)
        rule.onNode(hasText("Тўлов қайд қилиш")).assertDoesNotExist()
        // 7a put «Ҳисоб-китоб» between the hero and «Етказиш», so the timeline no longer starts
        // on screen. Scroll it into view before counting — the bar is an overlay outside the
        // list, so what it does is unaffected by where the list sits.
        list().performScrollToNode(hasText("Етказилди"))
        // «Етказилди» is the «Етказиш» card's third timeline column as well as the bar's secondary
        // button, so the ONE left is the timeline's and the bar's is the one that went.
        rule.onAllNodes(hasText("Етказилди")).assertCountEquals(1)
    }

    /** And the same order with the keyboard down: both of the bar's buttons are back. */
    @Test @Config(qualifiers = "w411dp-h891dp")
    fun theStickyBarReturnsWhenTheKeyboardCloses() {
        show(order())
        rule.onNode(hasText("Тўлов қайд қилиш")).assertIsDisplayed()
        list().performScrollToNode(hasText("Етказилди"))
        rule.onAllNodes(hasText("Етказилди")).assertCountEquals(2)
    }

    @Test @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f)
    fun largeFont() = shoot("order_detail_font13", order())

    /**
     * [blockedLight]'s order at font scale 1,3 — the frame that checks the sticky bar's clearance
     * rather than its wording. The outbox banner disables the secondary, and the bar keeps the
     * whole-order «Тўлов қайд қилиш» beside it, so at 1,3 both labels are at their widest while
     * the list below still has to end clear of the bar.
     */
    @Test @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f)
    fun blockedLargeFont() = shoot(
        "order_detail_blocked_font13",
        order(shipments = listOf(shipment)),
        listOf(
            PendingUpload(
                id = "q1", kind = OutboxKind.ADD_LOADED_PHOTO, orderId = "o3", shipmentId = "s1",
                failed = false, attempts = 0, error = null,
            ),
        ),
    )

    /**
     * The payment door blocked at font scale 1,3 — the case the list's bottom clearance is
     * measured for. «Тўлов қайд қилиш» is greyed with «Тасдиқ кутилмоқда: 13 350 000» wrapped onto
     * the two `meta` lines the reason is allowed, and the list reserves exactly that box's measured
     * height on top of the bar's own, so the last card ends above the bar rather than under it.
     */
    @Test @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f)
    fun pendingCapLargeFont() = shoot(
        "order_detail_pending_cap_font13",
        order(
            status = OrderStatus.PLACED, paid = "0.00",
            payments = listOf(
                payment.copy(
                    id = "p9", amount = Money.parse("13350000.00"),
                    status = PaymentStatus.PENDING_CONFIRMATION,
                    recordedAt = Instant.parse("2026-09-03T12:40:00Z"),
                ),
            ),
        ),
    )

    /**
     * «Шарҳлар» with a thread on it: three rows — avatar, name and time, then the note — over the
     * composer with a draft in it and «Юбориш» live. The middle comment's «@Азиз» is drawn as the
     * plain text it is; there is no mention picker on the phone, because the server is what
     * resolves a mention (and what turns it into the push that opens this screen).
     *
     * The card is below the fold, so the frame scrolls to it: a `LazyColumn` composes only what it
     * draws.
     */
    @Test @Config(qualifiers = "w411dp-h891dp")
    fun commentsLight() {
        show(order(), comments = Resource.Success(comments), commentDraft = "Тўлов бугун келади")
        list().performScrollToNode(hasText("Шарҳлар"))
        rule.onRoot().captureRoboImage("screenshots/order_detail_comments_light.png")
    }

    /** The same card at font scale 1,3 — the row that has to survive it is the name beside the
     *  timestamp, which is why the name yields its width rather than pushing the date off. */
    @Test @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f)
    fun commentsLargeFont() {
        show(order(), comments = Resource.Success(comments), commentDraft = "Тўлов бугун келади")
        list().performScrollToNode(hasText("Шарҳлар"))
        rule.onRoot().captureRoboImage("screenshots/order_detail_comments_font13.png")
    }

    /**
     * The thread expanded: five notes behind «Барчаси (5)», opened, then folded back with
     * «Камроқ». The card draws the LAST three collapsed — the route hands the thread back
     * oldest-first and what anyone opening an order wants is the end of the conversation — so the
     * two oldest are what appears on the tap.
     *
     * The row is found by its tag, not its wording: «Барчаси (5)» changes with the count and
     * «Камроқ» is the same word the history card uses.
     */
    @Test @Config(qualifiers = "w411dp-h891dp")
    fun commentsExpandedLight() {
        show(order(), comments = Resource.Success(fiveComments))
        val all = hasTestTag(TAG_COMMENTS_ALL)
        list().performScrollToNode(all)
        rule.onNode(all).assertTextEquals("Барчаси (5)")
        rule.onNode(all).performClick()
        rule.onNode(all).assertTextEquals("Камроқ")
        list().performScrollToNode(hasText("Ўлчов олинди, ҳисоб тайёр"))
        rule.onRoot().captureRoboImage("screenshots/order_detail_comments_expanded_light.png")
        rule.onNode(all).performClick()
        rule.onNode(all).assertTextEquals("Барчаси (5)")
        rule.onNode(hasText("Ўлчов олинди, ҳисоб тайёр")).assertDoesNotExist()
    }

    /**
     * A thread that failed to LOAD must not read as a deal nobody has written on. The card shows
     * the server's reason with a retry above whatever rows the last answer left behind — here
     * none, which is exactly the case «Ҳозирча шарҳлар йўқ» would have lied about.
     */
    @Test @Config(qualifiers = "w411dp-h891dp")
    fun aFailedThreadSaysSoInsteadOfReadingAsEmpty() {
        show(order(), comments = Resource.Error(null, AppError.Network("Интернет алоқаси йўқ")))
        val card = hasText("Шарҳлар")
        list().performScrollToNode(card)
        rule.onNode(hasText("Интернет алоқаси йўқ")).assertIsDisplayed()
        rule.onNode(hasText("Ҳозирча шарҳлар йўқ")).assertDoesNotExist()
    }

    /** …and the rows the last successful load left behind stay under the banner: a dropped refresh
     *  must not empty a thread the operator was reading. */
    @Test @Config(qualifiers = "w411dp-h891dp")
    fun aFailedRefreshKeepsTheThreadItAlreadyHad() {
        show(order(), comments = Resource.Error(comments, AppError.Network("Интернет алоқаси йўқ")))
        list().performScrollToNode(hasText("Шарҳлар"))
        rule.onNode(hasText("Интернет алоқаси йўқ")).assertIsDisplayed()
        rule.onNode(hasText("Юкланди, ҳайдовчи йўлда")).assertIsDisplayed()
    }

    /** An order nobody has written on yet still offers the card — the first person to open it
     *  after a mention push must have somewhere to answer. */
    @Test @Config(qualifiers = "w411dp-h891dp")
    fun theEmptyThreadStillOffersTheComposer() {
        show(order())
        val empty = hasText("Ҳозирча шарҳлар йўқ")
        list().performScrollToNode(empty)
        rule.onNode(empty).assertIsDisplayed()
        rule.onNode(hasText("Юбориш")).assertIsDisplayed()
    }

    /**
     * The other half of C2's rule, which [canceledLight] cannot photograph because its order was
     * never paid: cash already taken against an order that was later canceled is **history** and
     * stays on the screen. Dropping the progress card must not drop the payments card with it —
     * the money really did change hands; what is wrong is calling the rest of it *owed*.
     */
    @Test @Config(qualifiers = "w411dp-h891dp")
    fun aCanceledOrderStillListsThePaymentsItTook() {
        show(order(status = OrderStatus.CANCELED, paid = "6000000.00"))
        val card = hasText("Тўловлар")
        list().performScrollToNode(card)
        rule.onNode(card).assertIsDisplayed()
    }

    /**
     * The shipments door sits below [placedLight]'s viewport — a `LazyColumn` does not compose
     * what it does not draw, so it is scrolled to and asserted rather than photographed. It is the
     * only way into the split-truck flow on Android, so a regression that hid it would otherwise
     * cost nothing on any baseline.
     */
    @Test @Config(qualifiers = "w411dp-h891dp")
    fun shipmentsDoorIsOfferedOnAPlacedOrder() {
        show(order(status = OrderStatus.PLACED, paid = "0.00", payments = emptyList()), who = dispatcher)
        val door = hasText("Жўнатмаларга бўлиш")
        list().performScrollToNode(door)
        rule.onNode(door).assertIsDisplayed()
    }
}
