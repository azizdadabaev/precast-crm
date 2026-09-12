package uz.etalon.crm.feature.calculator

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusManager
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import uz.etalon.crm.core.calc.Pattern
import uz.etalon.crm.core.calc.SlabResult
import uz.etalon.crm.core.calc.SlabRow
import uz.etalon.crm.core.calc.autoPickedRate
import uz.etalon.crm.core.calc.money
import uz.etalon.crm.core.calc.tierPriceMoney
import uz.etalon.crm.core.designsystem.components.NoticeBanner
import uz.etalon.crm.core.designsystem.icon.EtalonIcon
import uz.etalon.crm.core.designsystem.icon.EtalonIcons
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.designsystem.theme.etalonRipple
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.ui.format.formatDecimal
import uz.etalon.crm.core.ui.format.formatMoney
import java.math.BigDecimal

// ── §3.4 «RoomCard», every size named ─────────────────────────────
//
// «white xl, pad 12/14/10, gap 10 between cards» — the 10 dp gap belongs to the list
// (`CalculatorScreen`), the three paddings to the card itself.

/** §3.4 RoomCard: «pad 12/14/10» — 12 top. */
private val CARD_PAD_TOP = 12.dp
/** §3.4 RoomCard: «pad 12/14/10» — 14 on each side. */
private val CARD_PAD_H = 14.dp
/** §3.4 RoomCard: «pad 12/14/10» — 10 bottom. */
private val CARD_PAD_BOTTOM = 10.dp

/** §3.4 row 1: «PatternChip h26 pill». */
private val CHIP_HEIGHT = 26.dp
/** The chip's own side padding — not in §3.4; the pill has to clear «Б-Г-Б авто» at 11 sp. */
private val CHIP_PAD_H = 10.dp
/** §3.4 row 1: «more button 28dp pill (⋯)». */
private val MORE_BUTTON = 28.dp
/** How far the ⋯ pill's 48 dp touch slot overhangs the card's end padding so the 28 dp pill lands
 *  flush with the content edge: half of what the slot adds around it. */
private val MORE_SLOT_SLACK = (EtalonSpace.minTouch - MORE_BUTTON) / 2
/** §3.4 row 1: name, chip and ⋯ sit in one row; the gap is not given, so it is the grid's `xs`. */
private val TITLE_GAP = EtalonSpace.xs

/** §3.4 row 2: «grid 1fr 1fr .9fr .9fr 1.3fr». */
private const val W_DIM = 1f
private const val W_HAIR = 0.9f
private const val W_RATE = 1.3f
/** §3.4 row 2: «gap 5». */
private val INPUT_GAP = 5.dp
/** §3.4 row 2: «margin-top 10». */
private val INPUT_TOP = 10.dp
/** §3.4 row 2: «Эни / Бўйи: lavenderBg cell radius md pad 6×8». */
private val DIM_PAD_H = 8.dp
private val DIM_PAD_V = 6.dp
/** §3.4 row 2: «Таяниш / Корр.: page-bg cell radius md hairline pad 5×7» — RateCell shares it. */
private val HAIR_PAD_H = 7.dp
private val HAIR_PAD_V = 5.dp
/** §3.4 row 2: «caption row `Нарх/м²` + 10dp chevron». */
private val RATE_CHEVRON = 10.dp
/** The gap between a cell's caption and its value, and between a figure and its unit — below the
 *  4-pt grid, so named here rather than tokenised. */
private val CELL_GAP = 2.dp

/** §3.4 row 4: «margin-top 10, top hairline, pad-top 10». */
private val RESULT_TOP = 10.dp
/** §3.4 row 5: «margin-top 8». */
private val FOOTER_TOP = 8.dp
/** §3.4 row 5: «flex, gap 10» — between the formula and the subtotal. */
private val FOOTER_GAP = EtalonSpace.rowGap

// ── §3.4's type sizes, mapped onto the §1.2 scale ─────────────────

/** §3.4 row 1: room name «14/800». `sectionTitle` is the scale's 14 sp step, at 700. */
private val NameStyle = EtalonType.sectionTitle.copy(fontWeight = FontWeight.W800)
/** §3.4 rows 2 and 4: «value 15/700 tabular» — the 14/700 step lifted half a point, as §2's own
 *  10.5 step is. Nothing on the scale sits at 15. */
