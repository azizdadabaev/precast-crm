package uz.etalon.crm.feature.calculator

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.OffsetMapping
import androidx.compose.ui.text.input.TransformedText
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.EtalonTextField
import uz.etalon.crm.core.designsystem.components.FormCard
import uz.etalon.crm.core.designsystem.components.FormField
import uz.etalon.crm.core.designsystem.components.RegionField
import uz.etalon.crm.core.designsystem.components.RegionPickerSheet
import uz.etalon.crm.core.designsystem.icon.EtalonIcon
import uz.etalon.crm.core.designsystem.icon.EtalonIcons
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.designsystem.theme.etalonRipple
import uz.etalon.crm.core.ui.format.formatPhone
import uz.etalon.crm.core.ui.regions.VILOYATS
import uz.etalon.crm.core.ui.regions.tumansOf

// ── §3.4 «ClientRow» / «ClientForm», every size named ─────────────

/** §3.4 ClientRow: «pad 10×12» — 12 on each side. */
private val ROW_PAD_H = 12.dp
/** §3.4 ClientRow: «pad 10×12» — 10 top and bottom. */
private val ROW_PAD_V = 10.dp
/** §3.4 ClientRow: «34dp lavenderBg circle with user icon in indigo». */
private val AVATAR = 34.dp
/** The glyph inside that circle — the 18 dp every `EtalonIconButton` draws inside its own pill. */
private val AVATAR_ICON = 18.dp
/** §3.4 ClientRow: the air between the three columns of «grid [34 | text | chevron]». */
private val ROW_GAP = EtalonSpace.rowGap
/** §3.4 ClientRow: «chevron rotates 180° when open». */
private val CHEVRON = 18.dp
private const val CHEVRON_OPEN_DEGREES = 180f
/** §3.4 ClientForm: the air between the lookup banner, the card and the «2-col» region row. */
private val FORM_GAP = EtalonSpace.rowGap

/** «·» between the phone and the region of the meta line — layout punctuation, not translatable
 *  content, so a literal here exactly as `ClientBar.kt` carried it. */
private const val SEGMENT_SEPARATOR = " · "
/** «Самарқанд, Регистон» — how §3.4's `region, district` meta joins its two halves. */
private const val REGION_SEPARATOR = ", "

/** The nine local digits, which is all [CalculatorUiState.clientPhoneDigits] ever holds. */
private const val PHONE_DIGITS = 9

/** Which of the two linked catalogues the form is browsing, if either — the same shape
 *  `ClientEditSheet`'s own `RegionPick` uses. */
private enum class ClientRegionPick { VILOYAT, TUMAN }

/**
 * Who the quote is for, on one line (§3.4 «ClientRow»): the lavender circle, the client's name
 * over «{phone} · {viloyat}, {tuman}», and the chevron that turns over when the form below is
 * open. The whole row is the toggle — [onToggle] — so an operator correcting a number does not
 * have to find a pencil.
 *
 * With nothing on file yet it says so rather than going blank: «Мижоз танланмаган» over the hint,
 * which is also the state the form opens itself in (`CalculatorViewModel.updateClientState`).
 */
@Composable
fun ClientRow(state: CalculatorUiState, open: Boolean, onToggle: () -> Unit, modifier: Modifier = Modifier) {
    val rotation by animateFloatAsState(if (open) CHEVRON_OPEN_DEGREES else 0f, label = "clientChevron")
    val region = listOf(state.clientAddress.viloyat, state.clientAddress.tuman)
        .filter { it.isNotBlank() }
        .joinToString(REGION_SEPARATOR)
    val meta = listOfNotNull(
        state.clientPhoneDigits.takeIf { it.isNotBlank() }?.let(::formatPhone),
        region.takeIf { it.isNotBlank() },
    ).joinToString(SEGMENT_SEPARATOR)

    Row(
        modifier.fillMaxWidth()
            .clip(EtalonShapes.xl)
            .background(EtalonColors.surface)
            .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.xl)
            .clickable(
                role = Role.Button,
                indication = etalonRipple(false),
                interactionSource = remember { MutableInteractionSource() },
                onClick = onToggle,
            )
            .heightIn(min = EtalonSpace.minTouch)
            .padding(horizontal = ROW_PAD_H, vertical = ROW_PAD_V),
        horizontalArrangement = Arrangement.spacedBy(ROW_GAP),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(AVATAR).clip(EtalonShapes.pill).background(EtalonColors.lavenderBg),
            contentAlignment = Alignment.Center,
        ) { EtalonIcon(EtalonIcons.User, null, size = AVATAR_ICON, tint = EtalonColors.indigo) }

        Column(Modifier.weight(1f)) {
            Text(
                state.clientName.ifBlank { stringResource(R.string.calc_client_none) },
                style = EtalonType.rowTitle,
                color = if (state.clientName.isBlank()) EtalonColors.ink2 else EtalonColors.ink,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                meta.ifBlank { stringResource(R.string.calc_client_hint) },
                style = EtalonType.meta,
                color = EtalonColors.ink3,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }

        EtalonIcon(
            EtalonIcons.ChevronDown, null,
            modifier = Modifier.rotate(rotation),
            size = CHEVRON, tint = EtalonColors.ink3,
        )
    }
}

