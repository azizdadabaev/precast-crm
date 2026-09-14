package uz.etalon.crm.feature.logistics.drivers

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberModalBottomSheetState
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
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.etalon.crm.core.designsystem.components.Avatar
import uz.etalon.crm.core.designsystem.components.EmptyState
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.EtalonFilterChip
import uz.etalon.crm.core.designsystem.components.EtalonIconButton
import uz.etalon.crm.core.designsystem.components.EtalonTextField
import uz.etalon.crm.core.designsystem.components.FormCard
import uz.etalon.crm.core.designsystem.components.FormField
import uz.etalon.crm.core.designsystem.components.LocalNavPillInset
import uz.etalon.crm.core.designsystem.components.PHONE_LOCAL_DIGITS
import uz.etalon.crm.core.designsystem.components.PhoneDigitsMask
import uz.etalon.crm.core.designsystem.components.PrimaryButton
import uz.etalon.crm.core.designsystem.components.StatusTag
import uz.etalon.crm.core.designsystem.components.StickyActionBar
import uz.etalon.crm.core.designsystem.icon.EtalonIcons
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.Driver
import uz.etalon.crm.core.ui.format.formatCountBare
import uz.etalon.crm.core.ui.format.formatPhone
import uz.etalon.crm.feature.logistics.LogisticsHeader
import uz.etalon.crm.feature.logistics.R
import uz.etalon.crm.feature.logistics.tokenSwitchColors
import uz.etalon.crm.core.designsystem.R as DesignSystemR

/** The card's own inset around the rows: with [EtalonSpace.rowPadH] inside every row it puts the
 *  avatar 14 dp from the card's edge, the same figure the clients list keeps. */
private val ROW_INSET = 6.dp

/** §2's list-row avatar, the same 36 dp [uz.etalon.crm.core.designsystem.components.OrderRow] draws. */
private val AVATAR = 36.dp

/** Title to the tag row under it, the same 3 dp every restyled list row uses. */
private val ROW_TITLE_GAP = 3.dp

/** Tag to the meta beside it. */
private val TAG_GAP = 6.dp

/** The dial circle: the row's own trailing glyph, drawn at the 36 dp every icon button in a row
 *  is, inside the 48 dp slot [EtalonIconButton] reserves. */
private val DIAL = 36.dp

/** §2's form sheet: the 20/16 every restyled sheet in the app uses. */
private val SHEET_PAD_H = EtalonSpace.xl
private val SHEET_PAD_V = EtalonSpace.lg

/** How far «Изоҳ» may grow before it scrolls inside itself — the same three lines the client
 *  sheet's own note field allows. */
private const val NOTES_MAX_LINES = 3

@Composable
fun DriversRoute(onBack: () -> Unit, vm: HiltDriversViewModel = hiltViewModel()) {
    val s by vm.state.collectAsStateWithLifecycle()
    val canManage by vm.canManage.collectAsStateWithLifecycle()
    DriversScreen(
        s = s, canManage = canManage, onBack = onBack, onRefresh = vm::refresh,
        onSetActiveOnly = vm::setActiveOnly, onCreate = vm::create, onSetActive = vm::setActive,
    )
}

/**
 * §5.2's row for this screen: «Drivers: Clients-style avatar rows». Top to bottom — the back arrow
 * beside «Ҳайдовчилар» and how many there are, the «Фаол» filter, one white `xl` card of avatar
 * rows, and a sticky «Ҳайдовчи қўшиш» that opens the create sheet.
 *
 * The row is the clients list's own shape without its money: the avatar, the name, the active tag
 * over the phone and what the driver is carrying, the dial, and — for an operator who holds
 * `driver.manage` — the switch that retires him. A driver has no detail screen behind him, so the
 * row itself does not click: the two things that can be done to a driver are both on the row.
 *
 * The shell draws its floating nav pill over this screen and gives it no `Scaffold`, so the screen
 * pads the status bar itself, the sticky bar is bottom-aligned inside a plain `Box`, and the list
 * reserves exactly what that bar covers — measured, not assumed. There is no text field on the
 * screen itself, so no `imePadding` (ruling R13): the three this flow has live in the create sheet,
 * an M3 `ModalBottomSheet`, which pads itself for the keyboard.
 */
