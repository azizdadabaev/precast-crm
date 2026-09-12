package uz.etalon.crm.feature.payments.discrepancies

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SheetValue
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.delay
import uz.etalon.crm.core.designsystem.components.Avatar
import uz.etalon.crm.core.designsystem.components.ConfirmSheet
import uz.etalon.crm.core.designsystem.components.ConfirmTile
import uz.etalon.crm.core.designsystem.components.DiscrepancyStatusTag
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.EtalonIconButton
import uz.etalon.crm.core.designsystem.components.EtalonTextField
import uz.etalon.crm.core.designsystem.components.EtalonToast
import uz.etalon.crm.core.designsystem.components.FormCard
import uz.etalon.crm.core.designsystem.components.FormField
import uz.etalon.crm.core.designsystem.components.MoneyText
import uz.etalon.crm.core.designsystem.components.NavySheet
import uz.etalon.crm.core.designsystem.components.NoticeBanner
import uz.etalon.crm.core.designsystem.components.PrimaryButton
import uz.etalon.crm.core.designsystem.components.SecondaryButton
import uz.etalon.crm.core.designsystem.components.TOAST_DURATION_MS
import uz.etalon.crm.core.designsystem.components.TagSurface
import uz.etalon.crm.core.designsystem.components.TonalButton
import uz.etalon.crm.core.designsystem.components.discrepancyStatusLabel
import uz.etalon.crm.core.designsystem.components.navPillContentPadding
import uz.etalon.crm.core.designsystem.icon.EtalonIcon
import uz.etalon.crm.core.designsystem.icon.EtalonIcons
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.designsystem.theme.etalonRipple
import uz.etalon.crm.core.model.Discrepancy
import uz.etalon.crm.core.model.DiscrepancyStatus
import uz.etalon.crm.core.ui.format.formatMoney
import uz.etalon.crm.core.ui.format.formatOrderNo
import uz.etalon.crm.core.ui.format.formatScheduleDate
import uz.etalon.crm.feature.payments.R
import uz.etalon.crm.feature.payments.queue.SHEET_SCRIM
import java.time.Instant
import uz.etalon.crm.core.designsystem.R as DesignSystemR

/** §2's list-row avatar, the same 36 dp [uz.etalon.crm.core.designsystem.components.OrderRow] draws. */
private val AVATAR = 36.dp

/** §2's form sheet: the 20/16 every restyled sheet in the app uses. */
private val SHEET_PAD_H = EtalonSpace.xl
private val SHEET_PAD_V = EtalonSpace.lg

/** The selected option's check, the same 16 dp glyph the approve sheet's options carry. */
private val CHECK = 16.dp

/** Stands where a name is missing, the same dash §3.6's «Қарз —» uses. */
private const val UNKNOWN = "—"

/**
 * Each resolution's own explanation, alongside the one-word label [discrepancyStatusLabel]
 * already gives every status tag in the app — reused here rather than a second mapping.
 *
 * An exhaustive `when`, not a map: a map is looked up at composition time, so a status added
 * without a hint used to crash the sheet at runtime. Here the compiler refuses the build instead,
 * which is where a missing string belongs. OPEN and UNKNOWN carry no hint because
 * [RESOLUTION_OPTIONS] never offers them — re-opening is not a resolution.
 */
@androidx.annotation.StringRes
private fun resolutionHint(status: DiscrepancyStatus): Int = when (status) {
    DiscrepancyStatus.RESOLVED_RECOVERED -> R.string.resolve_option_recovered_hint
    DiscrepancyStatus.RESOLVED_DISCOUNT -> R.string.resolve_option_discount_hint
    DiscrepancyStatus.RESOLVED_WRITEOFF -> R.string.resolve_option_writeoff_hint
    DiscrepancyStatus.DISPUTED -> R.string.resolve_option_disputed_hint
    DiscrepancyStatus.OPEN, DiscrepancyStatus.UNKNOWN -> R.string.resolve_option_none_hint
}

