package uz.etalon.crm.feature.calculator

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.calc.money
import uz.etalon.crm.core.calc.operatorAmountMoney
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.EtalonFilterChip
import uz.etalon.crm.core.designsystem.components.EtalonTextField
import uz.etalon.crm.core.designsystem.components.FormCard
import uz.etalon.crm.core.designsystem.components.FormField
import uz.etalon.crm.core.designsystem.components.FormFieldValue
import uz.etalon.crm.core.designsystem.components.NoticeBanner
import uz.etalon.crm.core.designsystem.components.PrimaryButton
import uz.etalon.crm.core.designsystem.components.SecondaryButton
import uz.etalon.crm.core.designsystem.components.TierTag
import uz.etalon.crm.core.designsystem.icon.EtalonIcon
import uz.etalon.crm.core.designsystem.icon.EtalonIcons
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.CapacityTier
import uz.etalon.crm.core.ui.format.TASHKENT
import uz.etalon.crm.core.ui.format.formatArea
import uz.etalon.crm.core.ui.format.formatCount
import uz.etalon.crm.core.ui.format.formatDate
import uz.etalon.crm.core.ui.format.formatDecimal
import uz.etalon.crm.core.ui.format.formatMoney
import uz.etalon.crm.core.ui.format.formatPercent
import uz.etalon.crm.core.ui.format.formatPhone
import uz.etalon.crm.core.ui.regions.composeAddress
import uz.etalon.crm.feature.calculator.calendar.DateGridSheet
import uz.etalon.crm.feature.calculator.calendar.tierOfDate
import java.math.BigDecimal
import java.time.LocalDate
import java.time.YearMonth

/** `PlaceOrderSchema.notes` is `z.string().max(2000)` — the field is capped here so an over-long
 *  note is impossible to type rather than rejected after the customer has waited for a round trip. */
internal const val PLACE_NOTES_MAX = 2000

// ── The sheet's own sizes ─────────────────────────────────────────

/** §2's form sheet, the same 20/16 the ⋯ settings sheet and `OutboxSheet` use. */
private val SHEET_PAD_H = EtalonSpace.xl
private val SHEET_PAD_V = EtalonSpace.lg
/** The air between the title, the client tile, the form card, the roll-up and the actions. */
private val BLOCK_GAP = EtalonSpace.md
/** Between the two discount chips, and between the two action buttons. */
private val ROW_GAP = EtalonSpace.sm
/** The client tile: §1.3's white row on the page ground, `lg` at the row padding every list row
 *  in the app uses. */
private val TILE_PAD_H = EtalonSpace.md
private val TILE_PAD_V = EtalonSpace.rowGap
/** A roll-up row — tall enough to read as a line of a receipt, short of a 48 dp touch row: none of
 *  them is tappable. */
private val SUMMARY_ROW_HEIGHT = 30.dp
/** The rule above «Жами». */
private val RULE_PAD_V = EtalonSpace.sm
/** §3.4's date row carries the same 10 dp chevron the rate cell does. */
private val CHEVRON = EtalonSpace.rowGap

/** «Жами» — `label` (12/600) lifted to 700, the weight §2 gives the one figure of a roll-up that
 *  is agreed rather than merely shown. */
private val TotalStyle = EtalonType.label.copy(fontWeight = FontWeight.W700)

/**
 * Whether the client bar has collected everything `PlaceOrderSchema` insists on: a name, a full
 * nine-digit phone, and an address. All three are `min(1)`/`min(5)` server-side — unlike the draft
 * route, which takes them as optional — so a quote that would be perfectly saveable as a project
 * can still be unplaceable, and the sheet has to say which.
 */
internal fun canPlaceClient(s: CalculatorUiState): Boolean =
    s.clientName.isNotBlank() &&
        s.clientPhoneDigits.length == CLIENT_PHONE_DIGITS &&
        composeAddress(s.clientAddress.viloyat, s.clientAddress.tuman, s.clientAddress.street).isNotBlank()

/**
 * Whether «Буюртма бериш» may be tapped. Deliberately a plain function over the state plus the
 * one thing the sheet owns (the picked date), so the whole rule is testable without Compose —
 * `PlaceOrderSheetStateTest` is that test.
 *
 * An extras-only room blocks the submit rather than being dropped from it: the server rejects a
 * room whose `innerLength` is not positive, and quietly sending the other rooms would place an
 * order for less than the operator quoted. [CalculatorUiState.unpersistableRoomNames] is what the
 * sheet names in the notice above the button.
 */
