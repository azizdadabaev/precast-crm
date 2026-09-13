package uz.etalon.crm.core.designsystem

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.unit.dp
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import uz.etalon.crm.core.designsystem.calendar.CapacityCalendarCard
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.model.CapacityMonth
import uz.etalon.crm.core.model.Resource
import uz.etalon.crm.core.testing.CalendarFixtures
import java.time.LocalDate

/**
 * The capacity calendar card against the owner's own web screenshot of September 2026: 12 Sep
 * = 5 orders / 685 м² (Overbooked, and the selected day), 8 Sep = 7 / 525 (Heavy), 2 Sep = 5 /
 * 204 (Available), the leading 31 August greyed, and the month's «N буюртма · X м²» line under
 * the title. The web draws a coloured stripe down the left of each day; the phone draws the bar
 * along the bottom and tints the whole ground, which is prototype 4a's own answer to a 40 dp cell.
 *
 * Nothing here reads the clock — `today` and the month are the fixture's — so a baseline recorded
 * in March is the baseline recorded in September.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w411dp-h891dp")
class CalendarScreenshotTest {
    @get:Rule val rule = createComposeRule()

    @Test fun calendarLight() {
        shoot("calendar_light") { Card(CalendarFixtures.september) }
    }

    /** §8's font-scale rule: the cells stay 56 dp tall and the m² line is the one that yields. */
    @Test @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f)
    fun calendarLargeFont() {
        shoot("calendar_font13") { Card(CalendarFixtures.september) }
    }

    /** The narrow phone: seven columns and six 2 dp gaps inside a 328 dp card. */
    @Test @Config(qualifiers = "w360dp-h800dp")
    fun calendarNarrow() {
        shoot("calendar_w360_light") { Card(CalendarFixtures.september) }
    }

    /**
     * The worst case the CRM ships into: the narrowest phone at the largest text the app honours.
     * §8's yield is what this frame is for — a 40 dp cell at font scale 1,3 has no room for
     * «525 м²», so the unit goes and the digits stay whole. Nothing may be cut mid-glyph.
     */
    @Test @Config(qualifiers = "w360dp-h800dp", fontScale = 1.3f)
    fun calendarNarrowLargeFont() {
        shoot("calendar_w360_font13") { Card(CalendarFixtures.september) }
    }

    /** The first load of a month (§4.3): the grid's geometry in `page` blocks, no text. */
    @Test fun calendarSkeleton() {
        shoot("calendar_skeleton_light") {
            CapacityCalendarCard(
                month = CalendarFixtures.MONTH,
                capacity = Resource.Loading(null),
                selected = null,
                today = CalendarFixtures.TODAY,
                onPrev = {}, onNext = {}, onSelect = {},
                modifier = Modifier.padding(horizontal = EtalonSpace.cardMargin),
            )
        }
    }

    /**
     * Design §9: the same payload under a tighter factory (200/300/400) recolours without an app
     * update. Laid beside `calendar_light`, 2 Sep steps Available → Moderate, 8 Sep and 11 Sep
     * step Heavy → Overbooked, and the legend prints the server's new numbers.
     */
    @Test fun calendarCustomThresholds() {
        shoot("calendar_custom_thresholds_light") { Card(CalendarFixtures.septemberTight) }
    }

    /**
     * The legend's own worst case, at the phone's: 1 000 / 2 000 / 3 000 on the narrow screen at
     * font scale 1,3, where four four-digit bands cannot share a line. Laid beside
     * `calendar_w360_font13` — the same card under the default 300/450/600 — the two are exactly
     * the same height: the second legend line is reserved before any month has arrived, so the
     * first load of a big factory no longer grows the card under the planner's finger.
     */
    @Test @Config(qualifiers = "w360dp-h800dp", fontScale = 1.3f)
    fun calendarWideThresholds() {
        shoot("calendar_wide_thresholds_light") { Card(CalendarFixtures.septemberWide) }
    }

    /**
     * §7's calculator picker: read-only with a floor of 12 September. Every day before it is
     * dimmed and inert exactly as an adjacent month's day is, and nothing is selected — the
     * picker opens on the month, not on a choice.
     */
    @Test fun calendarReadOnly() {
        shoot("calendar_readonly_light") {
            CapacityCalendarCard(
                month = CalendarFixtures.MONTH,
                capacity = Resource.Success(CalendarFixtures.september),
                selected = null,
                today = CalendarFixtures.TODAY,
                onPrev = {}, onNext = {}, onSelect = {},
                readOnly = true,
                minSelectable = LocalDate.of(2026, 9, 12),
                modifier = Modifier.padding(horizontal = EtalonSpace.cardMargin),
            )
        }
    }

    private fun shoot(name: String, content: @Composable () -> Unit) {
        rule.setContent {
            EtalonTheme {
                Column(
                    Modifier.fillMaxWidth().background(EtalonColors.page).padding(vertical = 16.dp),
                ) { content() }
            }
        }
        rule.onRoot().captureRoboImage("screenshots/$name.png")
    }
}

/** The card as a screen places it: `cardMargin` sides, 12 September selected. */
@Composable
private fun Card(month: CapacityMonth) = CapacityCalendarCard(
    month = CalendarFixtures.MONTH,
    capacity = Resource.Success(month),
    selected = CalendarFixtures.SELECTED,
    today = CalendarFixtures.TODAY,
    onPrev = {}, onNext = {}, onSelect = {},
    modifier = Modifier.padding(horizontal = EtalonSpace.cardMargin),
)