/**
 * A screen reached from elsewhere in the app (Home's avatar sheet, and R9's «Тафовутлар N» pill on
 * Payments), never a bottom-bar destination of its own. It draws its own back arrow: Nav3's
 * NavDisplay renders the entry and nothing around it, so a screen that does not draw one has no
 * visible way back at all.
 */
@Composable
fun DiscrepanciesRoute(
    onOpenOrder: (String) -> Unit,
    onBack: () -> Unit,
    vm: HiltDiscrepanciesViewModel = hiltViewModel(),
) {
    val s by vm.state.collectAsStateWithLifecycle()
    DiscrepanciesScreen(
        s = s,
        // Read once per composition of the route, exactly as `ConfirmQueueRoute` reads it: a
        // screen that called `Instant.now()` inside itself could not be photographed against a
        // fixed clock.
        now = Instant.now(),
        onOpenOrder = onOpenOrder,
        onBack = onBack,
        onRefresh = vm::refresh,
        onOpenResolve = vm::openResolve,
        onCloseSheet = vm::closeSheet,
        onSetStatus = vm::setStatus,
        onSetNote = vm::setNote,
        onSubmitResolve = vm::submitResolve,
        onToastShown = vm::clearToast,
    )
}

/**
 * §5.2's row for this screen: «NavySheet rows with StatusTag; resolve via ConfirmSheet». Top to
 * bottom — the back arrow beside «Нақд пул тафовутлари», the banners, and one navy [NavySheet]
 * carrying the flagged shortfalls as `2b-orders.png`'s own list rows: avatar, client, the
 * resolution tag over `№ · ҳайдовчи · сана`, the expected figure with the gap under it in
 * `debtOnDark`.
 *
 * The shell draws its floating nav pill over this screen and gives it no `Scaffold`, so the screen
 * pads the status bar itself and the list's bottom is [navPillContentPadding]. There is no sticky
 * bar and no text field on the screen itself, so no `imePadding` (ruling R13) — the one field this
 * flow has lives in the resolve sheet, an M3 `ModalBottomSheet`, which pads itself for the keyboard.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DiscrepanciesScreen(
    s: DiscrepanciesUiState,
    now: Instant,
    onOpenOrder: (String) -> Unit,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onOpenResolve: (Discrepancy) -> Unit,
    onCloseSheet: () -> Unit,
    onSetStatus: (DiscrepancyStatus) -> Unit,
    onSetNote: (String) -> Unit,
    onSubmitResolve: () -> Unit,
    onToastShown: () -> Unit,
) {
    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().background(EtalonColors.page).statusBarsPadding()) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = EtalonSpace.headerMargin, vertical = EtalonSpace.md),
                horizontalArrangement = Arrangement.spacedBy(EtalonSpace.md),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                EtalonIconButton(
                    icon = EtalonIcons.ArrowLeft,
                    contentDescription = stringResource(DesignSystemR.string.ds_cd_back),
                    onClick = onBack,
                    shape = EtalonShapes.md,
                )
                Text(
                    stringResource(R.string.discrepancies_title),
                    style = EtalonType.headline,
                    color = EtalonColors.ink,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
            }
            // Resolving is online-only — the route is not withIdempotency-wrapped, so it may
            // never be queued. The banner says so before the tap does.
            val banner = Modifier.padding(horizontal = EtalonSpace.cardMargin).padding(bottom = EtalonSpace.sm)
            if (s.isOffline) {
                ErrorBanner(stringResource(R.string.payments_offline_blocked), onRetry = onRefresh, modifier = banner)
            } else {
                s.error?.let { ErrorBanner(it, onRetry = onRefresh, modifier = banner) }
            }
            if (s.showNoResolvePermission) {
                NoticeBanner(stringResource(R.string.discrepancies_no_resolve_permission), modifier = banner)
            }
            NavySheet(
                title = stringResource(R.string.discrepancies_list_title),
                modifier = Modifier.weight(1f),
            ) {
                PullToRefreshBox(isRefreshing = s.loading, onRefresh = onRefresh, modifier = Modifier.fillMaxSize()) {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = navPillContentPadding(),
                    ) {
                        // Never beside an error banner and never while loading: an empty list
                        // there reads as "no discrepancies" when the truth is "couldn't check".
                        if (s.showEmptyState) {
                            item {
                                Text(
                                    stringResource(R.string.discrepancies_empty),
                                    style = EtalonType.body,
                                    color = EtalonColors.onDarkMuted,
                                    modifier = Modifier.padding(EtalonSpace.lg),
                                )
                            }
                        }
                        items(s.items, key = { it.id }) { d ->
                            DiscrepancyRow(
                                d = d,
                                now = now,
                                resolvable = s.canResolve,
                                resolveEnabled = !s.busy && !s.isOffline,
                                onOpenOrder = { onOpenOrder(d.orderId) },
                                onResolve = { onOpenResolve(d) },
                            )
                        }
                    }
                }
            }
        }

        // R8. The message is remembered rather than read straight off the state so the toast has
        // something to draw while it fades OUT — the state's own field is already null by then.
        var shown by remember { mutableStateOf("") }
        LaunchedEffect(s.toast) {
            val message = s.toast ?: return@LaunchedEffect
            shown = message
            delay(TOAST_DURATION_MS)
            onToastShown()
        }
        EtalonToast(shown, visible = s.toast != null, modifier = Modifier.align(Alignment.BottomCenter))
    }

    val sheet = s.sheet
    if (sheet != null) {
        ResolveSheet(
            sheet = sheet,
            submitting = s.busy,
            canResolve = s.canResolve,
            isOffline = s.isOffline,
            onDismiss = onCloseSheet,
            onSetStatus = onSetStatus,
            onSetNote = onSetNote,
            onSubmitResolve = onSubmitResolve,
        )
    }
}

/**
 * One flagged shortfall as a navy list row: expected versus the gap, the resolution as a tag, the
 * driver and the day it was reported — and, when the owner may act, the «Ҳал қилиш» offer under it.
 *
 * The figure on the right is what was EXPECTED, with the gap under it in `debtOnDark`: the row's
 * subject is money that did not arrive, so the missing sum is the thing that must be readable at
 * arm's length. A discrepancy whose gap is zero — the driver handed over everything and the flag is
 * now a question about something else — states what was received instead, in `paidOnDark`, rather
 * than drawing a red «Камомад: 0».
 *
 * @param resolveEnabled false while a resolve is in flight, and while the screen is offline: the
 *   route carries no server-side idempotency, so the action is refused rather than queued.
 */