internal fun canPlaceOrder(s: CalculatorUiState, scheduledAt: LocalDate?): Boolean =
    s.canWrite &&
        !s.placing &&
        !s.saving &&
        scheduledAt != null &&
        s.unpersistableRoomNames.isEmpty() &&
        s.rows.any { it.canPersist } &&
        canPlaceClient(s)

/**
 * The picked calendar day as the ISO-8601 instant `PlaceOrderSchema.scheduledAt` coerces.
 *
 * Resolved at the START OF DAY in `Asia/Tashkent`, not UTC: the server buckets an order into a
 * delivery day with `Date#getDate()` in its own local zone (see `GET /api/orders`'s `day` filter
 * and the capacity calendar), and a Tashkent day resolved as UTC midnight lands five hours early —
 * on the previous day for anyone reading the calendar. The customer said a day; this is that day.
 */
internal fun scheduledAtInstant(date: LocalDate): String =
    date.atStartOfDay(TASHKENT).toInstant().toString()

/**
 * «Буюртма бериш» — the sheet that turns the quote on screen into a real order.
 *
 * **D10 put three money fields here**: the discount (a percentage or a flat sum, never both), the
 * delivery cost and any other cost. They were on the old expandable totals sheet, where they sat
 * beside the quote at all times; they belong at the moment they are agreed, which is this one, and
 * the summary sheet's headline total behind this sheet moves live as they are typed.
 *
 * It computes nothing. Every figure it shows is read off [CalculatorUiState] — the engine priced
 * the rooms, [uz.etalon.crm.core.calc.OrderTotals] rolled them up — and the SERVER recomputes
 * every room from the inputs the repository sends; nothing here is ever the source of a number the
 * customer is charged.
 *
 * Two ways out, and the second is the reason this screen exists at all: a calculator is used at a
 * customer's site, where signal is worst. When the placement fails for want of a signal the sheet
 * stays open and offers «Навбатга қўйиш» — the same body, the same idempotency key, sent by the
 * outbox when a bar comes back.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlaceOrderSheet(
    state: CalculatorUiState,
    vm: CalculatorViewModel,
    onDismiss: () -> Unit,
    onPlace: (scheduledAt: String, notes: String) -> Unit,
    onQueue: (scheduledAt: String, notes: String) -> Unit,
    initialScheduledAt: LocalDate? = null,
    // Remembered, not read on every pass: the grid's «Бугун» ring and its floor must not move
    // under the operator's finger because a recomposition happened to land after midnight.
    today: LocalDate = remember { LocalDate.now(TASHKENT) },
) {
    // rememberSaveable: the sheet survives a rotation or a process death with the date and the
    // note the operator already typed, the same way the quote behind it survives. The three money
    // fields need no such treatment — they live on the ViewModel and are autosaved with the draft.
    //
    // [initialScheduledAt] is null in the app — there is deliberately NO default date (see the
    // picker below). It is passed only by the screenshot tests: a date picked through the dialog
    // is today's, which would re-date the baseline every morning and fail `verifyRoborazzi` on a
    // frame nobody touched.
    var scheduledEpochDay by rememberSaveable { mutableStateOf(initialScheduledAt?.toEpochDay()) }
    var notes by rememberSaveable { mutableStateOf("") }
    val scheduledAt = scheduledEpochDay?.let(LocalDate::ofEpochDay)
    // How loaded the picked day already is (§7). Known only once that day's month has been
    // through the grid — which it has, since the only way to pick a day is to tap one there.
    val scheduledTier = scheduledAt?.let { tierOfDate(state.capacityMonths[YearMonth.from(it)], it) }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = EtalonColors.surface,
        scrimColor = SHEET_SCRIM,
        shape = EtalonShapes.sheetTop,
        dragHandle = null,
        // Straight to full height: at Material's half-screen anchor the roll-up and «Буюртма
        // бериш» sit below the fold, and the one action the sheet exists for must not have to be
        // dragged into view.
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
    ) {
        Column(
            Modifier.fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = SHEET_PAD_H, vertical = SHEET_PAD_V),
            verticalArrangement = Arrangement.spacedBy(BLOCK_GAP),
        ) {
            Text(
                stringResource(R.string.calc_place_title),
                style = EtalonType.sectionTitle,
                color = EtalonColors.ink,
            )

            ClientTile(state)

            FormCard {
                FormField(stringResource(R.string.calc_place_scheduled_at)) {
                    DateRow(
                        value = scheduledAt?.let { formatDate(it.atStartOfDay(TASHKENT).toInstant()) },
                        tier = scheduledTier,
                        onClick = { vm.openDateGrid(scheduledAt) },
                    )
                }

                FormField(stringResource(R.string.calc_place_notes)) {
                    Column(Modifier.fillMaxWidth()) {
                        EtalonTextField(
                            value = notes,
                            onValueChange = { if (it.length <= PLACE_NOTES_MAX) notes = it },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = false,
                            maxLines = 3,
                        )
                        Text(
                            stringResource(R.string.calc_place_notes_counter, notes.length, PLACE_NOTES_MAX),
                            style = EtalonType.meta,
                            color = EtalonColors.ink3,
                            modifier = Modifier.padding(top = EtalonSpace.xs),
                        )
                    }
                }

                // D10. The two chips are the UNIT, not two fields: `setDiscountMode` zeroes the
                // one being left, exactly as the engine boundary resolves them (a positive UZS
                // amount always wins over a percentage — see `withTotals`).
                FormField(stringResource(R.string.calc_place_discount)) {
                    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(ROW_GAP)) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(ROW_GAP)) {
                            EtalonFilterChip(
                                label = stringResource(R.string.calc_place_discount_pct),
                                selected = state.discountMode == DiscountMode.PERCENT,
                                onClick = { vm.setDiscountMode(DiscountMode.PERCENT) },
                            )
                            EtalonFilterChip(
                                label = stringResource(R.string.calc_place_discount_sum),
                                selected = state.discountMode == DiscountMode.AMOUNT,
                                onClick = { vm.setDiscountMode(DiscountMode.AMOUNT) },
                            )
                        }
                        when (state.discountMode) {
                            DiscountMode.PERCENT -> AmountField(
                                value = state.discountPercent,
                                idleText = { formatDecimal(BigDecimal.valueOf(it), maxDigits = 2) },
                                allowDecimal = true,
                                onValue = vm::setDiscountPercent,
                            )
                            DiscountMode.AMOUNT -> AmountField(
                                value = state.discountAmount,
                                idleText = { formatMoney(operatorAmountMoney(it)) },
                                allowDecimal = false,
                                onValue = vm::setDiscountAmount,
                            )
                        }
                    }
                }

                FormField(stringResource(R.string.calc_delivery_cost)) {
                    AmountField(
                        value = state.deliveryCost,
                        idleText = { formatMoney(operatorAmountMoney(it)) },
                        allowDecimal = false,
                        onValue = vm::setDeliveryCost,
                    )
                }

                FormField(stringResource(R.string.calc_other_cost), divider = false) {
                    AmountField(
                        value = state.otherCost,
                        idleText = { formatMoney(operatorAmountMoney(it)) },
                        allowDecimal = false,
                        onValue = vm::setOtherCost,
                    )
                }
            }

            OrderSummary(state)

            // Named, never silently dropped — see canPlaceOrder's own doc.
            if (state.unpersistableRoomNames.isNotEmpty()) {
                NoticeBanner(
                    stringResource(R.string.calc_cannot_save_rooms, state.unpersistableRoomNames.joinToString(", ")),
                )
            }
            state.error?.let { ErrorBanner(it) }

            PrimaryButton(
                text = stringResource(R.string.calc_action_place_order),
                onClick = { scheduledAt?.let { onPlace(scheduledAtInstant(it), notes) } },
                enabled = canPlaceOrder(state, scheduledAt),
                loading = state.placing,
            )
            // Only after a lost signal. A server refusal is not queueable — the same body would
            // simply be refused again, hours later, with nobody watching.
            if (state.queueOffered) {
                SecondaryButton(
                    text = stringResource(R.string.calc_place_queue),
                    onClick = { scheduledAt?.let { onQueue(scheduledAtInstant(it), notes) } },
                    enabled = canPlaceOrder(state, scheduledAt),
                )
            }
        }
    }

    // §7: the capacity grid, read-only, in place of the Material date picker this sheet used to
    // open. The picked day stays sheet-local — the grid only reports which one was tapped.
    state.dateGrid?.let { grid ->
        DateGridSheet(
            grid = grid,
            selected = scheduledAt,
            today = today,
            onPrev = vm::dateGridPrev,
            onNext = vm::dateGridNext,
            onPick = { day -> scheduledEpochDay = day.toEpochDay(); vm.closeDateGrid() },
            onRetry = vm::retryDateGrid,
            onDismiss = vm::closeDateGrid,
        )
    }

    // The grid belongs to this sheet, not to the quote: dismissing the place-order sheet with the
    // picker still open would otherwise leave `dateGrid` set on the ViewModel, and the next
    // «Буюртма бериш» would open onto a calendar nobody asked for.
    DisposableEffect(Unit) { onDispose { vm.closeDateGrid() } }
}

/** Who the order is for. Read-only: the client bar on the screen behind is where this is edited,
 *  and re-offering it here would be a second place to change the customer a committed order
 *  belongs to. */
