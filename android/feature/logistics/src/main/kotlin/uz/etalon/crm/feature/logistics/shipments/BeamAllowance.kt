package uz.etalon.crm.feature.logistics.shipments

import uz.etalon.crm.core.model.OrderDetail
import uz.etalon.crm.core.model.OutboxKind
import uz.etalon.crm.core.model.PendingUpload
import uz.etalon.crm.core.model.beamLengthKey

/** What this truck may still take, per beam length and for blocks. The keys are
 *  [beamLengthKey]'s — the same spelling the server's over-load guard and the order detail's
 *  «Юклаш рўйхати» use, so a cap offered here is a cap the load route will honour. This used to
 *  format the `BigDecimal` with `%.2f`, which rounds the DECIMAL value: a 3.505 m beam was offered
 *  under «3.51» and posted under it, against a server total filed under «3.50» — a permanent 422
 *  in the yard. */
data class Allowance(val beams: Map<String, Int>, val blocks: Int)

/**
 * What one truck may still take. The server enforces the same arithmetic and
 * answers 422 when it is exceeded, so computing it here turns a rejected upload
 * into a stepper that simply stops.
 *
 * [queued] is the operator's own outbox for this order. A load counted onto truck one while offline
 * has not reached the server, so the order still comes back saying that truck is empty — and without
 * this the cap offered for truck two is the whole order total. The queue drains, truck two is
 * refused with a 422 that `outcomeFor` makes permanent, and its photo and counts are lost. A queued
 * load is already committed as far as the operator is concerned, so it is subtracted exactly like a
 * shipment the server has confirmed. Rows the server has already rejected are counted too: they are
 * still in the queue and retryable, and under-offering is the recoverable direction.
 */
fun allowanceFor(
    order: OrderDetail,
    excludingShipmentId: String?,
    queued: List<PendingUpload> = emptyList(),
): Allowance {
    val totalBeams = mutableMapOf<String, Int>()
    var totalBlocks = 0
    order.rooms.forEach { r ->
        totalBeams.merge(beamLengthKey(r.beamLength), r.beamCount, Int::plus)
        totalBlocks += r.totalBlocks
    }
    var takenBlocks = 0
    val takenBeams = mutableMapOf<String, Int>()
    order.shipments.filter { it.id != excludingShipmentId }.forEach { s ->
        // A key the server never would have written (corrupt cache, a future format change)
        // must not crash this computation; skip it rather than let it count against nothing.
        s.loadedBeams.forEach { (k, v) -> k.toBigDecimalOrNull()?.let { takenBeams.merge(beamLengthKey(it), v, Int::plus) } }
        takenBlocks += s.loadedBlocks ?: 0
    }
    // A queued load whose shipment the server HAS already confirmed would be counted twice, so the
    // set of already-counted ids is what the outbox is filtered against — alongside the truck being
    // loaded right now, whose own queued row (if the operator got back here somehow) is not
    // competition for itself.
    val alreadyCounted = order.shipments.filter { it.loadedBeams.isNotEmpty() || (it.loadedBlocks ?: 0) > 0 }.map { it.id }.toSet()
    queued.asSequence()
        .filter { it.kind == OutboxKind.LOAD_SHIPMENT }
        .filter { it.shipmentId != null && it.shipmentId != excludingShipmentId && it.shipmentId !in alreadyCounted }
        .forEach { row ->
            row.loadedBeams.forEach { (k, v) -> k.toBigDecimalOrNull()?.let { takenBeams.merge(beamLengthKey(it), v, Int::plus) } }
            takenBlocks += row.loadedBlocks
        }
    return Allowance(
        beams = totalBeams.mapValues { (k, total) -> (total - (takenBeams[k] ?: 0)).coerceAtLeast(0) },
        blocks = (totalBlocks - takenBlocks).coerceAtLeast(0),
    )
}
