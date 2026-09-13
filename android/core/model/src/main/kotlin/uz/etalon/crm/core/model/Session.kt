package uz.etalon.crm.core.model

import java.math.BigDecimal

data class Me(
    val id: String, val name: String, val role: Role,
    val permissions: Set<String>, val mustChangePassword: Boolean,
) { fun can(action: String) = action in permissions }

/** One pricing step: everything up to [maxBeamLength] metres costs [price]. */
data class PriceTier(val maxBeamLength: BigDecimal, val price: Money)

data class Pricing(val m2Tiers: List<PriceTier>, val extraBeamTiers: List<PriceTier>, val blockUnitPrice: Money)
// [CapacityThresholds] moved to Capacity.kt when the orders calendar needed it: the bootstrap and
// the capacity endpoint report the SAME factory setting, and two types for it would be two places
// a threshold change has to land. Its fields widened Int → BigDecimal there.
data class Bootstrap(val me: Me, val pricing: Pricing, val capacity: CapacityThresholds, val minSupportedAppVersion: String)
