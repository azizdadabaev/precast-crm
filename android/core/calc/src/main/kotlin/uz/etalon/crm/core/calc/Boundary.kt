package uz.etalon.crm.core.calc

import java.math.BigDecimal
import java.math.RoundingMode
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.Pricing

/**
 * The one place a calc-engine `Double` becomes `Money`. Everywhere else in `:core:calc` money is
 * a `Double` on purpose — bit-parity with `calculation-engine.ts` is the correctness criterion,
 * checked against 65 golden vectors. Everywhere else in the app money is `Money` over
 * `BigDecimal` — `Double` money is banned there. This file, and only this file, crosses that line.
 *
 * Every engine money field has already passed through [round2] before it reaches here, so the
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
fun moneyOf(d: Double): Money = Money(BigDecimal.valueOf(d).setScale(2, RoundingMode.UNNECESSARY))

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
