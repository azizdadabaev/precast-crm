package uz.etalon.crm.core.model

import java.math.BigDecimal
import java.math.RoundingMode

/**
 * The two-decimal string a beam length is grouped and posted under — the server's own
 * `Number(beamLength).toFixed(2)`, reproduced exactly.
 *
 * There is only one of these in the app because the client and the server have to agree on it
 * character for character. The load route's over-load guard builds its per-length totals with
 * `toFixed(2)` and compares the posted map's keys against them, so a key this client spells
 * differently compares against a total of **zero** and every positive count takes a permanent 422
 * in the yard. The same keys are what the detail screen's «Юклаш рўйхати» and the load stepper's
 * rows are labelled from, so a second spelling would also make the two lists disagree on paper.
 *
 * `toFixed(2)` rounds the **binary** value, not the decimal one, and the two disagree on an exact
 * half. `beamLength` is `Decimal(10,3)` on the server (`round3(innerWidth + 2 × bearing)`), so
 * 3.505 is a value that really occurs: decimal HALF_UP reads «3.51», while the nearest `Double` to
 * 3.505 is 3.504999… and `toFixed(2)` reads «3.50».
 *
 * Hence the `Double` crossing, which is sanctioned here and nowhere else: `BigDecimal(v.toDouble())`
 * is that binary expansion *exactly*, with far more digits than two, so a decimal tie can never
 * arise and `setScale(2, HALF_UP)` on it equals `toFixed(2)` for every input. Beam length is
 * geometry a truck is loaded from, not money, and the figure being matched is the server's own
 * rounding — which is why the rule that money never crosses a `Double` does not reach this line.
 *
 * **Its twin is `uz.etalon.crm.core.calc.beamLengthKey`, and the two must agree character for
 * character.** That one is handed the engine's own `Double` straight out of a live calculator row
 * (`:core:calc` is a line-for-line port of `calculation-engine.ts` and takes the engine's types
 * unchanged); this one is handed the `BigDecimal` a placed order carries back from the server, and
 * its `v.toDouble()` is what puts the two on the same rule. `BeamLengthKeyAgreementTest` pins them
 * against each other: the calculator's beam schedule and the order's load list must label the same
 * beam the same way, or the yard cuts to one list and loads from another.
 */
fun beamLengthKey(v: BigDecimal): String =
    BigDecimal(v.toDouble()).setScale(2, RoundingMode.HALF_UP).toPlainString()
