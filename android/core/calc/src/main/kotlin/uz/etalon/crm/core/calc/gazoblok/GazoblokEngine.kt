package uz.etalon.crm.core.calc.gazoblok

import kotlin.math.ceil
import uz.etalon.crm.core.calc.round2
import uz.etalon.crm.core.calc.round3

/**
 * Line-by-line Kotlin port of `gazoblok-engine.ts` (356 lines): газоблок (aerated-concrete wall
 * block) is a COMMODITY — a customer buys a quantity of blocks of a given size, priced per block.
 * The per-m³ price is DERIVED for display. The wall estimator turns a wall (length × height,
 * minus openings) into a block count plus a waste margin; the project estimator does the same
 * across many walls, grouped by block size, plus glue.
 *
 * Pure. No Android UI, network, DB, or logging — see the module's ground rules. Reuses
 * `round2`/`round3` from the floor engine (Task 1), same as the TS reuses them from
 * `calculation-engine.ts`.
 */

/** Default % of extra blocks added to cover cutting waste / breakage. */
const val DEFAULT_WASTE_PCT = 5.0

// ── Volume / derived price ──────────────────────────────────────

/** Volume of a single block in m³ (length × height × thickness). */
fun blockVolumeM3(p: BlockProduct): Double {
    val v = p.lengthM * p.heightM * p.thicknessM
    if (!v.isFinite() || v <= 0) {
        throw GazoblokError("block dimensions must be positive numbers (meters)")
    }
    return round3(v)
}

/** Derived price per m³ (UZS), for display alongside the per-block price. */
fun pricePerM3(p: BlockProduct): Double {
    if (!p.pricePerBlock.isFinite() || p.pricePerBlock < 0) {
        throw GazoblokError("price per block must be a non-negative number")
    }
    return round2(p.pricePerBlock / blockVolumeM3(p))
}

/** How many blocks fit in one m³ (informational). */
fun blocksPerM3(p: BlockProduct): Double = round2(1 / blockVolumeM3(p))

// ── Wall estimator ──────────────────────────────────────────────

/**
 * Estimate how many blocks a wall needs. The block laid in a wall shows its length × height
 * face; its thickness equals the wall thickness, so the operator should pick the size whose
 * thicknessM matches the wall.
 */
fun estimateWall(p: BlockProduct, input: WallEstimateInput): WallEstimateResult {
    if (!input.lengthM.isFinite() || input.lengthM <= 0) {
        throw GazoblokError("wall length must be a positive number (meters)")
    }
    if (!input.heightM.isFinite() || input.heightM <= 0) {
        throw GazoblokError("wall height must be a positive number (meters)")
    }
    val openings = input.openingsM2 ?: 0.0
    if (!openings.isFinite() || openings < 0) {
        throw GazoblokError("openings area must be a non-negative number (m²)")
    }
    val wastePct = input.wastePct ?: DEFAULT_WASTE_PCT
    if (!wastePct.isFinite() || wastePct < 0) {
        throw GazoblokError("waste percent must be a non-negative number")
    }

    val blockFaceAreaM2 = round3(p.lengthM * p.heightM)
    if (blockFaceAreaM2 <= 0) {
        throw GazoblokError("block face area must be positive (check length/height)")
    }

    val wallAreaM2 = round3(maxOf(0.0, input.lengthM * input.heightM - openings))
    // Subtract a tiny epsilon before ceil() so a float artifact (e.g. 30 / 0.18 × 1.05 lands on
    // 175.00000000000003) can't silently add a whole extra block. Same 1e-9 guard the floor
    // engine uses for tiers.
    val raw = (wallAreaM2 / blockFaceAreaM2) * (1 + wastePct / 100)
    val blocksNeeded = maxOf(0, ceil(raw - 1e-9).toInt())
    val volumeM3 = round3(blocksNeeded * blockVolumeM3(p))
    val price = round2(blocksNeeded * p.pricePerBlock)

    return WallEstimateResult(wallAreaM2, blockFaceAreaM2, wastePct, blocksNeeded, volumeM3, price)
}

// ── Multi-wall project estimator ────────────────────────────────