private val CellValueStyle = EtalonType.sectionTitle.copy(fontSize = 15.sp)
/** §3.4 row 1: pattern label «11/700». `labelSm` is 11/600. */
private val ChipLabelStyle = EtalonType.labelSm.copy(fontWeight = FontWeight.W700)
/** §3.4 row 2: «Таяниш / Корр.» value «13/600». `body` is 13/500. */
private val HairValueStyle = EtalonType.body.copy(fontWeight = FontWeight.W600)
/** §3.4 row 2: the rate value «13/700» — the scale's `rowTitle`, exactly. */
private val RateValueStyle = EtalonType.rowTitle
/** §3.4 row 4: the unit after a figure «11/500». `meta` is 11/400. */
private val UnitStyle = EtalonType.meta.copy(fontWeight = FontWeight.W500)
/** §3.4 row 5: «subtotal 16/800 tabular» — the scale's `titleSm`, exactly. */
private val SubtotalStyle = EtalonType.titleSm

/** §3.4 rows 1 and 2: «mode suffix `авто` 10/600 at 70%». */
private const val SUFFIX_ALPHA = 0.7f

/** What a figure that does not exist yet reads as — §3.4 row 4 and §4.1 rule 10. */
private const val DASH = "—"

/**
 * A catalogue m² rate as the rate cell writes it: thousands, with the Latin «k» §3.4 spells it
 * with («140k», «162,5k», «230k»). That `k` is the one Latin glyph the Uzbek-Cyrillic UI carries
 * besides «ETALON» — a unit abbreviation, recorded in the phase plan's Global Constraints.
 *
 * [price] crosses `Money` at [tierPriceMoney], not at a `Double.toLong()`: a tier price that ever
 * carried a fraction of a tiyin throws there rather than being silently truncated here. The
 * division is `BigDecimal`'s, and [formatDecimal] drops the trailing zeros — «140», never «140,0».
 */
internal fun formatRateK(price: Double): String =
    formatDecimal(tierPriceMoney(price).amount.divide(THOUSAND), maxDigits = 1) + "k"

private val THOUSAND = BigDecimal(1000)

/**
 * One room, design 3a (`3a-calculator.png`, spec §3.4 rows 1–5): the title row with the pattern
 * chip and ⋯, the five inline cells, the ⋯ panel ([MoreRow]), the four-column result strip and
 * the formula footer with this room's subtotal.
 *
 * The card is plain data in, plain callbacks out — every figure it draws came off the engine
 * already ([SlabRow.result]), and the four numeric cells render [draft], the text the operator
 * typed, never a double formatted back (see [RoomDraft] for why that distinction is load-bearing).
 *
 * [focusRequester] is this room's Эни cell, owned by the screen so the room ABOVE can send the
 * keyboard's «next» into it; [onNext] does the same in the other direction and is `null` on the
 * last room, where Бўйи closes the keyboard with «done» instead.
 *
 * @param rateConfirmPrice the tier this room is waiting on a reason for, or null — read off
 *   [CalculatorUiState.rateConfirm] by the screen. While it is set the card shows [RateConfirm]
 *   INSTEAD of [RateSheet] rather than over it: two stacked modal windows is a Compose shape with
 *   its own focus problems, and the swap keeps «Бекор» meaning "back to the price list", which is
 *   what a confirmation drawn over that list would have meant anyway.
 */
