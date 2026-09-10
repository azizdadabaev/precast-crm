package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.R
import uz.etalon.crm.core.designsystem.icon.EtalonIcon
import uz.etalon.crm.core.designsystem.icon.EtalonIcons
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.designsystem.theme.etalonRipple
import uz.etalon.crm.core.ui.format.MONEY_UNIT

private const val MAX_DIGITS = 12

/** A glove-sized key. Well past D7's 48 dp, and the number this whole component exists for. */
private val KEY_HEIGHT = 60.dp

/** Pure so the entry rules are unit-tested rather than driven through the UI. */
fun applyDigit(current: String, digit: Char, allowDecimal: Boolean): String = when {
    current.length >= MAX_DIGITS -> current
    digit == ',' || digit == '.' -> if (!allowDecimal || current.contains(',')) current else "${current.ifEmpty { "0" }},"
    !digit.isDigit() -> current
    current == "0" -> digit.toString()
    else -> current + digit
}

fun applyBackspace(current: String): String = current.dropLast(1)

/**
 * Amount and count entry without a soft keyboard: the operator is wearing gloves
 * on a truck bed, and the system keyboard's number row is a 6 mm target.
 *
 * Stateless — the caller owns [value] — so the calculator screen's ViewModel can dock this grid
 * in its own scaffold and drive it across fields, instead of the modal sheet below owning the
 * text itself.
 *
 * @param suffix the unit written beside the figure. D8 puts the **currency in front** of a
 *   number and everything else after it, so «UZS» renders as [MoneyHeroText]'s quiet prefix and
 *   «м», «м²», «та» stay where they are. The parameter keeps its name and its meaning — the
 *   caller still says "this figure is in UZS"; only where the echo paints it has changed, so
 *   that the keypad and the figure it is editing read the same way.
 */
@Composable
fun NumericKeypad(
    value: String,
    suffix: String? = null,
    allowDecimal: Boolean = true,
    confirmLabel: String,
    onValue: (String) -> Unit,
    onConfirm: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Row(verticalAlignment = Alignment.Bottom) {
            if (suffix == MONEY_UNIT) {
                Text(suffix, style = EtalonType.kpiUnit, color = EtalonColors.ink.copy(alpha = 0.5f))
                Spacer(Modifier.width(6.dp))
            }
            Text(
                value.ifEmpty { "0" },
                style = EtalonType.amountLg,
                color = EtalonColors.ink,
                modifier = Modifier.weight(1f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (suffix != null && suffix != MONEY_UNIT) {
                Text(suffix, style = EtalonType.body, color = EtalonColors.ink2)
            }
        }
        val rows = listOf("123", "456", "789", if (allowDecimal) ",0⌫" else " 0⌫")
        rows.forEach { row ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                row.forEach { ch ->
                    when (ch) {
                        ' ' -> Spacer(Modifier.weight(1f).height(KEY_HEIGHT))
                        '⌫' -> KeypadKey(onClick = { onValue(applyBackspace(value)) }) {
                            EtalonIcon(
                                EtalonIcons.Delete,
                                stringResource(R.string.action_backspace),
                                size = 20.dp,
                                tint = EtalonColors.ink,
                            )
                        }
                        else -> KeypadKey(onClick = { onValue(applyDigit(value, ch, allowDecimal)) }) {
                            Text(ch.toString(), style = EtalonType.titleSm, color = EtalonColors.ink)
                        }
                    }
                }
            }
        }
        PrimaryButton(confirmLabel, onClick = onConfirm)
    }
}

/** §2's key: `md` on the page ground with the system's hairline — the keypad is a table of
 *  numeric inputs, and it wears the same skin as one. */
@Composable
private fun RowScope.KeypadKey(onClick: () -> Unit, content: @Composable BoxScope.() -> Unit) = Box(
    Modifier
        .weight(1f)
        .height(KEY_HEIGHT)
        .clip(EtalonShapes.md)
        .background(EtalonColors.page)
        .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.md)
        .clickable(
            role = Role.Button,
            indication = etalonRipple(),
            interactionSource = remember { MutableInteractionSource() },
            onClick = onClick,
        ),
    contentAlignment = Alignment.Center,
    content = content,
)

/** Amount and count entry as a modal sheet — the sheet's scrim is right for a one-off edit like
 *  a payment amount or a shipment count, where nothing behind it needs to stay visible. A thin
 *  wrapper around [NumericKeypad]: every existing caller (payments, logistics) is untouched. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NumericKeypadSheet(
    title: String,
    initial: String,
    suffix: String? = null,
    allowDecimal: Boolean = false,
    onConfirm: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var value by remember { mutableStateOf(initial) }
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = EtalonColors.surface,
        shape = EtalonShapes.sheetTop,
    ) {
        Column(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            SectionLabel(title)
            NumericKeypad(
                value = value, suffix = suffix, allowDecimal = allowDecimal,
                confirmLabel = stringResource(R.string.action_confirm),
                onValue = { value = it }, onConfirm = { onConfirm(value.ifEmpty { "0" }) },
            )
        }
    }
}