/** Defaults for the project estimator's advanced knobs. */
const val DEFAULT_JOINT_MM = 2.0
const val DEFAULT_GLUE_KG_PER_M2 = 1.7
const val DEFAULT_GLUE_BAG_KG = 25.0

/** Blocks per m² of wall face for an explicit face (length × height), joint-aware.
 *  = 1 / ((faceL + joint) × (faceH + joint)), all in meters. */
private fun facePerM2(faceLM: Double, faceHM: Double, jointM: Double): Double {
    val denom = (faceLM + jointM) * (faceHM + jointM)
    if (!denom.isFinite() || denom <= 0) {
        throw GazoblokError("block face + joint must be positive (check length/height)")
    }
    return 1 / denom
}

/**
 * Estimate a whole project (list of walls, each with its own catalog block and openings).
 * Aggregates raw block counts per product, applies the waste margin ONCE per size, then ceils to
 * whole blocks. Glue is informational.
 *
 * A wall whose product is missing/unknown is skipped with a NO_BLOCK_SIZE warning. Openings
 * exceeding the wall clamp net area to 0 with a warning. Non-positive wall/opening dimensions
 * throw [GazoblokError] (callers pass only geometrically-complete walls).
 *
 * `products` must preserve the caller's iteration order — like the TS `Map`, a `LinkedHashMap`
 * (or Kotlin's order-preserving `mapOf`/`buildMap`) is required, not a plain `HashMap`.
 */
fun estimateProject(
    walls: List<WallInput>,
    products: Map<String, LabelledBlockProduct>,
    opts: ProjectEstimateOpts = ProjectEstimateOpts(),
): ProjectEstimateResult {
    val jointM = (opts.jointMm ?: DEFAULT_JOINT_MM) / 1000
    val wastePct = opts.wastePct ?: DEFAULT_WASTE_PCT
    val glueKgPerM2 = opts.glueKgPerM2 ?: DEFAULT_GLUE_KG_PER_M2
    val glueBagKg = opts.glueBagKg ?: DEFAULT_GLUE_BAG_KG
    if (!jointM.isFinite() || jointM < 0) throw GazoblokError("joint must be a non-negative number (mm)")
    if (!wastePct.isFinite() || wastePct < 0) throw GazoblokError("waste percent must be a non-negative number")

    val warnings = mutableListOf<EstimateWarning>()
    // productId -> accumulator. LinkedHashMap so iteration below walks in first-seen-wall order,
    // matching the TS `Map`'s insertion-order iteration (relied on by the stable sort below).
    val rawByProduct = LinkedHashMap<String, Double>()
    val netByProduct = LinkedHashMap<String, Double>()
    var glueNetArea = 0.0

    for (w in walls) {
        val product = if (w.productId.isNotEmpty()) products[w.productId] else null
        if (product == null) {
            warnings.add(EstimateWarning(w.id, WarningCode.NO_BLOCK_SIZE, "Блок ўлчами танланмаган · No block size selected"))
            continue
        }
        if (!w.lengthM.isFinite() || w.lengthM <= 0) throw GazoblokError("wall length must be a positive number (meters)")
        if (!w.heightM.isFinite() || w.heightM <= 0) throw GazoblokError("wall height must be a positive number (meters)")

        var openingsArea = 0.0
        for (o in w.openings) {
            if (!o.widthM.isFinite() || o.widthM <= 0 || !o.heightM.isFinite() || o.heightM <= 0) {
                throw GazoblokError("opening dimensions must be positive numbers (meters)")
            }
            // TS also rejects a non-integer qty (e.g. 1.5); Opening.qty is Kotlin `Int`, which
            // makes that unrepresentable at the call site, so only the >= 1 check applies here —
            // same tradeoff SlabInput.extraBeams made in Task 2.
            if (o.qty < 1) throw GazoblokError("opening quantity must be an integer >= 1")
            openingsArea += o.widthM * o.heightM * o.qty
        }

        val gross = w.lengthM * w.heightM
        if (openingsArea > gross) {
            warnings.add(EstimateWarning(w.id, WarningCode.OPENINGS_EXCEED_WALL, "Очиқликлар девордан катта · Openings exceed the wall"))
        }
        val net = maxOf(0.0, gross - openingsArea)

        val faceHM = if (w.orientation == WallOrientation.ROTATED) product.thicknessM else product.heightM
        val perM2 = facePerM2(product.lengthM, faceHM, jointM)
        rawByProduct[w.productId] = (rawByProduct[w.productId] ?: 0.0) + net * perM2
        netByProduct[w.productId] = (netByProduct[w.productId] ?: 0.0) + net
        glueNetArea += net
    }

    val perSize = mutableListOf<PerSizeResult>()
    for ((productId, raw) in rawByProduct) {
        val product = products.getValue(productId)
        val blocksNeeded = maxOf(0, ceil(raw * (1 + wastePct / 100) - 1e-9).toInt())
        perSize.add(
            PerSizeResult(
                productId = productId,
                label = product.label,
                netAreaM2 = round3(netByProduct[productId] ?: 0.0),
                blocksNeeded = blocksNeeded,
                volumeM3 = round3(blocksNeeded * blockVolumeM3(product.toBlockProduct())),
                price = round2(blocksNeeded * product.pricePerBlock),
            ),
        )
    }
    // Exterior/thick (usually pricier) first. `sortedByDescending` is a stable sort (it delegates
    // to `Collections.sort`, TimSort) so equal-price entries keep `rawByProduct`'s insertion
    // order — the same guarantee the TS relies on from `Array.prototype.sort`'s stability.
    val sortedPerSize = perSize.sortedByDescending { it.price }

    val kg = round2(glueNetArea * glueKgPerM2)
    val glue = GlueResult(netAreaM2 = round3(glueNetArea), kg = kg, bags = ceil(kg / glueBagKg).toInt())

    return ProjectEstimateResult(
        perSize = sortedPerSize,
        glue = glue,
        totalBlocks = sortedPerSize.sumOf { it.blocksNeeded },
        totalVolumeM3 = round3(sortedPerSize.sumOf { it.volumeM3 }),
        totalPrice = round2(sortedPerSize.sumOf { it.price }),
        warnings = warnings,
    )
}

