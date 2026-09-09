package uz.etalon.crm.feature.calculator

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DragHandle
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.calc.Pattern
import uz.etalon.crm.core.calc.SlabRow
import uz.etalon.crm.core.calc.money
import uz.etalon.crm.core.designsystem.components.Chip
import uz.etalon.crm.core.designsystem.components.ChipTone
import uz.etalon.crm.core.designsystem.components.MoneyText
import uz.etalon.crm.core.designsystem.components.NoticeBanner
import uz.etalon.crm.core.designsystem.components.SectionLabel
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.designsystem.theme.LocalEtalonColors
import uz.etalon.crm.core.ui.format.formatArea
import uz.etalon.crm.core.ui.format.formatMeters
import uz.etalon.crm.feature.calculator.KeypadTarget.Field.LENGTH
import uz.etalon.crm.feature.calculator.KeypadTarget.Field.WIDTH
import java.math.BigDecimal

/**
 * The collapsed room card: name, the two large ЭНИ/БЎЙИ entry fields, a live result strip, the
 * pattern chip and the room's subtotal — plus the «Қўшимча» expander row Task 5 fills in, and an
 * overflow menu to duplicate or delete the room.
 *
 * [index] and [listState] are only for the drag handle's own gesture math (see [DragHandle]); the
 * card renders no differently for its position in the list otherwise.
 */
