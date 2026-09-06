package uz.etalon.crm.feature.logistics.shipments

import uz.etalon.crm.core.model.OrderDetail
import java.util.Locale

/** What this truck may still take, per beam length and for blocks. */
data class Allowance(val beams: Map<String, Int>, val blocks: Int)

private fun key(v: java.math.BigDecimal) = String.format(Locale.ROOT, "%.2f", v)

/**
 * What one truck may still take. The server enforces the same arithmetic and
 * answers 422 when it is exceeded, so computing it here turns a rejected upload
 * into a stepper that simply stops.
 */
fun allowanceFor(order: OrderDetail, excludingShipmentId: String?): Allowance {
    val totalBeams = mutableMapOf<String, Int>()
    var totalBlocks = 0
    order.rooms.forEach { r ->
        totalBeams.merge(key(r.beamLength), r.beamCount, Int::plus)
        totalBlocks += r.totalBlocks
    }
    var takenBlocks = 0
    val takenBeams = mutableMapOf<String, Int>()
    order.shipments.filter { it.id != excludingShipmentId }.forEach { s ->
        s.loadedBeams.forEach { (k, v) -> takenBeams.merge(key(java.math.BigDecimal(k)), v, Int::plus) }
        takenBlocks += s.loadedBlocks ?: 0
    }
    return Allowance(
        beams = totalBeams.mapValues { (k, total) -> (total - (takenBeams[k] ?: 0)).coerceAtLeast(0) },
        blocks = (totalBlocks - takenBlocks).coerceAtLeast(0),
    )
}
