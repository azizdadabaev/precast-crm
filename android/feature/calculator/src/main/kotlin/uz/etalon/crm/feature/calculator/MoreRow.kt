package uz.etalon.crm.feature.calculator

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import uz.etalon.crm.core.calc.SlabRow
import uz.etalon.crm.core.designsystem.components.EtalonIconButton
import uz.etalon.crm.core.designsystem.components.SecondaryButton
import uz.etalon.crm.core.designsystem.icon.EtalonIcon
import uz.etalon.crm.core.designsystem.icon.EtalonIcons
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.designsystem.theme.etalonRipple
import uz.etalon.crm.core.ui.format.formatCount
import uz.etalon.crm.core.ui.format.formatMeters

/** §3.4 row 3: «MoreRow … gap 6, h40 each». */
private val MORE_GAP = 6.dp
private val MORE_CELL_HEIGHT = 40.dp
/** §3.4 row 3: «delete IconButton 40dp radius md». */
private val DELETE_BUTTON = 40.dp
/** §3.4 row 3: «checkbox 16dp radius 5 with check». */
private val CHECKBOX = 16.dp
private val CHECKBOX_RADIUS = 5.dp
private val CHECK_GLYPH = 12.dp
/** The stepper's − and +: painted 36 dp, the size every square icon button in §2 paints. */
private val STEPPER_BUTTON = 36.dp
private val STEPPER_GLYPH = 16.dp
/** The cells' own side padding — §3.4 gives them none; 6 dp is what keeps the label off an `md`
 *  corner without eating the width the stepper needs at 360 dp. */
private val CELL_PAD_H = 6.dp
/** The gap between the ⋯ panel and the InputRow above it — §3.4's own inter-row 10. */
private val MORE_TOP = 10.dp

/** §3.4 row 3: the toggle's label, 13/600 — the same step `Таяниш`'s value is set in. */
private val ToggleLabelStyle = EtalonType.body.copy(fontWeight = FontWeight.W600)
/** §3.4 row 3: the stepper's «+Б» label, 11/600 — the scale's `labelSm`, exactly. */
private val StepperLabelStyle = EtalonType.labelSm
/** §3.4 row 3: the stepper's figure, «15/700» — the same step the card's cells are set in
 *  (`RoomCard.kt`'s `CellValueStyle`; each file names its own, both off `sectionTitle`). */
private val StepperValueStyle = EtalonType.sectionTitle.copy(fontSize = 15.sp)
/** R4: the working-out pairs are `meta` — 11/400 for the name, 11/600 for the figure, so the
 *  numbers still read as numbers in a block of eleven-point grey. */
private val WorkingValueStyle = EtalonType.labelSm

/**
 * What ⋯ opens on a room card: §3.4's own `1fr 1fr auto` row — the «+Б» stepper cell, the
 * «Бош балка» toggle and delete, all h40 with a 6 dp gap — then this app's duplicate and reorder
 * (plan ruling R3) and the engine's read-only working-out (ruling R4), the five numbers an
 * operator checks against the desk.
 *
 * D7 vs the drawn geometry, the [uz.etalon.crm.core.designsystem.components.SegmentedControl]
 * pattern: every control here paints §3.4's size and reserves 48 dp of touch around it, which
 * overhangs the 40 dp row — so the row's cells are painted with `background(colour, shape)`
 * rather than `clip(shape).background(colour)`. A clip is a graphics layer, and a layer clips
 * touch as well as paint, which would hand back the hit area D7 just bought.
 */
