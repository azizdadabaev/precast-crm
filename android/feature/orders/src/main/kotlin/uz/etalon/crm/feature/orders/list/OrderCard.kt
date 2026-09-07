package uz.etalon.crm.feature.orders.list

import androidx.compose.foundation.layout.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.components.*
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.OrderSummary
import uz.etalon.crm.core.ui.format.formatAddressLine
import uz.etalon.crm.core.ui.format.formatPhone
import uz.etalon.crm.core.ui.format.formatScheduleDate
import java.time.Instant

/**
 * The scheduled date sits on the order-number row rather than beside the address,
 * so the whole of the last row's free width belongs to the address. Sharing that row
 * meant the address — the longest and most variable field on the card — was left with
 * whatever the two chips did not take, and the canonical "<Viloyat>, <Tuman>, <street>"
 * form is far longer than that.
 *
 * [now] is a parameter so a screenshot baseline is not hostage to the day it is recorded.
 */
@Composable
fun OrderCard(o: OrderSummary, now: Instant = Instant.now(), onClick: () -> Unit) {
    StatusStripeCard(stripe = toneColor(orderStatusTone(o.status)), onClick = onClick) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(o.orderNumber, style = EtalonType.monoBody.copy(fontWeight = FontWeight.Bold), color = MaterialTheme.colorScheme.primary)
            // The date sits a quarter of the way into the gap between the order number and
            // the price, rather than hard against the number. Proportional, so it holds its
            // position across screen widths and font scales.
            Spacer(Modifier.weight(0.25f))
            Text(formatScheduleDate(o.scheduledAt, now), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(0.75f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            MoneyText(o.totalPrice, style = EtalonType.monoBody.copy(fontWeight = FontWeight.Bold))
        }
        Spacer(Modifier.height(4.dp))
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("${o.client.name} · ${formatPhone(o.client.phone)}", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            AreaText(o.totalArea)
        }
        Spacer(Modifier.height(6.dp))
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(formatAddressLine(o.client.address).orEmpty(), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            PaymentChip(o.paymentState)
            StatusChip(o.status)
        }
    }
}