@Composable
fun RoomCard(
    row: SlabRow,
    draft: RoomDraft,
    expanded: Boolean,
    canMoveUp: Boolean,
    canMoveDown: Boolean,
    focusRequester: FocusRequester,
    onNext: (() -> Unit)?,
    onNameChange: (String) -> Unit,
    onWidthChange: (String) -> Unit,
    onLengthChange: (String) -> Unit,
    onBearingChange: (String) -> Unit,
    onCorrectionChange: (String) -> Unit,
    onCyclePattern: () -> Unit,
    onToggleExpanded: () -> Unit,
    onExtraBeams: (Int) -> Unit,
    onForceStartBeam: (Boolean) -> Unit,
    onDuplicate: () -> Unit,
    onDelete: () -> Unit,
    onMoveUp: () -> Unit,
    onMoveDown: () -> Unit,
    rateConfirmPrice: Double?,
    onPickRate: (Double?) -> Unit,
    onConfirmRate: (String) -> Boolean,
    onDismissRateConfirm: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val r = row.result
    var showRateSheet by remember(row.id) { mutableStateOf(false) }
    val lengthFocus = remember(row.id) { FocusRequester() }
    val focusManager = LocalFocusManager.current

    Column(
        modifier.fillMaxWidth()
            .clip(EtalonShapes.xl)
            .background(EtalonColors.surface)
            .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.xl)
            .padding(start = CARD_PAD_H, end = CARD_PAD_H, top = CARD_PAD_TOP, bottom = CARD_PAD_BOTTOM),
    ) {
        // ── 1. Title row ──────────────────────────────────────────
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(TITLE_GAP),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            BasicTextField(
                value = row.name,
                onValueChange = onNameChange,
                singleLine = true,
                textStyle = NameStyle.copy(color = EtalonColors.ink),
                cursorBrush = SolidColor(EtalonColors.indigo),
                modifier = Modifier.weight(1f),
                decorationBox = { inner ->
                    if (row.name.isEmpty()) {
                        Text(stringResource(R.string.calc_room_placeholder), style = NameStyle, color = EtalonColors.ink3)
                    }
                    inner()
                },
            )
            // The engine's own contract: `pattern` is a sentinel on an extras-only row and must
            // not be read as a real layout (SlabResult's KDoc, CalculateSlab.kt:219) — so that
            // row shows no chip at all.
            if (r != null && !r.isExtrasOnly) {
                PatternChip(pattern = r.pattern, auto = row.patternOverride == null, onClick = onCyclePattern)
            }
            MoreButton(expanded = expanded, onClick = onToggleExpanded)
        }

        // ── 2. InputRow ───────────────────────────────────────────
        //
        // `IntrinsicSize.Min` + `fillMaxHeight()` on every cell is what makes the five share one
        // edge, as the capture draws them: each cell's own content is a different height (the
        // 15/700 lavender pair is taller than the 13/600 hairline three), and without this they
        // paint 45 and 36 floating inside their 48 dp slots.
        Row(
            Modifier.fillMaxWidth().padding(top = INPUT_TOP).height(IntrinsicSize.Min),
            horizontalArrangement = Arrangement.spacedBy(INPUT_GAP),
        ) {
            DimCell(
                rowId = row.id,
                caption = stringResource(R.string.calc_field_width),
                text = draft.width,
                onText = onWidthChange,
                imeAction = ImeAction.Next,
                actions = KeyboardActions(onNext = { lengthFocus.requestFocus() }),
                modifier = Modifier.weight(W_DIM).focusRequester(focusRequester),
            )
            DimCell(
                rowId = row.id,
                caption = stringResource(R.string.calc_field_length),
                text = draft.length,
                onText = onLengthChange,
                imeAction = if (onNext != null) ImeAction.Next else ImeAction.Done,
                actions = KeyboardActions(
                    onNext = { onNext?.invoke() },
                    onDone = { focusManager.clearFocus() },
                ),
                modifier = Modifier.weight(W_DIM).focusRequester(lengthFocus),
            )
            HairCell(
                rowId = row.id,
                caption = stringResource(R.string.calc_field_bearing),
                text = draft.bearing,
                onText = onBearingChange,
                focusManager = focusManager,
                modifier = Modifier.weight(W_HAIR),
            )
            HairCell(
                rowId = row.id,
                caption = stringResource(R.string.calc_field_correction),
                text = draft.correction,
                onText = onCorrectionChange,
                focusManager = focusManager,
                modifier = Modifier.weight(W_HAIR),
            )
            RateCell(
                row = row,
                // An extras-only room is not priced by the m² at all (§4.1 rule 9), so it has no
                // rate to show and nothing for the rate sheet to override.
                enabled = r != null && !r.isExtrasOnly,
                onClick = { showRateSheet = true },
                modifier = Modifier.weight(W_RATE),
            )
        }

        // ── 3. MoreRow, behind ⋯ ──────────────────────────────────
        if (expanded) {
            MoreRow(
                row = row,
                canMoveUp = canMoveUp,
                canMoveDown = canMoveDown,
                onExtraBeams = onExtraBeams,
                onForceStartBeam = onForceStartBeam,
                onDuplicate = onDuplicate,
                onDelete = onDelete,
                onMoveUp = onMoveUp,
                onMoveDown = onMoveDown,
            )
        }

        // ── 4. ResultRow ──────────────────────────────────────────
        Box(
            Modifier.padding(top = RESULT_TOP).fillMaxWidth()
                .height(EtalonSpace.hairline).background(EtalonColors.surfaceBorder),
        )
        ResultRow(r)

        // ── 5. Footer ─────────────────────────────────────────────
        FooterRow(row, r)

        if (!row.canPersist && r != null) {
            Box(Modifier.padding(top = FOOTER_TOP)) {
                NoticeBanner(stringResource(R.string.calc_room_not_persistable))
            }
        }
    }

    // R2 in the two branches below. A pick that is NOT an override (Авто, or the tier the engine
    // would have picked anyway) changes the quote immediately and there is nothing left to show,
    // so the sheet closes with it; every other tier leaves the sheet open BEHIND the confirmation,
    // which is what brings the price list back when «Бекор» clears `rateConfirm`.
    if (showRateSheet && rateConfirmPrice == null) {
        RateSheet(
            row = row,
            onDismiss = { showRateSheet = false },
            onPick = { price ->
                onPickRate(price)
                if (price == null || price == autoPickedRate(row)) showRateSheet = false
            },
        )
    }
    rateConfirmPrice?.let { price ->
        RateConfirm(
            row = row,
            price = price,
            onDismiss = onDismissRateConfirm,
            // Only a reason that actually landed closes the price list too — a refusal leaves
            // both open rather than returning the operator to a quote that did not change.
            onConfirm = { reason -> if (onConfirmRate(reason)) showRateSheet = false },
        )
    }
}

