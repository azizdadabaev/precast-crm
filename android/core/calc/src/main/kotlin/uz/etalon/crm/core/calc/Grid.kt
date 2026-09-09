package uz.etalon.crm.core.calc

/**
 * Ported verbatim from `roundUpToGrid`/`roundDownToGrid` in `src/lib/utils.ts:90`. `GRID_EPS`
 * defends against float drift (e.g. 0.1 + 0.2 = 0.30000000000000004) and pushes a value that
 * already sits on a grid line strictly past it, so clicking "up" twice advances by two grid
 * units, not one.
 */
private const val GRID_EPS = 1e-9

fun roundUpToGrid(value: Double, grid: Double): Double {
    if (!value.isFinite() || !grid.isFinite() || grid <= 0) return value
    return round3(kotlin.math.ceil((value + GRID_EPS) / grid) * grid)
}

fun roundDownToGrid(value: Double, grid: Double): Double {
    if (!value.isFinite() || !grid.isFinite() || grid <= 0) return value
    return round3(kotlin.math.floor((value - GRID_EPS) / grid) * grid)
}
