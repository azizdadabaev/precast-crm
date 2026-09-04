package uz.etalon.crm.core.network

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.network.dto.DeviceRegisterRequest
import uz.etalon.crm.core.network.dto.LoginRequest

/**
 * EtalonJson.create() must set encodeDefaults = true: LoginRequest.client
 * and DeviceRegisterRequest.platform carry defaults the server relies on
 * (missing "client" makes login silently report client:"web"; missing
 * "platform" makes PUT /api/devices 422). Uses the exact Json NetworkModule
 * provides, not a hand-rolled one, so this guards the real wiring.
 */
class RequestEncodingTest {
    private val json = EtalonJson.create()

    @Test fun `login request encodes the android client default`() {
        val body = json.encodeToString(LoginRequest.serializer(), LoginRequest(loginName = "a", pin = "1234"))
        assertTrue(body.contains(""""client":"android""""), body)
    }

    @Test fun `device register request encodes the android platform default`() {
        val body = json.encodeToString(DeviceRegisterRequest.serializer(), DeviceRegisterRequest(fcmToken = "t"))
        assertTrue(body.contains(""""platform":"android""""), body)
    }

    @Test fun `envelope without data still decodes with explicitNulls off`() {
        val env = json.decodeFromString(Envelope.serializer(), """{"ok":true}""")
        assertTrue(env.ok)
        assertNull(env.data)
    }
}
