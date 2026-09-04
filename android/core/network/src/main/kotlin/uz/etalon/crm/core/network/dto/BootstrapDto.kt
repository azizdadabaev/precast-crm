package uz.etalon.crm.core.network.dto

import kotlinx.serialization.Serializable

@Serializable data class TierDto(val max_beam_length: Double, val price: Double)
@Serializable data class PricingDto(val m2PriceTiers: List<TierDto>, val extraBeamPriceTiers: List<TierDto>, val blockUnitPrice: Double, val updatedAt: String? = null)
@Serializable data class ThresholdsDto(val low: Int, val moderate: Int, val heavy: Int)
@Serializable data class BootstrapDto(val me: UserDto, val pricing: PricingDto, val capacityThresholds: ThresholdsDto, val regionsVersion: String, val minSupportedAppVersion: String, val serverTime: String)
