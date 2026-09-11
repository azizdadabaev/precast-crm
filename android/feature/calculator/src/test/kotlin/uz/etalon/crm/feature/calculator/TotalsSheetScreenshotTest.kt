package uz.etalon.crm.feature.calculator

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import com.github.takahirom.roborazzi.captureRoboImage
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import uz.etalon.crm.core.calc.SlabRow
import uz.etalon.crm.core.calc.beamSchedule
import uz.etalon.crm.core.calc.computeOrderTotals
import uz.etalon.crm.core.calc.projectTotals
import uz.etalon.crm.core.calc.recomputeRow
import uz.etalon.crm.core.data.ClientsRepository
import uz.etalon.crm.core.data.PermissionGate
import uz.etalon.crm.core.data.RejectedOrder
import uz.etalon.crm.core.data.SessionPricing
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.model.Pricing
import uz.etalon.crm.core.testing.FakeEtalonApi

private class TotalsSheetInertSessionPricing : SessionPricing {
    override val pricing: StateFlow<Pricing?> = MutableStateFlow(null)
}

/**
 * [TotalsSheet] renders its full content unconditionally — collapsing is purely
 * `BottomSheetScaffold`'s `sheetPeekHeight` clipping the same composition (see the composable's
 * own KDoc), not a branch inside it. So the "collapsed" baseline below is the SAME composition as
 * "expanded", just clipped to the peek height the way `CalculatorScreen` clips it in the real app;
 * "expanded" captures the whole thing at its natural height.
 *
 * The "collapsed" fixture must reproduce the WHOLE sheet the way `BottomSheetScaffold` builds it,
 * not just [TotalsSheet]'s own content: Material3 draws its default drag handle
 * ([BottomSheetDefaults.DragHandle]) above `sheetContent`, and `sheetPeekHeight`
 * ([CalculatorScreen]'s [CALC_SHEET_PEEK_HEIGHT]) measures both together. An earlier version of
 * this fixture clipped a bare, handle-less [TotalsSheet] to `88.dp` — a peek the app never
 * actually draws — so it stayed green while the real screen clipped the grand total the operator
 * reads out loud (see task-6 report). Rendering the handle here and sharing
 * [CALC_SHEET_PEEK_HEIGHT] with the real screen is what makes this fixture move if that ever
 * regresses again, in either direction — a bigger handle, more of [TotalsSheet]'s own top padding,
 * or a taller peek row.
 */
@OptIn(ExperimentalMaterial3Api::class)
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36])
class TotalsSheetScreenshotTest {
    @get:Rule val rule = createComposeRule()

    private fun room(id: String, name: String, width: Double, length: Double) =
        recomputeRow(SlabRow(id = id, name = name, innerWidth = width, innerLength = length))

    /** Two priced rooms of different beam lengths (so the production list groups into two rows,
     *  descending) plus delivery/other both set — the case the task exists for: the headline total
     *  must differ from `totals.projTotal.total` because these are non-zero. `totals`/`orderTotals`/
     *  `schedule` are computed the same way `CalculatorViewModel.withTotals` does, so the sheet
     *  shows real numbers instead of the empty-state defaults. */
    private fun state(): CalculatorUiState {
        val rows = listOf(room("r1", "Хона 1", 4.0, 6.0), room("r2", "Хона 2", 5.0, 5.0))
        val discountPercent = 10.0
        val deliveryCost = 150_000.0
        val otherCost = 25_000.0
        return CalculatorUiState(
            rows = rows,
            discountMode = DiscountMode.PERCENT, discountPercent = discountPercent,
            deliveryCost = deliveryCost, otherCost = otherCost,
            totals = projectTotals(rows, discountPercent, 0.0),
            orderTotals = computeOrderTotals(rows, discountPercent, 0.0, deliveryCost, otherCost),
            schedule = beamSchedule(rows),
            canWrite = true,
        )
    }

    private fun vm() = CalculatorViewModel(
        session = TotalsSheetInertSessionPricing(), permissions = PermissionGate { false },
        clients = ClientsRepository(object : FakeEtalonApi() {}, PermissionGate { false }),
    )

    private fun shootCollapsed(name: String) {
        rule.setContent {
            EtalonTheme() {
                Box(Modifier.height(CALC_SHEET_PEEK_HEIGHT).clipToBounds()) {
                    Column(Modifier.fillMaxWidth()) {
                        BottomSheetDefaults.DragHandle()
                        TotalsSheet(state = state(), vm = vm()) {}
                    }
                }
            }
        }
        rule.onRoot().captureRoboImage("screenshots/totals_sheet_collapsed_$name.png")
    }

    private fun shootExpanded(name: String) {
        rule.setContent {
            EtalonTheme() { TotalsSheet(state = state(), vm = vm()) {} }
        }
        rule.onRoot().captureRoboImage("screenshots/totals_sheet_expanded_$name.png")
    }

    /** The sheet's own `actions` slot, filled the way `CalculatorRoute` fills it. Every other
     *  fixture in this file — and in `CalculatorScreenshotTest` — passes `{}` there, so
     *  «Буюртма бериш»/«Тозалаш»/«Лойиҳани сақлаш», the save notice, the refusal banner and the
     *  rejected-order row had no baseline at all; all four could have been laid out wrongly, or
     *  been missing outright, with the whole suite green.
     *
     *  The two `assertIsDisplayed` calls are not decoration: the notice dismisses itself after
     *  2.5 s (`SAVE_MESSAGE_AUTO_DISMISS_MS`), and a baseline recorded after that had elapsed
     *  would silently pin a frame WITHOUT it. */
    private fun shootActions(name: String) {
        val s = state().copy(
            error = "Бу хоналарни сақлаб бўлмайди: Хона 3",
            saveMessage = "Лойиҳа сақланди",
            rejectedOrders = listOf(
                RejectedOrder(id = "row-1", clientName = "Азиз Дадамов", message = "Мижоз манзили керак"),
            ),
        )
        val vm = vm()
        rule.setContent {
            EtalonTheme() {
                TotalsSheet(state = s, vm = vm) { CalculatorActions(state = s, vm = vm) }
            }
        }
        rule.onNodeWithText("Лойиҳа сақланди").assertIsDisplayed()
        rule.onNodeWithText("Бу хоналарни сақлаб бўлмайди: Хона 3").assertIsDisplayed()
        rule.onRoot().captureRoboImage("screenshots/totals_sheet_actions_$name.png")
    }

    @Test @Config(qualifiers = "w411dp-h891dp") fun collapsedLight() = shootCollapsed("light")

    @Test @Config(qualifiers = "w411dp-h891dp") fun expandedLight() = shootExpanded("light")

    // A taller-than-a-phone canvas on purpose: the whole action group — the refusal banner, the
    // rejected-order row, the notice and all four buttons — is what this baseline exists for, and
    // on a real 891dp screen the operator reaches «Тозалаш»/«Лойиҳани сақлаш» by scrolling the
    // sheet, which one captured frame cannot do.
    @Test @Config(qualifiers = "w411dp-h1200dp") fun actionsLight() = shootActions("light")
}
