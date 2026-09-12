package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.designsystem.theme.etalonRipple
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.OrderStatus

/**
 * §2's list row — `[36 avatar | text | trailing]`, radius `lg`, ~56 dp tall from the 36 dp avatar
 * plus its 10 dp of vertical padding, which is already past D7's 48 dp floor. `heightIn` states
 * that floor rather than leaving it to the avatar to keep holding it.
 *
 * The row takes strings for everything the *screen* words and [Money] for everything that is
 * money, so no Uzbek copy and no number formatting is invented inside the design system.
 *
 * @param status null draws no tag and lifts the meta line up beside the avatar on its own. Home's
 *   «Бугунги етказиш» rows are the case: everything on that sheet is scheduled for today, so the
 *   tag would repeat what the sheet's own title says (`2b-home.png`).
 * @param metaLine already composed by the caller, e.g. "№ 09−0003 · 78,7 м²".
 * @param debt the server's `remaining` — it counts write-offs, so it is never re-derived here.
 *   `null` or zero renders [paidLabel].
 * @param paidLabel the settled wording, e.g. «тўланган». **Null draws no second line at all**, which
 *   is a state of its own and not the same as "settled": a CANCELED order is owed nothing and has
 *   paid nothing, so both «қолди …» and «тўланган» would be a claim about money that no longer
 *   applies. Callers pass `debt = null, paidLabel = null` for that row.
 * @param debtLabel the caller's wording, e.g. `{ "қолди ${formatMoney(it)}" }`.
 * @param onDark the row sits inside a [NavySheet]; false is the white-card variant of `2b-home.png`.
 * @param showAvatar false drops the 36 dp circle and closes the gap it left, for a list where the
 *   avatar would be the SAME one on every row and so distinguishes nothing — a client's own order
 *   list, where [clientName] carries the order number instead of a person. Defaulted true, so
 *   every other caller draws exactly what it drew before.
 * @param trailing a second line under the amount for a row whose money says nothing more — the
 *   clients list's «1 буюртма» (§3.6), where the figure above is the client's lifetime total and
 *   there is no debt or paid state to word. It is drawn only where [debt] and [paidLabel] leave the
 *   second line empty: a row states one thing under its amount, never two. The slot arrives already
 *   styled `tagPanel` in `ink3` / `onDarkMuted`, so the caller passes a bare `Text`.
 *
 * §2 also gives the row a `navy2` **hover** state. That is deliberately not implemented: this app
 * is touch-only, a finger has no hover, and a state nothing can enter is a state nobody maintains.
 * The press below is the one feedback the row gives.
 */
@Composable
fun OrderRow(
    clientName: String,
    status: OrderStatus?,
    metaLine: String,
    total: Money,
    debt: Money?,
    paidLabel: String?,
    debtLabel: (Money) -> String,
    onDark: Boolean = true,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    showAvatar: Boolean = true,
    trailing: (@Composable ColumnScope.() -> Unit)? = null,
) {
    // Zero and null are the same state — settled — and neither may reach [debtLabel].
    val due = debt?.takeIf { it.amount.signum() > 0 }
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    Row(
        modifier
            .fillMaxWidth()
            .heightIn(min = EtalonSpace.minTouch)
            .clip(EtalonShapes.lg)
            // §2: a navy row presses to indigo. The spec does not word the light row's press, so
            // it borrows SecondaryButton's — lavenderBg is the system's one "pressed on white".
            .background(
                when {
                    !pressed -> Color.Transparent
                    onDark -> EtalonColors.indigo
                    else -> EtalonColors.lavenderBg
                },
            )
            .clickable(
                role = Role.Button,
                indication = etalonRipple(onDark),
                interactionSource = interaction,
                onClick = onClick,
            )
            .padding(horizontal = EtalonSpace.rowPadH, vertical = EtalonSpace.rowPadV),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (showAvatar) {
            Avatar(clientName, size = 36.dp)
            Spacer(Modifier.width(EtalonSpace.rowGap))
        }
        Column(Modifier.weight(1f)) {
            Text(
                clientName,
                style = EtalonType.rowTitle,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                color = if (onDark) EtalonColors.onDark else EtalonColors.ink,
            )
            Spacer(Modifier.height(3.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (status != null) {
                    StatusTag(status, if (onDark) TagSurface.ROW_ON_NAVY else TagSurface.ROW_ON_LIGHT, short = true)
                    Spacer(Modifier.width(6.dp))
                }
                Text(
                    metaLine,
                    style = EtalonType.meta,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    color = if (onDark) EtalonColors.onDarkMuted else EtalonColors.ink3,
                )
            }
        }
        Spacer(Modifier.width(EtalonSpace.rowGap))
        Column(horizontalAlignment = Alignment.End) {
            MoneyText(total, style = EtalonType.rowAmount, color = if (onDark) EtalonColors.onDark else EtalonColors.ink)
            val second = if (due != null) debtLabel(due) else paidLabel
            if (second != null) {
                Spacer(Modifier.height(2.dp))
                Text(
                    second,
                    style = EtalonType.tagPanel,
                    maxLines = 1,
                    // A cut figure must not read as a smaller debt than it is: ellipsize, never clip.
                    overflow = TextOverflow.Ellipsis,
                    color = when {
                        due != null && onDark -> EtalonColors.debtOnDark
                        due != null -> EtalonColors.red
                        onDark -> EtalonColors.paidOnDark
                        else -> EtalonColors.green
                    },
                )
            } else if (trailing != null) {
                Spacer(Modifier.height(2.dp))
                CompositionLocalProvider(
                    LocalTextStyle provides EtalonType.tagPanel,
                    LocalContentColor provides if (onDark) EtalonColors.onDarkMuted else EtalonColors.ink3,
                ) { trailing() }
            }
        }
    }
}
