package uz.etalon.crm.core.designsystem

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertHasNoClickAction
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.hasAnyDescendant
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.height
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import uz.etalon.crm.core.designsystem.components.MONTH_COLUMNS
import uz.etalon.crm.core.designsystem.components.MonthColumnCurrent
import uz.etalon.crm.core.designsystem.components.MonthColumnSelected
import uz.etalon.crm.core.designsystem.components.MonthColumns
import uz.etalon.crm.core.designsystem.components.monthBarTag
import uz.etalon.crm.core.designsystem.components.monthColumnTag
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.model.Money
import java.math.BigDecimal

/**
 * Design §2.3b: the twelve-month chart is also the month picker, so what it reports on a tap and
 * which column it marks as picked are behaviour, not decoration. The colours themselves are
 * `ds_month_columns_light`'s business; this file asserts the structure and the wiring.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36], qualifiers = "w411dp-h891dp")
class MonthColumnsTest {
    @get:Rule val rule = createComposeRule()

    private val labels = listOf("янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек")

    private fun money(values: List<String>) = values.map { Money(BigDecimal(it)) }

    private fun show(
        booked: List<String> = List(MONTH_COLUMNS) { "${it + 1}0000000" },
        collected: List<String> = List(MONTH_COLUMNS) { "${it + 1}000000" },
        monthLabels: List<String> = labels,
        selected: Int = 11,
        current: Int = 11,
        onSelect: (Int) -> Unit = {},
    ) = rule.setContent {
        EtalonTheme {
            Box(Modifier.width(330.dp)) {
                MonthColumns(
                    booked = money(booked),
                    collected = money(collected),
                    labels = monthLabels,
                    selected = selected,
                    current = current,
                    onSelect = onSelect,
                )
            }
        }
    }

    @Test fun `the chart is twelve columns wide`() {
        show()
        repeat(MONTH_COLUMNS) { i ->
            rule.onNodeWithTag(monthColumnTag(i), useUnmergedTree = true).assertIsDisplayed()
        }
    }

    /** A payload shorter than a year pads on the LEFT rather than drawing fewer columns: the card
     *  under the rail must not change height because the business is eight months old. */
    @Test fun `a short series still draws twelve columns`() {
        show(
            booked = listOf("4000000", "9000000", "2000000"),
            collected = listOf("1000000", "2000000", "3000000"),
            monthLabels = labels.takeLast(3),
            selected = 2,
            current = 2,
        )
        repeat(MONTH_COLUMNS) { i ->
            rule.onNodeWithTag(monthColumnTag(i), useUnmergedTree = true).assertIsDisplayed()
        }
    }

    /**
     * The index space is the PAYLOAD's, not the drawn column's.
     *
     * Nine months are drawn in twelve columns, so three empty ones stand on the left and payload
     * month `k` is column `k + 3`. The accent pair, the today-dot and the tap must all follow the
     * payload's numbering: before this was fixed the highlight and the dot sat three columns left
     * of the months they belonged to, and tapping a column selected a different month than the one
     * whose bars were under the finger — three different answers to "which month is this".
     */
    @Test fun `with a short series the marks and the taps land on the payload's own months`() {
        val picked = mutableListOf<Int>()
        val nine = labels.takeLast(9)                       // апр … дек
        show(
            booked = List(9) { "${it + 1}0000000" },
            collected = List(9) { "${it + 1}000000" },
            monthLabels = nine,
            selected = 6,                                   // октябрь — the 7th of the nine
            current = 8,                                    // декабрь — the last
            onSelect = { picked += it },
        )
        val pad = MONTH_COLUMNS - 9

        // The marks sit on the labels they belong to, not three columns to the left.
        rule.onNode(
            SemanticsMatcher.expectValue(MonthColumnSelected, true) and hasAnyDescendant(hasText(nine[6])),
            useUnmergedTree = true,
        ).assertExists()
        rule.onNode(
            SemanticsMatcher.expectValue(MonthColumnCurrent, true) and hasAnyDescendant(hasText(nine[8])),
            useUnmergedTree = true,
        ).assertExists()
        // …and on nothing else.
        rule.onNodeWithTag(monthColumnTag(pad + 6), useUnmergedTree = true)
            .assert(SemanticsMatcher.expectValue(MonthColumnSelected, true))
        rule.onNodeWithTag(monthColumnTag(6), useUnmergedTree = true)
            .assert(SemanticsMatcher.expectValue(MonthColumnSelected, false))
        rule.onNodeWithTag(monthColumnTag(pad + 8), useUnmergedTree = true)
            .assert(SemanticsMatcher.expectValue(MonthColumnCurrent, true))
        rule.onNodeWithTag(monthColumnTag(8), useUnmergedTree = true)
            .assert(SemanticsMatcher.expectValue(MonthColumnCurrent, false))

        // Tapping the k-th month's column reports k, whatever column it was drawn in.
        rule.onNodeWithTag(monthColumnTag(pad + 0)).performClick()
        rule.onNodeWithTag(monthColumnTag(pad + 5)).performClick()
        assertEquals(listOf(0, 5), picked)
    }

    /** A padding column has no month behind it, so it is not a control at all — it can neither
     *  report a month that does not exist nor offer TalkBack a button with no name. */
    @Test fun `a padding column is not tappable`() {
        val picked = mutableListOf<Int>()
        show(
            booked = List(9) { "${it + 1}0000000" },
            collected = List(9) { "${it + 1}000000" },
            monthLabels = labels.takeLast(9),
            selected = 8, current = 8,
            onSelect = { picked += it },
        )
        repeat(MONTH_COLUMNS - 9) { i ->
            rule.onNodeWithTag(monthColumnTag(i), useUnmergedTree = true).assertHasNoClickAction()
        }
        assertEquals(emptyList<Int>(), picked)
    }

    @Test fun `tapping a column reports that column's own index`() {
        val picked = mutableListOf<Int>()
        show(onSelect = { picked += it })

        // The fourth column, not the first: a handler that always reported index 0 fails here.
        rule.onNodeWithTag(monthColumnTag(3)).performClick()
        assertEquals(listOf(3), picked)

        rule.onNodeWithTag(monthColumnTag(11)).performClick()
        assertEquals(listOf(3, 11), picked)
    }

    /** Exactly one column is the picked one, and it is the one the caller named — the accent pair
     *  is what the rail above the chart is scoped to. */
    @Test fun `one column and only one reports itself selected`() {
        show(selected = 7)

        val selected = rule.onAllNodes(
            SemanticsMatcher.expectValue(MonthColumnSelected, true),
            useUnmergedTree = true,
        ).fetchSemanticsNodes()
        assertEquals(1, selected.size)

        rule.onNodeWithTag(monthColumnTag(7), useUnmergedTree = true)
            .assert(SemanticsMatcher.expectValue(MonthColumnSelected, true))
        rule.onNodeWithTag(monthColumnTag(6), useUnmergedTree = true)
            .assert(SemanticsMatcher.expectValue(MonthColumnSelected, false))
    }

    /** A year with no trade at all still draws twelve columns of stubs: a chart that collapsed to
     *  nothing reads as a rendering failure rather than as a quiet year. */
    @Test fun `an all-zero year draws stubs, not an empty band`() {
        show(booked = List(MONTH_COLUMNS) { "0" }, collected = List(MONTH_COLUMNS) { "0" })
        repeat(MONTH_COLUMNS) { i ->
            rule.onNodeWithTag(monthColumnTag(i), useUnmergedTree = true)
                .assertIsDisplayed()
                .assertHeightIsAtLeast(1.dp)
        }
    }

    /**
     * Ruling R13, the defect this chart shipped with: under one shared denominator a real but
     * small month rounded away to nothing and looked exactly like a month that traded nothing.
     *
     * A figure worth half a percent of the best month is 0,3 dp against the 60 dp band; it must
     * still be drawn at least 3 dp tall. A genuine zero keeps the thinner 2 dp stub — so the two
     * are distinguishable, which is the whole point, and the small month is the taller of them.
     */
    @Test fun `a real but tiny month is drawn at least three dp, taller than a zero month's stub`() {
        // Month 0 collected 0,5 % of month 11's figure; month 1 collected nothing at all.
        val tinyYear = listOf("1000000", "0") + List(MONTH_COLUMNS - 3) { "0" } + listOf("200000000")
        show(booked = List(MONTH_COLUMNS) { "0" }, collected = tinyYear)

        val tiny = collectedBarHeight(0)
        val zero = collectedBarHeight(1)

        assertTrue("a 0,5 % month must keep the 3 dp floor, not round away — was $tiny", tiny >= 3.dp)
        assertTrue("a month with nothing in it must be shorter than one with a little", zero < tiny)
        assertTrue("…and must still be drawn, as a stub — was $zero", zero >= 1.dp)
    }

    private fun collectedBarHeight(index: Int) =
        rule.onNodeWithTag(monthBarTag(index, collected = true), useUnmergedTree = true)
            .getUnclippedBoundsInRoot().height

    /** D7's floor: a column is a target a finger can hit, whatever its bars do. */
    @Test fun `every column is at least a 48 dp target`() {
        show(booked = List(MONTH_COLUMNS) { "0" }, collected = List(MONTH_COLUMNS) { "0" })
        repeat(MONTH_COLUMNS) { i ->
            rule.onNodeWithTag(monthColumnTag(i), useUnmergedTree = true).assertHeightIsAtLeast(48.dp)
        }
    }
}