/**
 * §3.4 row 1: «label `Г-Б` / `Б-Г-Б` / `Г-Б-Г` 11/700 + mode suffix `авто` 10/600 at 70%; auto =
 * lavenderBg/indigo, manual override = indigo/white, no suffix». One tap cycles
 * ([CalculatorViewModel.cyclePattern]) — the chip is the only way to a pattern on this card.
 */
@Composable
private fun PatternChip(pattern: Pattern, auto: Boolean, onClick: () -> Unit) {
    val fg = if (auto) EtalonColors.indigo else EtalonColors.onDark
    Row(
        Modifier.minimumInteractiveComponentSize()
            .height(CHIP_HEIGHT)
            .clip(EtalonShapes.pill)
            .background(if (auto) EtalonColors.lavenderBg else EtalonColors.indigo)
            .clickable(
                role = Role.Button, indication = etalonRipple(onDark = !auto),
                interactionSource = remember { MutableInteractionSource() }, onClick = onClick,
            )
            .padding(horizontal = CHIP_PAD_H),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(stringResource(patternLabel(pattern)), style = ChipLabelStyle, color = fg)
        if (auto) {
            Spacer(Modifier.width(EtalonSpace.xs))
            Text(
                stringResource(R.string.calc_pattern_auto_suffix),
                style = EtalonType.caption, color = fg.copy(alpha = SUFFIX_ALPHA),
            )
        }
    }
}

internal fun patternLabel(p: Pattern): Int = when (p) {
    Pattern.GB -> R.string.calc_pattern_gb
    Pattern.BGB -> R.string.calc_pattern_bgb
    Pattern.GBG -> R.string.calc_pattern_gbg
}

/**
 * §3.4 row 1: «more button 28dp pill (⋯), lavenderBg when expanded». Local rather than
 * [uz.etalon.crm.core.designsystem.components.EtalonIconButton]: that one always paints the white
 * surface with its hairline and takes no fill, and the lavender state is what says the panel below
 * is open. The 48 dp hit slot around the 28 dp pill is the same one it reserves (D7).
 */
@Composable
private fun MoreButton(expanded: Boolean, onClick: () -> Unit) {
    // The 48 dp slot is 10 dp wider than the pill on each side, which would leave the pill sitting
    // 10 dp inside the card's content edge; the capture draws it flush. The slot is nudged out to
    // overhang the card's 14 dp end padding instead — the SegmentedControl trade, in the other
    // axis: the touch area keeps its 48 dp and the paint lands where the design puts it.
    Box(
        Modifier.offset(x = MORE_SLOT_SLACK).minimumInteractiveComponentSize(),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier.size(MORE_BUTTON)
                .clip(EtalonShapes.pill)
                .background(if (expanded) EtalonColors.lavenderBg else EtalonColors.surface)
                .clickable(
                    role = Role.Button, indication = etalonRipple(),
                    interactionSource = remember { MutableInteractionSource() }, onClick = onClick,
                ),
            contentAlignment = Alignment.Center,
        ) {
            EtalonIcon(
                EtalonIcons.Ellipsis, stringResource(R.string.calc_action_more),
                tint = EtalonColors.ink,
            )
        }
    }
}

