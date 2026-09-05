package uz.etalon.crm.core.network

import kotlinx.coroutines.test.runTest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import uz.etalon.crm.core.network.dto.DeliveryLocationRequest
import uz.etalon.crm.core.network.dto.DispatchCreateRequest
import uz.etalon.crm.core.network.dto.ShipmentDispatchRequest
import uz.etalon.crm.core.network.dto.toJsonBody
import java.math.BigDecimal

class LogisticsApiTest {
    private lateinit var server: MockWebServer
    private lateinit var api: EtalonApi

    @BeforeEach fun setUp() {
        server = MockWebServer().also { it.start() }
        val json = EtalonJson.create()
        api = Retrofit.Builder()
            .baseUrl(server.url("/"))
            .client(OkHttpClient.Builder().addInterceptor(EnvelopeInterceptor(json)).build())
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(EtalonApi::class.java)
    }
    @AfterEach fun tearDown() = server.shutdown()

    private fun ok(body: String) =
        MockResponse().setBody(body).addHeader("Content-Type", "application/json")

    private fun jpegPart(): MultipartBody.Part =
        MultipartBody.Part.createFormData(
            "file", "truck.jpg",
            byteArrayOf(0xFF.toByte(), 0xD8.toByte()).toRequestBody("image/jpeg".toMediaType()),
        )

    private fun textPart(v: String) = v.toRequestBody("text/plain".toMediaType())

