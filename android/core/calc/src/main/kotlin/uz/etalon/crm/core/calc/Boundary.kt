package uz.etalon.crm.core.calc

import java.math.BigDecimal
import java.math.RoundingMode
import uz.etalon.crm.core.calc.gazoblok.BlockOrderTotal
import uz.etalon.crm.core.calc.gazoblok.BlockProduct
import uz.etalon.crm.core.calc.gazoblok.PerSizeResult
import uz.etalon.crm.core.calc.gazoblok.ProjectEstimateResult
import uz.etalon.crm.core.calc.gazoblok.WallEstimateResult
import uz.etalon.crm.core.calc.gazoblok.lineTotal
import uz.etalon.crm.core.calc.gazoblok.pricePerM3
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.Pricing

/**
 * The one place a calc-engine `Double` becomes `Money`. Everywhere else in `:core:calc` money is
 * a `Double` on purpose — bit-parity with `calculation-engine.ts`/`gazoblok-engine.ts` is the
 * correctness criterion, checked against every golden vector the server exports. Everywhere else
 * in the app money is `Money` over `BigDecimal` — `Double` money is banned there. This file, and
 * only this file, crosses that line — for both the slab engine (below) and the gazoblok engine
 * (further down).
 *
 * Every engine money field has already passed through [round2] before it reaches here (the one
 * exception is documented on [BlockOrderMoney]), so the
 * `Double` is the nearest double to a value with at most two decimals. [BigDecimal.valueOf] goes
 * through `Double.toString` — the shortest decimal string that round-trips to that double — which
 * for such a value is exactly the two-decimal string. So `Money(BigDecimal.valueOf(d).setScale(2))`
 * is lossless. The `BigDecimal(Double)` constructor is NOT: it expands the binary fraction
 * (`BigDecimal(0.1)` is `0.1000000000000000055511151231257827…`). Never use it here.
 *
 * `setScale(2, RoundingMode.UNNECESSARY)` is deliberate: it throws if a value carrying more than
 * two decimals ever reaches this boundary — the correct loud failure for a non-`round2`'d double,
 * rather than a silent rounding that could shave a sum invoiced to a customer.
 */
internal fun moneyOf(d: Double): Money = Money(BigDecimal.valueOf(d).setScale(2, RoundingMode.UNNECESSARY))

/**
 * A catalogue m² price-tier value — [PriceTier.price] / [M2_OVERRIDE_TIERS] / what [autoPickedRate]
 * returns — converted to [Money]. These are always whole-UZS literals straight out of the engine's
 * tier tables, never a fraction of a tiyin, so this is exactly as exact as [moneyOf] and shares its
 * `RoundingMode.UNNECESSARY`: a tier price that ever carried a fraction throws here too, rather
 * than silently truncating it the way a feature-module `Double.toLong()` shortcut would.
 *
 * [moneyOf] itself stays `internal` to this file on purpose (see its doc) — this is the
 * boundary-respecting public door for the one other place in the app that legitimately turns a
 * calc-engine `Double` into [Money]: a feature module rendering a catalogue tier price.
 */
fun tierPriceMoney(price: Double): Money = moneyOf(price)

/**
 * An operator-entered whole-UZS amount — discount amount, delivery cost or other cost, typed on
 * the place-order sheet's number fields (`allowDecimal = false`: a digits-only keyboard, the same
 * "cash has no kopeks" rule `RecordPaymentScreen` uses for a payment amount). Unlike [moneyOf]/
 * [tierPriceMoney] this `Double` never passed through the calc engine's [round2] — it is raw UI
 * input, not an already-rounded engine result — so it deliberately does NOT go through [moneyOf]'s
 * `RoundingMode.UNNECESSARY`: nothing here promises exactly two decimals, only that none ever
 * appear because the field itself disallows them. [Double.toLong] truncates toward zero, which
 * is exact (never lossy) precisely because of that restriction.
 */
fun operatorAmountMoney(d: Double): Money = Money(BigDecimal.valueOf(d.toLong()))

/** Android's `BigDecimal`/`Money` pricing (`core:model` `Session.kt`) → the engine's `Double` config. */
fun Pricing.toPriceConfig(): PriceConfig = PriceConfig(
    m2PriceTiers = m2Tiers.map { PriceTier(it.maxBeamLength.toDouble(), it.price.amount.toDouble()) },
    extraBeamPriceTiers = extraBeamTiers.map { PriceTier(it.maxBeamLength.toDouble(), it.price.amount.toDouble()) },
    blockUnitPrice = blockUnitPrice.amount.toDouble(),
)

/** [SlabResult]'s money fields, converted to [Money]. */
data class RoomMoney(
    val subtotal: Money,
    val m2Cost: Money,
    val patternExtraCost: Money,
    val manualExtraBeamsCost: Money,
    val m2Price: Money,
    val extraBeamPricePerM: Money,
)

