package uz.etalon.crm.feature.logistics

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
import uz.etalon.crm.core.image.PreparedImage
import uz.etalon.crm.core.model.ClientRef
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.OrderDetail
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.OrderSummary
import uz.etalon.crm.core.model.PaymentState
import uz.etalon.crm.core.model.Resource
import uz.etalon.crm.core.model.RoomLine
import uz.etalon.crm.core.model.ShipmentLine
import uz.etalon.crm.core.model.ShipmentStatus
import uz.etalon.crm.feature.logistics.delivery.DeliveryProofScreen
import uz.etalon.crm.feature.logistics.delivery.DeliveryProofUiState
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
    private fun DeliveryProof(s: DeliveryProofUiState) = ShellFrame {
        DeliveryProofScreen(
            s = s, onBack = {}, onRetake = {}, onSetAmountDigits = {}, onSetNoCashCollected = {},
            onSetNote = {}, onSetDriverReturned = {}, onSubmit = {},
            // Robolectric reports the ime inset as absent whatever is focused, so the bar is
            // pinned on rather than read from the window (ruling R13's seam).
            barVisible = true,
        )
    }

    private fun shootDeliveryProof(name: String) {
        val s = deliveryProofState()
        rule.setContent { EtalonTheme { DeliveryProof(s) } }
        rule.onRoot().captureRoboImage("screenshots/delivery_proof_$name.png")
    }

    @Test @Config(qualifiers = "w411dp-h891dp") fun deliveryProofLight() = shootDeliveryProof("light")
    @Test @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f) fun deliveryProofLargeFont() = shootDeliveryProof("font13")

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

    // ── Shipments list: one truck in each of the four states ────────────────────

    private fun shipment(id: String, number: Int, status: ShipmentStatus, driverName: String? = null, truckIdentifier: String? = null) = ShipmentLine(
        id = id, number = number, status = status,
        loadedBeams = if (status == ShipmentStatus.PENDING) emptyMap() else mapOf("6.00" to 3, "4.00" to 1),
        loadedBlocks = if (status == ShipmentStatus.PENDING) null else 15,
        loadedPhotoUrl = null, driverName = driverName, truckIdentifier = truckIdentifier,
    )

    /** Task 3 owns this screen's restyle; its fixture is kept exactly as phase 1b left it —
     *  roomless — so `shipments_list_*` does not move under a task that is not rebuilding it. */
    private fun shipmentsOrder() = order().copy(
        rooms = emptyList(),
        shipments = listOf(
            shipment("s1", 1, ShipmentStatus.PENDING),
            shipment("s2", 2, ShipmentStatus.LOADED, driverName = "Дилшод Раҳимов"),
            shipment("s3", 3, ShipmentStatus.DISPATCHED, driverName = "Дилшод Раҳимов", truckIdentifier = "01 A 123 BC"),
            shipment("s4", 4, ShipmentStatus.DELIVERED, driverName = "Аброр Юсупов", truckIdentifier = "01 B 456 DE"),
        ),
    )

    private fun shootShipmentsList(name: String, dark: Boolean) {
        val s = ShipmentsUiState(resource = Resource.Success(shipmentsOrder()))
        rule.setContent { EtalonTheme(darkTheme = dark) { ShellFrame { ShipmentsScreen(s, {}, {}, {}, {}, {}, {}, {}) } } }
        rule.onRoot().captureRoboImage("screenshots/shipments_list_$name.png")
    }

    @Test @Config(qualifiers = "w411dp-h891dp") fun shipmentsListLight() = shootShipmentsList("light", false)
    @Test @Config(qualifiers = "w411dp-h891dp") fun shipmentsListDark() = shootShipmentsList("dark", true)
    @Test @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f) fun shipmentsListLargeFont() = shootShipmentsList("font13", false)

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
