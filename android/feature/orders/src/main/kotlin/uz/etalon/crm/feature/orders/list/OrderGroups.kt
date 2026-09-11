package uz.etalon.crm.feature.orders.list

import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.OrderSummary
import uz.etalon.crm.core.ui.format.TASHKENT
import java.time.YearMonth

/** One month's worth of rows, with the sum of the totals of the ones that still count as business
 *  (see [groupByMonth]) — a canceled row is listed but not summed. */
data class MonthGroup(val month: YearMonth, val total: Money, val rows: List<OrderSummary>)

/** Groups the rows the server already sorted into month headings, keeping the server's order:
 *  `groupBy` returns a LinkedHashMap, so both the months and the rows inside them come out in
 *  order of first appearance. The month is the *Tashkent* month of `scheduledAt` — a UTC instant
 *  late on the last day of a month is already the next month for the business.
 *
 *  CANCELED rows stay in the list — an operator looking for the order they canceled must find it —
 *  but are left out of the month's sum. That is the CRM's own rule, not a mobile invention: every
 *  order-based figure on the web — booked revenue, receivables, AOV, the charts — is denominated
 *  by `LIVE_ORDERS = status notIn ['CANCELED','DRAFT']` (`src/lib/dashboard-data.ts:39-52`,
 *  "CANCELED is money that never happened"), so a month header that counted them would contradict
 *  every other figure in the product. */
fun groupByMonth(rows: List<OrderSummary>): List<MonthGroup> =
    rows.groupBy { YearMonth.from(it.scheduledAt.atZone(TASHKENT)) }
        .map { (m, rs) ->
            val total = rs.filter { it.status != OrderStatus.CANCELED }
                .fold(Money.ZERO) { acc, o -> acc + o.totalPrice }
            MonthGroup(m, total, rs)
        }
