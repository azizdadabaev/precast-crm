package uz.etalon.crm.feature.calculator

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextInput
import com.github.takahirom.roborazzi.captureScreenRoboImage
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import uz.etalon.crm.core.calc.SlabRow
import uz.etalon.crm.core.calc.autoPickedRate
import uz.etalon.crm.core.calc.beamSchedule
import uz.etalon.crm.core.calc.computeOrderTotals
import uz.etalon.crm.core.calc.projectTotals
import uz.etalon.crm.core.calc.recomputeRow
import uz.etalon.crm.core.data.ClientsRepository
import uz.etalon.crm.core.data.PermissionGate
import uz.etalon.crm.core.data.SessionPricing
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.model.Pricing
import uz.etalon.crm.core.testing.FakeEtalonApi
import uz.etalon.crm.core.ui.regions.ParsedAddress
import java.time.LocalDate

/** §7's first fixture — «Зал» 5,2 × 7,1, whose beam length puts the engine in the 180 000 bracket. */
private const val AUTO_PRICE = 180_000.0
/** The tier the frame chooses over it: a mark-up, and the direction the second tile must show. */
private const val CHOSEN_PRICE = 230_000.0

/** The capture's own customer and the costs agreed with them. */
private const val CLIENT_NAME = "Karimov LLC"
private const val CLIENT_PHONE = "935554466"
private const val DISCOUNT_PERCENT = 5.0
private const val DELIVERY = 300_000.0

/** A fixed day, never `LocalDate.now()`: a baseline that re-dates itself every morning fails
 *  `verifyRoborazziDebug` on a frame nobody has touched. */
private val SCHEDULED = LocalDate.of(2026, 9, 20)

/** «Навбатга қўйиш», the offline half of the action pair. */
private const val QUEUE = "Навбатга қўйиш"

private class SheetsInertSessionPricing : SessionPricing {
    override val pricing: StateFlow<Pricing?> = MutableStateFlow(null)
}

