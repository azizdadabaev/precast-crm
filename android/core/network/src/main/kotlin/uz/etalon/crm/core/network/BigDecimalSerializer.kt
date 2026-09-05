package uz.etalon.crm.core.network

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.KSerializer
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonEncoder
import kotlinx.serialization.json.JsonUnquotedLiteral
import kotlinx.serialization.json.jsonPrimitive
import java.math.BigDecimal

/**
 * Writes a BigDecimal as a bare (unquoted) JSON number literal built from
 * toPlainString(), and reads one back by parsing the raw literal text.
 *
 * Money request fields such as cashToCollect/expectedCollection are
 * Decimal(14,2) columns the server reads as a plain JSON number
 * (z.coerce.number(), or an untyped `number` cast) — never a quoted string.
 * A Double cannot carry them safely: converting a domain BigDecimal with
 * .toDouble() and letting kotlinx encode that Double can change the literal
 * that reaches the wire (extra trailing digits, or scientific notation once
 * the magnitude crosses ~1e11, which Decimal(14,2)'s 12-digit integer part
 * can reach). Routing the exact BigDecimal straight through avoids both.
 *
 * Only works through the Json format — both directions require a
 * JsonEncoder/JsonDecoder and fail loudly rather than silently falling back
 * to a Double-based number that can lose precision.
 */
object BigDecimalSerializer : KSerializer<BigDecimal> {
    override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("BigDecimal", PrimitiveKind.STRING)

    @OptIn(ExperimentalSerializationApi::class)
    override fun serialize(encoder: Encoder, value: BigDecimal) {
        val jsonEncoder = encoder as? JsonEncoder
            ?: error("BigDecimalSerializer can only be used with the Json format")
        jsonEncoder.encodeJsonElement(JsonUnquotedLiteral(value.toPlainString()))
    }

    override fun deserialize(decoder: Decoder): BigDecimal {
        val jsonDecoder = decoder as? JsonDecoder
            ?: error("BigDecimalSerializer can only be used with the Json format")
        return BigDecimal(jsonDecoder.decodeJsonElement().jsonPrimitive.content)
    }
}