@Composable
fun MoreRow(
    row: SlabRow,
    canMoveUp: Boolean,
    canMoveDown: Boolean,
    onExtraBeams: (Int) -> Unit,
    onForceStartBeam: (Boolean) -> Unit,
    onDuplicate: () -> Unit,
    onDelete: () -> Unit,
    onMoveUp: () -> Unit,
    onMoveDown: () -> Unit,
) = Column(
    Modifier.fillMaxWidth().padding(top = MORE_TOP),
    verticalArrangement = Arrangement.spacedBy(MORE_GAP),
) {
    Row(
        Modifier.fillMaxWidth().height(MORE_CELL_HEIGHT),
        horizontalArrangement = Arrangement.spacedBy(MORE_GAP),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        StepperCell(
            label = stringResource(R.string.calc_more_extra_beams),
            value = row.extraBeams,
            onChange = onExtraBeams,
        )
        ToggleCell(
            label = stringResource(R.string.calc_more_start_beam),
            on = row.forceStartBeam,
            onToggle = { onForceStartBeam(!row.forceStartBeam) },
        )
        EtalonIconButton(
            EtalonIcons.Trash,
            stringResource(R.string.calc_action_delete),
            onClick = onDelete,
            size = DELETE_BUTTON,
            shape = EtalonShapes.md,
            tint = EtalonColors.red,
        )
    }
    // R3: this app reorders and duplicates rooms; the capture's card does neither, and the drag
    // handle it used to carry is gone with the rest of the old card.
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(MORE_GAP),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SecondaryButton(
            text = stringResource(R.string.calc_action_duplicate),
            onClick = onDuplicate,
            compact = true,
            leadingIcon = EtalonIcons.Copy,
            modifier = Modifier.weight(1f),
        )
        EtalonIconButton(
            EtalonIcons.ArrowUp, stringResource(R.string.calc_action_move_up),
            onClick = onMoveUp, size = DELETE_BUTTON, shape = EtalonShapes.md, enabled = canMoveUp,
        )
        EtalonIconButton(
            EtalonIcons.ArrowDown, stringResource(R.string.calc_action_move_down),
            onClick = onMoveDown, size = DELETE_BUTTON, shape = EtalonShapes.md, enabled = canMoveDown,
        )
    }
    row.result?.let { r ->
        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(EtalonSpace.xs)) {
            WorkingOutRow(stringResource(R.string.calc_out_monolith_length), formatMeters(r.monolithLength))
            WorkingOutRow(stringResource(R.string.calc_out_beam_length), formatMeters(r.beamLength))
            WorkingOutRow(stringResource(R.string.calc_out_pitches), formatCount(r.pitches))
            WorkingOutRow(stringResource(R.string.calc_out_block_rows), formatCount(r.blockRows))
            WorkingOutRow(stringResource(R.string.calc_out_blocks_per_row), formatCount(r.blocksPerRow))
        }
    }
}

/**
 * §3.4 row 3: «`+Б қўшимча` numeric stepper cell (label left, value right 15/700)» — one `1fr`
 * column of the row, so it has 145 dp at 411 dp of screen and 120 dp at 360 dp. That is why this
 * is not [uz.etalon.crm.core.designsystem.components.CountStepper]: that one's label, two 48 dp
 * slots and 56 dp minimum figure cell need 152 dp before its label starts.
 *
 * The two buttons paint 36 dp and lay out 36 dp wide, with their 48 dp touch slot overhanging on
 * every side ([requiredSize] inside the painted box, the SegmentedControl pattern). The label
 * carries the `weight`, so when the column runs out of room the LABEL gives way — ellipsis first,
 * then nothing — and the figure and the two buttons are never the thing that goes.
 *
 * The two touch slots are 36 dp apart and 48 dp wide, so they overlap by 12 dp down the middle;
 * Compose hit-tests children in reverse order, so that band belongs to «+». A tap that lands in
 * it was aimed at one of the two buttons either way — the alternative, a 12 dp gap between them,
 * costs exactly the width the «+Б» label needs at 360 dp.
 */
@Composable
private fun RowScope.StepperCell(label: String, value: Int, onChange: (Int) -> Unit) = Row(
    Modifier.weight(1f)
        .height(MORE_CELL_HEIGHT)
        .background(EtalonColors.page, EtalonShapes.md)
        .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.md)
        .padding(horizontal = CELL_PAD_H),
    verticalAlignment = Alignment.CenterVertically,
) {
    Text(
        label, style = StepperLabelStyle, color = EtalonColors.ink2,
        maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
    )
    Text(
        value.toString(), style = StepperValueStyle, color = EtalonColors.ink, maxLines = 1,
        modifier = Modifier.padding(horizontal = EtalonSpace.xs),
    )
    StepperButton(
        EtalonIcons.Minus, stringResource(R.string.calc_extra_beams_decrease),
        enabled = value > 0, onClick = { onChange(value - 1) },
    )
    StepperButton(
        EtalonIcons.Plus, stringResource(R.string.calc_extra_beams_increase),
        enabled = true, onClick = { onChange(value + 1) },
    )
}

