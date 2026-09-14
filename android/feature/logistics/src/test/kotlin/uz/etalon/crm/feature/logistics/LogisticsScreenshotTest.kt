package uz.etalon.crm.feature.logistics

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.ComposeContentTestRule
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
import uz.etalon.crm.core.image.PreparedImage
import uz.etalon.crm.core.model.ClientRef
import uz.etalon.crm.core.model.Driver
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.OrderDetail
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.OrderSummary
import uz.etalon.crm.core.model.OutboxKind
import uz.etalon.crm.core.model.PaymentState
import uz.etalon.crm.core.model.PendingUpload
import uz.etalon.crm.core.model.Resource
import uz.etalon.crm.core.model.RoomLine
import uz.etalon.crm.core.model.ShipmentLine
import uz.etalon.crm.core.model.ShipmentStatus
import uz.etalon.crm.feature.logistics.delivery.DeliveryProofScreen
import uz.etalon.crm.feature.logistics.delivery.DeliveryProofUiState
import uz.etalon.crm.feature.logistics.dispatch.DispatchScreen
import uz.etalon.crm.feature.logistics.dispatch.DispatchUiState
import uz.etalon.crm.feature.logistics.loadtruck.LoadTruckScreen
import uz.etalon.crm.feature.logistics.loadtruck.LoadTruckUiState
import uz.etalon.crm.feature.logistics.shipments.Allowance
import uz.etalon.crm.feature.logistics.shipments.ShipmentLoadScreen
import uz.etalon.crm.feature.logistics.shipments.ShipmentLoadUiState
import uz.etalon.crm.feature.logistics.shipments.ShipmentsScreen
import uz.etalon.crm.feature.logistics.shipments.ShipmentsUiState
import java.io.File
import java.math.BigDecimal
import java.time.Instant

/** What `SignedInShell` provides into [LocalNavPillInset] at Robolectric's 0 dp system navigation
 *  inset: the pill's 84 dp band alone, so these frames carry the clearance a real phone shows. */
private val SHELL_NAV_PILL_INSET = 84.dp

/** The gate's confirm, and the delivery screen's own sticky button. «Етказилди» is the button;
 *  «Тасдиқлаш» exists only on the navy panel, so its presence IS "the gate is open". */
private const val DELIVERED = "Етказилди"

/** `action_dispatch`, and — the same word — `dispatch_title` one header above it. */
private const val DISPATCH = "Жўнатиш"

/**
 * Taps the BUTTON carrying [label], not the heading or the status tag that happens to say the same
 * word. «Етказилди» is both the shipments list's deliver offer and a finished lorry's own tag, and
 * «Жўнатиш» is both the dispatch screen's title and the action on its bar — `onNodeWithText` finds
 * two nodes for each and fails. The merged tree folds a button's label into its own clickable node,
 * so "has this text AND a click action" is exactly one node; a heading and a tag have neither.
 */
private fun ComposeContentTestRule.clickButton(label: String) =
    onNode(hasText(label) and hasClickAction()).performClick()

/** The clock the shipment rows' «3 сен» metas are written against. */
private val NOW: Instant = Instant.parse("2026-09-04T00:00:00Z")

/** When the loaded trucks in the fixture went on. */
private val LOADED_AT: Instant = Instant.parse("2026-09-03T05:00:00Z")

/** The dispatch form's picker, filled — the one row that is selected and one that is not. */
private val DRIVERS = listOf(
    driver("d1", "Дилшод Раҳимов", "998901112233"),
    driver("d2", "Аброр Юсупов", "998901112244"),
)

private fun driver(id: String, name: String, phone: String) = Driver(
    id = id, name = name, phone = phone, notes = null, active = true,
    activeDispatchCount = 0, discrepancyCount30d = 0, lastDispatchAt = null,
)

/** The band the shell reserves for the floating nav pill, around a screen the shell would host. */
@Composable
private fun ShellFrame(content: @Composable () -> Unit) =
    CompositionLocalProvider(LocalNavPillInset provides SHELL_NAV_PILL_INSET, content = content)