/** §3.4 row 2: «Эни / Бўйи: lavenderBg cell radius md pad 6×8; caption 10/600 indigo; value
 *  15/700 tabular, decimal keyboard, placeholder `0,00`». */
@Composable
private fun DimCell(
    rowId: String,
    caption: String,
    text: String,
    onText: (String) -> Unit,
    imeAction: ImeAction,
    actions: KeyboardActions,
    modifier: Modifier = Modifier,
) = Column(
    modifier.minimumInteractiveComponentSize().fillMaxHeight()
        .clip(EtalonShapes.md)
        .background(EtalonColors.lavenderBg)
        .padding(horizontal = DIM_PAD_H, vertical = DIM_PAD_V),
    verticalArrangement = Arrangement.spacedBy(CELL_GAP),
) {
    Text(caption, style = EtalonType.caption, color = EtalonColors.indigo, maxLines = 1, overflow = TextOverflow.Ellipsis)
    CellField(rowId, text, onText, CellValueStyle, imeAction, actions)
}

/** §3.4 row 2: «Таяниш / Корр.: page-bg cell radius md hairline pad 5×7; caption 10/600 ink2;
 *  value 13/600». Editable like the two lavender cells — the modal keypad that used to own these
 *  two values is retired with the rest of the pad, and the ⋯ panel keeps only the controls §3.4
 *  puts there. Rare edits, so they close the keyboard rather than walking on to the next cell. */
@Composable
private fun HairCell(
    rowId: String,
    caption: String,
    text: String,
    onText: (String) -> Unit,
    focusManager: FocusManager,
    modifier: Modifier = Modifier,
) = Column(
    modifier.minimumInteractiveComponentSize().fillMaxHeight()
        .clip(EtalonShapes.md)
        .background(EtalonColors.page)
        .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.md)
        .padding(horizontal = HAIR_PAD_H, vertical = HAIR_PAD_V),
    verticalArrangement = Arrangement.spacedBy(CELL_GAP),
) {
    Text(caption, style = EtalonType.caption, color = EtalonColors.ink2, maxLines = 1, overflow = TextOverflow.Ellipsis)
    CellField(
        rowId, text, onText, HairValueStyle, ImeAction.Done,
        KeyboardActions(onDone = { focusManager.clearFocus() }),
    )
}

/**
 * The editable half of a cell. [TextFieldValue] rather than the `String` overload on purpose: the
 * text goes to the ViewModel through [filterDecimalText], and when the filter drops the keystroke
 * (a second separator, a pasted letter) the `String` overload re-renders the OLD text and parks
 * the caret at its end — mid-number, that throws the operator back to the front of the field.
 * Holding the selection here keeps the caret where the filter left it.
 *
 * The draft stays the source of truth: [LaunchedEffect] follows it whenever it moves without this
 * cell typing it — a ± bump, «юқорилаштириш», a restored draft — and parks the caret at the end,
 * which is where the operator would continue from.
 */
@Composable
private fun CellField(
    rowId: String,
    text: String,
    onText: (String) -> Unit,
    style: TextStyle,
    imeAction: ImeAction,
    actions: KeyboardActions,
) {
    var value by remember(rowId) { mutableStateOf(TextFieldValue(text, TextRange(text.length))) }
    LaunchedEffect(text) {
        if (value.text != text) value = TextFieldValue(text, TextRange(text.length))
    }
    BasicTextField(
        value = value,
        onValueChange = { typed ->
            val filtered = filterDecimalText(typed.text)
            val caret = (typed.selection.end - (typed.text.length - filtered.length))
                .coerceIn(0, filtered.length)
            value = TextFieldValue(filtered, TextRange(caret))
            onText(filtered)
        },
        singleLine = true,
        textStyle = style.copy(color = EtalonColors.ink),
        cursorBrush = SolidColor(EtalonColors.indigo),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal, imeAction = imeAction),
        keyboardActions = actions,
        modifier = Modifier.fillMaxWidth(),
        decorationBox = { inner ->
            if (value.text.isEmpty()) {
                Text(stringResource(R.string.calc_cell_placeholder), style = style, color = EtalonColors.ink3, maxLines = 1)
            }
            inner()
        },
    )
}