/** §3.4 row 3's stepper buttons: 36 dp painted and laid out, 48 dp of touch overhanging it —
 *  [requiredSize] ignores the 36 dp box's constraints, so the hit slot spills 6 dp on each side
 *  instead of taking 48 dp of a 120 dp column. Nothing between it and the card clips. */
@Composable
private fun StepperButton(icon: Int, contentDescription: String, enabled: Boolean, onClick: () -> Unit) =
    Box(Modifier.size(STEPPER_BUTTON), contentAlignment = Alignment.Center) {
        Box(
            Modifier.requiredSize(EtalonSpace.minTouch)
                .clickable(
                    enabled = enabled, role = Role.Button, indication = etalonRipple(),
                    interactionSource = remember { MutableInteractionSource() }, onClick = onClick,
                ),
            contentAlignment = Alignment.Center,
        ) {
            Box(
                Modifier.size(STEPPER_BUTTON)
                    .background(EtalonColors.surface, EtalonShapes.sm)
                    .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.sm),
                contentAlignment = Alignment.Center,
            ) {
                EtalonIcon(
                    icon, contentDescription, size = STEPPER_GLYPH,
                    tint = if (enabled) EtalonColors.ink else EtalonColors.ink3,
                )
            }
        }
    }

/**
 * §3.4 row 3: «`Бош балка` toggle (page bg/hairline; on = navy bg, white, checkbox 16dp radius 5
 * with check)». The whole cell is the target — a 16 dp box is not one — and `toggleable` is what
 * publishes its state: the box is the only thing that says the start beam is forced, and a screen
 * reader cannot see it (the same reason `SegmentedControl` uses `selectable`).
 */
@Composable
private fun RowScope.ToggleCell(label: String, on: Boolean, onToggle: () -> Unit) {
    val fg = if (on) EtalonColors.onDark else EtalonColors.ink
    Row(
        Modifier.weight(1f)
            .height(MORE_CELL_HEIGHT)
            .background(if (on) EtalonColors.navy else EtalonColors.page, EtalonShapes.md)
            .then(
                if (on) Modifier
                else Modifier.border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.md),
            )
            .toggleable(
                value = on,
                onValueChange = { onToggle() },
                role = Role.Checkbox,
                indication = etalonRipple(onDark = on),
                interactionSource = remember { MutableInteractionSource() },
            )
            .padding(horizontal = CELL_PAD_H),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(EtalonSpace.xs),
    ) {
        Text(
            label, style = ToggleLabelStyle, color = fg, maxLines = 1,
            overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
        )
        Box(
            Modifier.size(CHECKBOX)
                .background(
                    if (on) EtalonColors.onDark else EtalonColors.surface,
                    RoundedCornerShape(CHECKBOX_RADIUS),
                )
                .then(
                    if (on) Modifier
                    else Modifier.border(
                        EtalonSpace.hairline, EtalonColors.surfaceBorder, RoundedCornerShape(CHECKBOX_RADIUS),
                    ),
                ),
            contentAlignment = Alignment.Center,
        ) {
            if (on) EtalonIcon(EtalonIcons.Check, null, size = CHECK_GLYPH, tint = EtalonColors.navy)
        }
    }
}

/** One line of the engine's working-out (R4) — no touch handling at all: this block answers
 *  "why that much?", it is not something to tap. */
@Composable
private fun WorkingOutRow(label: String, value: String) = Row(
    Modifier.fillMaxWidth(),
    horizontalArrangement = Arrangement.SpaceBetween,
) {
    Text(label, style = EtalonType.meta, color = EtalonColors.ink2)
    Text(value, style = WorkingValueStyle, color = EtalonColors.ink)
}
