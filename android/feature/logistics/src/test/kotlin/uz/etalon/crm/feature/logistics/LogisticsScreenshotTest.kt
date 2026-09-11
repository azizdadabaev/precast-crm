package uz.etalon.crm.feature.logistics

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import uz.etalon.crm.core.designsystem.components.CountStepper
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.MoneyHeroText
import uz.etalon.crm.core.designsystem.components.PrimaryButton
import uz.etalon.crm.core.designsystem.components.SecondaryButton
import uz.etalon.crm.core.designsystem.components.StickyActionBar
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.designsystem.theme.LocalEtalonColors
import uz.etalon.crm.core.image.PreparedImage
import uz.etalon.crm.core.model.ClientRef
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.OrderDetail
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.OrderSummary
import uz.etalon.crm.core.model.PaymentState
import uz.etalon.crm.core.model.Resource
import uz.etalon.crm.core.model.ShipmentLine
import uz.etalon.crm.core.model.ShipmentStatus
import uz.etalon.crm.core.ui.format.formatMoney
import uz.etalon.crm.feature.logistics.delivery.DeliveryProofUiState
import uz.etalon.crm.feature.logistics.delivery.DeliveryProofViewModel
import uz.etalon.crm.feature.logistics.shipments.Allowance
import uz.etalon.crm.feature.logistics.shipments.ShipmentLoadUiState
import uz.etalon.crm.feature.logistics.shipments.ShipmentLoadViewModel
import uz.etalon.crm.feature.logistics.shipments.ShipmentsScreen
import uz.etalon.crm.feature.logistics.shipments.ShipmentsUiState
import java.io.File
import java.math.BigDecimal
import java.time.Instant

