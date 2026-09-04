package uz.etalon.crm.core.model

import java.math.BigDecimal

data class Me(
    val id: String, val name: String, val role: Role,
    val permissions: Set<String>, val mustChangePassword: Boolean,
) { fun can(action: String) = action in permissions }

/** One pricing step: everything up to [maxBeamLength] metres costs [price]. */
data class PriceTier(val maxBeamLength: BigDecimal, val price: Money)

data class Pricing(val m2Tiers: List<PriceTier>, val extraBeamTiers: List<PriceTier>, val blockUnitPrice: Money)
data class CapacityThresholds(val low: Int, val moderate: Int, val heavy: Int)
data class Bootstrap(val me: Me, val pricing: Pricing, val capacity: CapacityThresholds, val minSupportedAppVersion: String)
