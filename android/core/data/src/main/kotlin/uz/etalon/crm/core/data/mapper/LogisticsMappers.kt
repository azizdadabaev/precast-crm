package uz.etalon.crm.core.data.mapper

import uz.etalon.crm.core.model.Driver
import uz.etalon.crm.core.model.LatLng
import uz.etalon.crm.core.network.dto.DriverListItemDto
import uz.etalon.crm.core.model.beamLengthKey
import uz.etalon.crm.core.network.dto.LatLngDto
import java.time.Instant

fun DriverListItemDto.toDomain() = Driver(
    id = id, name = name, phone = phone, notes = notes, active = active,
    activeDispatchCount = activeDispatchCount, discrepancyCount30d = discrepancyCount30d,
    lastDispatchAt = lastDispatchAt?.let(Instant::parse),
)

fun LatLngDto.toDomain() = LatLng(lat, lng)

/**
 * The server's over-load guard builds its per-length totals with
 * `Number(beamLength).toFixed(2)`, so a map keyed "3.3" compares against a total
 * of zero and every positive count is rejected with a 422. Always normalise.
 *
 * [beamLengthKey] is that spelling, shared with the allowance and the order detail's load list.
 */
fun normaliseBeamKeys(beams: Map<String, Int>): Map<String, Int> =
    beams.mapKeys { (k, _) -> beamLengthKey(k.toBigDecimal()) }