/**
 * Neither [uz.etalon.crm.feature.logistics.delivery.DeliveryProofRoute] nor
 * [uz.etalon.crm.feature.logistics.shipments.ShipmentLoadRoute] exposes a stateless composable the
 * way [ShipmentsScreen] does (`ShipmentsScreen(s, ...)` vs. `ShipmentsRoute`) — the whole
 * post-photo layout lives inline in the Route, coupled to the concrete Hilt-injected ViewModel
 * class. Rather than touch that production code just to make it screenshot-testable, the two
 * private `*Preview` composables below reproduce that layout verbatim against the plain,
 * Hilt-free `DeliveryProofViewModel`/`ShipmentLoadViewModel` base classes, which already take
 * nothing but a lambda. Every widget they call (StickyActionBar, MoneyText, CountStepper, ...) is
 * the real production component; only the Scaffold/Column wiring around them is duplicated. See
 * the task-16 report for the recommendation to extract a real stateless composable for both
 * screens so this duplication is not needed.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36])
class LogisticsScreenshotTest {
    @get:Rule val rule = createComposeRule()

    // ── Delivery proof: a photo, an amount, and a shortfall ──────────────────────

    private fun deliveryProofState(): DeliveryProofUiState {
        val vm = DeliveryProofViewModel("o1", expected = Money.parse("2000000.00"), submit = { _, _ -> Result.success("ob") })
        vm.onPhoto(PreparedImage(File("/tmp/proof.jpg"), 1280, 853, 180_000))
        vm.setAmountDigits("1500000")
        return vm.state.value
    }

    @OptIn(ExperimentalMaterial3Api::class)
    @Composable
    private fun DeliveryProofPreview(s: DeliveryProofUiState) {
        Scaffold(
            topBar = { TopAppBar(title = { Text(stringResource(R.string.delivery_proof_title)) }) },
            bottomBar = {
                // Verbatim with the Route, the nav-pill clearance included — a preview that
                // stopped mirroring it would keep a baseline of a bar the app no longer draws there.
                StickyActionBar {
                    SecondaryButton(stringResource(R.string.action_retake), onClick = {}, modifier = Modifier.weight(1f))
                    PrimaryButton(stringResource(R.string.action_mark_delivered), onClick = {}, loading = s.submitting, modifier = Modifier.weight(1f))
                }
            },
        ) { pad ->
            Column(
                Modifier.padding(pad).padding(16.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                if (s.error != null) ErrorBanner(s.error)
                AsyncImage(
                    model = s.photo!!.file, contentDescription = null, contentScale = ContentScale.Fit,
                    modifier = Modifier.fillMaxWidth().height(180.dp),
                )
                Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(stringResource(R.string.delivery_cash_label), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    MoneyHeroText(s.amount, style = EtalonType.monoDisplay)
                    Text(stringResource(R.string.delivery_expected, formatMoney(s.expected)), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (!s.noCashCollected && !s.shortfall.isZero) {
                        Text(stringResource(R.string.delivery_shortfall, formatMoney(s.shortfall)), style = MaterialTheme.typography.bodyMedium, color = LocalEtalonColors.current.danger)
                    }
                    if (!s.noCashCollected && !s.overCollected.isZero) {
                        Text(stringResource(R.string.delivery_overcollected, formatMoney(s.overCollected)), style = MaterialTheme.typography.bodyMedium, color = LocalEtalonColors.current.danger)
                    }
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text(stringResource(R.string.delivery_no_cash))
                    Switch(checked = s.noCashCollected, onCheckedChange = {})
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text(stringResource(R.string.delivery_driver_returned))
                    Switch(checked = s.driverReturned, onCheckedChange = {})
                }
                Text(stringResource(R.string.upload_queued_hint), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }

    private fun shootDeliveryProof(name: String, dark: Boolean) {
        val s = deliveryProofState()
        rule.setContent { EtalonTheme(darkTheme = dark) { DeliveryProofPreview(s) } }
        rule.onRoot().captureRoboImage("screenshots/delivery_proof_$name.png")
    }

    @Test @Config(qualifiers = "w411dp-h891dp") fun deliveryProofLight() = shootDeliveryProof("light", false)
    @Test @Config(qualifiers = "w411dp-h891dp") fun deliveryProofDark() = shootDeliveryProof("dark", true)
    @Test @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f) fun deliveryProofLargeFont() = shootDeliveryProof("font13", false)

    // ── Shipment load: three beam steppers and a block stepper ──────────────────

    private fun shipmentLoadState(): ShipmentLoadUiState {
        val allowance = Allowance(beams = mapOf("6.00" to 10, "5.00" to 8, "4.00" to 6), blocks = 40)
        val vm = ShipmentLoadViewModel("o1", "s1", initialAllowance = allowance, load = { _, _, _, _, _ -> Result.success("ob") })
        vm.onPhoto(PreparedImage(File("/tmp/load.jpg"), 1280, 853, 180_000))
        vm.setBeam("6.00", 3)
        vm.setBeam("5.00", 2)
        vm.setBeam("4.00", 1)
        vm.setBlocks(15)
        return vm.state.value
    }

    @OptIn(ExperimentalMaterial3Api::class)
    @Composable
    private fun ShipmentLoadPreview(s: ShipmentLoadUiState) {
        Scaffold(
            topBar = { TopAppBar(title = { Text(stringResource(R.string.shipment_load_title)) }) },
            bottomBar = {
                // Verbatim with the Route, the nav-pill clearance included.
                StickyActionBar {
                    SecondaryButton(stringResource(R.string.action_retake), onClick = {}, modifier = Modifier.weight(1f))
                    PrimaryButton(stringResource(R.string.action_mark_loaded), onClick = {}, loading = s.submitting, modifier = Modifier.weight(1f))
                }
            },
        ) { pad ->
            Column(
                Modifier.padding(pad).padding(16.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                if (s.error != null) ErrorBanner(s.error)
                AsyncImage(
                    model = s.photo!!.file, contentDescription = null, contentScale = ContentScale.Fit,
                    modifier = Modifier.fillMaxWidth().height(180.dp),
                )
                s.allowance.beams.entries.sortedBy { it.key.toDoubleOrNull() ?: 0.0 }.forEach { (lengthKey, max) ->
                    CountStepper(
                        label = stringResource(R.string.beam_length_label, lengthKey.replace('.', ',')),
                        value = s.beams[lengthKey] ?: 0, onChange = {}, max = max,
                    )
                }
                CountStepper(label = stringResource(R.string.blocks_label), value = s.blocks, onChange = {}, max = s.allowance.blocks)
                Text(stringResource(R.string.upload_queued_hint), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }

    private fun shootShipmentLoad(name: String, dark: Boolean) {
        val s = shipmentLoadState()
        rule.setContent { EtalonTheme(darkTheme = dark) { ShipmentLoadPreview(s) } }
        rule.onRoot().captureRoboImage("screenshots/shipment_load_$name.png")
    }

    @Test @Config(qualifiers = "w411dp-h891dp") fun shipmentLoadLight() = shootShipmentLoad("light", false)
    @Test @Config(qualifiers = "w411dp-h891dp") fun shipmentLoadDark() = shootShipmentLoad("dark", true)
    @Test @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f) fun shipmentLoadLargeFont() = shootShipmentLoad("font13", false)

    // ── Shipments list: one truck in each of the four states ────────────────────

    private fun shipment(id: String, number: Int, status: ShipmentStatus, driverName: String? = null, truckIdentifier: String? = null) = ShipmentLine(
        id = id, number = number, status = status,
        loadedBeams = if (status == ShipmentStatus.PENDING) emptyMap() else mapOf("6.00" to 3, "4.00" to 1),
        loadedBlocks = if (status == ShipmentStatus.PENDING) null else 15,
        loadedPhotoUrl = null, driverName = driverName, truckIdentifier = truckIdentifier,
    )

    private fun shipmentsOrder() = OrderDetail(
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
        rooms = emptyList(), payments = emptyList(),
        shipments = listOf(
            shipment("s1", 1, ShipmentStatus.PENDING),
            shipment("s2", 2, ShipmentStatus.LOADED, driverName = "Дилшод Раҳимов"),
            shipment("s3", 3, ShipmentStatus.DISPATCHED, driverName = "Дилшод Раҳимов", truckIdentifier = "01 A 123 BC"),
            shipment("s4", 4, ShipmentStatus.DELIVERED, driverName = "Аброр Юсупов", truckIdentifier = "01 B 456 DE"),
        ),
        loadedPhotos = emptyList(), deliveryProofUrl = null, events = emptyList(), dispatch = null,
        fetchedAt = Instant.parse("2026-09-04T00:00:00Z"),
    )

    private fun shootShipmentsList(name: String, dark: Boolean) {
        val s = ShipmentsUiState(resource = Resource.Success(shipmentsOrder()))
        rule.setContent { EtalonTheme(darkTheme = dark) { ShipmentsScreen(s, {}, {}, {}, {}, {}, {}, {}) } }
        rule.onRoot().captureRoboImage("screenshots/shipments_list_$name.png")
    }

    @Test @Config(qualifiers = "w411dp-h891dp") fun shipmentsListLight() = shootShipmentsList("light", false)
    @Test @Config(qualifiers = "w411dp-h891dp") fun shipmentsListDark() = shootShipmentsList("dark", true)
    @Test @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f) fun shipmentsListLargeFont() = shootShipmentsList("font13", false)
}