fun SlabResult.money(): RoomMoney = RoomMoney(
    subtotal = moneyOf(subtotal),
    m2Cost = moneyOf(m2Cost),
    patternExtraCost = moneyOf(patternExtraCost),
    manualExtraBeamsCost = moneyOf(manualExtraBeamsCost),
    m2Price = moneyOf(m2Price),
    extraBeamPricePerM = moneyOf(extraBeamPricePerM),
)

/** [ProjectTotal]'s fields, converted to [Money] — except [discountPercent], which stays a
 *  `BigDecimal` because it is a percentage, not an amount. */
data class ProjectMoney(
    val roomsSubtotal: Money,
    val discountPercent: BigDecimal,
    val discountAmount: Money,
    val total: Money,
)

fun ProjectTotal.money(): ProjectMoney = ProjectMoney(
    roomsSubtotal = moneyOf(roomsSubtotal),
    discountPercent = BigDecimal.valueOf(discountPercent),
    discountAmount = moneyOf(discountAmount),
    total = moneyOf(total),
)

/**
 * [OrderTotals.totalPrice], converted to [Money] — the order-placement headline the totals sheet
 * shows (`Order.totalPrice`), not [ProjectTotal.money]'s `total` (a different, in-app running
 * number that never includes delivery/other). [OrderTotals] leaves [OrderTotals.totalPrice]
 * unrounded on purpose (see its class doc); it is [round2]'d here, immediately before [moneyOf],
 * mirroring what the server's `Order.totalPrice` column (`Decimal(14,2)`) does on write — this is
 * not new rounding, and every other [OrderTotals] field is left to the existing [ProjectTotal.money]
 * display (roomsSubtotal/discountAmount/discountPercent), which this sheet also shows.
 */
fun OrderTotals.totalPriceMoney(): Money = moneyOf(round2(totalPrice))

// ── Gazoblok ─────────────────────────────────────────────────────
//
// Same rule as the slab section above: every gazoblok money value is a `Double` in
// `uz.etalon.crm.core.calc.gazoblok` (bit-parity with `gazoblok-engine.ts`) and becomes `Money`
// only here, via [moneyOf]. A raw, non-`round2`'d `Double` reaching any conversion below throws
// the same `ArithmeticException` [moneyOf] always throws — see its doc.

/** [WallEstimateResult]'s money field, converted to [Money]. */
data class WallEstimateMoney(val price: Money)

fun WallEstimateResult.money(): WallEstimateMoney = WallEstimateMoney(price = moneyOf(price))

/** [PerSizeResult]'s money field, converted to [Money]. */
data class PerSizeMoney(val price: Money)

fun PerSizeResult.money(): PerSizeMoney = PerSizeMoney(price = moneyOf(price))

/** [ProjectEstimateResult]'s money fields, converted to [Money]. [perSize] converts 1:1 with the
 *  original list — same order, same index — so a caller can zip it back against
 *  `ProjectEstimateResult.perSize` (e.g. for `productId`/`label`) when it needs both. */
data class ProjectEstimateMoney(val perSize: List<PerSizeMoney>, val totalPrice: Money)

fun ProjectEstimateResult.money(): ProjectEstimateMoney = ProjectEstimateMoney(
    perSize = perSize.map { it.money() },
    totalPrice = moneyOf(totalPrice),
)

/** [BlockOrderTotal]'s fields, converted to [Money] — except [discountPercent] (a percentage,
 *  not an amount — stays `BigDecimal`, same reasoning as [ProjectMoney.discountPercent]) and
 *  [totalBlocks] (a block count, not an amount — stays `Double`).
 *
 *  [deliveryCost] is the one exception to this file's "already `round2`'d" rule: `orderTotal`
 *  echoes the caller's delivery fee through `max(0.0, …)` without rounding it — verbatim from the
 *  TypeScript, which does the same — so a fee that arrived with float noise (`87500.00000000001`
 *  out of any arithmetic) would trip [moneyOf]'s `UNNECESSARY` scale and throw. It is rounded here
 *  instead. This cannot move [total], which the engine already rounded with the raw fee included;
 *  at worst the displayed parts differ from the displayed total by a tiyin. */
data class BlockOrderMoney(
    val linesSubtotal: Money,
    val discountPercent: BigDecimal,
    val discountAmount: Money,
    val deliveryCost: Money,
    val total: Money,
    val totalBlocks: Double,
)

fun BlockOrderTotal.money(): BlockOrderMoney = BlockOrderMoney(
    linesSubtotal = moneyOf(linesSubtotal),
    discountPercent = BigDecimal.valueOf(discountPercent),
    discountAmount = moneyOf(discountAmount),
    deliveryCost = moneyOf(round2(deliveryCost)),
    total = moneyOf(total),
    totalBlocks = totalBlocks,
)

/** [pricePerM3]'s derived per-m³ display price, converted to [Money]. */
fun BlockProduct.pricePerM3Money(): Money = moneyOf(pricePerM3(this))

/** [lineTotal]'s return value, converted to [Money]. */
fun lineTotalMoney(unitPrice: Double, quantity: Double): Money = moneyOf(lineTotal(unitPrice, quantity))
