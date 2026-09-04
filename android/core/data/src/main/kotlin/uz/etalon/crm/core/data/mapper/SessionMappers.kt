package uz.etalon.crm.core.data.mapper

import uz.etalon.crm.core.model.*
import uz.etalon.crm.core.network.dto.BootstrapDto
import uz.etalon.crm.core.network.dto.UserDto

fun UserDto.toMe() = Me(id, name, Role.from(role), permissions.toSet(), mustChangePassword)
fun BootstrapDto.toDomain() = Bootstrap(
    me = me.toMe(),
    pricing = Pricing(pricing.m2PriceTiers.map { it.max_beam_length to it.price.toLong() }, pricing.extraBeamPriceTiers.map { it.max_beam_length to it.price.toLong() }, pricing.blockUnitPrice.toLong()),
    capacity = CapacityThresholds(capacityThresholds.low, capacityThresholds.moderate, capacityThresholds.heavy),
    minSupportedAppVersion = minSupportedAppVersion,
)
