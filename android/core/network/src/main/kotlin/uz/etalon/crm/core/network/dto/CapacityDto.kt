package uz.etalon.crm.core.network.dto

import kotlinx.serialization.Serializable
import uz.etalon.crm.core.network.BigDecimalSerializer
import java.math.BigDecimal

/** `GET /api/orders/capacity` (`src/app/api/orders/capacity/route.ts`). `totalArea` is a bare
 *  JSON number (2 dp, `Math.round(x * 100) / 100` server-side) — [BigDecimalSerializer] reads its
 *  exact literal rather than routing it through a Double, same reason as every other area figure. */
@Serializable
data class CapacityDayDto(
    val date: String,
    @Serializable(with = BigDecimalSerializer::class) val totalArea: BigDecimal,
    val totalOrders: Int,
    val totalBlocks: Int,
)

/** The factory's day-load bands, in m² — mirrors `core/model`'s `CapacityThresholds`. */
@Serializable
data class CapacityThresholdsDto(
    @Serializable(with = BigDecimalSerializer::class) val low: BigDecimal,
    @Serializable(with = BigDecimalSerializer::class) val moderate: BigDecimal,
    @Serializable(with = BigDecimalSerializer::class) val heavy: BigDecimal,
)

/** [days] omits dates with no orders (R3/§4.3) — the client zero-fills them. [thresholds] is null
 *  only on a server old enough to omit them; [CapacityThresholds.DEFAULT] then applies. */
@Serializable
data class CapacityDto(
    val days: List<CapacityDayDto> = emptyList(),
    val thresholds: CapacityThresholdsDto? = null,
)