@Composable
private fun ClientTile(state: CalculatorUiState) = Column(
    Modifier.fillMaxWidth()
        .clip(EtalonShapes.lg)
        .background(EtalonColors.page)
        .padding(horizontal = TILE_PAD_H, vertical = TILE_PAD_V),
) {
    Text(
        state.clientName,
        style = EtalonType.rowTitle,
        color = EtalonColors.ink,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
    )
    Text(formatPhone(state.clientPhoneDigits), style = EtalonType.meta, color = EtalonColors.ink2, maxLines = 1)
    Text(
        composeAddress(state.clientAddress.viloyat, state.clientAddress.tuman, state.clientAddress.street),
        style = EtalonType.meta,
        color = EtalonColors.ink2,
        maxLines = 2,
        overflow = TextOverflow.Ellipsis,
    )
}

/** The date field's value line: what was picked — with how loaded that day already is (§7) — or
 *  the prompt, and the chevron that says a picker opens. No default date — `scheduledAt` is
 *  required server-side and a silent "today" would be a real production commitment nobody chose.
 *
 *  [tier] is null until the day's month has been loaded, and the row simply shows the date then:
 *  a tier is the server's own arithmetic, and there is nothing honest to print in its place. */
@Composable
private fun DateRow(value: String?, tier: CapacityTier?, onClick: () -> Unit) = Row(
    Modifier.fillMaxWidth()
        .heightIn(min = EtalonSpace.minTouch)
        .clickable(
            interactionSource = remember { MutableInteractionSource() },
            indication = null,
            onClick = onClick,
        ),
    verticalAlignment = Alignment.CenterVertically,
) {
    // The date and its tag are ONE value, so they share the row's free width and the chevron keeps
    // its place at the end. `fill = false` is what keeps the tag against the date rather than
    // against the chevron; the tag is measured first, so at font scale 1,3 it is the date that
    // ellipsises — «тўлиб кетган» clipped down the middle would be unreadable, and the date is
    // still legible at «20 сен 20…».
    Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
        Text(
            value ?: stringResource(R.string.calc_place_pick_date),
            style = FormFieldValue,
            color = if (value != null) EtalonColors.ink else EtalonColors.ink3,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f, fill = false),
        )
        if (value != null && tier != null) {
            TierTag(tier, modifier = Modifier.padding(start = ROW_GAP))
        }
    }
    EtalonIcon(EtalonIcons.ChevronDown, null, size = CHEVRON, tint = EtalonColors.ink3)
}