/**
 * The three modal sheets §3.4 gives the calculator: «Тарифни танланг» (RateSheet), the navy
 * «Нархни ўзгартириш» confirmation (RateConfirm) and «Буюртмани расмийлаштириш» (PlaceOrderSheet,
 * carrying D10's relocated discount, delivery and other cost).
 *
 * Whole-screen captures, not `onRoot()`: each is a `ModalBottomSheet` living in a window of its
 * own, and the scrim behind it is part of what §3.4 specifies.
 *
 * Light only (D6). Every figure is the engine's — the rooms are recomputed here and rolled up by
 * `computeOrderTotals`, exactly as `CalculatorViewModel.withTotals` does it.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w411dp-h891dp")
class CalculatorSheetsScreenshotTest {
    @get:Rule val rule = createComposeRule()

    private fun zal(): SlabRow = recomputeRow(SlabRow(id = "zal", name = "Зал", innerWidth = 5.2, innerLength = 7.1))

    /** The §7 fixtures as a placeable quote: three priced rooms, the full client, and D10's two
     *  agreed costs. Built the way `withTotals` builds it — PERCENT mode passes 0 as the amount. */
    private fun placeableState(queueOffered: Boolean = false): CalculatorUiState {
        val rows = listOf(
            zal(),
            recomputeRow(SlabRow(id = "r2", name = "Хона 1", innerWidth = 4.0, innerLength = 6.0)),
            recomputeRow(SlabRow(id = "r3", name = "Ошхона", innerWidth = 3.6, innerLength = 4.5)),
        )
        return CalculatorUiState(
            rows = rows,
            drafts = rows.associate { it.id to draftOf(it) },
            discountMode = DiscountMode.PERCENT,
            discountPercent = DISCOUNT_PERCENT,
            deliveryCost = DELIVERY,
            totals = projectTotals(rows, DISCOUNT_PERCENT, 0.0),
            orderTotals = computeOrderTotals(rows, DISCOUNT_PERCENT, 0.0, DELIVERY, 0.0),
            schedule = beamSchedule(rows),
            canWrite = true,
            clientName = CLIENT_NAME,
            clientPhoneDigits = CLIENT_PHONE,
            clientAddress = ParsedAddress("Самарқанд", "Регистон", "Мирзо кўчаси, 14"),
            clientFormOpen = false,
            queueOffered = queueOffered,
        )
    }

    /** The sheet edits the three money fields THROUGH the ViewModel, so it needs one; these frames
     *  photograph a state that is already typed, so nothing here is ever called. */
    private fun vm() = CalculatorViewModel(
        session = SheetsInertSessionPricing(),
        permissions = PermissionGate { true },
        clients = ClientsRepository(object : FakeEtalonApi() {}, PermissionGate { true }),
    )

    private fun screen(content: @androidx.compose.runtime.Composable () -> Unit) {
        rule.setContent {
            EtalonTheme {
                Box(Modifier.fillMaxSize().background(EtalonColors.page)) { content() }
            }
        }
        rule.waitForIdle()
    }

    /** «Тарифни танланг»: «Авто» selected over the room's own 180 000, and the catalogue tier that
     *  equals it carrying the «авто» mini tag — the row that looks like an override and is not. */
    @Test fun rateSheetLight() {
        val row = zal()
        assertEquals("the tagged tier is the engine's own pick", AUTO_PRICE, autoPickedRate(row), 0.0)
        screen { RateSheet(row = row, onDismiss = {}, onPick = {}) }
        captureScreenRoboImage("screenshots/rate_sheet_light.png")
    }

    /** The navy confirmation for 230 000 against an auto 180 000 — «↑ устама», with the mandatory
     *  reason typed so «Тасдиқлаш» is live and the counter reads a real figure (D5). */
    @Test fun rateConfirmLight() {
        screen { RateConfirm(row = zal(), price = CHOSEN_PRICE, onDismiss = {}, onConfirm = {}) }
        rule.onNodeWithContentDescription("Сабаб (мажбурий)").performTextInput("Йирик буюртма")
        rule.waitForIdle()
        captureScreenRoboImage("screenshots/rate_confirm_light.png")
    }

    /** «Буюртмани расмийлаштириш» with everything filled in: the client, a date, D10's 5 % discount
     *  and 300 000 delivery, and the roll-up they produce. */
    @Test fun placeOrderLight() {
        val s = placeableState()
        screen {
            PlaceOrderSheet(
                state = s, vm = vm(), onDismiss = {}, onPlace = { _, _ -> }, onQueue = { _, _ -> },
                initialScheduledAt = SCHEDULED,
            )
        }
        // The two relocated figures are on the sheet, and the roll-up is the engine's.
        rule.onNodeWithText("Чегирма 5%").assertExists()
        rule.onNodeWithText("Етказиш").assertExists()
        captureScreenRoboImage("screenshots/place_order_light.png")
    }

    /**
     * The same sheet after a placement died on the network: «Навбатга қўйиш» appears under the
     * primary action, and only then (a server refusal is not queueable).
     *
     * Scrolled to the foot, unlike [placeOrderLight]: the form plus the roll-up is taller than a
     * 411 × 891 phone, so the two actions are exactly what the other frame cannot show.
     */
    @Test fun placeOrderQueueLight() {
        val s = placeableState(queueOffered = true)
        screen {
            PlaceOrderSheet(
                state = s, vm = vm(), onDismiss = {}, onPlace = { _, _ -> }, onQueue = { _, _ -> },
                initialScheduledAt = SCHEDULED,
            )
        }
        rule.onNode(hasScrollAction()).performScrollToNode(hasText(QUEUE))
        rule.waitForIdle()
        rule.onNodeWithText(QUEUE).assertExists()
        captureScreenRoboImage("screenshots/place_order_queue_light.png")
    }
}
