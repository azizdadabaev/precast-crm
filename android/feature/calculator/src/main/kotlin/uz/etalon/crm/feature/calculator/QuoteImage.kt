package uz.etalon.crm.feature.calculator

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import uz.etalon.crm.core.calc.money
import uz.etalon.crm.core.calc.operatorAmountMoney
import uz.etalon.crm.core.calc.totalPriceMoney
import uz.etalon.crm.core.designsystem.components.AreaText
import uz.etalon.crm.core.designsystem.components.MoneyText
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.ui.format.formatAddressLine
import uz.etalon.crm.core.ui.format.formatMoney
import uz.etalon.crm.core.ui.format.formatPercent
import uz.etalon.crm.core.ui.format.formatPhone
import uz.etalon.crm.core.ui.regions.composeAddress
import java.io.File
import java.math.BigDecimal
import java.util.UUID

/**
 * «Юбориш» — the calculator's own quote card, captured to a PNG the operator hands a customer on
 * Telegram or WhatsApp while still standing in the house. Mirrors the web's own share artifact,
 * `precast-crm/src/components/share/CalculationShareCard.tsx`: company header, client line, one
 * row per priced room, then Етказиб бериш / Бошқа / Жами — NOT the office print sheet
 * (`orders/[id]/print`), which is a different document for a different reader.
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

@Composable
fun QuoteCard(state: CalculatorUiState, modifier: Modifier = Modifier) {
    EtalonTheme(darkTheme = false) {
        Column(
            modifier
                .width(QUOTE_CARD_WIDTH)
                // Opaque is not optional: a transparent capture shares as a black rectangle in
                // most messengers.
                .background(MaterialTheme.colorScheme.surface)
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Column {
                    Text(stringResource(R.string.calc_quote_company), style = MaterialTheme.typography.titleLarge)
                    Text(
                        stringResource(R.string.calc_quote_company_tagline),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Text(formatPhone(stringResource(R.string.calc_quote_company_phone)), style = EtalonType.monoBody)
            }
            HorizontalDivider()

            val clientAddress = formatAddressLine(
                composeAddress(state.clientAddress.viloyat, state.clientAddress.tuman, state.clientAddress.street),
            )
            val clientLine = listOfNotNull(
                state.clientName.takeIf { it.isNotBlank() },
                state.clientPhoneDigits.takeIf { it.isNotBlank() }?.let { formatPhone(it) },
                clientAddress,
            ).joinToString(" · ")
            if (clientLine.isNotEmpty()) {
                Text(clientLine, style = MaterialTheme.typography.bodyMedium)
            }

            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                state.rows.forEach { row ->
                    val result = row.result ?: return@forEach
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            row.name.ifBlank { stringResource(R.string.calc_quote_room_unnamed) },
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.weight(1f),
                        )
                        AreaText(BigDecimal.valueOf(result.monolithArea), style = EtalonType.monoBody)
                        Spacer(Modifier.width(12.dp))
                        MoneyText(result.money().subtotal, style = EtalonType.monoBody)
                    }
                }
            }
            HorizontalDivider()

            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                // A discount nets silently into Жами otherwise, and the customer reads a total
                // LOWER than the rooms above it with nothing to explain the difference — the same
                // conditional line the web's own share card carries
                // (`src/components/share/CalculationShareCard.tsx`). Off `totals.projTotal`, which
                // is round2'd, not off `orderTotals.discountAmount`, which the engine deliberately
                // leaves unrounded (see `OrderTotals`' class doc) and `moneyOf` would refuse.
                val discount = state.totals.projTotal
                if (discount.discountAmount > 0) {
                    QuoteTotalRow(
                        if (state.discountMode == DiscountMode.PERCENT) {
                            stringResource(
                                R.string.calc_quote_discount_percent,
                                formatPercent(BigDecimal.valueOf(discount.discountPercent)),
                            )
                        } else {
                            stringResource(R.string.calc_quote_discount)
                        },
                        formatMoney(discount.money().discountAmount),
                    )
                }
                if (state.deliveryCost > 0) {
                    QuoteTotalRow(stringResource(R.string.calc_delivery_cost), formatMoney(operatorAmountMoney(state.deliveryCost)))
                }
                if (state.otherCost > 0) {
                    QuoteTotalRow(stringResource(R.string.calc_other_cost), formatMoney(operatorAmountMoney(state.otherCost)))
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Bottom) {
                    Text(stringResource(R.string.calc_place_summary_total), style = MaterialTheme.typography.titleMedium)
                    MoneyText(state.orderTotals.totalPriceMoney(), style = EtalonType.monoTitle)
                }
            }
        }
    }
}

@Composable
private fun QuoteTotalRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = EtalonType.monoBody)
    }
}

/**
 * Composes [content] fully — so a `GraphicsLayer` wrapped around it can record a real frame — but
 * reports ZERO size to whatever screen hosts it, so it never opens a gap in a visible layout.
 * `Modifier.graphicsLayer { alpha = 0f }` alone is not enough: the content still gets measured at
 * its natural height (for [QuoteCard], several hundred dp) and that height is still reserved in
 * the surrounding column even though nothing is painted — this is the "measured off-screen at a
 * fixed width" the card is captured at: [QUOTE_CARD_WIDTH], enforced by [QuoteCard]'s own
 * `Modifier.width`, not by this layout (which measures with no constraint of its own so that width
 * wins). The child never actually draws to the real canvas either — see [ShareQuoteButton]'s own
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
 * something that is not a directory. `ShareQuoteButton` is where that is caught and shown.
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
