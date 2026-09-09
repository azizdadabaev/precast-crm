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
 */
@Serializable
data class SaveProjectDraftRequest(
    val projectId: String? = null,
    val name: String? = null,
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
