package uz.etalon.crm.core.model

data class Me(
    val id: String, val name: String, val role: Role,
    val permissions: Set<String>, val mustChangePassword: Boolean,
) { fun can(action: String) = action in permissions }

data class Pricing(val m2Tiers: List<Pair<Double, Long>>, val extraBeamTiers: List<Pair<Double, Long>>, val blockUnitPrice: Long)
data class CapacityThresholds(val low: Int, val moderate: Int, val heavy: Int)
data class Bootstrap(val me: Me, val pricing: Pricing, val capacity: CapacityThresholds, val minSupportedAppVersion: String)
