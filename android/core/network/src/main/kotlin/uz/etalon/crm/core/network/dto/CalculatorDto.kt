package uz.etalon.crm.core.network.dto

import kotlinx.serialization.Serializable
import uz.etalon.crm.core.network.BigDecimalSerializer
import java.math.BigDecimal

/**
 * One room of `POST /api/projects`'s body — mirrors `RoomCalcInputBaseSchema`
 * (src/lib/validation.ts) field for field; `CalculatorContractTest` pins the names.
 *
 * [m2PriceOverrideValue] travels as [BigDecimal] rather than `Double`: it is a catalogue m²-tier
 * price, and `:core:calc`'s `Boundary.kt` (`tierPriceMoney`) is the one place a calc-engine
 * `Double` may become money on this client. Every other field here is an engine quantity or a
 * percentage, not money, and stays a plain number — see `CalculatorRepository.toWire()`.
 */
@Serializable
data class RoomCalcInputDto(
    val name: String? = null,
    val innerWidth: Double,
    val innerLength: Double,
    val bearing: Double = 0.15,
    val correction: Double = 0.0,
    val extraBeams: Int = 0,
    val forceStartBeam: Boolean = false,
    val patternOverride: String? = null,
    val m2PriceOverride: Boolean = false,
    @Serializable(with = BigDecimalSerializer::class) val m2PriceOverrideValue: BigDecimal? = null,
    val m2PriceReason: String? = null,
)

/**
 * Body of `POST /api/projects` (`SaveProjectDraftSchema`). [discountAmount] is a whole-UZS
 * operator amount — `Boundary.kt`'s `operatorAmountMoney` — so it travels as [BigDecimal] the
 * same way `PaymentRecordRequest.amount` does; [discountPercent] is a percentage and stays a
 * plain `Double`, matching `ProjectMoney.discountPercent`'s own reasoning.
 *
 * `SaveProjectDraftSchema.name` is deliberately not a field here: the web calculator — the only
 * other caller of this route — always sends it as `null` (`precast-crm/src/app/(app)/calculations/page.tsx`),
 * because neither client has anything resembling a "project name" to offer; a field this class
 * could only ever leave `null` would be dead weight pretending to be a feature.
 */
@Serializable
data class SaveProjectDraftRequest(
    val projectId: String? = null,
    val clientName: String? = null,
    val clientPhone: String,
    val clientAddress: String? = null,
    val rooms: List<RoomCalcInputDto>,
    val discountPercent: Double = 0.0,
    @Serializable(with = BigDecimalSerializer::class) val discountAmount: BigDecimal = BigDecimal.ZERO,
)

/**
 * Response of `POST /api/projects`. The route answers the FULL `Project` row (with its
 * `calculations`/`client` relations included), not a bare `{id}` — `EtalonJson.ignoreUnknownKeys`
 * is what lets this decode just the one field this client needs.
 */
@Serializable data class ProjectSavedDto(val id: String)

/**
 * Body of `POST /api/orders` (`PlaceOrderSchema`) — the deal itself, not a quote. A deliberate
 * superset of [SaveProjectDraftRequest]: the same rooms and the same discount levers, plus the
 * three client fields the server requires here (`min(1)` on name and address, `min(5)` on the
 * phone — the draft route takes them as optional), the delivery date, the notes, and the delivery
 * and other costs the draft route has no columns for.
 *
 * The server recomputes every room with its own engine and its own `loadPricingConfig()`, so this
 * carries INPUTS only — never a subtotal, never a total, never a room's `SlabResult`.
 *
 * The money fields travel as [BigDecimal] for the reason `PaymentRecordRequest.amount` does:
 * [discountAmount]/[deliveryCost]/[otherCost] are whole-UZS operator amounts off the totals sheet's
 * keypad (`Boundary.kt`'s `operatorAmountMoney`), and [paidAmount] is a customer's cash. Only
 * [discountPercent] stays a plain `Double` — it is a percentage, not an amount, matching
 * `ProjectMoney.discountPercent`'s own reasoning.
 *
 * `paymentMethod` is deliberately absent, and [paidAmount]/[receiptUrls] are pinned at their empty
 * values: prepayment at placement is the NEXT phase's slice, designed for offline. `PlaceOrderSchema`'s
 * refinement only demands a `paymentMethod` once `paidAmount > 0`, so a field this class could
 * only ever leave null would be dead weight — the same rule that keeps `SaveProjectDraftSchema.name`
 * out of [SaveProjectDraftRequest].
 */
@Serializable
data class PlaceOrderRequest(
    val clientName: String,
    val clientPhone: String,
    val clientAddress: String,
    val rooms: List<RoomCalcInputDto>,
    val discountPercent: Double = 0.0,
    @Serializable(with = BigDecimalSerializer::class) val discountAmount: BigDecimal = BigDecimal.ZERO,
    @Serializable(with = BigDecimalSerializer::class) val deliveryCost: BigDecimal = BigDecimal.ZERO,
    @Serializable(with = BigDecimalSerializer::class) val otherCost: BigDecimal = BigDecimal.ZERO,
    /** ISO-8601 instant; `z.coerce.date()` on the server. Required — there is no server default,
     *  and a silent "today" would be a real production commitment nobody chose. */
    val scheduledAt: String,
    val notes: String? = null,
    @Serializable(with = BigDecimalSerializer::class) val paidAmount: BigDecimal = BigDecimal.ZERO,
    val receiptUrls: List<String> = emptyList(),
)

/**
 * Response of `POST /api/orders`. The route answers the FULL `Order` row (client, project and
 * relations included), not a bare `{id, orderNumber}` — `EtalonJson.ignoreUnknownKeys` is what
 * lets this decode just the two fields this client needs: the id to navigate to, and the number
 * to name the order in a confirmation.
 */
@Serializable data class OrderPlacedDto(val id: String, val orderNumber: String)
