package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * The band the floating nav pill occupies **above** the system navigation-bar inset, read off
 * [BottomNav]'s own geometry: `BAR_BOTTOM_MARGIN` (12) + `BAR_HEIGHT` (60) + the same 12 dp of air
 * again over the bar, so a row that ends exactly on this band still has a margin's worth of
 * breathing room before the pill starts.
 *
 * The bar itself is drawn on `navigationBarsPadding()`, which is why this figure is the band alone
 * and the system inset is added separately by [navPillInsetOf].
 *
 * `internal`, not `private`: [BottomNavScrim] is the band too — it fades exactly this much and
 * then stops, rather than washing on down through the system-bar strip — and it must not restate
 * the figure.
 */
internal val NAV_PILL_BAND = 84.dp

/**
 * How much room the current screen must leave at its bottom edge for the shell's floating nav
 * pill — the system navigation inset plus the pill's own 84 dp band — or `0.dp` where no pill is
 * drawn.
 *
 * `SignedInShell` provides it once around the whole Nav3 display (and provides `0.dp` for the one
 * route that hides the pill), so a screen never has to know which navigation mode the phone is in.
 * The flat 100 dp this replaces was ~20 dp short under three-button navigation, where the inset
 * alone is 48.
 *
 * The default of `0.dp` is what a screenshot test, a preview or a signed-out screen sees: no pill,
 * no clearance.
 */
val LocalNavPillInset: ProvidableCompositionLocal<Dp> = compositionLocalOf { 0.dp }

/**
 * The clearance for the current navigation mode: gesture navigation contributes a few dp of handle,
 * three-button navigation ~48 dp, and both get the same 84 dp band on top. This is what the shell
 * provides into [LocalNavPillInset]; screens read the local rather than calling this, so a locked
 * route can provide `0.dp` instead.
 *
 * **Zero while the keyboard is up.** The pill is drawn on the navigation bar, so the IME covers it
 * completely — and every screen with a text field (Record payment, Change PIN, the clients search)
 * was reserving the pill's whole 84 dp band on top of the keyboard's own inset, pushing content up
 * by a band that nothing occupies. Decided once here rather than per screen, so the rule cannot
 * drift: no pill on screen, no clearance for it. Screenshot frames are unaffected — Robolectric
 * reports the IME absent whatever is focused.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun navPillInsetOf(): Dp = if (WindowInsets.isImeVisible) {
    0.dp
} else {
    WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding() + NAV_PILL_BAND
}

/** Lifts whatever this modifies clear of the nav pill — the fixed sheet or bar at a screen's foot. */
@Composable
fun Modifier.navPillPadding(): Modifier = this.padding(bottom = LocalNavPillInset.current)

/**
 * A scrolling list's `contentPadding` with the pill's clearance already in the bottom edge.
 *
 * @param extraBottom room for something drawn *over* the list's last row — a [StickyActionBar] on
 *   a screen with no `Scaffold` to add the bar's height for it ([StickyActionBarDefaults.height]),
 *   or a fixed summary sheet.
 */
@Composable
fun navPillContentPadding(
    start: Dp = 0.dp,
    top: Dp = 0.dp,
    end: Dp = 0.dp,
    extraBottom: Dp = 0.dp,
): PaddingValues = PaddingValues(
    start = start, top = top, end = end,
    bottom = LocalNavPillInset.current + extraBottom,
)
