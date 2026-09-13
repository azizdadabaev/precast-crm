package uz.etalon.crm.core.data.mapper

import uz.etalon.crm.core.model.CapacityDay
import uz.etalon.crm.core.model.CapacityThresholds
import uz.etalon.crm.core.network.dto.CapacityDayDto
import uz.etalon.crm.core.network.dto.CapacityThresholdsDto
import java.time.LocalDate

fun CapacityDayDto.toDomain() = CapacityDay(LocalDate.parse(date), totalArea, totalOrders, totalBlocks)

fun CapacityThresholdsDto.toDomain() = CapacityThresholds(low, moderate, heavy)
