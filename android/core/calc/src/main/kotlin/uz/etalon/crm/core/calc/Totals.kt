package uz.etalon.crm.core.calc

/**
 * Project-level aggregation across a list of [SlabRow]s, ported line-for-line from the `totals`
 * `useMemo` in `MultiRoomCalculator.tsx:598`.
 */
data class ProjectTotals(
    val projTotal: ProjectTotal,
    val beams: Int, val blocks: Int,
    val monolithLength: Double, val monolithArea: Double, val concrete: Double,
)

/** Rows with a null [SlabRow.result] contribute nothing — only computed rows reach [projectTotal]
 *  or any of the material sums. */
fun projectTotals(rows: List<SlabRow>, discountPercent: Double, discountAmount: Double): ProjectTotals {
    val valid = rows.mapNotNull { it.result }
    return ProjectTotals(
        projTotal = projectTotal(valid, discountPercent, discountAmount),
        beams = valid.sumOf { it.beamCount },
        blocks = valid.sumOf { it.totalBlocks },
        monolithLength = valid.fold(0.0) { s, r -> s + r.monolithLength },
        monolithArea = valid.fold(0.0) { s, r -> s + r.monolithArea },
        concrete = valid.fold(0.0) { s, r -> s + r.concreteVolume },
    )
}

/** One line of the production beam schedule: a beam length (as a two-decimal key) and the total
 *  count of beams at that length across the project. */
data class BeamScheduleLine(val lengthKey: String, val beams: Int)

/**
 * JS `Number.prototype.toFixed(2)`: round half **up** on the EXACT binary value of the double,
 * not on its shortest decimal representation. `BigDecimal(Double)` — the constructor everything
 * else in this repo bans — is the only thing that gives the exact value, and this is the one
 * place that wants it: `String.format("%.2f", 2.675)` gives "2.68" while JS gives "2.67", which
 * would split one production beam length into two rows the factory then cuts twice.
 */
fun beamLengthKey(beamLength: Double): String =
    java.math.BigDecimal(beamLength).setScale(2, java.math.RoundingMode.HALF_UP).toPlainString()

/** Groups rows' beam counts by two-decimal beam length, descending — the "Балка + Ғишт"
 *  production list, ported from the `schedule` `useMemo` in `MultiRoomCalculator.tsx:609`. Rows
 *  with no result contribute nothing. */
fun beamSchedule(rows: List<SlabRow>): List<BeamScheduleLine> {
    val acc = LinkedHashMap<String, Int>()
    rows.forEach { row -> row.result?.let { acc.merge(beamLengthKey(it.beamLength), it.beamCount, Int::plus) } }
    return acc.entries.map { BeamScheduleLine(it.key, it.value) }.sortedByDescending { it.lengthKey.toDouble() }
}
