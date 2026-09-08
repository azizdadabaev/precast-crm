package uz.etalon.crm.core.data

import kotlinx.serialization.json.Json
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.model.AppError
import uz.etalon.crm.core.network.ApiException
import java.io.IOException

class ErrorMapperTest {
    @Test fun `401 is Unauthorized`() { assertEquals(AppError.Unauthorized, ApiException(401, "Unauthorized").toAppError()) }
    @Test fun `403 keeps the Uzbek half`() {
        val e = ApiException(403, "Рухсат йўқ · Permission denied (order.view)").toAppError()
        assertEquals(AppError.Forbidden("Рухсат йўқ"), e)
    }
    @Test fun `422 exposes field errors from zod flatten`() {
        val details = Json.parseToJsonElement("""{"fieldErrors":{"pin":["PIN must be exactly 4 digits"]},"formErrors":[]}""")
        val e = ApiException(422, "Validation failed", details).toAppError() as AppError.Validation
        assertEquals("PIN must be exactly 4 digits", e.fields["pin"])
    }
    @Test fun `409 carries the machine code`() {
        val details = Json.parseToJsonElement("""{"code":"PHONE_BELONGS_TO_OTHER"}""")
        assertEquals(AppError.Conflict("Телефон бошқа мижозники", "PHONE_BELONGS_TO_OTHER"), ApiException(409, "Телефон бошқа мижозники · Phone belongs to another client", details).toAppError())
    }
    @Test fun `IOException is Network with an Uzbek message`() {
        assertEquals(AppError.Network("Интернет йўқ"), IOException("timeout").toAppError())
    }
    @Test fun `an unmapped throwable with a message passes it through — DeviceLocation relies on this for its Uzbek text`() {
        val e = IllegalStateException("Жойни аниқлаш учун рухсат керак").toAppError()
        assertEquals(AppError.Server("Жойни аниқлаш учун рухсат керак", 0), e)
    }
    @Test fun `an unmapped throwable with no message falls back to a generic Uzbek one`() {
        val e = IllegalStateException().toAppError()
        assertEquals(AppError.Server("Хатолик", 0), e)
    }
}