// ── Order line + totals ─────────────────────────────────────────

/** JS's `Number.isInteger`: finite AND has no fractional part (NaN/Infinity are never integers). */
private fun Double.isJsInteger(): Boolean = isFinite() && this == Math.floor(this)

/** A single line's total (UZS). */
fun lineTotal(unitPrice: Double, quantity: Double): Double {
    if (!quantity.isJsInteger() || quantity < 0) {
        throw GazoblokError("quantity must be a non-negative integer")
    }
    if (!unitPrice.isFinite() || unitPrice < 0) {
        throw GazoblokError("unit price must be a non-negative number")
    }
    return round2(unitPrice * quantity)
}

/**
 * Compute an order's grand total from its lines and a single discount input. Discount precedence
 * mirrors the floor engine's `projectTotal`: an explicit UZS `discountAmount` > 0 wins (and the
 * percent is back-computed for downstream consistency); otherwise `discountPercent` is applied.
 * The amount is capped at the subtotal so a typo can't make the total negative. Delivery is added
 * after the discount.
 */
fun orderTotal(
    lines: List<OrderLineInput>,
    discountPercent: Double = 0.0,
    discountAmount: Double = 0.0,
    deliveryCost: Double = 0.0,
): BlockOrderTotal {
    val linesSubtotal = round2(lines.fold(0.0) { s, l -> s + lineTotal(l.unitPrice, l.quantity) })
    val totalBlocks = lines.fold(0.0) { s, l -> s + l.quantity }
    val delivery = maxOf(0.0, deliveryCost)

    val amt = discountAmount
    val discountAmt: Double
    val discountPct: Double
    if (amt > 0) {
        discountAmt = round2(minOf(amt, linesSubtotal))
        discountPct = if (linesSubtotal > 0) round2((discountAmt / linesSubtotal) * 100) else 0.0
    } else {
        discountPct = maxOf(0.0, minOf(100.0, discountPercent))
        discountAmt = round2((linesSubtotal * discountPct) / 100)
    }
    val total = round2(linesSubtotal - discountAmt + delivery)
    return BlockOrderTotal(
        linesSubtotal = linesSubtotal,
        discountPercent = discountPct,
        discountAmount = discountAmt,
        deliveryCost = delivery,
        total = total,
        totalBlocks = totalBlocks,
    )
}
