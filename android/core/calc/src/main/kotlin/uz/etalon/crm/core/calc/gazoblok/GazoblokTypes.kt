package uz.etalon.crm.core.calc.gazoblok

/**
 * Line-by-line Kotlin port of the input/result shapes in `gazoblok-engine.ts`. Every quantity
 * stays `Double` (mirrors the TS engine's untyped `number` so the golden-vector replay can assert
 * bit-for-bit parity) except counts that come from `Math.ceil`/integer-only domains, which are
 * `Int` — same convention [uz.etalon.crm.core.calc.SlabResult] uses for its count fields.
 */

/** A catalog product as the engine needs it: dimensions in METERS plus the operator-set price
 *  per single block (UZS). Verbatim port of `BlockProduct`. */
data class BlockProduct(
    val lengthM: Double,
    val heightM: Double,
    val thicknessM: Double, // = the wall thickness this block builds
    val pricePerBlock: Double,
)

/** Verbatim port of `WallEstimateInput`. */
data class WallEstimateInput(
    /** Wall length (m). */
    val lengthM: Double,
    /** Wall height (m). */
    val heightM: Double,
    /** Total openings area (doors/windows) to subtract (m²). Default 0. */
    val openingsM2: Double? = null,
    /** Waste margin added on top (%). Default [DEFAULT_WASTE_PCT]. */
    val wastePct: Double? = null,
)

/** Verbatim port of `WallEstimateResult`. */
data class WallEstimateResult(
    /** Wall face area net of openings, never below 0 (m²). */
    val wallAreaM2: Double,
    /** Face area of one block shown on the wall = length × height (m²). */
    val blockFaceAreaM2: Double,
    val wastePct: Double,
    /** ceil(wallArea / blockFaceArea × (1 + waste%)). */
    val blocksNeeded: Int,
    /** blocksNeeded × block volume (m³). */
    val volumeM3: Double,
    /** blocksNeeded × pricePerBlock (UZS). */
    val price: Double,
)

enum class OpeningKind { DOOR, WINDOW, OTHER }

/** Verbatim port of `Opening`. */
data class Opening(
    val kind: OpeningKind,
    val widthM: Double,
    val heightM: Double,
    val qty: Int,
)

enum class WallOrientation { STANDARD, ROTATED }

/** Verbatim port of `WallInput`. */
data class WallInput(
    val id: String,
    val name: String? = null,
    val lengthM: Double,
    val heightM: Double,
    val productId: String,
    val openings: List<Opening> = emptyList(),
    val orientation: WallOrientation? = null,
)

/** Verbatim port of `ProjectEstimateOpts`. */
data class ProjectEstimateOpts(
    val jointMm: Double? = null,
    val wastePct: Double? = null,
    val glueKgPerM2: Double? = null,
    val glueBagKg: Double? = null,
)

/** Verbatim port of `PerSizeResult`. */
data class PerSizeResult(
    val productId: String,
    val label: String,
    val netAreaM2: Double,
    val blocksNeeded: Int,
    val volumeM3: Double,
    val price: Double,
)

/** Verbatim port of `GlueResult`. */
data class GlueResult(
    val netAreaM2: Double,
    val kg: Double,
    val bags: Int,
)

enum class WarningCode { OPENINGS_EXCEED_WALL, NO_BLOCK_SIZE }

/** Verbatim port of `EstimateWarning`. */
data class EstimateWarning(
    val wallId: String,
    val code: WarningCode,
    val message: String,
)

/** Verbatim port of `ProjectEstimateResult`. */
data class ProjectEstimateResult(
    val perSize: List<PerSizeResult>,
    val glue: GlueResult,
    val totalBlocks: Int,
    val totalVolumeM3: Double,
    val totalPrice: Double,
    val warnings: List<EstimateWarning>,
)

/** TS's `BlockProduct & { label: string }` — the value type of `estimateProject`'s `products`
 *  parameter. */
data class LabelledBlockProduct(
    val lengthM: Double,
    val heightM: Double,
    val thicknessM: Double,
    val pricePerBlock: Double,
    val label: String,
)

internal fun LabelledBlockProduct.toBlockProduct(): BlockProduct =
    BlockProduct(lengthM = lengthM, heightM = heightM, thicknessM = thicknessM, pricePerBlock = pricePerBlock)

/** Verbatim port of `OrderLineInput`. `quantity` stays `Double` (not `Int`) so [lineTotal]'s
 *  "must be a non-negative integer" validation can actually reject a fractional value the way the
 *  TS does — an `Int` field would make that case unrepresentable, the same tradeoff
 *  `SlabInput.extraBeams` made the other way in Task 2. */
data class OrderLineInput(
    /** Price per block (UZS) at the moment of quoting. */
    val unitPrice: Double,
    val quantity: Double,
)

/** Verbatim port of `BlockOrderTotal`. */
data class BlockOrderTotal(
    val linesSubtotal: Double,
    val discountPercent: Double,
    val discountAmount: Double,
    val deliveryCost: Double,
    val total: Double,
    val totalBlocks: Double,
)

// ── Wire maps for the golden-vector field-set guard ─────────────────
//
// Same technique as uz.etalon.crm.core.calc.SlabResult.toWireMap: a hand-maintained field-name
// list that GazoblokParityTest compares by KEY SET against the golden JSON's result object, so a
// field the port forgot — or one a future exporter change adds — is a set mismatch instead of a
// silent pass. Field names already match gazoblok-engine.ts's camelCase keys one for one, so this
// is an identity mapping rather than a snake_case translation.

/** Wire representation of [WallEstimateResult] for the `estimateWall` field-set guard. */
internal fun WallEstimateResult.toWireMap(): Map<String, Any> = mapOf(
    "wallAreaM2" to wallAreaM2,
    "blockFaceAreaM2" to blockFaceAreaM2,
    "wastePct" to wastePct,
    "blocksNeeded" to blocksNeeded,
    "volumeM3" to volumeM3,
    "price" to price,
)

/** Wire representation of [BlockOrderTotal] for the `orderTotal` field-set guard. */
internal fun BlockOrderTotal.toWireMap(): Map<String, Any> = mapOf(
    "linesSubtotal" to linesSubtotal,
    "discountPercent" to discountPercent,
    "discountAmount" to discountAmount,
    "deliveryCost" to deliveryCost,
    "total" to total,
    "totalBlocks" to totalBlocks,
)

/** Wire representation of [ProjectEstimateResult] for the `estimateProject` field-set guard. */
internal fun ProjectEstimateResult.toWireMap(): Map<String, Any> = mapOf(
    "perSize" to perSize,
    "glue" to glue,
    "totalBlocks" to totalBlocks,
    "totalVolumeM3" to totalVolumeM3,
    "totalPrice" to totalPrice,
    "warnings" to warnings,
)
