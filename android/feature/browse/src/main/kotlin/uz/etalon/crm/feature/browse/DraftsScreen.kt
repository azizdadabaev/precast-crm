package uz.etalon.crm.feature.browse

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.etalon.crm.core.designsystem.components.EmptyState
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.SearchField
import uz.etalon.crm.core.designsystem.components.SegmentItem
import uz.etalon.crm.core.designsystem.components.SegmentedControl
import uz.etalon.crm.core.designsystem.components.Tag
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.DraftLine
import uz.etalon.crm.core.model.Resource
import uz.etalon.crm.core.ui.format.formatArea
import uz.etalon.crm.core.ui.format.formatDate
import uz.etalon.crm.core.ui.format.formatMoney
import uz.etalon.crm.core.ui.format.formatPhone
import uz.etalon.crm.core.designsystem.components.navPillContentPadding

/**
 * «Лойиҳалар» — the bar's fifth cell, and the web's `/projects`.
 *
 * A draft is a calculation somebody saved and did not place. The list exists so that work is not
 * lost between a customer's phone call and their decision: without it the only way back to a saved
 * quote on the phone was to recalculate it.
 *
 * The «Лойиҳалар» / «Барчаси» control is the web's own, and means the same thing — the first sends
 * `status=DRAFT`, the second sends no status and lets ordered projects back into the list, where
 * their row prints the order number they became instead of the «Лойиҳа» tag.
 */
@Composable
fun DraftsRoute(onOpenOrder: (String) -> Unit, vm: DraftsViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val query by vm.query.collectAsStateWithLifecycle()
    val draftsOnly by vm.draftsOnly.collectAsStateWithLifecycle()
    DraftsScreen(
        state = state,
        query = query,
        draftsOnly = draftsOnly,
        onQueryChange = vm::setQuery,
        onDraftsOnlyChange = vm::setDraftsOnly,
        onRetry = vm::refresh,
        onOpenOrder = onOpenOrder,
    )
}

@Composable
internal fun DraftsScreen(
    state: Resource<List<DraftLine>>,
    query: String,
    draftsOnly: Boolean,
    onQueryChange: (String) -> Unit,
    onDraftsOnlyChange: (Boolean) -> Unit,
    onRetry: () -> Unit,
    onOpenOrder: (String) -> Unit,
) {
    val rows = state.dataOrNull.orEmpty()
    Column(Modifier.fillMaxSize().background(EtalonColors.page).statusBarsPadding()) {
        Column(Modifier.padding(horizontal = EtalonSpace.xl, vertical = EtalonSpace.md)) {
            Text(stringResource(R.string.drafts_title), style = EtalonType.displayTitle, color = EtalonColors.ink)
            Text(
                stringResource(R.string.drafts_subtitle),
                style = EtalonType.meta,
                color = EtalonColors.ink2,
            )
        }
        Column(Modifier.padding(horizontal = EtalonSpace.cardMargin)) {
            SearchField(
                value = query,
                onValueChange = onQueryChange,
                placeholder = stringResource(R.string.drafts_search_hint),
            )
            Spacer(Modifier.height(EtalonSpace.sm))
            SegmentedControl(
                items = listOf(
                    SegmentItem(stringResource(R.string.drafts_seg_drafts)),
                    SegmentItem(stringResource(R.string.drafts_seg_all)),
                ),
                selectedIndex = if (draftsOnly) 0 else 1,
                onSelect = { onDraftsOnlyChange(it == 0) },
                onNavy = false,
            )
        }
        Spacer(Modifier.height(EtalonSpace.sm))
        if (state is Resource.Error) ErrorBanner(state.error.message, onRetry = onRetry)
        if (rows.isEmpty() && state !is Resource.Loading) {
            EmptyState(
                text = if (query.isBlank()) {
                    stringResource(R.string.drafts_empty)
                } else {
                    stringResource(R.string.drafts_empty_search, query)
                },
            )
        }
        LazyColumn(
            contentPadding = navPillContentPadding(
                start = EtalonSpace.cardMargin,
                end = EtalonSpace.cardMargin,
                top = EtalonSpace.xs,
            ),
            verticalArrangement = Arrangement.spacedBy(EtalonSpace.sm),
        ) {
            items(rows, key = { it.id }) { row ->
                // row.id is the PROJECT; what a tap must open is the ORDER it became.
                DraftCard(row, onClick = row.orderId?.let { id -> { onOpenOrder(id) } })
            }
        }
    }
}

/**
 * @param onClick null for a project that is still a draft. There is no draft editor on the phone —
 *   the calculator opens empty, not onto a saved project — so a tap would lead nowhere. An ordered
 *   one opens its order, which is a real destination.
 */
@Composable
private fun DraftCard(row: DraftLine, onClick: (() -> Unit)?) = Column(
    Modifier.fillMaxWidth().clip(EtalonShapes.xl).background(EtalonColors.surface)
        .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.xl)
        .then(if (onClick != null) Modifier.clickable(role = Role.Button, onClick = onClick) else Modifier)
        .padding(horizontal = EtalonSpace.cardPadH, vertical = EtalonSpace.cardPadV),
) {
    Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.Top) {
        Column(Modifier.weight(1f)) {
            Text(
                row.clientName?.takeIf { it.isNotBlank() } ?: stringResource(R.string.drafts_no_client),
                style = EtalonType.rowTitle,
                color = if (row.clientName.isNullOrBlank()) EtalonColors.ink3 else EtalonColors.ink,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            row.clientPhone?.takeIf { it.isNotBlank() }?.let {
                Text(formatPhone(it), style = EtalonType.meta, color = EtalonColors.ink2, maxLines = 1)
            }
        }
        Spacer(Modifier.width(EtalonSpace.sm))
        // Ordered projects wear the order number they became; the rest wear the «Лойиҳа» tag.
        val ordered = row.orderNumber
        if (ordered != null) {
            Tag(ordered, fg = EtalonColors.green, bg = EtalonColors.greenBg)
        } else {
            Tag(stringResource(R.string.drafts_tag_draft), fg = EtalonColors.ink2, bg = EtalonColors.surfaceBorder)
        }
    }
    Spacer(Modifier.height(EtalonSpace.xs))
    Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
        Text(
            stringResource(R.string.drafts_meta, row.rooms, formatArea(row.area)),
            style = EtalonType.meta,
            color = EtalonColors.ink3,
            maxLines = 1,
        )
        Text(formatMoney(row.subtotal), style = EtalonType.rowAmount, color = EtalonColors.ink, maxLines = 1)
    }
    Spacer(Modifier.height(2.dp))
    Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
        row.clientAddress?.takeIf { it.isNotBlank() }?.let {
            Text(
                it,
                style = EtalonType.meta,
                color = EtalonColors.ink3,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
        } ?: Box(Modifier.weight(1f))
        Text(formatDate(row.updatedAt), style = EtalonType.caption, color = EtalonColors.ink3, maxLines = 1)
    }
}