/**
 * The camera-first trio and the shipments list, as §5.2 draws them: a header row, white cards, the
 * load list the driver counts against, and a sticky bar that carries the job's one action.
 *
 * Each screen is photographed through its own stateless composable — `LoadTruckScreen(s, …)`,
 * `ShipmentLoadScreen(s, …)`, `DeliveryProofScreen(s, …)` — rather than through a copy of its
 * layout: the phase-1b duplication these frames used to carry could (and did) drift away from the
 * production Route it was mirroring. The Routes above them now hold only the camera hand-off, the
 * ViewModel wiring and ruling R5's dwell.
 *
 * Light only (the theme has no dark palette; phase 3's review proved the `_dark` frames were
 * byte-identical), plus font scale 1,3 where a screen has wrapping to prove.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36])
class LogisticsScreenshotTest {
    @get:Rule val rule = createComposeRule()

    // ── Load truck: the order's load list over the photo just taken ──────────────

    private fun loadTruckState(submitting: Boolean = false) = LoadTruckUiState(
        photo = PreparedImage(File("/tmp/load.jpg"), 1280, 853, 180_000),
        order = order(),
        submitting = submitting,
    )

    private fun shootLoadTruck(name: String, s: LoadTruckUiState, extraPhoto: Boolean = false) {
        rule.setContent {
            EtalonTheme {
                ShellFrame {
                    LoadTruckScreen(s = s, extraPhoto = extraPhoto, onBack = {}, onRetake = {}, onSubmit = {})
                }
            }
        }
        rule.onRoot().captureRoboImage("screenshots/load_truck_$name.png")
    }

    @Test @Config(qualifiers = "w411dp-h891dp") fun loadTruckLight() =
        shootLoadTruck("light", loadTruckState())

    /** Attaching another photo to an order that is already loaded: no load list — nothing is going
     *  on a lorry — and «Бириктириш» rather than «Юкланди» on the bar. */
    @Test @Config(qualifiers = "w411dp-h891dp") fun loadTruckExtraLight() =
        shootLoadTruck("extra_light", loadTruckState(), extraPhoto = true)

    /** Ruling R5's result grid, in the bar above the working button. */
    @Test @Config(qualifiers = "w411dp-h891dp") fun loadTruckSubmittingLight() =
        shootLoadTruck("submitting_light", loadTruckState(submitting = true))

    /** The longest title in the trio — «Юк машинасига юклаш» — at font scale 1,3: two lines are
     *  allowed and nothing may clip, header or load list. */
    @Test @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f) fun loadTruckLargeFont() =
        shootLoadTruck("font13", loadTruckState())

    // ── Shipment load: the same list, counted ───────────────────────────────────

    private fun shipmentLoadState() = ShipmentLoadUiState(
        photo = PreparedImage(File("/tmp/load.jpg"), 1280, 853, 180_000),
        order = order(),
        beams = mapOf("6.00" to 3, "5.00" to 2, "4.00" to 1),
        blocks = 15,
        allowance = Allowance(beams = mapOf("6.00" to 10, "5.00" to 8, "4.00" to 6), blocks = 40),
    )

    private fun shootShipmentLoad(name: String) {
        val s = shipmentLoadState()
        rule.setContent {
            EtalonTheme {
                ShellFrame {
                    ShipmentLoadScreen(
                        s = s, onBack = {}, onRetake = {}, onSetBeam = { _, _ -> }, onSetBlocks = {}, onSubmit = {},
                    )
                }
            }
        }
        rule.onRoot().captureRoboImage("screenshots/shipment_load_$name.png")
    }

    @Test @Config(qualifiers = "w411dp-h891dp") fun shipmentLoadLight() = shootShipmentLoad("light")
    @Test @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f) fun shipmentLoadLargeFont() = shootShipmentLoad("font13")

    // ── Delivery proof: the cash hero, the two switches, the note ────────────────

    private fun deliveryProofState() = DeliveryProofUiState(
        photo = PreparedImage(File("/tmp/proof.jpg"), 1280, 853, 180_000),
        amountDigits = "1500000",
        driverReturned = true,
        expected = Money.parse("2000000.00"),
        order = order(),
    )

    @Composable
    private fun DeliveryProof(s: DeliveryProofUiState, barVisible: Boolean = true) = ShellFrame {
        DeliveryProofScreen(
            s = s, onBack = {}, onRetake = {}, onSetAmountDigits = {}, onSetNoCashCollected = {},
            onSetNote = {}, onSetDriverReturned = {}, onSubmit = {},
            // Robolectric reports the ime inset as absent whatever is focused, so the bar is
            // passed in rather than read from the window (ruling R13's seam).
            barVisible = barVisible,
        )
    }

    private fun shootDeliveryProof(name: String, s: DeliveryProofUiState = deliveryProofState(), barVisible: Boolean = true) {
        rule.setContent { EtalonTheme { DeliveryProof(s, barVisible) } }
        rule.onRoot().captureRoboImage("screenshots/delivery_proof_$name.png")
    }

    @Test @Config(qualifiers = "w411dp-h891dp") fun deliveryProofLight() = shootDeliveryProof("light")
    @Test @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f) fun deliveryProofLargeFont() = shootDeliveryProof("font13")

    /** «Нақд олинмади» on: the amount hero recedes, and «Сабабини ёзинг» appears — the one place
     *  the route actually keeps a note. */
    @Test @Config(qualifiers = "w411dp-h891dp") fun deliveryProofNoCashLight() = shootDeliveryProof(
        "no_cash_light",
        deliveryProofState().copy(
            amountDigits = "", noCashCollected = true, note = "Мижоз жойида йўқ эди, эртага тўлайди",
        ),
    )

    /** Ruling R13: the keyboard is up, so the sticky bar is gone and «Изоҳ» is not fighting it for
     *  the bottom of the screen. Robolectric never reports the ime inset, so the seam is driven. */
    @Test @Config(qualifiers = "w411dp-h891dp") fun deliveryProofImeLight() = shootDeliveryProof(
        "ime_light",
        deliveryProofState().copy(noCashCollected = true, amountDigits = "", note = "Мижоз жойида йўқ эди"),
        barVisible = false,
    )

    /**
     * The navy gate over the screen that opened it — reached by tapping «Етказилди» rather than by
     * a flag, because the gate is the button's own state and a frame that composed it directly
     * would not prove the button opens it. The tiles carry «Кутилган» and the 500 000 «Камомад»
     * the driver is agreeing to.
     */
    @OptIn(ExperimentalRoborazziApi::class)
    @Test @Config(qualifiers = "w411dp-h891dp") fun deliveryProofGateLight() {
        val s = deliveryProofState()
        rule.setContent { EtalonTheme { DeliveryProof(s) } }
        rule.onNodeWithText(DELIVERED).performClick()
        rule.waitForIdle()
        captureScreenRoboImage("screenshots/delivery_proof_gate_light.png")
    }

    // ── Shipments: the trucks of one order, each offering its own next step ─────

    private fun shipment(
        id: String, number: Int, status: ShipmentStatus,
        driverName: String? = null, truckIdentifier: String? = null, loadedAt: Instant? = null,
    ) = ShipmentLine(
        id = id, number = number, status = status,
        loadedBeams = if (status == ShipmentStatus.PENDING) emptyMap() else mapOf("6.00" to 3, "4.00" to 1),
        loadedBlocks = if (status == ShipmentStatus.PENDING) null else 15,
        loadedPhotoUrl = null, driverName = driverName, truckIdentifier = truckIdentifier,
        loadedAt = loadedAt,
    )

    /** One truck in each state the screen can draw, so the frame pins all four trailing offers at
     *  once — «Юклаш», «Жўнатиш», «Етказилди», and the finished lorry that offers nothing. Truck 2
     *  carries a REJECTED load (see [shipmentsState]): its own offer is withdrawn and the way out
     *  sits under the row. */
    private fun shipmentsOrder() = order().copy(
        rooms = emptyList(),
        shipments = listOf(
            shipment("s1", 1, ShipmentStatus.PENDING),
            shipment("s2", 2, ShipmentStatus.PENDING),
            shipment("s3", 3, ShipmentStatus.LOADED, driverName = "Дилшод Раҳимов", loadedAt = LOADED_AT),
            shipment("s4", 4, ShipmentStatus.DISPATCHED, driverName = "Дилшод Раҳимов", truckIdentifier = "01 A 123 BC", loadedAt = LOADED_AT),
            shipment("s5", 5, ShipmentStatus.DELIVERED, driverName = "Аброр Юсупов", truckIdentifier = "01 B 456 DE", loadedAt = LOADED_AT),
        ),
    )

    /** Two queued rows, one of each kind the screen draws differently: truck 2's own load, which
     *  the server has REFUSED and which therefore speaks from its row with the reason and the way
     *  out; and an order-level photo still on its way, which has no row and so speaks from the
     *  banner at the top. */
    private fun shipmentsState() = ShipmentsUiState(
        resource = Resource.Success(shipmentsOrder()),
        pendingUploads = listOf(
            PendingUpload(
                id = "u1", kind = OutboxKind.LOAD_SHIPMENT, orderId = "o1", shipmentId = "s2",
                failed = true, attempts = 3, error = "Жўнатма аллақачон юкланган",
            ),
            PendingUpload(
                id = "u2", kind = OutboxKind.ADD_LOADED_PHOTO, orderId = "o1", shipmentId = null,
                failed = false, attempts = 1, error = null,
            ),
        ),
    )

    @Composable
    private fun Shipments(s: ShipmentsUiState) = ShellFrame {
        ShipmentsScreen(
            s = s, now = NOW, onLoadShipment = {}, onDispatch = {}, onBack = {}, onAdd = {},
            onDelete = {}, onDeliver = {}, onRefresh = {},
        )
    }

    private fun shootShipments(name: String) {
        rule.setContent { EtalonTheme { Shipments(shipmentsState()) } }
        rule.onRoot().captureRoboImage("screenshots/shipments_$name.png")
    }

    @Test @Config(qualifiers = "w411dp-h891dp") fun shipmentsLight() = shootShipments("light")
    @Test @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f) fun shipmentsLargeFont() = shootShipments("font13")

    /** The navy question in front of signing for a lorry — reached by tapping «Етказилди» on the
     *  DISPATCHED row rather than by a flag, because the gate is that button's own state. Its tiles
     *  carry who was driving and what went on. */
    @OptIn(ExperimentalRoborazziApi::class)
    @Test @Config(qualifiers = "w411dp-h891dp") fun shipmentsDeliverGateLight() {
        rule.setContent { EtalonTheme { Shipments(shipmentsState()) } }
        rule.clickButton(DELIVERED)
        rule.waitForIdle()
        captureScreenRoboImage("screenshots/shipments_deliver_gate_light.png")
    }

    // ── Dispatch: the order's progress over the form that sends a lorry ─────────

    private fun dispatchState() = DispatchUiState(
        drivers = DRIVERS,
        driverId = "d1",
        truck = "01 A 123 BC",
        amountDigits = "12000000",
        willCollectCash = true,
        order = order(),
    )

    @Composable
    private fun Dispatch(s: DispatchUiState) = ShellFrame {
        DispatchScreen(
            s = s, isShipment = true, onCancel = {}, onSetDriverId = {}, onSetTruck = {},
            onSetWillCollectCash = {}, onSetAmountDigits = {}, onSubmit = {}, onRetryDrivers = {},
            shipmentNumber = 2,
            // Robolectric reports the ime inset as absent whatever is focused, so the bar is
            // passed in rather than read from the window (ruling R13's seam).
            barVisible = true,
        )
    }

    private fun shootDispatch(name: String) {
        rule.setContent { EtalonTheme { Dispatch(dispatchState()) } }
        rule.onRoot().captureRoboImage("screenshots/dispatch_$name.png")
    }

    @Test @Config(qualifiers = "w411dp-h891dp") fun dispatchLight() = shootDispatch("light")
    @Test @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f) fun dispatchLargeFont() = shootDispatch("font13")

    /** The gate the sticky «Жўнатиш» opens: the cash the driver will collect as the hero, and the
     *  driver and lorry he is taking as the two tiles. */
    @OptIn(ExperimentalRoborazziApi::class)
    @Test @Config(qualifiers = "w411dp-h891dp") fun dispatchGateLight() {
        rule.setContent { EtalonTheme { Dispatch(dispatchState()) } }
        rule.clickButton(DISPATCH)
        rule.waitForIdle()
        captureScreenRoboImage("screenshots/dispatch_gate_light.png")
    }

    /**
     * The order behind all four screens: two beam lengths across three rooms, so «Юклаш рўйхати»
     * records both the grouping (two 6,00 m rooms summed into one row) and the first-appearance
     * order — the same shape the order detail's own fixture carries.
     */
    private fun order() = OrderDetail(
        summary = OrderSummary(
            id = "o1", orderNumber = "2026-09-0042", status = OrderStatus.PLACED,
            paymentState = PaymentState.PARTIALLY_PAID,
            totalPrice = Money.parse("48000000.00"), confirmedPaid = Money.parse("20000000.00"),
            totalArea = BigDecimal("310.500"), totalBlocks = 620, totalBeams = 44,
            scheduledAt = Instant.parse("2026-09-10T00:00:00Z"), placedAt = Instant.parse("2026-09-01T00:00:00Z"),
            client = ClientRef("c1", "Каримов Шерзод Абдуллаевич", "998901112233", "Тошкент, Чилонзор"),
        ),
        notes = null,
        deliveryLat = null, deliveryLng = null, deliveryLocationUrl = null, deliveryLocationLabel = null,
        discountAmount = Money.ZERO, deliveryCost = Money.ZERO, otherCost = Money.ZERO,
        roomsSubtotal = Money.ZERO, writeOffAmount = Money.ZERO,
        rooms = listOf(
            room("Зал", beamLength = "6.00", beams = 10, blocks = 260),
            room("Хона 1", beamLength = "5.00", beams = 8, blocks = 200),
            room("Хона 2", beamLength = "6.00", beams = 6, blocks = 160),
        ),
        payments = emptyList(),
        shipments = emptyList(),
        loadedPhotos = emptyList(), deliveryProofUrl = null, events = emptyList(), dispatch = null,
        fetchedAt = Instant.parse("2026-09-04T00:00:00Z"),
    )

    private fun room(name: String, beamLength: String, beams: Int, blocks: Int) = RoomLine(
        name = name, innerWidth = BigDecimal("5.80"), innerLength = BigDecimal("6.40"), pattern = "Г-Б",
        beamLength = BigDecimal(beamLength), beamCount = beams, totalBlocks = blocks,
        billedArea = BigDecimal("37.100"), subtotal = Money.parse("13350000.00"),
    )
}
