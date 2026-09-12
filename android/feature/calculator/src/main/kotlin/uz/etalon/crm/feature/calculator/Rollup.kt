package uz.etalon.crm.feature.calculator

import uz.etalon.crm.core.calc.money
import uz.etalon.crm.core.calc.operatorAmountMoney
import uz.etalon.crm.core.calc.totalPriceMoney
import uz.etalon.crm.core.model.Money

/**
 * The order roll-up as it is PRINTED — one set of whole-UZS figures, read by both the operator's
 * `PlaceOrderSheet` and the customer's `QuoteImage` card, so the two can never disagree.
 *
 * Every field is already whole UZS: `formatMoney` rounds to whole for display anyway, and the
 * point of this class is that the rounding happens ONCE, here, where the four lines can be made
 * to add up.
 */
internal data class RollupLines(
    val roomsSubtotal: Money,
    /** Derived, not read — see [rollupLines]. */
    val discount: Money,
    val delivery: Money,
    val other: Money,
    val total: Money,
)

/**
 * The roll-up's four lines, rounded once so **the column adds up on screen**.
 *
 * Each line used to round to whole UZS on its own, and «Жами» rounded from the exact sum. On a
 * discount that lands on a half that column is a UZS short: 15 125 470 at 5 % is 756 273,5, which
 * prints as «756 274» (half-up) while «Жами» — 14 669 196,50 → «14 669 197» — was computed from
 * the .5 that was never shown. A customer adding the four printed figures got 14 669 196 and a
 * quote that looks wrong by one UZS is a quote the operator has to defend.
 *
 * So the discount is the one line DERIVED from its printed neighbours:
 * `roomsSubtotal − (total − delivery − other)`, all four already whole. The three it is derived
 * from are the figures that were entered or invoiced; the discount is the one the arithmetic can
 * absorb a half into. On the same case it prints «756 273» and the column reaches «14 669 197».
 *
 * Nothing CHARGED changes: the server keeps the exact 14 669 196,50 — `OrderTotals.totalPrice`
 * is what is posted, and this function never touches it.
 *
 * The derived figure can never go negative for a non-negative discount, and it is delivery and
 * other cancelling EXACTLY out of `total − delivery − other` that makes that true. Two rules
 * upstream guarantee they do:
 *
 * - Both costs are whole UZS before they are money at all: the fields refuse a decimal and
 *   `operatorAmountMoney` truncates below a UZS, so `total − delivery − other` shifts the figure by
 *   whole units and cannot move the fraction inside it.
 * - Both subtotals this works from have already been rounded to two decimals by `:core:calc`.
 *   `ProjectTotal.roomsSubtotal` becomes [Money] through `moneyOf`, whose `RoundingMode.UNNECESSARY`
 *   THROWS on a third decimal rather than absorbing it, and `OrderTotals.totalPrice` — left raw on
 *   purpose — is `round2`'d inside `totalPriceMoney` on its way through the same door.
 *
 * So the only fraction anywhere in the four figures is the half a percentage discount put there,
 * and what is left after the cancellation is `round(subtotal) − round(subtotal − discount)`: the
 * discount, whole, never more than the subtotal and never less than nothing.
 *
 * Lives here rather than in `:core:calc` because it takes the SCREEN's state — the two engine
 * sums and the two operator-entered costs together — which `:core:calc` has no name for. Every
 * `Double` → `Money` crossing below still goes through that module's sanctioned boundary
 * (`ProjectTotal.money`, `operatorAmountMoney`, `totalPriceMoney`) and no other way; the
 * arithmetic itself is `BigDecimal` inside [Money], never a `Double`.
 */
internal fun rollupLines(state: CalculatorUiState): RollupLines {
    val project = state.totals.projTotal.money()
    val roomsSubtotal = Money(project.roomsSubtotal.roundedWhole())
    val delivery = Money(operatorAmountMoney(state.deliveryCost).roundedWhole())
    val other = Money(operatorAmountMoney(state.otherCost).roundedWhole())
    val total = Money(state.orderTotals.totalPriceMoney().roundedWhole())
    return RollupLines(
        roomsSubtotal = roomsSubtotal,
        discount = roomsSubtotal - (total - delivery - other),
        delivery = delivery,
        other = other,
        total = total,
    )
}
