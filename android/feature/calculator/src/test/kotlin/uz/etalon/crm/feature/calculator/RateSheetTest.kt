package uz.etalon.crm.feature.calculator

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import uz.etalon.crm.core.calc.autoPickedRate
import uz.etalon.crm.core.calc.tierPriceMoney
import uz.etalon.crm.core.data.ClientsRepository
import uz.etalon.crm.core.data.PermissionGate
import uz.etalon.crm.core.data.SessionPricing
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.model.Pricing
import uz.etalon.crm.core.testing.FakeEtalonApi
import uz.etalon.crm.core.ui.format.formatMoney

/** The strings the two sheets publish, as `strings.xml` writes them. */
private const val RATE_CELL = "Нарх/м²"
private const val SHEET_TITLE = "Тарифни танланг"
private const val AUTO_ROW = "Авто"
private const val REASON = "Сабаб (мажбурий)"
private const val CONFIRM = "Тасдиқлаш"
private const val CANCEL = "Бекор"

/** «Зал» 5,2 × 7,1 — the §7 fixture, whose beam length puts the engine in the 180 000 bracket, so
 *  one of the five catalogue tiers IS the auto rate (the row that carries the «авто» tag and, by
 *  R2, is not an override at all). */
private const val AUTO_PRICE = 180_000.0
private const val CHEAPEST = 140_000.0
private const val DEAREST = 230_000.0

private class RateInertSessionPricing : SessionPricing {
    override val pricing: StateFlow<Pricing?> = MutableStateFlow(null)
}

