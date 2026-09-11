package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.theme.EtalonColors

/** How much of the scrolling content the scrim fades out above the bar. */
private val SCRIM_HEIGHT = 16.dp

/** Air above and below the button row. */
private val BAR_PAD_V = 12.dp

/** The button slot the bar is sized around — `PrimaryButton`/`SecondaryButton` height, and D7's
 *  minimum touch target. */
private val BUTTON_HEIGHT = 48.dp

object StickyActionBarDefaults {
    /**
     * What the bar covers of the window **excluding** the nav-pill clearance it adds beneath
     * itself: [SCRIM_HEIGHT] 16 + [BAR_PAD_V] 12 + a [BUTTON_HEIGHT] 48 dp button slot +
     * [BAR_PAD_V] 12 = 88 dp.
     *
     * A screen that sits in a `Scaffold` never needs this — the Scaffold measures the bottom bar
     * and hands its height back in the content padding. It is for the screens that have no
     * Scaffold and align the bar in a `Box` themselves (order detail), where the list's own
     * `contentPadding` has to spell the clearance out:
     * `navPillContentPadding(extraBottom = StickyActionBarDefaults.height)`.
     */
    val height: Dp = SCRIM_HEIGHT + BAR_PAD_V + BUTTON_HEIGHT + BAR_PAD_V
}

/**
 * The bar that carries a screen's next step. Lives in Scaffold's bottomBar slot so it stays in
 * the thumb zone while the content scrolls, and it sits above the navigation-bar inset rather
 * than under it.
 *
 * §2 replaces the old hairline rule with a scrim: the page colour fading up from the bar, so a
 * row scrolling underneath dissolves instead of being cut by a line. The bar itself is the page,
 * not a white card — the button is the only object here.
 *
 * @param clearNavPill whether the bar lifts itself clear of the shell's floating nav pill, which
 *   is drawn *over* every signed-in screen. It does so with [LocalNavPillInset] — the system
 *   navigation inset **plus** the pill's band — which is why it drops its own
 *   `navigationBarsPadding()` in that mode: the inset is already inside the figure, and applying
 *   both would count it twice. The padding stays *inside* the bar's `page` background, so the
 *   strip the pill floats on is page-coloured rather than a shelf of whatever the caller drew
 *   behind the bar.
 *
 *   Pass `false` for a bar outside the shell — one on a screen the pill is not drawn over, or one
 *   whose caller has already lifted it — and the bar keeps the plain `navigationBarsPadding()` +
 *   12 dp it had before the clearance existed.
 */
@Composable
fun StickyActionBar(clearNavPill: Boolean = true, content: @Composable RowScope.() -> Unit) {
    Column {
        Box(
            Modifier.fillMaxWidth().height(SCRIM_HEIGHT).background(
                Brush.verticalGradient(listOf(EtalonColors.page.copy(alpha = 0f), EtalonColors.page)),
            ),
        )
        Row(
            Modifier.fillMaxWidth()
                .background(EtalonColors.page)
                .then(if (clearNavPill) Modifier else Modifier.navigationBarsPadding())
                .padding(
                    start = 16.dp, end = 16.dp, top = BAR_PAD_V,
                    bottom = BAR_PAD_V + if (clearNavPill) LocalNavPillInset.current else 0.dp,
                ),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            content = content,
        )
    }
}
