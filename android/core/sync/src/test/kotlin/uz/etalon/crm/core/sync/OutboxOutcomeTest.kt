package uz.etalon.crm.core.sync

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.network.ApiException
import java.io.IOException

class OutboxOutcomeTest {

    @Test fun `a dropped connection retries`() {
        assertEquals(OutboxOutcome.Retry, outcomeFor(IOException("unexpected end of stream")))
    }

    @Test fun `a server error retries`() {
        assertEquals(OutboxOutcome.Retry, outcomeFor(ApiException(500, "Internal server error")))
        assertEquals(OutboxOutcome.Retry, outcomeFor(ApiException(502, "Сервер хатоси · Server error")))
    }

    @Test fun `rate limiting and timeout retry`() {
        assertEquals(OutboxOutcome.Retry, outcomeFor(ApiException(429, "Too many requests")))
        assertEquals(OutboxOutcome.Retry, outcomeFor(ApiException(408, "Timeout")))
    }

    @Test fun `a rejected upload fails permanently with the Uzbek half of the message`() {
        val out = outcomeFor(ApiException(422, "Расм катта (макс 8 МБ) · Image too large (max 8 MB)"))
        assertTrue(out is OutboxOutcome.Fail)
        assertEquals("Расм катта (макс 8 МБ)", (out as OutboxOutcome.Fail).message)
    }

    @Test fun `a stale status transition fails permanently`() {
        // The order moved on while the photo waited for a signal.
        val out = outcomeFor(ApiException(422, "Order must be PLACED or IN_PRODUCTION to load (current: DELIVERED)"))
        assertTrue(out is OutboxOutcome.Fail)
    }

    @Test fun `a 401 retries so the upload survives a token refresh`() {
        // Signing back in must not lose the photo; the row stays queued.
        assertEquals(OutboxOutcome.Retry, outcomeFor(ApiException(401, "Авторизация талаб қилинади · Authentication required")))
    }

    /** The server's own idempotency layer is still running the FIRST attempt at this key. Nothing
     *  was rejected — treating it as a permanent failure would turn a flaky connection into a lost
     *  order the operator has to chase. */
    @Test fun `IDEMPOTENT_IN_PROGRESS retries rather than failing the row`() {
        val details = JsonObject(mapOf("code" to JsonPrimitive("IDEMPOTENT_IN_PROGRESS")))
        val t = ApiException(409, "Сўров ҳали бажарилмоқда · Request still in progress", details)
        assertEquals(OutboxOutcome.Retry, outcomeFor(t))
    }

    /** Every OTHER 409 is a real conflict the server will answer the same way forever — the order
     *  already exists for that project, say — so it must still fail permanently. */
    @Test fun `an ordinary 409 still fails permanently`() {
        val out = outcomeFor(ApiException(409, "Бу лойиҳа учун буюртма аллақачон жойлаштирилган · Already placed"))
        assertTrue(out is OutboxOutcome.Fail)
        assertEquals("Бу лойиҳа учун буюртма аллақачон жойлаштирилган", (out as OutboxOutcome.Fail).message)
    }

    @Test fun `a missing file fails permanently instead of retrying forever`() {
        // The prepared JPEG lived in a directory the OS can evict; a retry can never bring
        // the file back, so this must not fall into the generic "any IOException retries" rule.
        val out = outcomeFor(MissingUploadFileException("/data/user/0/uz.etalon.crm/files/outbox/gone.jpg"))
        assertTrue(out is OutboxOutcome.Fail)
    }
}
