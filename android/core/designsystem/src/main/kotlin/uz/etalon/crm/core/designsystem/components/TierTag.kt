package uz.etalon.crm.core.designsystem.components

import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import uz.etalon.crm.core.designsystem.R
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.CapacityTier

/**
 * The capacity calendar's load tier as a tag (design §4.5, R8). It is a [StatusTag] in every way
 * but its palette: same [TagBody] shape, padding and type, so the day sheet's tier tag and the
 * order row's status tag sit at the same height beside each other.
 *
 * The tiers are deliberately NOT folded into [TagFamily]. A family says what a status *means*
 * across the app; a tier is a position on one ordered scale, and MODERATE and HEAVY need two
 * neighbouring warm colours that no status family owns.
 */

/** The figure, the bar and the tag's text (§4.2). */
fun CapacityTier.color(): Color = when (this) {
    CapacityTier.AVAILABLE -> EtalonColors.green
    CapacityTier.MODERATE -> EtalonColors.warning
    CapacityTier.HEAVY -> EtalonColors.heavy
    CapacityTier.OVERBOOKED -> EtalonColors.red
}

/** The day cell's ground, and the tag's fill on a light surface (§4.2). */
fun CapacityTier.bg(): Color = when (this) {
    CapacityTier.AVAILABLE -> EtalonColors.greenBg
    CapacityTier.MODERATE -> EtalonColors.warningBg
    CapacityTier.HEAVY -> EtalonColors.heavyBg
    CapacityTier.OVERBOOKED -> EtalonColors.redBg
}

@StringRes
fun tierLabel(tier: CapacityTier): Int = when (tier) {
    CapacityTier.AVAILABLE -> R.string.ds_tier_available
    CapacityTier.MODERATE -> R.string.ds_tier_moderate
    CapacityTier.HEAVY -> R.string.ds_tier_heavy
    CapacityTier.OVERBOOKED -> R.string.ds_tier_overbooked
}

/**
 * @param onDark the navy day sheet. The pale `*Bg` fills are invisible there, so the tag is the
 * tier colour at 18 % — the same white-18 % weight the navy surfaces' own dividers carry — with
 * the full tier colour as the word.
 */
@Composable
fun TierTag(tier: CapacityTier, onDark: Boolean = false, modifier: Modifier = Modifier) = TagBody(
    text = stringResource(tierLabel(tier)),
    bg = if (onDark) tier.color().copy(alpha = 0.18f) else tier.bg(),
    fg = tier.color(),
    style = EtalonType.tag,
    modifier = modifier,
)