@Composable
fun DriversScreen(
    s: DriversUiState,
    canManage: Boolean,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onSetActiveOnly: (Boolean) -> Unit,
    onCreate: (name: String, phone: String, notes: String?) -> Unit,
    onSetActive: (id: String, active: Boolean) -> Unit,
) {
    var showAdd by remember { mutableStateOf(false) }
    // What the bar actually covers, read back from its own layout: the scrim, the button and the
    // nav-pill band the bar adds beneath itself. Zero while there is no bar, which is when the list
    // falls back to the pill's own clearance.
    var barHeightPx by remember { mutableIntStateOf(0) }
    val barHeight = with(LocalDensity.current) { barHeightPx.toDp() }
    // Activating and retiring a driver are both online-only and neither is server-side idempotent
    // (see DriversViewModel), and `setActive` returns early while another request is in flight —
    // so the switch is disabled rather than left live to swallow the tap.
    val actionsEnabled = !s.loading && !s.isOffline

    Box(Modifier.fillMaxSize().background(EtalonColors.page).statusBarsPadding()) {
        Column(Modifier.fillMaxSize()) {
            // The module's shared header. Drivers is pushed from the account sheet rather than
            // being a tab of its own, so it carries the back arrow every pushed screen draws —
            // Nav3's NavDisplay renders the entry and nothing around it.
            LogisticsHeader(
                title = stringResource(R.string.drivers_title),
                meta = stringResource(R.string.drivers_subtitle, formatCountBare(s.drivers.size)),
                onBack = onBack,
            )
            // A server-side filter, not a client-side one: toggling it re-fetches (see
            // DriversViewModel.setActiveOnly), which is why the count above it moves with it.
            Row(Modifier.fillMaxWidth().padding(horizontal = EtalonSpace.headerMargin)) {
                EtalonFilterChip(
                    label = stringResource(R.string.drivers_active_only),
                    selected = s.activeOnly,
                    onClick = { onSetActiveOnly(!s.activeOnly) },
                )
            }
            Spacer(Modifier.height(EtalonSpace.sm))
            s.error?.let {
                ErrorBanner(
                    it, onRetry = onRefresh,
                    modifier = Modifier.padding(horizontal = EtalonSpace.cardMargin)
                        .padding(bottom = EtalonSpace.sm),
                )
            }
            PullToRefreshBox(isRefreshing = s.loading, onRefresh = onRefresh, modifier = Modifier.fillMaxSize()) {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(
                        start = EtalonSpace.cardMargin,
                        end = EtalonSpace.cardMargin,
                        top = EtalonSpace.xs,
                        // The bar already carries the pill's band inside its own height, so the
                        // two are a maximum and never a sum.
                        bottom = maxOf(barHeight, LocalNavPillInset.current),
                    ),
                    verticalArrangement = Arrangement.spacedBy(EtalonSpace.md),
                ) {
                    // Never beside an error banner and never while loading (see
                    // DriversUiState.showEmptyState): «no drivers» and «couldn't check» must not
                    // read the same to an operator about to add a second row for a driver who has
                    // one.
                    if (s.showEmptyState) item { EmptyState(stringResource(R.string.drivers_empty)) }
                    // One card with the rows stacked inside it, not a card per row — the clients
                    // list's own sheet. The list is one unbounded page from the server, but the
                    // fleet is a couple of dozen lorries, so it can never grow past a screenful
                    // of rows the way a client list could.
                    if (s.drivers.isNotEmpty()) {
                        item(key = "card") { DriversCard(s.drivers, canManage, actionsEnabled, onSetActive) }
                    }
                }
            }
        }

        Box(Modifier.align(Alignment.BottomCenter).onSizeChanged { barHeightPx = it.height }) {
            // Offered only to an operator who holds `driver.manage`. Disabled while offline because
            // POST /api/drivers is not idempotency-wrapped and so may not be queued — said before
            // the tap rather than after it.
            //
            // `loading` is the second term because it is ONE flag shared by the list refresh,
            // `setActive` and `create` (see DriversViewModel). Without it, an operator who flips a
            // driver's switch and taps «Ҳайдовчи қўшиш» before that settles opens a sheet whose
            // «Сақлаш» is already spinning for a request the sheet never sent.
            if (canManage) {
                StickyActionBar {
                    PrimaryButton(
                        text = stringResource(R.string.action_add_driver),
                        onClick = { showAdd = true },
                        enabled = !s.loading && !s.isOffline,
                    )
                }
            }
        }
    }

    if (showAdd) {
        AddDriverSheet(
            submitting = s.loading,
            created = s.createdCount,
            error = s.error,
            onDismiss = { showAdd = false },
            onCreate = onCreate,
            onDone = { showAdd = false },
        )
    }
}

