package uz.etalon.crm.core.network.dto

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonPrimitive

/** Prices stay as raw JSON primitives so the mapper can build a BigDecimal from the exact digits
 *  the server sent. Decoding them as Double would run every price through a binary float first —
 *  money never touches a float in this app (CLAUDE.md §6). */
@Serializable data class TierDto(val max_beam_length: JsonPrimitive, val price: JsonPrimitive)
@Serializable data class PricingDto(val m2PriceTiers: List<TierDto>, val extraBeamPriceTiers: List<TierDto>, val blockUnitPrice: JsonPrimitive, val updatedAt: String? = null)
@Serializable data class ThresholdsDto(val low: Int, val moderate: Int, val heavy: Int)
@Serializable data class BootstrapDto(val me: UserDto, val pricing: PricingDto, val capacityThresholds: ThresholdsDto, val regionsVersion: String, val minSupportedAppVersion: String, val serverTime: String)