/**
 * The five fields behind [ClientRow] (§3.4 «ClientForm», ruling R9): «Исм*», «Тел рақам*» on the
 * phone keyboard behind the fixed «+998 » prefix, the two linked region pickers side by side, and
 * the street line.
 *
 * The phone is the lookup key, not just a field: every keystroke goes through
 * `CalculatorViewModel.setClientPhoneDigits`, which debounces a `findByPhone` at the ninth digit
 * and fills the name and address from the match. A failed lookup is the [ErrorBanner] above the
 * card — retryable, and never blocking: a new customer is simply a miss.
 *
 * Takes [vm] directly rather than a bundle of callbacks, the same way `ClientBarExpanded` did:
 * this is a slot [CalculatorRoute] hands to `CalculatorScreen`, not something the screen — which
 * holds no ViewModel of its own — builds.
 */
@Composable
fun ClientForm(state: CalculatorUiState, vm: CalculatorViewModel, modifier: Modifier = Modifier) {
    var picking by remember { mutableStateOf<ClientRegionPick?>(null) }

    val pick = picking
    if (pick != null) {
        RegionPickerSheet(
            title = stringResource(if (pick == ClientRegionPick.VILOYAT) R.string.calc_client_viloyat else R.string.calc_client_tuman),
            options = when (pick) {
                ClientRegionPick.VILOYAT -> VILOYATS.map { it.nameUz to it.name }
                ClientRegionPick.TUMAN -> tumansOf(state.clientAddress.viloyat).map { it.nameUz to it.name }
            },
            onDismiss = { picking = null },
            onPick = { chosen ->
                if (pick == ClientRegionPick.VILOYAT) vm.setClientViloyat(chosen) else vm.setClientTuman(chosen)
                picking = null
            },
        )
    }

    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(FORM_GAP)) {
        state.clientLookupError?.let { ErrorBanner(it, onRetry = vm::retryClientLookup) }
        FormCard {
            FormField(stringResource(R.string.calc_client_name_req)) {
                EtalonTextField(
                    value = state.clientName,
                    onValueChange = vm::setClientName,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            FormField(stringResource(R.string.calc_client_phone_req)) {
                EtalonTextField(
                    value = state.clientPhoneDigits,
                    onValueChange = { vm.setClientPhoneDigits(it.filter(Char::isDigit).take(PHONE_DIGITS)) },
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = stringResource(R.string.calc_client_phone_mask),
                    prefix = "+998 ",
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                    visualTransformation = PhoneDigitsMask,
                )
            }
            // `RegionField` publishes no `Modifier`, so the two columns take their width from a
            // weighted box around each — the field fills whatever it is given.
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(FORM_GAP)) {
                Box(Modifier.weight(1f)) {
                    RegionField(stringResource(R.string.calc_client_viloyat), state.clientAddress.viloyat) {
                        picking = ClientRegionPick.VILOYAT
                    }
                }
                Box(Modifier.weight(1f)) {
                    RegionField(stringResource(R.string.calc_client_tuman), state.clientAddress.tuman) {
                        picking = ClientRegionPick.TUMAN
                    }
                }
            }
            FormField(stringResource(R.string.calc_client_address), divider = false) {
                EtalonTextField(
                    value = state.clientAddress.street,
                    onValueChange = vm::setClientStreet,
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = stringResource(R.string.calc_client_address_hint),
                )
            }
        }
    }
}

/**
 * §3.4's phone mask, `+998 90 ___ __ __`: the nine stored digits drawn as `90 123 45 67` behind
 * the field's own fixed «+998 » prefix.
 *
 * Only the DRAWING changes — [CalculatorUiState.clientPhoneDigits] stays nine bare digits, which
 * is what `normalizePhone` and the lookup want. The offset mapping is the reason this is a
 * transformation rather than a formatted value: with the spaces unmapped the cursor and any
 * selection drift by one character per group, and backspace starts eating the wrong digit.
 */
internal object PhoneDigitsMask : VisualTransformation {
    override fun filter(text: AnnotatedString): TransformedText {
        val d = text.text.take(PHONE_DIGITS)
        val out = buildString {
            d.forEachIndexed { i, c ->
                // The group boundaries of `90 123 45 67`, counted in original digits.
                if (i == 2 || i == 5 || i == 7) append(' ')
                append(c)
            }
        }
        return TransformedText(AnnotatedString(out), PhoneOffsets)
    }
}

/** How many spaces [PhoneDigitsMask] has inserted before a given original offset, and back. */
private object PhoneOffsets : OffsetMapping {
    override fun originalToTransformed(offset: Int): Int = when {
        offset <= 2 -> offset
        offset <= 5 -> offset + 1
        offset <= 7 -> offset + 2
        else -> offset + 3
    }

    override fun transformedToOriginal(offset: Int): Int = when {
        offset <= 2 -> offset
        offset <= 6 -> offset - 1
        offset <= 9 -> offset - 2
        else -> offset - 3
    }
}

