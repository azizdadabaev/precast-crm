package uz.etalon.crm.core.data.mapper

import uz.etalon.crm.core.model.ClientDetail
import uz.etalon.crm.core.model.ClientOrderLine
import uz.etalon.crm.core.model.ClientSummary
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.network.dto.ClientDetailDto
import uz.etalon.crm.core.network.dto.ClientOrderLineDto
import uz.etalon.crm.core.network.dto.ClientRowDto
import java.time.Instant

/**
 * Mirrors `normalizePhone` in `src/lib/phone.ts` — the storage direction, not `formatPhone`'s
 * display one. Phone is this product's unique customer identity (names may legitimately
 * repeat), and the server dedups `POST /api/clients` by the normalized phone: sending anything
 * else here would let the same customer get created twice under two spellings of one number.
 *
 * ASCII digits only, deliberately not `Char.isDigit()`: Kotlin's is Unicode-aware and would
 * accept an Arabic-Indic or Devanagari digit that the server's `/\D+/` never does, so the two
 * sides would normalise one pasted string to two different phones — two rows for one customer.
 */
fun normalizePhone(input: String): String {
    val d = input.filter { it in '0'..'9' }
    return when {
        d.isEmpty() -> ""
        d.length == 12 && d.startsWith("998") -> d
        d.length == 9 -> "998$d"
        d.length == 10 && d.startsWith("8") -> "998" + d.substring(1)
        d.length == 11 && d.startsWith("8") -> "998" + d.substring(1)
        else -> d
    }
}

/** `GET /api/clients` row. `counts` defaults to zero orders when the response carries no
 *  `_count` at all — see [ClientRowDto]'s own doc for which responses that is. */
fun ClientRowDto.toDomain() = ClientSummary(
    id = id, name = name, phone = phone, address = address, orderCount = counts.orders,
)

fun ClientOrderLineDto.toDomain() = ClientOrderLine(
    id = id, orderNumber = orderNumber, status = OrderStatus.from(status),
    totalPrice = Money.parse(totalPrice), scheduledAt = Instant.parse(scheduledAt),
)

fun ClientDetailDto.toDomain() = ClientDetail(
    id = id, name = name, phone = phone, address = address, notes = notes,
    orders = orders.map { it.toDomain() },
)