/**
 * The one control in the calculator that changes what a customer is charged, driven end to end
 * through a real [CalculatorViewModel]: the rate cell opens [RateSheet]; ruling R2 decides which
 * taps change the quote on the spot and which have to be justified first; D5 makes that
 * justification mandatory.
 *
 * The sheet is deliberately NOT tested in isolation — every one of these rules lives in
 * [CalculatorViewModel.pickRate]/[CalculatorViewModel.confirmRate], and a test of the composable
 * alone would only assert that a lambda was called.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36], qualifiers = "w411dp-h891dp")
class RateSheetTest {
    @get:Rule val rule = createComposeRule()

    private fun viewModel() = CalculatorViewModel(
        session = RateInertSessionPricing(),
        permissions = PermissionGate { true },
        clients = ClientsRepository(object : FakeEtalonApi() {}, PermissionGate { true }),
    )

    /** The card for the quote's one room, wired to [vm] exactly as `CalculatorScreen` wires it. */
    private fun card(vm: CalculatorViewModel) {
        rule.setContent {
            val s by vm.state.collectAsState()
            EtalonTheme {
                Column(Modifier.width(411.dp).background(EtalonColors.page).padding(16.dp)) {
                    val row = s.rows.firstOrNull() ?: return@Column
                    RoomCard(
                        row = row, draft = s.draft(row.id), expanded = false,
                        canMoveUp = false, canMoveDown = false,
                        focusRequester = remember { FocusRequester() }, onNext = null,
                        onNameChange = {}, onWidthChange = {}, onLengthChange = {},
                        onBearingChange = {}, onCorrectionChange = {},
                        onCyclePattern = {}, onToggleExpanded = {},
                        onExtraBeams = {}, onForceStartBeam = {},
                        onDuplicate = {}, onDelete = {}, onMoveUp = {}, onMoveDown = {},
                        rateConfirmPrice = s.rateConfirm?.takeIf { it.rowId == row.id }?.price,
                        onPickRate = { price -> vm.pickRate(row.id, price) },
                        onConfirmRate = vm::confirmRate,
                        onDismissRateConfirm = vm::dismissRateConfirm,
                    )
                }
            }
        }
        rule.waitForIdle()
    }

    /** One priced room, typed into the ViewModel the way the screen types into it. */
    private fun quote(vm: CalculatorViewModel): String {
        vm.addRoom()
        val id = vm.state.value.rows[0].id
        vm.setWidthText(id, "5,2")
        vm.setLengthText(id, "7,1")
        return id
    }

    private fun row(vm: CalculatorViewModel) = vm.state.value.rows.first()

    private fun openSheet() {
        rule.onNodeWithText(RATE_CELL).performClick()
        rule.waitForIdle()
        rule.onNodeWithText(SHEET_TITLE).assertExists()
    }

    private fun money(price: Double) = formatMoney(tierPriceMoney(price))

    @Test fun `the sheet offers Авто and the five catalogue tiers, and nothing else`() {
        val vm = viewModel()
        quote(vm)
        card(vm)
        openSheet()

        rule.onNodeWithText(AUTO_ROW).assertExists()
        listOf(140_000.0, 160_000.0, 180_000.0, 200_000.0, 230_000.0)
            .forEach { rule.onNodeWithText(money(it)).assertExists() }
        // The auto row's own sub names the rate the engine picked — this fixture's 180 000.
        rule.onNodeWithText("${money(AUTO_PRICE)} · енг тарифи").assertExists()
    }

    /** R2's first branch: «Авто» is not an override, so it needs no reason and asks for none. */
    @Test fun `Авто clears an override on the spot, with no confirmation`() {
        val vm = viewModel()
        val id = quote(vm)
        vm.applyRateOverride(id, DEAREST, "Йирик буюртма")
        card(vm)
        openSheet()

        rule.onNodeWithText(AUTO_ROW).performClick()
        rule.waitForIdle()

        assertFalse("the override is gone", row(vm).m2PriceOverride)
        assertNull(row(vm).m2PriceOverrideValue)
        assertNull("no confirmation was ever opened", vm.state.value.rateConfirm)
        rule.onNodeWithText(SHEET_TITLE).assertDoesNotExist()
    }

    /**
     * R2's second branch, and the reason the «авто» tag exists: picking the tier that EQUALS the
     * auto-picked rate changes nothing on the quote, so it is not an override and must not open a
     * confirmation an operator would then have to invent a reason for.
     */
    @Test fun `the tier equal to the auto rate clears instead of asking for a reason`() {
        val vm = viewModel()
        val id = quote(vm)
        assertEquals("the fixture's auto rate", AUTO_PRICE, autoPickedRate(row(vm)), 0.0)
        vm.applyRateOverride(id, CHEAPEST, "Эски келишув")
        card(vm)
        openSheet()

        rule.onNodeWithText(money(AUTO_PRICE)).performClick()
        rule.waitForIdle()

        assertFalse(row(vm).m2PriceOverride)
        assertNull(vm.state.value.rateConfirm)
        rule.onNodeWithText(CONFIRM).assertDoesNotExist()
    }

    /** D5: every other tier is a real override, and «Тасдиқлаш» waits for the reason. */
    @Test fun `another tier opens the confirmation, disabled until a reason is typed`() {
        val vm = viewModel()
        quote(vm)
        card(vm)
        openSheet()

        rule.onNodeWithText(money(DEAREST)).performClick()
        rule.waitForIdle()

        assertEquals(DEAREST, vm.state.value.rateConfirm?.price)
        assertFalse("nothing is applied yet", row(vm).m2PriceOverride)
        // The confirmation replaces the price list rather than stacking over it.
        rule.onNodeWithText(SHEET_TITLE).assertDoesNotExist()
        rule.onNodeWithText("↑ устама").assertExists()
        rule.onNodeWithText(CONFIRM).assertIsNotEnabled()

        rule.onNodeWithContentDescription(REASON).performTextInput("Йирик буюртма")
        rule.onNodeWithText(CONFIRM).assertIsEnabled()
    }

    @Test fun `confirming with a reason applies the tier and takes both sheets away`() {
        val vm = viewModel()
        quote(vm)
        card(vm)
        openSheet()
        rule.onNodeWithText(money(DEAREST)).performClick()
        rule.waitForIdle()

        rule.onNodeWithContentDescription(REASON).performTextInput("Йирик буюртма")
        rule.onNodeWithText(CONFIRM).performClick()
        rule.waitForIdle()

        val r = row(vm)
        assertTrue(r.m2PriceOverride)
        assertEquals(DEAREST, r.m2PriceOverrideValue)
        assertEquals("Йирик буюртма", r.m2PriceReason)
        assertNull(vm.state.value.rateConfirm)
        rule.onNodeWithText(CONFIRM).assertDoesNotExist()
        rule.onNodeWithText(SHEET_TITLE).assertDoesNotExist()
    }

    /** «Бекор» is a step back, not a way out: the price list is still open behind it, which is
     *  what the operator was looking at when they mis-tapped. */
    @Test fun `cancelling the confirmation returns to the price list with nothing applied`() {
        val vm = viewModel()
        quote(vm)
        card(vm)
        openSheet()
        rule.onNodeWithText(money(CHEAPEST)).performClick()
        rule.waitForIdle()

        rule.onNodeWithText(CANCEL).performClick()
        rule.waitForIdle()

        assertNull(vm.state.value.rateConfirm)
        assertFalse(row(vm).m2PriceOverride)
        rule.onNodeWithText(SHEET_TITLE).assertExists()
    }

    /** A tier BELOW the engine's is a discount, not a mark-up — the direction is the whole point
     *  of the second tile, and getting it backwards would read as the opposite decision. */
    @Test fun `a cheaper tier reads as a discount`() {
        val vm = viewModel()
        quote(vm)
        card(vm)
        openSheet()
        rule.onNodeWithText(money(CHEAPEST)).performClick()
        rule.waitForIdle()

        rule.onNodeWithText("↓ чегирма").assertExists()
        rule.onNodeWithText("↑ устама").assertDoesNotExist()
    }

    /**
     * D5 again, from the other side: a reason already on file belongs to the rate it was written
     * for. Re-opening the confirmation on a DIFFERENT tier must start empty — a pre-filled sentence
     * about the previous price would leave «Тасдиқлаш» live from the first frame, and the mandatory
     * reason would be one tap away from meaning nothing.
     */
    @Test fun `a second override does not inherit the first one's reason`() {
        val vm = viewModel()
        quote(vm)
        card(vm)
        openSheet()
        rule.onNodeWithText(money(DEAREST)).performClick()
        rule.waitForIdle()
        rule.onNodeWithContentDescription(REASON).performTextInput("Йирик буюртма")
        rule.onNodeWithText(CONFIRM).performClick()
        rule.waitForIdle()
        assertEquals("Йирик буюртма", row(vm).m2PriceReason)

        openSheet()
        rule.onNodeWithText(money(CHEAPEST)).performClick()
        rule.waitForIdle()

        rule.onNodeWithText(CONFIRM).assertIsNotEnabled()
        rule.onNodeWithText("Йирик буюртма").assertDoesNotExist()
    }

    /** …and the same tier DOES come back with what was written for it, so rewording a reason is not
     *  retyping it. The rule is one expression: [reasonSeed]. */
    @Test fun `re-opening the same override shows the reason on file`() {
        val vm = viewModel()
        quote(vm)
        card(vm)
        openSheet()
        rule.onNodeWithText(money(DEAREST)).performClick()
        rule.waitForIdle()
        rule.onNodeWithContentDescription(REASON).performTextInput("Йирик буюртма")
        rule.onNodeWithText(CONFIRM).performClick()
        rule.waitForIdle()

        openSheet()
        rule.onNodeWithText(money(DEAREST)).performClick()
        rule.waitForIdle()

        rule.onNodeWithText("Йирик буюртма").assertExists()
        rule.onNodeWithText(CONFIRM).assertIsEnabled()
    }

    /**
     * `RoomCalcInputBaseSchema.m2PriceReason` is capped at 200 server-side, so the field caps at
     * 200 here — a 201st character is never typed rather than 422'd after the customer has waited.
     * The counter says so while it is being typed.
     */
    @Test fun `the reason stops at two hundred characters, and the counter says so`() {
        val vm = viewModel()
        quote(vm)
        card(vm)
        openSheet()
        rule.onNodeWithText(money(DEAREST)).performClick()
        rule.waitForIdle()

        rule.onNodeWithContentDescription(REASON).performTextInput("а".repeat(MAX_REASON + 1))
        rule.waitForIdle()

        rule.onNodeWithText("$MAX_REASON / $MAX_REASON").assertExists()
        rule.onNodeWithText(CONFIRM).performClick()
        rule.waitForIdle()
        assertEquals(MAX_REASON, row(vm).m2PriceReason?.length)
    }
}
