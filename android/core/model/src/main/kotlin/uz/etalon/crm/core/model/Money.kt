package uz.etalon.crm.core.model

import java.math.BigDecimal
import java.math.RoundingMode

/** UZS in major units. Constructed from the server's decimal string only;
 *  the client never derives money from floats. */
@JvmInline
value class Money(val amount: BigDecimal) : Comparable<Money> {
    operator fun plus(o: Money) = Money(amount + o.amount)
    operator fun minus(o: Money) = Money(amount - o.amount)
    val isZero: Boolean get() = amount.signum() == 0
    val isNegative: Boolean get() = amount.signum() < 0
    fun coerceAtLeastZero(): Money = if (isNegative) ZERO else this
    /** Whole-UZS value for display; half-away-from-zero matches the engine's round2 then display. */
    fun roundedWhole(): BigDecimal = amount.setScale(0, RoundingMode.HALF_UP)
    override fun compareTo(other: Money) = amount.compareTo(other.amount)

    companion object {
        val ZERO = Money(BigDecimal.ZERO)
        fun parse(server: String): Money = try {
            Money(BigDecimal(server.trim()))
        } catch (e: NumberFormatException) {
            throw IllegalArgumentException("Not a money string: '$server'", e)
        }
    }
}