    @Test fun `loadTruck posts multipart with the idempotency header`() = runTest {
        server.enqueue(ok("""{"ok":true,"data":{"loadedPhotoUrl":"/uploads/orders/o1/loaded-1.jpg"}}"""))
        val res = api.loadTruck("o1", jpegPart(), "key-1")
        assertEquals("/uploads/orders/o1/loaded-1.jpg", res.loadedPhotoUrl)
        val rec = server.takeRequest()
        assertEquals("POST", rec.method)
        assertEquals("/api/orders/o1/load", rec.path)
        assertEquals("key-1", rec.getHeader("Idempotency-Key"))
        assertTrue(rec.getHeader("Content-Type")!!.startsWith("multipart/form-data"))
        assertTrue(rec.body.readUtf8().contains("""name="file""""))
    }

    @Test fun `deliveryProof sends every cash field as its own part`() = runTest {
        server.enqueue(ok("""{"ok":true,"data":{"id":"o1","status":"DELIVERED"}}"""))
        api.deliveryProof(
            id = "o1", file = jpegPart(),
            cashAmount = textPart("1500000"),
            noCashCollected = textPart("false"),
            noCashCollectedNote = textPart(""),
            driverReturned = textPart("true"),
            idempotencyKey = "key-2",
        )
        val body = server.takeRequest().body.readUtf8()
        for (name in listOf("file", "cashAmount", "noCashCollected", "noCashCollectedNote", "driverReturned")) {
            assertTrue(body.contains("""name="$name""""), "missing part $name")
        }
    }

    @Test fun `loadShipment sends the beam map and block count as text parts`() = runTest {
        server.enqueue(ok("""{"ok":true,"data":{"id":"s1","number":1,"status":"LOADED"}}"""))
        api.loadShipment("o1", "s1", jpegPart(), textPart("""{"3.30":5}"""), textPart("120"), "key-3")
        val rec = server.takeRequest()
        assertEquals("/api/orders/o1/shipments/s1/load", rec.path)
        val body = rec.body.readUtf8()
        assertTrue(body.contains("""name="loadedBeams""""))
        assertTrue(body.contains("""{"3.30":5}"""))
        assertTrue(body.contains("""name="loadedBlocks""""))
    }

    @Test fun `dispatchShipment posts json and reads the dispatched flag`() = runTest {
        server.enqueue(ok("""{"ok":true,"data":{"dispatched":true}}"""))
        val res = api.dispatchShipment("o1", "s1", ShipmentDispatchRequest(driverId = "d1", truckIdentifier = "01A123BC", driverWillCollectCash = true, cashToCollect = BigDecimal("500000.00")))
        assertTrue(res.dispatched)
        val rec = server.takeRequest()
        assertEquals("POST", rec.method)
        val sent = rec.body.readUtf8()
        assertTrue(sent.contains(""""driverId":"d1""""))
        assertTrue(sent.contains(""""driverWillCollectCash":true"""))
    }

    // Money on the wire must carry the exact decimal the server's
    // Decimal(14,2) column expects, as a bare number (never a quoted
    // string, never a Double — see BigDecimalSerializer).
    @Test fun `dispatchShipment carries the exact cash decimal, not a Double approximation`() = runTest {
        server.enqueue(ok("""{"ok":true,"data":{"dispatched":true}}"""))
        api.dispatchShipment("o1", "s1", ShipmentDispatchRequest(cashToCollect = BigDecimal("1234.56")))
        val sent = server.takeRequest().body.readUtf8()
        assertTrue(sent.contains(""""cashToCollect":1234.56"""), "expected the bare literal 1234.56, got: $sent")
    }

    @Test fun `createDispatch carries the Decimal(14,2) ceiling exactly, where Double would switch to scientific notation`() = runTest {
        server.enqueue(ok("""{"ok":true,"data":{"id":"dp1","expectedCollection":"999999999999.99"}}"""))
        api.createDispatch("o1", DispatchCreateRequest(expectedCollection = BigDecimal("999999999999.99")))
        val sent = server.takeRequest().body.readUtf8()
        // Double.toString(999999999999.99) renders "9.9999999999999E11" on the
        // JVM this module targets — not representable as this plain-decimal
        // literal, which is exactly why this field is BigDecimal, not Double.
        assertTrue(sent.contains(""""expectedCollection":999999999999.99"""), "expected the bare literal 999999999999.99, got: $sent")
    }

    @Test fun `createShipment posts with no body and returns the new shipment`() = runTest {
        server.enqueue(ok("""{"ok":true,"data":{"id":"s2","number":2,"status":"PENDING"}}"""))
        val res = api.createShipment("o1")
        assertEquals(2, res.number)
        val rec = server.takeRequest()
        assertEquals("POST", rec.method)
        assertEquals("/api/orders/o1/shipments", rec.path)
    }

    @Test fun `deleteShipment and deliverShipment hit the right paths`() = runTest {
        server.enqueue(ok("""{"ok":true,"data":{"deleted":true}}"""))
        api.deleteShipment("o1", "s1")
        assertEquals("/api/orders/o1/shipments/s1", server.takeRequest().path)
        server.enqueue(ok("""{"ok":true,"data":{"delivered":true}}"""))
        api.deliverShipment("o1", "s1")
        assertEquals("/api/orders/o1/shipments/s1/deliver", server.takeRequest().path)
    }

    @Test fun `createDispatch sends expectedCollection`() = runTest {
        server.enqueue(ok("""{"ok":true,"data":{"id":"dp1","expectedCollection":"500000.00"}}"""))
        api.createDispatch("o1", DispatchCreateRequest(driverId = "d1", truckIdentifier = null, expectedCollection = BigDecimal("500000.00"), notes = null))
        assertTrue(server.takeRequest().body.readUtf8().contains(""""expectedCollection":500000.00"""))
    }

    // The shared Json has explicitNulls = false, which would silently drop a
    // null lat/lng — but the server's DeliveryLocationBody requires both keys
    // present (a null in either clears the pin). setDeliveryLocation therefore
    // takes a pre-built JsonObject (see DeliveryLocationRequest.toJsonBody())
    // instead of routing the request DTO through the shared Json.
    @Test fun `setDeliveryLocation sends nulls to clear the pin`() = runTest {
        server.enqueue(ok("""{"ok":true,"data":{"id":"o1","deliveryLat":null,"deliveryLng":null,"deliveryLocationUrl":null,"deliveryLocationLabel":null}}"""))
        val body = DeliveryLocationRequest(null, null, null, null).toJsonBody()
        val res = api.setDeliveryLocation("o1", body)
        assertEquals(null, res.deliveryLat)
        // explicitNulls = false must NOT drop the required lat/lng keys
        val sent = server.takeRequest().body.readUtf8()
        assertTrue(sent.contains(""""lat":null"""), "lat must be sent explicitly as null")
        assertTrue(sent.contains(""""lng":null"""), "lng must be sent explicitly as null")
    }

    @Test fun `drivers list is parsed with its derived counts`() = runTest {
        server.enqueue(ok("""{"ok":true,"data":[{"id":"d1","name":"Ҳайдовчи","phone":"998901112233","active":true,"activeDispatchCount":2,"discrepancyCount30d":0,"lastDispatchAt":"2026-09-01T00:00:00.000Z"}]}"""))
        val list = api.drivers(activeOnly = "true")
        assertEquals(1, list.size)
        assertEquals(2, list[0].activeDispatchCount)
        assertEquals("/api/drivers?activeOnly=true", server.takeRequest().path)
    }

    @Test fun `resolveMapLink returns coordinates`() = runTest {
        server.enqueue(ok("""{"ok":true,"data":{"lat":41.31,"lng":69.28}}"""))
        val p = api.resolveMapLink(uz.etalon.crm.core.network.dto.ResolveLinkRequest("https://maps.app.goo.gl/x"))
        assertEquals(41.31, p.lat)
    }
}