/**
 * §3.4 row 2: «RateCell (button): same geometry as Таяниш; caption row `Нарх/м²` + 10dp chevron;
 * value `140k · авто` (13/700 + 10/600 at 70%). Auto = page-bg/hairline/ink; overridden = indigo
 * bg, white text, `140k · қўлда`».
 *
 * The rate shown is the one the quote is priced at: the override when there is one, otherwise
 * what the engine picked ([autoPickedRate]).
 */
@Composable
private fun RateCell(row: SlabRow, enabled: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val overridden = row.m2PriceOverride
    val fg = if (overridden) EtalonColors.onDark else EtalonColors.ink
    val captionColor = if (overridden) EtalonColors.onDark.copy(alpha = SUFFIX_ALPHA) else EtalonColors.ink2
    Column(
        modifier.minimumInteractiveComponentSize().fillMaxHeight()
            .clip(EtalonShapes.md)
            .background(if (overridden) EtalonColors.indigo else EtalonColors.page)
            .then(
                if (overridden) Modifier
                else Modifier.border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.md),
            )
            .clickable(
                enabled = enabled, role = Role.Button, indication = etalonRipple(onDark = overridden),
                interactionSource = remember { MutableInteractionSource() }, onClick = onClick,
            )
            .padding(horizontal = HAIR_PAD_H, vertical = HAIR_PAD_V),
        verticalArrangement = Arrangement.spacedBy(CELL_GAP),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(
                stringResource(R.string.calc_rate_cell), style = EtalonType.caption, color = captionColor,
                maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
            )
            EtalonIcon(EtalonIcons.ChevronDown, null, size = RATE_CHEVRON, tint = captionColor)
        }
        val rate = appliedRate(row)
        val suffix = stringResource(
            R.string.calc_rate_suffix,
            stringResource(if (overridden) R.string.calc_rate_manual_suffix else R.string.calc_pattern_auto_suffix),
        )
        val suffixStyle = EtalonType.caption
        val valueText = if (enabled) formatRateK(rate) else DASH
        val measurer = rememberTextMeasurer()
        // «· авто» is a whole word or nothing: ellipsized to «· а…» it reads as a truncated value,
        // and the figure beside it is the number the quote turns on. So the two runs are measured
        // against the width this row actually got — the row is `fillMaxWidth`, so that width is
        // the cell's and does not depend on what is inside it, which is what keeps this from
        // oscillating. At a 1.3 font scale on a narrow column the rate stands alone.
        // (`BoxWithConstraints` would read this in one pass, but it is a `SubcomposeLayout` and
        // the InputRow measures its cells' intrinsic heights to make them share an edge.)
        // 0 is "not measured yet", not "no room": the suffix is shown until a width says it does
        // not fit, so the common case never pops it in a frame late.
        var cellWidth by remember(row.id) { mutableIntStateOf(0) }
        val density = LocalDensity.current
        val fits = enabled && remember(valueText, suffix, cellWidth, density) {
            cellWidth == 0 || with(density) {
                measurer.measure(valueText, RateValueStyle).size.width +
                    CELL_GAP.roundToPx() +
                    measurer.measure(suffix, suffixStyle).size.width <= cellWidth
            }
        }
        Row(
            Modifier.fillMaxWidth().onSizeChanged { cellWidth = it.width },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(valueText, style = RateValueStyle, color = fg, maxLines = 1)
            if (fits) {
                Spacer(Modifier.width(CELL_GAP))
                Text(suffix, style = suffixStyle, color = fg.copy(alpha = SUFFIX_ALPHA), maxLines = 1)
            }
        }
    }
}

/** The m² rate this room is priced at — the operator's override, or the tier the engine picked.
 *  0.0 until the row computes, where the cell shows [DASH] rather than a price. */
private fun appliedRate(row: SlabRow): Double =
    if (row.m2PriceOverride) row.m2PriceOverrideValue ?: autoPickedRate(row) else autoPickedRate(row)

/**
 * §3.4 row 4: «4 equal columns, margin-top 10, top hairline, pad-top 10: caption 10/600 ink3 +
 * value 15/700 tabular with 11/500 ink2 unit: `Монолит Б x,xx м` · `Балка N та` · `Ғишт N та` ·
 * `Майдон x,xx м²` (right-aligned)».
 *
 * An extras-only room has no slab, so its two м² figures read [DASH] (§4.1 rule 9); a row that
 * does not compute yet reads [DASH] in all four (rule 10).
 */
