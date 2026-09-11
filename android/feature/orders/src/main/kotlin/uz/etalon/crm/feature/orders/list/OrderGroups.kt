package uz.etalon.crm.feature.orders.list

import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.OrderSummary
import uz.etalon.crm.core.ui.format.TASHKENT
import java.time.YearMonth

/** One month's worth of rows, with the sum of their order totals. */
data class MonthGroup(val month: YearMonth, val total: Money, val rows: List<OrderSummary>)

/** Groups the rows the server already sorted into month headings, keeping the server's order:
 *  `groupBy` returns a LinkedHashMap, so both the months and the rows inside them come out in
 *  order of first appearance. The month is the *Tashkent* month of `scheduledAt` — a UTC instant
 *  late on the last day of a month is already the next month for the business. */
fun groupByMonth(rows: List<OrderSummary>): List<MonthGroup> =
    rows.groupBy { YearMonth.from(it.scheduledAt.atZone(TASHKENT)) }
        .map { (m, rs) -> MonthGroup(m, rs.fold(Money.ZERO) { acc, o -> acc + o.totalPrice }, rs) }