@Composable
private fun DiscrepancyRow(
    d: Discrepancy,
    now: Instant,
    resolvable: Boolean,
    resolveEnabled: Boolean,
    onOpenOrder: () -> Unit,
    onResolve: () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    Column(
        Modifier
            .fillMaxWidth()
            .clip(EtalonShapes.lg)
            // §2: a navy row presses to indigo, exactly as OrderRow's does.
            .background(if (pressed) EtalonColors.indigo else Color.Transparent)
            .clickable(
                role = Role.Button,
                indication = etalonRipple(onDark = true),
                interactionSource = interaction,
                onClick = onOpenOrder,
            )
            .padding(horizontal = EtalonSpace.rowPadH, vertical = EtalonSpace.rowPadV),
        verticalArrangement = Arrangement.spacedBy(EtalonSpace.xs),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Avatar(d.clientName, size = AVATAR)
            Spacer(Modifier.width(EtalonSpace.rowGap))
            Column(Modifier.weight(1f)) {
                Text(
                    d.clientName,
                    style = EtalonType.rowTitle,
                    color = EtalonColors.onDark,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(3.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    DiscrepancyStatusTag(d.status, TagSurface.ROW_ON_NAVY)
                    Spacer(Modifier.width(6.dp))
                    Text(
                        metaLine(d, now),
                        style = EtalonType.meta,
                        color = EtalonColors.onDarkMuted,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Spacer(Modifier.width(EtalonSpace.rowGap))
            Column(horizontalAlignment = Alignment.End) {
                MoneyText(d.expectedAmount, style = EtalonType.rowAmount, color = EtalonColors.onDark)
                Spacer(Modifier.height(2.dp))
                val short = !d.gap.isZero
                Text(
                    if (short) {
                        stringResource(R.string.queue_shortfall, formatMoney(d.gap))
                    } else {
                        stringResource(R.string.discrepancies_received, formatMoney(d.receivedAmount))
                    },
                    style = EtalonType.tagPanel,
                    // A cut figure must not read as a smaller gap than it is: ellipsize, never clip.
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    color = if (short) EtalonColors.debtOnDark else EtalonColors.paidOnDark,
                )
            }
        }
        // The decision already taken, in the owner's own words. Two lines: it is a sentence, and
        // one line cuts most of them off at the width a tag and an avatar leave behind.
        d.resolutionNote?.let {
            Text(
                stringResource(R.string.discrepancies_resolution_note, it),
                style = EtalonType.meta,
                color = EtalonColors.onDarkMuted,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (resolvable) {
            TonalButton(
                text = stringResource(R.string.discrepancy_action_resolve),
                onClick = onResolve,
                enabled = resolveEnabled,
                onDark = true,
                modifier = Modifier.align(Alignment.End),
            )
        }
    }
}

/** `№ 09−0003 · Жасур · 3 сен` — §3.5's meta line, the driver named plainly the way the queue's own
 *  row names whoever recorded a payment. */
@Composable
private fun metaLine(d: Discrepancy, now: Instant): String = listOfNotNull(
    formatOrderNo(d.orderNumber),
    d.driverName,
    formatScheduleDate(d.reportedAt, now),
).joinToString(" · ")

/** «№ 09−0003 · Тошматов Илҳом» — the line the sheet and its gate both carry. */
private fun sheetMeta(d: Discrepancy) = "${formatOrderNo(d.orderNumber)} · ${d.clientName}"

/**
 * The one gate in front of resolving a discrepancy. Everything it collects mirrors what
 * `PATCH /api/discrepancies/{id}` will actually read — a status from [RESOLUTION_OPTIONS] and a
 * note of at least five characters.
 *
 * A white `ModalBottomSheet` rather than the navy [ConfirmSheet], for ruling R3's reason: that
 * component is the shape for a confirmation with **nothing to type**, and this sheet is four
 * choices and a mandatory note. The navy sheet is the GATE in front of the resolution instead,
 * opened by «Ҳал қилиш» below.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ResolveSheet(
    sheet: ResolveSheetState,
    submitting: Boolean,
    canResolve: Boolean,
    isOffline: Boolean,
    onDismiss: () -> Unit,
    onSetStatus: (DiscrepancyStatus) -> Unit,
    onSetNote: (String) -> Unit,
    onSubmitResolve: () -> Unit,
) {
    var gateOpen by remember { mutableStateOf(false) }
    // A swipe, a scrim tap and a back press are the same decision the Cancel button is, so they
    // are held shut for the same reason ConfirmSheet holds shut: dismissing mid-flight drops the
    // sheet the failure message is written into, on the one screen where the action cannot be
    // taken back once it lands.
    val submittingNow by rememberUpdatedState(submitting)
    // Straight to full height: at Material's half-screen anchor the four options and the footer
    // sit below the fold, and the decision this sheet exists for must not have to be dragged
    // into view.
    val sheetState = rememberModalBottomSheetState(
        skipPartiallyExpanded = true,
        confirmValueChange = { target -> target != SheetValue.Hidden || !submittingNow },
    )
    ModalBottomSheet(
        sheetState = sheetState,
        onDismissRequest = { if (!submittingNow) onDismiss() },
        containerColor = EtalonColors.surface,
        scrimColor = SHEET_SCRIM,
        shape = EtalonShapes.sheetTop,
        dragHandle = null,
    ) {
        Column(
            Modifier.fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = SHEET_PAD_H, vertical = SHEET_PAD_V),
            verticalArrangement = Arrangement.spacedBy(EtalonSpace.md),
        ) {
            Text(
                stringResource(R.string.discrepancy_resolve_sheet_title),
                style = EtalonType.sectionTitle, color = EtalonColors.ink,
            )
            Text(
                sheetMeta(sheet.discrepancy),
                style = EtalonType.meta, color = EtalonColors.ink2,
                maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
            Text(
                stringResource(R.string.queue_expected, formatMoney(sheet.discrepancy.expectedAmount)),
                style = EtalonType.meta, color = EtalonColors.ink2,
            )
            Text(
                stringResource(R.string.discrepancies_received, formatMoney(sheet.discrepancy.receivedAmount)),
                style = EtalonType.meta, color = EtalonColors.ink2,
            )

            // The sheet always opens blank, so without this an owner replacing an earlier
            // decision (say RESOLVED_DISCOUNT → RESOLVED_WRITEOFF) would never see what they are
            // overwriting — the route replaces the resolver, the timestamp and the note with no
            // warning that this is a second pass.
            if (sheet.hasExistingResolution) {
                FormCard {
                    FormField(stringResource(R.string.discrepancy_existing_resolution_label), divider = false) {
                        Column(verticalArrangement = Arrangement.spacedBy(EtalonSpace.xs)) {
                            DiscrepancyStatusTag(sheet.discrepancy.status)
                            sheet.discrepancy.resolutionNote?.let {
                                Text(it, style = EtalonType.body, color = EtalonColors.ink)
                            }
                        }
                    }
                }
            }

            FormCard {
                FormField(stringResource(R.string.discrepancy_resolve_status_label)) {
                    Column(Modifier.fillMaxWidth()) {
                        RESOLUTION_OPTIONS.forEach { status ->
                            ResolveOption(
                                selected = sheet.status == status,
                                label = stringResource(discrepancyStatusLabel(status)),
                                hint = stringResource(resolutionHint(status)),
                                onSelect = { onSetStatus(status) },
                            )
                        }
                    }
                }
                FormField(stringResource(R.string.discrepancy_note_label), divider = false) {
                    EtalonTextField(
                        value = sheet.note,
                        onValueChange = onSetNote,
                        modifier = Modifier.fillMaxWidth(),
                        placeholder = stringResource(R.string.discrepancy_note_hint),
                        singleLine = false,
                        maxLines = 3,
                    )
                }
            }

            sheet.error?.let { ErrorBanner(it) }

            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(EtalonSpace.sm)) {
                SecondaryButton(
                    stringResource(DesignSystemR.string.ds_action_cancel), onClick = onDismiss,
                    enabled = !submitting, modifier = Modifier.weight(1f),
                )
                // `loading` alone, not `enabled = !submitting` beside it: `loading` already takes
                // the click away, and it is what keeps the indigo fill while the call is in
                // flight. Disabling it as well paints the lavender "you cannot do this" skin over
                // the action the owner has just taken.
                //
                // The gate is a CONFIRMATION, and there is nothing to confirm while the screen is
                // still holding something `submitResolve()` would refuse — no status chosen, a
                // note under five characters, no permission, or no network (the route may not be
                // queued). Opening it there asked the owner to agree on the navy panel, took the
                // tap, and then showed the reason on the sheet BEHIND the gate. So a blocked tap
                // goes straight to the ViewModel, which writes the Uzbek reason into this sheet's
                // own error banner. The four conditions are the ViewModel's own guard, read once.
                // `ResolveGateTest` pins it, as `RecordGateTest` pins the same rule one screen over.
                PrimaryButton(
                    text = stringResource(R.string.discrepancy_action_resolve),
                    onClick = {
                        if (sheet.blocker == null && canResolve && !isOffline) gateOpen = true else onSubmitResolve()
                    },
                    loading = submitting, modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.navigationBarsPadding().height(EtalonSpace.sm))
        }
    }

    // R3's final gate. In a `Dialog` of its own, the way the approve sheet's gate is: the sheet
    // above already occupies a window, and a full-screen scrim composed inside its column would be
    // laid out INSIDE the sheet rather than over it.
    if (gateOpen) {
        Dialog(
            onDismissRequest = { gateOpen = false },
            properties = DialogProperties(usePlatformDefaultWidth = false),
        ) {
            ConfirmSheet(
                caption = stringResource(R.string.discrepancy_action_resolve),
                // The gap is what the decision is about — how much never arrived — not the sum
                // that did. Zero is possible and drawn as such: a flag with nothing missing is
                // still a decision, and a hero saying «UZS 0» is the honest one.
                amount = sheet.discrepancy.gap,
                meta = sheetMeta(sheet.discrepancy),
                tiles = {
                    ConfirmTile(
                        stringResource(R.string.discrepancy_tile_type),
                        // Never null here: the gate is only opened once `blocker` is clear, and
                        // its first rule is that a status has been chosen.
                        sheet.status?.let { stringResource(discrepancyStatusLabel(it)) } ?: UNKNOWN,
                        Modifier.weight(1f),
                    )
                    ConfirmTile(
                        stringResource(R.string.record_driver_label),
                        sheet.discrepancy.driverName ?: UNKNOWN,
                        Modifier.weight(1f),
                    )
                },
                dismissText = stringResource(DesignSystemR.string.ds_action_cancel),
                confirmText = stringResource(R.string.discrepancy_action_resolve),
                onDismiss = { gateOpen = false },
                // The gate closes and the sheet behind it carries the outcome — the spinner while
                // the call is in flight, the reason if it fails. A refused resolution must land
                // where the fields that caused the refusal still are. That ordering is also why no
                // `confirmEnabled` is passed: the gate is never composed while a call is in flight,
                // so a guard on `submitting` here could only ever read true.
                onConfirm = { gateOpen = false; onSubmitResolve() },
            )
        }
    }
}

/**
 * A 48 dp option row, not a `RadioButton`: the owner is choosing how a shortfall is written off,
 * and the four options must be distinguishable and reachable with a thumb. §2's own selected-row
 * treatment, the same one the approve sheet's «Тафовут амали» draws — a `lavenderBg` fill and a
 * check glyph, so the choice is never colour alone. `Role.RadioButton` stays for TalkBack.
 */
@Composable
private fun ResolveOption(selected: Boolean, label: String, hint: String, onSelect: () -> Unit) = Row(
    Modifier.fillMaxWidth()
        .heightIn(min = EtalonSpace.minTouch)
        .clip(EtalonShapes.lg)
        .background(if (selected) EtalonColors.lavenderBg else Color.Transparent)
        .selectable(selected = selected, role = Role.RadioButton, onClick = onSelect)
        .padding(horizontal = EtalonSpace.rowPadH, vertical = EtalonSpace.rowPadV),
    verticalAlignment = Alignment.CenterVertically,
) {
    Column(Modifier.weight(1f)) {
        Text(label, style = EtalonType.rowTitle, color = EtalonColors.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(hint, style = EtalonType.meta, color = EtalonColors.ink2, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
    if (selected) {
        Spacer(Modifier.width(EtalonSpace.sm))
        EtalonIcon(EtalonIcons.Check, null, size = CHECK, tint = EtalonColors.indigo)
    }
}