/** The white sheet of §3.6, the same one the clients list draws its rows on. */
@Composable
private fun DriversCard(
    drivers: List<Driver>,
    canManage: Boolean,
    actionsEnabled: Boolean,
    onSetActive: (id: String, active: Boolean) -> Unit,
) = Column(
    Modifier.fillMaxWidth()
        .clip(EtalonShapes.xl).background(EtalonColors.surface)
        .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.xl)
        .padding(horizontal = ROW_INSET, vertical = EtalonSpace.xs),
) {
    drivers.forEach { d ->
        DriverRow(d, canManage, actionsEnabled, onSetActive = { active -> onSetActive(d.id, active) })
    }
}

/**
 * One driver as a light list row: the avatar, the name, and under it the active tag beside
 * the phone with [driverWorkload] after it.
 *
 * The dial stays a target of its own — unlike the clients list, where a tappable phone inside a
 * tappable row would be two targets a thumb cannot tell apart. Nothing else on this row clicks, and
 * the number an operator wants when a lorry is late is the whole reason this screen is reachable
 * from the account sheet.
 */
@Composable
private fun DriverRow(d: Driver, canManage: Boolean, actionsEnabled: Boolean, onSetActive: (Boolean) -> Unit) {
    val ctx = LocalContext.current
    Row(
        Modifier.fillMaxWidth()
            .heightIn(min = EtalonSpace.minTouch)
            .padding(horizontal = EtalonSpace.rowPadH, vertical = EtalonSpace.rowPadV),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Avatar(d.name, size = AVATAR)
        Spacer(Modifier.width(EtalonSpace.rowGap))
        Column(Modifier.weight(1f)) {
            // The tag rides beside the NAME rather than under it, which is where the orders and
            // discrepancies rows put theirs. Those rows' metas are three short fields; this one is
            // a phone number and a workload, and with «Фаол» in front of it the line had room for
            // the number and nothing else — «2 та фао…» is not a fact anybody can act on.
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    d.name,
                    style = EtalonType.rowTitle, color = EtalonColors.ink,
                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                Spacer(Modifier.width(TAG_GAP))
                StatusTag(d.active)
            }
            Spacer(Modifier.height(ROW_TITLE_GAP))
            // Two texts rather than one joined string, so the ellipsis can only ever fall on the
            // workload. The number is what this screen is opened for when a lorry is late, and a
            // «+998 90 111 22…» is a number nobody can dial; the counts beside it are context and
            // may be cut. Same glyphs, same order, same « · » — only what survives a short row
            // changes.
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    formatPhone(d.phone),
                    style = EtalonType.meta, color = EtalonColors.ink3,
                    maxLines = 1,
                )
                val workload = driverWorkload(d)
                if (workload.isNotEmpty()) {
                    Text(
                        " · $workload",
                        style = EtalonType.meta, color = EtalonColors.ink3,
                        maxLines = 1, overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
        Spacer(Modifier.width(EtalonSpace.xs))
        EtalonIconButton(
            icon = EtalonIcons.Phone,
            contentDescription = stringResource(DesignSystemR.string.ds_cd_call),
            onClick = { dial(ctx, d.phone) },
            size = DIAL,
            shape = EtalonShapes.md,
        )
        if (canManage) {
            Switch(
                checked = d.active,
                onCheckedChange = onSetActive,
                enabled = actionsEnabled,
                colors = tokenSwitchColors(),
            )
        }
    }
}

/**
 * What follows the number on the meta line: «2 та фаол жўнатма · 30 кунда 1 та тафовут», and only
 * the counts the server actually reports. A driver with nothing on the road and nothing against
 * him shows the phone alone rather than two zeroes — so this is empty and the row prints no
 * separator either.
 */
@Composable
private fun driverWorkload(d: Driver): String = listOfNotNull(
    stringResource(R.string.driver_active_dispatches, d.activeDispatchCount).takeIf { d.activeDispatchCount > 0 },
    stringResource(R.string.driver_discrepancies_30d, d.discrepancyCount30d).takeIf { d.discrepancyCount30d > 0 },
).joinToString(" · ")

/**
 * Opens the dialer with the number filled in — `ACTION_DIAL`, never `ACTION_CALL`, which needs the
 * `CALL_PHONE` permission and would place a real call on a mis-tap. Guarded, because a device with
 * no dialer at all (an emulator image, a warehouse tablet) throws straight out of the tap handler
 * and takes the screen down with it. The same shape `feature:clients`' own `dial` uses.
 *
 * [phone] is the stored digits-only form. It is never logged.
 */
private fun dial(ctx: Context, phone: String) {
    runCatching { ctx.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:+$phone"))) }
}

/**
 * Adding a driver: §2's form sheet, the same white [FormCard] the client edit sheet carries.
 *
 * The sheet holds while the create is in flight so its own «Сақлаш» can carry the spinner, and
 * closes only when a driver has actually been created. Every refusal keeps it up with [error]
 * above the field that caused it: the ones the ViewModel makes ITSELF (a blank name, eight digits,
 * no network) never start a request at all, and a refusal from the server — a connection lost
 * mid-request above all — used to close the sheet and take the typed name, phone and note with it,
 * so the operator had to type the lot again to read why it failed.
 *
 * @param created [DriversUiState.createdCount] — the success signal. The effect keys on a CHANGE
 *   of it rather than on [submitting] falling, which is what tells a refusal apart from a save.
 * @param onDone what to do once a driver has been created — dismissal, distinct from [onDismiss]'s
 *   "the operator swiped it away".
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddDriverSheet(
    submitting: Boolean,
    created: Int,
    error: String?,
    onDismiss: () -> Unit,
    onCreate: (name: String, phone: String, notes: String?) -> Unit,
    onDone: () -> Unit,
) {
    var name by remember { mutableStateOf("") }
    var phoneDigits by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }
    var submitted by remember { mutableStateOf(false) }
    // Keyed on the success counter, so no refusal of any kind can reach it: this sheet holds the
    // only copy of what the operator typed. It runs once on composition too, with `submitted`
    // still false — which is exactly why the guard is on `submitted` and not on the key.
    LaunchedEffect(created) {
        if (submitted) {
            submitted = false
            onDone()
        }
    }
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        // Straight to full height, the same reason the client sheet does it: at Material's
        // half-screen anchor «Сақлаш» sits below the fold, and a form whose save button has to be
        // dragged into view is a form that gets half filled in.
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = EtalonColors.surface,
        shape = EtalonShapes.sheetTop,
    ) {
        Column(
            Modifier.fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = SHEET_PAD_H, vertical = SHEET_PAD_V),
            verticalArrangement = Arrangement.spacedBy(EtalonSpace.md),
        ) {
            Text(
                stringResource(R.string.action_add_driver),
                style = EtalonType.sectionTitle,
                color = EtalonColors.ink,
            )
            error?.let { ErrorBanner(it) }
            FormCard {
                FormField(stringResource(R.string.driver_name)) {
                    EtalonTextField(
                        value = name,
                        onValueChange = { name = it },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                // The «+998 » is display-only: the field holds the nine local digits and the caller
                // sends the twelve-digit form. The digits are DRAWN «90 111 22 33» by the shared
                // `PhoneDigitsMask`, the same grouping the client form shows.
                //
                // ASCII digits, not `Char.isDigit()`: Kotlin's is Unicode-aware, so an Arabic-Indic
                // digit would pass both this filter and the ViewModel's own check and then reach a
                // server whose `/\D+/` strips it — a driver saved under a number nobody typed. The
                // same rule `normalizePhone` documents.
                FormField(stringResource(R.string.driver_phone)) {
                    EtalonTextField(
                        value = phoneDigits,
                        onValueChange = { phoneDigits = it.filter { c -> c in '0'..'9' }.take(PHONE_LOCAL_DIGITS) },
                        modifier = Modifier.fillMaxWidth(),
                        prefix = "+998 ",
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                        visualTransformation = PhoneDigitsMask,
                    )
                }
                FormField(stringResource(R.string.driver_notes), divider = false) {
                    EtalonTextField(
                        value = notes,
                        onValueChange = { notes = it },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = false,
                        maxLines = NOTES_MAX_LINES,
                    )
                }
            }
            // `loading` already takes the click away (PrimaryButton is `enabled && !loading`), so a
            // separate `enabled = !submitting` would only repeat it — and repeating it paints the
            // disabled skin over a save that IS going through.
            PrimaryButton(
                text = stringResource(R.string.logistics_action_save),
                onClick = {
                    submitted = true
                    onCreate(name, "998$phoneDigits", notes.ifBlank { null })
                },
                loading = submitting,
            )
            // The sheet's own bottom edge: the gesture bar's inset plus a little air, the same
            // close every restyled sheet in the app draws.
            Spacer(Modifier.navigationBarsPadding().height(EtalonSpace.sm))
        }
    }
}
