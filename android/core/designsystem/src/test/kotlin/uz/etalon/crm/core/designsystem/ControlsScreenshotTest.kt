package uz.etalon.crm.core.designsystem

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.unit.dp
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import uz.etalon.crm.core.designsystem.components.EtalonFilterChip
import uz.etalon.crm.core.designsystem.components.SearchField
import uz.etalon.crm.core.designsystem.components.SegmentItem
import uz.etalon.crm.core.designsystem.components.SegmentedControl
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.designsystem.theme.EtalonType

/** §3.2's own row, counts included, with «Қабул» selected. */
private val CHIPS = listOf(
    "Барчаси" to 9, "Қабул" to 1, "Ишлаб чиқариш" to 1, "Йўлда" to null, "Етказилган" to 5,
)

private val LIST_SEGMENTS = listOf(
    SegmentItem("Барчаси", 9), SegmentItem("Қарз", 6), SegmentItem("Тўланган", 3),
)

private val PAYMENT_SEGMENTS = listOf(
    SegmentItem("Кутилмоқда", 3), SegmentItem("Тасдиқланган", 3), SegmentItem("Рад этилган", 1),
)

/**
 * §2's navigation and filtering furniture in one sheet: the search field idle and typed, the chip
 * row idle / selected / counted, and the switch on both of its grounds — navy2 on a navy sheet
 * (§3.2's «Рўйхат» header) and navy on the light page (§3.5's payments filter). Compare with
 * `2b-orders.png` for the first three and `2b-payments.png` for the last.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w411dp-h891dp")
class ControlsScreenshotTest {
    @get:Rule val rule = createComposeRule()

    @Test fun controlsLight() {
        rule.setContent { EtalonTheme { ControlsSheet() } }
        rule.onRoot().captureRoboImage("screenshots/ds_controls_light.png")
    }

    /**
     * D7 on the two controls that paint below 48 dp: a chip is drawn 32 dp tall and a switch item
     * 30 dp, and both must still hold a 48 dp slot. Only the chips and the segments are composed
     * here so that every clickable node in the tree is one of them.
     */
    @Test fun chipsAndSegmentsKeepTheirHitArea() {
        rule.setContent {
            EtalonTheme {
                Column {
                    // A FlowRow, not the sheet's LazyRow: every chip has to be composed and at its
                    // natural width for the count and the measurements below to mean anything.
                    FlowRow(Modifier.fillMaxWidth(), Arrangement.spacedBy(6.dp)) {
                        CHIPS.forEach { (label, count) ->
                            EtalonFilterChip(label, selected = label == "Қабул", onClick = {}, count = count)
                        }
                    }
                    SegmentedControl(LIST_SEGMENTS, selectedIndex = 0, onSelect = {})
                }
            }
        }
        val nodes = rule.onAllNodes(hasClickAction(), useUnmergedTree = true).fetchSemanticsNodes()
        val minTouch = EtalonSpace.minTouch.value
        assertEquals(CHIPS.size + LIST_SEGMENTS.size, nodes.size)
        nodes.forEachIndexed { i, node ->
            // `touchBoundsInRoot`, not `size`: the drawn box is 32 dp (30 for a segment) and the
            // 48 dp comes from Compose expanding the target at the input layer.
            // `minimumInteractiveComponentSize` on the component is what reserves the room for
            // that expansion — without it a neighbour would be sitting in it.
            val w = node.touchBoundsInRoot.width / rule.density.density
            val h = node.touchBoundsInRoot.height / rule.density.density
            assertTrue(
                "target $i is %.1f × %.1f dp, under the 48 dp hit area".format(w, h),
                w >= minTouch && h >= minTouch,
            )
        }
    }
}

@Composable
private fun ChipRow() = LazyRow(
    Modifier.fillMaxWidth(),
    horizontalArrangement = Arrangement.spacedBy(6.dp),
    contentPadding = PaddingValues(horizontal = EtalonSpace.headerMargin),
) {
    items(CHIPS) { (label, count) ->
        EtalonFilterChip(label, selected = label == "Қабул", onClick = {}, count = count)
    }
}

@Composable
private fun ControlsSheet() = Column(
    Modifier.fillMaxWidth().background(EtalonColors.page).padding(vertical = 16.dp),
    verticalArrangement = Arrangement.spacedBy(12.dp),
) {
    Column(
        Modifier.fillMaxWidth().padding(horizontal = EtalonSpace.headerMargin),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Caption("SearchField · бўш", EtalonColors.ink2)
        SearchField(value = "", onValueChange = {}, placeholder = "Мижоз, № ёки телефон")
        Caption("SearchField · терилган", EtalonColors.ink2)
        SearchField(value = "Yusupov", onValueChange = {}, placeholder = "Мижоз, № ёки телефон", onClear = {})
    }
    Caption("EtalonFilterChip", EtalonColors.ink2, EtalonSpace.headerMargin)
    ChipRow()
    // The switch on navy: §3.2 puts it in the NavySheet's sticky header, beside the section title.
    Column(
        Modifier.fillMaxWidth().padding(horizontal = EtalonSpace.cardMargin),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Column(
            Modifier.fillMaxWidth().background(EtalonColors.navy, EtalonShapes.sheet).padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Caption("SegmentedControl · onNavy", EtalonColors.onDarkMuted)
            SegmentedControl(LIST_SEGMENTS, selectedIndex = 0, onSelect = {})
            SegmentedControl(LIST_SEGMENTS, selectedIndex = 1, onSelect = {})
        }
        Caption("SegmentedControl · саҳифада", EtalonColors.ink2)
        SegmentedControl(PAYMENT_SEGMENTS, selectedIndex = 0, onSelect = {}, onNavy = false)
    }
}

@Composable
private fun Caption(text: String, color: Color, inset: androidx.compose.ui.unit.Dp = 0.dp) =
    Text(text, style = EtalonType.caption, color = color, modifier = Modifier.padding(horizontal = inset))
