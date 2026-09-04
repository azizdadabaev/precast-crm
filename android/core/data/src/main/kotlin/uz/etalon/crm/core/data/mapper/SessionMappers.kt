package uz.etalon.crm.core.data.mapper

import kotlinx.serialization.json.JsonPrimitive
import uz.etalon.crm.core.model.*
import uz.etalon.crm.core.network.dto.BootstrapDto
import uz.etalon.crm.core.network.dto.TierDto
import uz.etalon.crm.core.network.dto.UserDto
import java.math.BigDecimal

fun UserDto.toMe() = Me(id, name, Role.from(role), permissions.toSet(), mustChangePassword)

/** Money from the server's exact digits, never via a float (CLAUDE.md §6). */
private fun JsonPrimitive.toMoney() = Money.parse(content)
private fun TierDto.toDomain() = PriceTier(BigDecimal(max_beam_length.content.trim()), price.toMoney())

fun BootstrapDto.toDomain() = Bootstrap(
    me = me.toMe(),
    pricing = Pricing(
        m2Tiers = pricing.m2PriceTiers.map { it.toDomain() },
        extraBeamTiers = pricing.extraBeamPriceTiers.map { it.toDomain() },
        blockUnitPrice = pricing.blockUnitPrice.toMoney(),
    ),
    capacity = CapacityThresholds(capacityThresholds.low, capacityThresholds.moderate, capacityThresholds.heavy),
    minSupportedAppVersion = minSupportedAppVersion,
)
