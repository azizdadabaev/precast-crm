package uz.etalon.crm.feature.calculator

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.shape.RoundedCornerShape
import uz.etalon.crm.core.calc.SlabRow
import uz.etalon.crm.core.designsystem.components.CountStepper
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
/** The toggle cell's own side padding — §3.4 gives the cell no padding of its own; this is
 *  `Таяниш`'s 7 dp rounded up to the grid so the label clears the pill's corner. */
private val TOGGLE_PAD_H = EtalonSpace.sm
/** The gap between the ⋯ panel and the InputRow above it — §3.4's own inter-row 10. */
private val MORE_TOP = 10.dp

/** §3.4 row 3: the toggle's label, 13/600 — the same step `Таяниш`'s value is set in. */
private val ToggleLabelStyle = EtalonType.body.copy(fontWeight = FontWeight.W600)
/** R4: the working-out pairs are `meta` — 11/400 for the name, 11/600 for the figure, so the
 *  numbers still read as numbers in a block of eleven-point grey. */
private val WorkingValueStyle = EtalonType.labelSm

/**
 * What ⋯ opens on a room card: the engine inputs §3.4 puts here (+Б қўшимча, Бош балка, delete),
 * this app's own duplicate and reorder (plan ruling R3), and the engine's read-only working-out
 * (ruling R4) — the five numbers an operator checks against the desk.
 *
 * §3.4 draws the first three as one `1fr 1fr auto` row. That grid cannot survive D7: two
 * [EtalonIconButton]s reserve 48 dp each whatever they paint, so a 1fr column at this card's
 * 351 dp of inner width leaves the stepper 145 dp for a label, a value and two buttons that need
 * 214 dp between them. The controls therefore stack as three h40 rows of the same 6 dp gap, in
 * §3.4's own order, rather than being squeezed into one — recorded in the task report.
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
    CountStepper(
        label = stringResource(R.string.calc_more_extra_beams),
        value = row.extraBeams,
        onChange = { onExtraBeams(it) },
    )
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(MORE_GAP)) {
        ToggleCell(
            label = stringResource(R.string.calc_more_start_beam),
            on = row.forceStartBeam,
            onToggle = { onForceStartBeam(!row.forceStartBeam) },
            modifier = Modifier.weight(1f),
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
 * §3.4 row 3: «`Бош балка` toggle (page bg/hairline; on = navy bg, white, checkbox 16dp radius 5
 * with check)». The whole cell is the target — a 16 dp box is not one — and it keeps its 48 dp
 * slot (D7) around the 40 dp it paints.
 */
@Composable
private fun ToggleCell(label: String, on: Boolean, onToggle: () -> Unit, modifier: Modifier = Modifier) {
    val fg = if (on) EtalonColors.onDark else EtalonColors.ink
    Row(
        modifier.minimumInteractiveComponentSize()
            .height(MORE_CELL_HEIGHT)
            .clip(EtalonShapes.md)
            .background(if (on) EtalonColors.navy else EtalonColors.page)
            .then(
                if (on) Modifier else Modifier.border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.md),
            )
            .clickable(
                role = Role.Switch, indication = etalonRipple(onDark = on),
                interactionSource = remember { MutableInteractionSource() }, onClick = onToggle,
            )
            .padding(horizontal = TOGGLE_PAD_H),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(EtalonSpace.sm),
    ) {
        Text(label, style = ToggleLabelStyle, color = fg, maxLines = 1, modifier = Modifier.weight(1f))
        Box(
            Modifier.size(CHECKBOX)
                .clip(RoundedCornerShape(CHECKBOX_RADIUS))
                .background(if (on) EtalonColors.onDark else EtalonColors.surface)
                .then(
                    if (on) Modifier
                    else Modifier.border(EtalonSpace.hairline, EtalonColors.surfaceBorder, RoundedCornerShape(CHECKBOX_RADIUS)),
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