@Composable
internal fun ResultRow(r: SlabResult?) = Row(
    Modifier.fillMaxWidth().padding(top = RESULT_TOP),
    horizontalArrangement = Arrangement.spacedBy(EtalonSpace.xs),
) {
    val slab = r?.takeIf { !it.isExtrasOnly }
    ResultCell(
        stringResource(R.string.calc_out_monolith),
        slab?.let { formatDecimal(BigDecimal.valueOf(it.monolithLength), 2) },
        stringResource(R.string.calc_unit_m),
        Alignment.Start,
    )
    ResultCell(
        stringResource(R.string.calc_out_beams),
        r?.let { formatDecimal(BigDecimal.valueOf(it.beamCount.toLong()), 0) },
        stringResource(R.string.calc_unit_pcs),
        Alignment.Start,
    )
    ResultCell(
        stringResource(R.string.calc_out_blocks),
        r?.let { formatDecimal(BigDecimal.valueOf(it.totalBlocks.toLong()), 0) },
        stringResource(R.string.calc_unit_pcs),
        Alignment.Start,
    )
    ResultCell(
        stringResource(R.string.calc_out_area),
        slab?.let { formatDecimal(BigDecimal.valueOf(it.monolithArea), 2) },
        stringResource(R.string.calc_unit_m2),
        Alignment.End,
    )
}

/** One of [ResultRow]'s four columns. A `null` [value] is the row that has nothing to show yet —
 *  the unit goes with it, because «— та» reads as a count of nothing rather than as no count. */
@Composable
private fun RowScope.ResultCell(
    caption: String,
    value: String?,
    unit: String,
    align: Alignment.Horizontal,
) = Column(Modifier.weight(1f), horizontalAlignment = align) {
    Text(caption, style = EtalonType.caption, color = EtalonColors.ink3, maxLines = 1, overflow = TextOverflow.Ellipsis)
    Spacer(Modifier.height(CELL_GAP))
    if (value == null) {
        Text(DASH, style = CellValueStyle, color = EtalonColors.ink3)
    } else {
        Row {
            Text(value, style = CellValueStyle, color = EtalonColors.ink, modifier = Modifier.alignByBaseline(), maxLines = 1)
            Spacer(Modifier.width(CELL_GAP))
            Text(unit, style = UnitStyle, color = EtalonColors.ink2, modifier = Modifier.alignByBaseline(), maxLines = 1)
        }
    }
}

/**
 * §3.4 row 5: «flex, gap 10, margin-top 8: left 11 ink2 `{rate} × {billed m²} м²` + ` + {extras}
 * балка` when extras/BGB cost > 0 (wraps); right subtotal 16/800 tabular».
 *
 * The extras figure is the engine's own `patternExtraCost + manualExtraBeamsCost` rather than
 * `subtotal − rate × billed`: both are already `round2`'d by the engine, so adding them is exact,
 * while re-deriving the m² cost here would repeat a rounding the engine has already done and
 * could disagree with it by a tiyin on the very line that explains the total.
 *
 * An extras-only room has no m² leg at all (§4.1 rule 9), so it shows the beam line alone.
 */
@Composable
internal fun FooterRow(row: SlabRow, r: SlabResult?) = Row(
    Modifier.fillMaxWidth().padding(top = FOOTER_TOP),
    horizontalArrangement = Arrangement.spacedBy(FOOTER_GAP),
    verticalAlignment = Alignment.Bottom,
) {
    val money = r?.money()
    val extras = money?.let { it.patternExtraCost + it.manualExtraBeamsCost } ?: Money.ZERO
    val extrasLine = if (extras.isZero) "" else stringResource(R.string.calc_footer_extras, formatMoney(extras))
    val formula = when {
        r == null -> ""
        // No m² leg to add to, so the beams are the whole line rather than an addition to it.
        r.isExtrasOnly -> stringResource(R.string.calc_footer_beams_only, formatMoney(extras))
        else -> stringResource(
            R.string.calc_footer_formula,
            formatMoney(tierPriceMoney(appliedRate(row))),
            formatDecimal(BigDecimal.valueOf(r.billedArea), 2),
        ) + extrasLine
    }
    Text(formula, style = EtalonType.meta, color = EtalonColors.ink2, modifier = Modifier.weight(1f))
    Text(
        money?.let { formatMoney(it.subtotal) } ?: DASH,
        style = SubtotalStyle, color = EtalonColors.ink, maxLines = 1,
    )
}
