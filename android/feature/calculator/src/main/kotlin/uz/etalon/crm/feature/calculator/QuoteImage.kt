package uz.etalon.crm.feature.calculator

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import uz.etalon.crm.core.calc.SlabRow
import uz.etalon.crm.core.calc.money
import uz.etalon.crm.core.calc.operatorAmountMoney
import uz.etalon.crm.core.calc.totalPriceMoney
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.ui.format.MONEY_UNIT
import uz.etalon.crm.core.ui.format.formatAddressLine
import uz.etalon.crm.core.ui.format.formatArea
import uz.etalon.crm.core.ui.format.formatDate
import uz.etalon.crm.core.ui.format.formatDecimal
import uz.etalon.crm.core.ui.format.formatMoney
import uz.etalon.crm.core.ui.format.formatPercent
import uz.etalon.crm.core.ui.format.formatPhone
import uz.etalon.crm.core.ui.regions.composeAddress
import java.io.File
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

/**
 * «Юбориш» — the calculator's own quote card, captured to a PNG the operator hands a customer on
 * Telegram or WhatsApp while still standing in the house. Mirrors the web's own share artifact,
 * `precast-crm/src/components/share/CalculationShareCard.tsx`: company header, client line, one
 * card per priced room, then the cost roll-up — NOT the office print sheet (`orders/[id]/print`),
 * which is a different document for a different reader.
 *
 * Restyled to the design system (phase 4, task 6): the same white room card and navy summary block
 * the operator is looking at on the calculator screen, so a customer and an operator read one
 * document, not two. The per-room strip and its formula footer are literally [ResultRow] and
 * [FooterRow] from `RoomCard.kt` — reused rather than re-drawn, because «as the card draws it» is
 * a promise a copy would quietly break the first time either changed.
 *
 * Fixed width, not the device's: [QUOTE_CARD_WIDTH] — a quote a customer receives must look the
 * same on every phone regardless of which one composed it. Always the light palette
 * ([EtalonTheme] with `darkTheme = false`), regardless of the operator's own device theme, for the
 * same reason.
 *
 * Reads every figure straight off [state] — nothing here recomputes a price. Rooms with no
 * [uz.etalon.crm.core.calc.SlabRow.result] yet (still mid-typing) are skipped; an extras-only room
 * that priced but can't be *saved* still shows here — see [uz.etalon.crm.core.calc.SlabRow.canPersist]'s
 * own doc — because showing a customer a price is not writing one.
 */
private val QUOTE_CARD_WIDTH = 360.dp

/** The page margin of the sheet the cards sit on — one step in from `EtalonSpace.cardMargin`,
 *  because the capture is 360 dp wide rather than a 411 dp phone. */
private val PAGE_PAD = EtalonSpace.md

/** The stack rhythm between header, client, rooms and roll-up. Matches the room list's own gap. */
private val BLOCK_GAP = EtalonSpace.rowGap

/** §3.1's brand block: the 34 dp gradient square and the 10 dp gap Home sets it in. */
private val BRAND_MARK = 34.dp
private val BRAND_GAP = 10.dp

/** §3.4 RoomCard: «pad 14/12/10» — the card the quote reuses, to the dp. */
private val CARD_PAD_H = 14.dp
private val CARD_PAD_TOP = 12.dp
private val CARD_PAD_BOTTOM = 10.dp

/** §3.4 RoomCard row 1: the pattern chip is a 26 dp pill with 10 dp of side padding. Static here
 *  — the customer's copy has nothing to tap — so no 48 dp hit slot is reserved around it. */
private val CHIP_HEIGHT = 26.dp
private val CHIP_PAD_H = 10.dp

/** §3.4 SummarySheet: «pad 14/16/12», the navy block the total is set in. */
private val NAVY_PAD_H = 16.dp
private val NAVY_PAD_TOP = 14.dp
private val NAVY_PAD_BOTTOM = 12.dp

/** One roll-up line, the height `PlaceOrderSheet` gives the same rows. */
private val ROLLUP_ROW_HEIGHT = 28.dp

/** §3.4 SummarySheet: the total, «26/800 tabular»; `amountLg` is the scale's 30/800. */
private val TotalStyle = EtalonType.amountLg.copy(fontSize = 26.sp)

/** R7: «UZS» 12/600 at 70 % AFTER the figure — the one place in this app the unit follows the
 *  number, and the customer's copy of the very figure the summary sheet draws that way. */
private const val UNIT_ALPHA = 0.7f

/** §3.4 RoomCard row 1: the room name, 14/800. */
private val NameStyle = EtalonType.sectionTitle.copy(fontWeight = FontWeight.W800)