/**
 * One of D10's three money inputs.
 *
 * The text is local while the field has focus and the FORMATTED value when it does not: the group
 * separator this app writes sums with is U+202F, which no keyboard can type back, so a field that
 * echoed `formatMoney` on every keystroke would be untypable after the first thousand. Handing the
 * plain digits over on focus and the grouped figure back on blur is what lets the operator read
 * «300 000» and still edit it. [RoomDraft] makes the same distinction for the room cells.
 *
 * [parseDecimal] is the ONE text → `Double` boundary in this feature; a blank field is 0, which is
 * also what a cleared discount means.
 *
 * @param allowDecimal false for the three UZS fields — cash has no kopeks, the same rule the old
 *   money keypad enforced, and [operatorAmountMoney] truncates anything below a whole UZS anyway.
 */
@Composable
private fun AmountField(
    value: Double,
    idleText: (Double) -> String,
    allowDecimal: Boolean,
    onValue: (Double) -> Unit,
) {
    var typed by remember { mutableStateOf("") }
    var focused by remember { mutableStateOf(false) }
    // Zero shows as an EMPTY field, never «0»: a zero an operator did not enter reads as one they
    // did, and it has to be cleared before a real figure can be typed.
    val shown = when {
        focused -> typed
        value == 0.0 -> ""
        else -> idleText(value)
    }
    EtalonTextField(
        value = shown,
        onValueChange = { raw ->
            val text = if (allowDecimal) filterDecimalText(raw) else raw.filter(Char::isDigit)
            typed = text
            onValue(parseDecimal(text) ?: 0.0)
        },
        modifier = Modifier.fillMaxWidth().onFocusChanged { focus ->
            focused = focus.isFocused
            // Seeded on the way IN, so the caret lands on the digits and not on a thin space.
            if (focus.isFocused) typed = if (value == 0.0) "" else plainText(value, allowDecimal)
        },
        keyboardOptions = KeyboardOptions(
            keyboardType = if (allowDecimal) KeyboardType.Decimal else KeyboardType.Number,
        ),
    )
}