@Composable
fun RoomCard(
    row: SlabRow,
    index: Int,
    listState: LazyListState,
    keypadTarget: KeypadTarget?,
    expanded: Boolean,
    onNameChange: (String) -> Unit,
    onOpenField: (KeypadTarget.Field) -> Unit,
    onToggleExpanded: () -> Unit,
    onDuplicate: () -> Unit,
    onDelete: () -> Unit,
    onMove: (Int, Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val ext = LocalEtalonColors.current
    val shape = MaterialTheme.shapes.large
    var menuOpen by remember { mutableStateOf(false) }
    val r = row.result

    Column(
        modifier.fillMaxWidth()
            .clip(shape)
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, ext.border, shape)
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            DragHandle(index = index, rowId = row.id, listState = listState, onMove = onMove)
            OutlinedTextField(
                value = row.name, onValueChange = onNameChange, singleLine = true,
                textStyle = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f),
            )
            Box {
                IconButton(onClick = { menuOpen = true }, modifier = Modifier.size(48.dp)) {
                    Icon(Icons.Default.MoreVert, contentDescription = stringResource(R.string.calc_action_more))
                }
                DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                    DropdownMenuItem(
                        text = { Text(stringResource(R.string.calc_action_duplicate)) },
                        onClick = { menuOpen = false; onDuplicate() },
                    )
                    DropdownMenuItem(
                        text = { Text(stringResource(R.string.calc_action_delete)) },
                        onClick = { menuOpen = false; onDelete() },
                    )
                }
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
            DimensionField(
                label = stringResource(R.string.calc_field_width),
                valueText = formatMeters(row.innerWidth),
                highlighted = keypadTarget == KeypadTarget(row.id, WIDTH),
                onClick = { onOpenField(WIDTH) },
                modifier = Modifier.weight(1f),
            )
            DimensionField(
                label = stringResource(R.string.calc_field_length),
                valueText = formatMeters(row.innerLength),
                highlighted = keypadTarget == KeypadTarget(row.id, LENGTH),
                onClick = { onOpenField(LENGTH) },
                modifier = Modifier.weight(1f),
            )
        }

        if (r != null) {
            Text(
                stringResource(
                    R.string.calc_result_strip,
                    formatArea(BigDecimal.valueOf(r.monolithArea)),
                    stringResource(R.string.calc_beams, r.beamCount),
                    stringResource(R.string.calc_blocks, r.totalBlocks),
                ),
                style = EtalonType.monoBody, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            Text("—", style = EtalonType.monoBody, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }

        Row(
            Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            if (r != null) {
                // The engine's own contract: `pattern` is a sentinel value on an extras-only row
                // and must not be read as a real layout (SlabResult's KDoc, CalculateSlab.kt:219).
                if (!r.isExtrasOnly) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Chip(ChipTone.PRIMARY, stringResource(patternLabel(r.pattern)))
                        if (row.patternOverride == null) {
                            Text(
                                stringResource(R.string.calc_pattern_auto),
                                style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                } else {
                    Spacer(Modifier)
                }
                MoneyText(r.money().subtotal, style = EtalonType.monoTitle)
            } else {
                Spacer(Modifier)
                Text("—", style = EtalonType.monoTitle, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }

        Row(
            Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable(onClick = onToggleExpanded),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(
                stringResource(R.string.calc_extras),
                style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Icon(
                if (expanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        if (!row.canPersist && row.result != null) {
            NoticeBanner(stringResource(R.string.calc_room_not_persistable))
        }
    }
}

private fun patternLabel(p: Pattern): Int = when (p) {
    Pattern.GB -> R.string.calc_pattern_gb
    Pattern.BGB -> R.string.calc_pattern_bgb
    Pattern.GBG -> R.string.calc_pattern_gbg
}

/** ЭНИ or БЎЙИ: a large, tappable value that opens the docked keypad on this field, highlighted
 *  while the keypad is pointed at it — the design's single biggest touch target, since it's what
 *  an operator taps most while quoting live. */
@Composable
private fun DimensionField(
    label: String, valueText: String, highlighted: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier,
) {
    val ext = LocalEtalonColors.current
    val shape = MaterialTheme.shapes.medium
    Column(
        modifier
            .clip(shape)
            .background(if (highlighted) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant)
            .border(1.dp, if (highlighted) MaterialTheme.colorScheme.primary else ext.border, shape)
            .clickable(onClick = onClick)
            .heightIn(min = 48.dp)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        SectionLabel(label)
        Text(valueText, style = EtalonType.monoTitle, color = MaterialTheme.colorScheme.onSurface)
    }
}

/**
 * Long-press-then-drag reorder without a new dependency. `dragFromIndex` starts at [index] (read
 * fresh at drag start through [rememberUpdatedState], so a stale closure never reorders from the
 * wrong slot) and is walked forward to whatever index this row lands on next, so a continuous
 * drag across several rows keeps calling [onMove] with the row's current position rather than
 * the one it started at.
 */
@Composable
private fun DragHandle(index: Int, rowId: String, listState: LazyListState, onMove: (Int, Int) -> Unit, modifier: Modifier = Modifier) {
    val latestIndex = rememberUpdatedState(index)
    var dragFromIndex by remember(rowId) { mutableIntStateOf(index) }
    var accumulatedY by remember(rowId) { mutableStateOf(0f) }
    Icon(
        Icons.Default.DragHandle,
        contentDescription = stringResource(R.string.calc_action_reorder),
        // `size` is an exact constraint, so the gesture must attach before `padding` narrows it —
        // padding after pointerInput only insets the icon glyph, not the ≥48dp hit region.
        modifier = modifier
            .size(48.dp)
            .pointerInput(rowId) {
                detectDragGesturesAfterLongPress(
                    onDragStart = { dragFromIndex = latestIndex.value; accumulatedY = 0f },
                    onDragEnd = { accumulatedY = 0f },
                    onDragCancel = { accumulatedY = 0f },
                    onDrag = { change, dragAmount ->
                        change.consume()
                        accumulatedY += dragAmount.y
                        val info = listState.layoutInfo
                        val dragged = info.visibleItemsInfo.firstOrNull { it.index == dragFromIndex } ?: return@detectDragGesturesAfterLongPress
                        val draggedCenter = dragged.offset + dragged.size / 2 + accumulatedY
                        val target = info.visibleItemsInfo.firstOrNull { other ->
                            other.index != dragFromIndex && draggedCenter >= other.offset && draggedCenter <= other.offset + other.size
                        }
                        if (target != null) {
                            onMove(dragFromIndex, target.index)
                            dragFromIndex = target.index
                            accumulatedY = 0f
                        }
                    },
                )
            }
            .padding(12.dp),
    )
}
