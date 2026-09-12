package uz.etalon.crm.feature.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.components.EtalonKey
import uz.etalon.crm.core.designsystem.icon.EtalonIcon
import uz.etalon.crm.core.designsystem.icon.EtalonIcons
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.designsystem.R as DesignSystemR

/** Ruling R6's key height. Well past D7's 48 dp: the PIN is typed one-handed, often outdoors. */
private val KEY_HEIGHT = 64.dp

/** The backspace glyph, drawn at the digits' optical size rather than the icon default. */
private val BACKSPACE_SIZE = 20.dp

/**
 * 3×4 keypad — no soft keyboard for a 4-digit PIN (ruling R6).
 *
 * The keys are §2's input skin: white `md` with the system hairline, the digit in `titleSm`. That
 * is deliberately the same key `NumericKeypad` draws for sums and counts, one shade lighter
 * because this pad sits on the page ground rather than inside a white sheet — an operator who can
 * work one keypad can work the other.
 */
@Composable
fun PinPad(onDigit: (Char) -> Unit, onBackspace: () -> Unit, enabled: Boolean, modifier: Modifier = Modifier) {
    val rows = listOf("123", "456", "789", " 0⌫")
    val ink = if (enabled) EtalonColors.ink else EtalonColors.ink3
    Column(modifier, verticalArrangement = Arrangement.spacedBy(EtalonSpace.md)) {
        rows.forEach { row ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(EtalonSpace.md)) {
                row.forEach { ch ->
                    when (ch) {
                        ' ' -> Spacer(Modifier.weight(1f).height(KEY_HEIGHT))
                        '⌫' -> PinKey(enabled, onBackspace) {
                            EtalonIcon(
                                EtalonIcons.Delete,
                                stringResource(DesignSystemR.string.action_backspace),
                                size = BACKSPACE_SIZE,
                                tint = ink,
                            )
                        }
                        else -> PinKey(enabled, { onDigit(ch) }) {
                            Text(ch.toString(), style = EtalonType.titleSm, color = ink)
                        }
                    }
                }
            }
        }
    }
}

/** One key — the design system's [EtalonKey], white on the page ground rather than the numeric
 *  pad's page-on-white. The press is stated in fill as well as ripple: a wrong PIN is three tries
 *  from locked out, so the operator has to be able to see which digit their thumb landed on. */
@Composable
private fun RowScope.PinKey(enabled: Boolean, onClick: () -> Unit, content: @Composable BoxScope.() -> Unit) =
    EtalonKey(
        height = KEY_HEIGHT,
        fill = EtalonColors.surface,
        pressedFill = EtalonColors.lavenderBg,
        onClick = onClick,
        enabled = enabled,
        content = content,
    )