/** §3.4 RoomCard row 1: the chip label, 11/700. */
private val ChipLabelStyle = EtalonType.labelSm.copy(fontWeight = FontWeight.W700)

@Composable
fun QuoteCard(state: CalculatorUiState, modifier: Modifier = Modifier, now: Instant = Instant.now()) {
    EtalonTheme(darkTheme = false) {
        Column(
            modifier
                .width(QUOTE_CARD_WIDTH)
                // Opaque is not optional: a transparent capture shares as a black rectangle in
                // most messengers.
                .background(EtalonColors.page)
                .padding(PAGE_PAD),
            verticalArrangement = Arrangement.spacedBy(BLOCK_GAP),
        ) {
            QuoteHeader(now)
            QuoteClient(state)
            state.rows.forEach { row -> row.result?.let { QuoteRoomCard(row) } }
            QuoteRollup(state)
            QuoteTotal(state)
        }
    }
}

/** The wordmark Home draws in its app bar, with the company's own phone and the day the quote was
 *  made: a customer reading it a week later must be able to tell which price they are holding. */
@Composable
private fun QuoteHeader(now: Instant) = Row(
    Modifier.fillMaxWidth(),
    verticalAlignment = Alignment.CenterVertically,
) {
    Box(
        Modifier.size(BRAND_MARK).clip(EtalonShapes.md)
            .background(Brush.linearGradient(listOf(EtalonColors.indigo, EtalonColors.indigoTint))),
    )
    Spacer(Modifier.width(BRAND_GAP))
    Column(Modifier.weight(1f)) {
        Text(stringResource(R.string.calc_quote_company), style = NameStyle, color = EtalonColors.ink)
        Text(stringResource(R.string.calc_quote_company_tagline), style = EtalonType.meta, color = EtalonColors.ink2)
    }
    Column(horizontalAlignment = Alignment.End) {
        Text(
            formatPhone(stringResource(R.string.calc_quote_company_phone)),
            style = EtalonType.label, color = EtalonColors.ink, maxLines = 1,
        )
        Text(formatDate(now), style = EtalonType.meta, color = EtalonColors.ink3, maxLines = 1)
    }
}

/** Who the quote is for, in the collapsed `ClientRow` idiom: the name over phone · address. Drawn
 *  only when there is something to draw — a quote composed before the client was entered is still
 *  a quote, and an empty white strip would read as a field the operator forgot. */