/** The same number as [AmountField]'s idle text but typable: no grouping, and the decimal comma
 *  only where decimals are allowed at all. `internal` so `PlaceOrderSheetStateTest` can pin the
 *  one property the focus swap turns on — what this writes, [parseDecimal] reads back unchanged.
 *
 *  The whole-UZS branch goes through [operatorAmountMoney] rather than `Double.toLong()`: that is
 *  the module's ONE sanctioned crossing for an operator-typed amount, and truncating money by hand
 *  outside `:core:calc` is exactly what this app does not do — even where the keypad guarantees
 *  there is nothing to truncate. */
internal fun plainText(value: Double, allowDecimal: Boolean): String =
    if (allowDecimal) {
        BigDecimal.valueOf(value).stripTrailingZeros().toPlainString().replace('.', ',')
    } else {
        operatorAmountMoney(value).amount.toPlainString()
    }

/**
 * The quote as a receipt: the rooms, what they came to, what was taken off and what was added, and
 * the one figure the customer is committing to.
 *
 * Every figure comes from [rollupLines], the one helper the customer's quote card reads too — so
 * the operator's receipt and the customer's copy cannot drift, and **the column adds up**: see
 * that function for why the discount is the line that is derived rather than read.
 *
 * Every money line still crosses `Double` → `Money` through `:core:calc`'s sanctioned boundary and
 * no other way; [rollupLines] does all four crossings in one place.
 */
@Composable
private fun OrderSummary(state: CalculatorUiState) {
    val project = state.totals.projTotal.money()
    val lines = rollupLines(state)
    Column(Modifier.fillMaxWidth()) {
        SummaryRow(stringResource(R.string.calc_place_summary_rooms), formatCount(state.rows.count { it.canPersist }))
        SummaryRow(
            stringResource(R.string.calc_place_summary_area),
            formatArea(BigDecimal.valueOf(state.totals.monolithArea)),
        )
        SummaryRow(stringResource(R.string.calc_place_summary_rooms_subtotal), formatMoney(lines.roomsSubtotal))
        // Shown when it is worth a UZS, the same rule the two costs below follow: a discount that
        // rounds away to nothing is not a line on a receipt, and leaving it out keeps the column
        // adding up either way.
        if (lines.discount.amount.signum() > 0) {
            SummaryRow(
                // The percentage is part of the LABEL when it is what the operator entered — the
                // figure on the right is what it came to in UZS either way.
                label = if (state.discountMode == DiscountMode.PERCENT) {
                    stringResource(R.string.calc_place_summary_discount, formatPercent(project.discountPercent))
                } else {
                    stringResource(R.string.calc_place_discount)
                },
                value = stringResource(R.string.calc_place_minus, formatMoney(lines.discount)),
            )
        }
        if (lines.delivery.amount.signum() > 0) {
            SummaryRow(stringResource(R.string.calc_place_summary_delivery), formatMoney(lines.delivery))
        }
        if (lines.other.amount.signum() > 0) {
            SummaryRow(stringResource(R.string.calc_place_summary_other), formatMoney(lines.other))
        }
        Box(
            Modifier.padding(vertical = RULE_PAD_V).fillMaxWidth()
                .height(EtalonSpace.hairline).background(EtalonColors.surfaceBorder),
        )
        SummaryRow(
            label = stringResource(R.string.calc_place_summary_total),
            value = formatMoney(lines.total),
            emphasis = true,
        )
    }
}

/** One line of the roll-up: the caption left, the figure right. [emphasis] is «Жами» — `label` at
 *  700 in `ink`, against the other lines' `meta`/`rowAmount` in `ink2`, because it is the one
 *  figure of the column the customer actually agrees to. */
@Composable
private fun SummaryRow(label: String, value: String, emphasis: Boolean = false) = Row(
    Modifier.fillMaxWidth().heightIn(min = SUMMARY_ROW_HEIGHT),
    horizontalArrangement = Arrangement.SpaceBetween,
    verticalAlignment = Alignment.CenterVertically,
) {
    Text(
        label,
        style = if (emphasis) TotalStyle else EtalonType.meta,
        color = if (emphasis) EtalonColors.ink else EtalonColors.ink2,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = Modifier.weight(1f),
    )
    Text(
        value,
        style = if (emphasis) TotalStyle else EtalonType.rowAmount,
        color = if (emphasis) EtalonColors.ink else EtalonColors.ink2,
        maxLines = 1,
        modifier = Modifier.padding(start = ROW_GAP),
    )
}