@Composable
private fun QuoteClient(state: CalculatorUiState) {
    val address = formatAddressLine(
        composeAddress(state.clientAddress.viloyat, state.clientAddress.tuman, state.clientAddress.street),
    )
    val meta = listOfNotNull(
        state.clientPhoneDigits.takeIf { it.isNotBlank() }?.let { formatPhone(it) },
        address,
    ).joinToString(SEPARATOR)
    if (state.clientName.isBlank() && meta.isEmpty()) return
    QuoteSurface {
        Column(Modifier.padding(horizontal = CARD_PAD_H, vertical = EtalonSpace.rowPadV)) {
            if (state.clientName.isNotBlank()) {
                Text(state.clientName, style = EtalonType.sectionTitle, color = EtalonColors.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (meta.isNotEmpty()) {
                Text(meta, style = EtalonType.meta, color = EtalonColors.ink2, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

/**
 * One priced room, in the room card's own idiom: the name and its dimensions, the pattern as a
 * static tag, then the four-column result strip and the formula footer exactly as `RoomCard` draws
 * them — same composables, so the customer's copy and the operator's screen can never drift.
 */
@Composable
private fun QuoteRoomCard(row: SlabRow) {
    val r = row.result ?: return
    QuoteSurface {
        Column(Modifier.padding(start = CARD_PAD_H, end = CARD_PAD_H, top = CARD_PAD_TOP, bottom = CARD_PAD_BOTTOM)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(
                        row.name.ifBlank { stringResource(R.string.calc_quote_room_unnamed) },
                        style = NameStyle, color = EtalonColors.ink, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    )
                    // An extras-only room has no slab, so its «эни × бўйи» would be «0,00 × 0,00»
                    // — a measurement nobody took. The engine's own sentinel rule, same as the
                    // pattern tag below.
                    if (!r.isExtrasOnly) {
                        Text(
                            stringResource(
                                R.string.calc_quote_room_dims,
                                formatDecimal(BigDecimal.valueOf(row.innerWidth), 2),
                                formatDecimal(BigDecimal.valueOf(row.innerLength), 2),
                            ),
                            style = EtalonType.meta, color = EtalonColors.ink2, maxLines = 1,
                        )
                    }
                }
                if (!r.isExtrasOnly) PatternTag(stringResource(patternLabel(r.pattern)))
            }
            Box(
                Modifier.padding(top = EtalonSpace.rowGap).fillMaxWidth()
                    .height(EtalonSpace.hairline).background(EtalonColors.surfaceBorder),
            )
            ResultRow(r)
            FooterRow(row, r)
        }
    }
}

/** [PatternChip]'s resting state without the tap: the customer cannot cycle a layout, and the
 *  «авто» suffix says something about how the operator worked, not about what is being bought. */
@Composable
private fun PatternTag(label: String) = Box(
    Modifier.height(CHIP_HEIGHT).clip(EtalonShapes.pill).background(EtalonColors.lavenderBg)
        .padding(horizontal = CHIP_PAD_H),
    contentAlignment = Alignment.Center,
) {
    Text(label, style = ChipLabelStyle, color = EtalonColors.indigo, maxLines = 1)
}

/**
 * What the rooms come to and what moves it: the same four lines `PlaceOrderSheet` shows the
 * operator before placing, on the same strings — a customer who is later handed the order must
 * find the identical arithmetic.
 *
 * The discount comes off `totals.projTotal`, which is `round2`'d, not off
 * `orderTotals.discountAmount`, which the engine deliberately leaves unrounded (see `OrderTotals`'
 * class doc) and `moneyOf` would refuse.
 */
@Composable
private fun QuoteRollup(state: CalculatorUiState) {
    val project = state.totals.projTotal.money()
    QuoteSurface {
        Column(Modifier.padding(horizontal = CARD_PAD_H, vertical = EtalonSpace.sm)) {
            RollupRow(stringResource(R.string.calc_place_summary_rooms_subtotal), formatMoney(project.roomsSubtotal))
            if (project.discountAmount.amount.signum() > 0) {
                RollupRow(
                    // The percentage belongs to the LABEL when it is what the operator entered;
                    // the figure on the right is what it came to in UZS either way.
                    label = if (state.discountMode == DiscountMode.PERCENT) {
                        stringResource(R.string.calc_place_summary_discount, formatPercent(project.discountPercent))
                    } else {
                        stringResource(R.string.calc_place_discount)
                    },
                    value = stringResource(R.string.calc_place_minus, formatMoney(project.discountAmount)),
                )
            }
            if (state.deliveryCost > 0) {
                RollupRow(
                    stringResource(R.string.calc_place_summary_delivery),
                    formatMoney(operatorAmountMoney(state.deliveryCost)),
                )
            }
            if (state.otherCost > 0) {
                RollupRow(
                    stringResource(R.string.calc_place_summary_other),
                    formatMoney(operatorAmountMoney(state.otherCost)),
                )
            }
        }
    }
}

@Composable
private fun RollupRow(label: String, value: String) = Row(
    Modifier.fillMaxWidth().heightIn(min = ROLLUP_ROW_HEIGHT),
    horizontalArrangement = Arrangement.SpaceBetween,
    verticalAlignment = Alignment.CenterVertically,
) {
    Text(label, style = EtalonType.meta, color = EtalonColors.ink2, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
    Text(value, style = EtalonType.rowAmount, color = EtalonColors.ink2, maxLines = 1, modifier = Modifier.padding(start = EtalonSpace.rowGap))
}

/**
 * The bottom line, in the navy the operator's own summary sheet is set in: «Жами» over the
 * order-PLACEMENT total (delivery and other included — [CalculatorUiState.orderTotals], NOT
 * `totals.projTotal.total`; see `OrderTotals.kt`'s class doc for why conflating the two is a
 * defect), with the material line on the caption row beside «Жами».
 *
 * The material line shares the CAPTION row rather than standing beside the figure the way the
 * summary sheet arranges the same two: this card is 360 dp wide against the sheet's 411, and side
 * by side the 26 sp figure and the material line together overflow — the first casualty being the
 * «UZS» after the figure, which clipped to «UZ». Stacked, the figure has the whole width.
 *
 * R7: «UZS» follows the figure here, as the summary sheet draws it, and nowhere else.
 */
@Composable
private fun QuoteTotal(state: CalculatorUiState) = Column(
    Modifier.fillMaxWidth().clip(EtalonShapes.sheet).background(EtalonColors.navy)
        .padding(start = NAVY_PAD_H, end = NAVY_PAD_H, top = NAVY_PAD_TOP, bottom = NAVY_PAD_BOTTOM),
) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
        Text(
            stringResource(R.string.calc_place_summary_total),
            style = EtalonType.tagPanel, color = EtalonColors.onDarkMuted, maxLines = 1,
        )
        Text(
            stringResource(
                R.string.calc_summary_line,
                formatArea(BigDecimal.valueOf(state.totals.monolithArea)),
                formatDecimal(BigDecimal.valueOf(state.totals.beams.toLong()), 0),
                formatDecimal(BigDecimal.valueOf(state.totals.blocks.toLong()), 0),
            ),
            style = EtalonType.meta,
            color = EtalonColors.onDarkMuted,
            textAlign = TextAlign.End,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f).padding(start = EtalonSpace.sm),
        )
    }
    Row(verticalAlignment = Alignment.Bottom) {
        Text(
            formatMoney(state.orderTotals.totalPriceMoney()),
            style = TotalStyle, color = EtalonColors.onDark, maxLines = 1, overflow = TextOverflow.Ellipsis,
        )
        Text(
            MONEY_UNIT,
            style = EtalonType.label,
            color = EtalonColors.onDark.copy(alpha = UNIT_ALPHA),
            maxLines = 1,
            modifier = Modifier.padding(start = EtalonSpace.xs / 2),
        )
    }
}

/** Every white block on the quote: §2's card — `xl` radius, `surface` fill, 1 dp hairline. */
@Composable
private fun QuoteSurface(content: @Composable () -> Unit) = Box(
    Modifier.fillMaxWidth().clip(EtalonShapes.xl).background(EtalonColors.surface)
        .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.xl),
) { content() }

/** « · » — the separator every one-line client summary in this app uses. */
private const val SEPARATOR = " · "

/**
 * Composes [content] fully — so a `GraphicsLayer` wrapped around it can record a real frame — but
 * reports ZERO size to whatever screen hosts it, so it never opens a gap in a visible layout.
 * `Modifier.graphicsLayer { alpha = 0f }` alone is not enough: the content still gets measured at
 * its natural height (for [QuoteCard], several hundred dp) and that height is still reserved in
 * the surrounding column even though nothing is painted — this is the "measured off-screen at a
 * fixed width" the card is captured at: [QUOTE_CARD_WIDTH], enforced by [QuoteCard]'s own
 * `Modifier.width`, not by this layout (which measures with no constraint of its own so that width
 * wins). The child never actually draws to the real canvas either — see [rememberShareQuote]'s own
 * `drawWithContent`, which records into the layer and stops there — so nothing leaks onto the
 * screen even though the child is technically "placed" inside this zero-size box.
 */
@Composable
internal fun ZeroSizeCapture(content: @Composable () -> Unit) {
    Layout(content = content) { measurables, _ ->
        val placeable = measurables.first().measure(Constraints())
        layout(0, 0) { placeable.place(0, 0) }
    }
}

/**
 * Writes the captured quote under `cacheDir/quotes/` and returns the file itself.
 *
 * A random file name per share, and every older file in the directory removed first: a stale PNG
 * left behind carries a previous customer's name, phone and address baked into the image, and a
 * predictable name would let anything holding a `content://` grant on one share guess the next
 * one's URI.
 *
 * Split out of [writeQuotePng] so the write and the cleanup can be tested on any host:
 * `FileProvider.getUriForFile` cannot run under Robolectric on Windows (see `QuoteImageTest`'s own
 * KDoc), and everything this function does is the half that has nothing to do with FileProvider.
 *
 * Throws [java.io.IOException] if the directory cannot be used — a full disk, or the name taken by
 * something that is not a directory. `rememberShareQuote` is where that is caught and shown.
 */
internal suspend fun writeQuoteFile(context: Context, bitmap: ImageBitmap): File = withContext(Dispatchers.IO) {
    val dir = File(context.cacheDir, "quotes").apply { mkdirs() }
    dir.listFiles()?.forEach { it.delete() }
    File(dir, "${UUID.randomUUID()}.png").also { f ->
        f.outputStream().use { bitmap.asAndroidBitmap().compress(Bitmap.CompressFormat.PNG, 100, it) }
    }
}

/**
 * [writeQuoteFile]'s file as the `content://` URI [androidx.core.content.FileProvider] exposes for
 * it — see `app/src/main/res/xml/file_paths.xml` and the `<provider>` entry in the manifest, both
 * scoped to exactly that subdirectory and nothing wider.
 */
suspend fun writeQuotePng(context: Context, bitmap: ImageBitmap): Uri =
    FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", writeQuoteFile(context, bitmap))

/** [uri] carries a customer's name, phone and address baked into its image, and this [Intent]
 *  hands it to whichever app the operator picks — nothing about either is logged on this path. */
fun shareQuoteIntent(uri: Uri, subject: String): Intent = Intent(Intent.ACTION_SEND).apply {
    type = "image/png"
    putExtra(Intent.EXTRA_STREAM, uri)
    putExtra(Intent.EXTRA_SUBJECT, subject)
    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION) // without this every messenger gets a SecurityException
}
