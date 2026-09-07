package uz.etalon.crm.core.testing

import kotlinx.serialization.json.JsonObject
import okhttp3.MultipartBody
import okhttp3.RequestBody
import uz.etalon.crm.core.network.EtalonApi
import uz.etalon.crm.core.network.dto.*

/**
 * The one place a test double for [EtalonApi] is written.
 *
 * Every member throws, so a suite subclasses this and overrides ONLY the routes the code under
 * test actually calls — an unexpected call fails the test by name instead of returning a
 * plausible-looking fixture. A double that would have succeeded is what makes a permission guard
 * provable: see `ClientsRepositoryTest`'s recording doubles.
 *
 * This exists because the alternative kept breaking. `EtalonApi` gained endpoints three times in
 * Phase 1c/1d, and each time every hand-written double in every module stopped compiling and had
 * to gain an identical throwing stub — twice the whole-project build was left broken by a task
 * that only verified its own module. Widening the interface now costs one member here.
 *
 * Kept in `src/main` rather than a test source set: Gradle does not share test source sets across
 * modules, which is exactly why six near-identical copies existed.
 */
abstract class FakeEtalonApi : EtalonApi {

    /** Names the route, never its arguments — those carry tokens, phones and client data. */
    private fun unused(route: String): Nothing =
        error("FakeEtalonApi.$route was called; this test did not override it")

    override suspend fun login(body: LoginRequest): LoginResponse = unused("login")
    override suspend fun me(): UserDto = unused("me")
    override suspend fun bootstrap(): BootstrapDto = unused("bootstrap")
    override suspend fun changePin(body: ChangePinRequest): ChangedDto = unused("changePin")
    override suspend fun registerDevice(body: DeviceRegisterRequest): DeviceDto = unused("registerDevice")
    override suspend fun unregisterDevice(token: String): DeletedDto = unused("unregisterDevice")
    override suspend fun orders(q: String?, status: String?, day: String?, page: Int, pageSize: Int): OrdersPageDto = unused("orders")
    override suspend fun order(id: String): OrderDetailDto = unused("order")

    override suspend fun loadTruck(id: String, file: MultipartBody.Part, idempotencyKey: String, authorization: String): LoadedPhotoDto = unused("loadTruck")
    override suspend fun addLoadedPhoto(id: String, file: MultipartBody.Part, idempotencyKey: String, authorization: String): GalleryPhotoDto = unused("addLoadedPhoto")
    override suspend fun deliveryProof(id: String, file: MultipartBody.Part, cashAmount: RequestBody, noCashCollected: RequestBody, noCashCollectedNote: RequestBody, driverReturned: RequestBody, idempotencyKey: String, authorization: String): OrderStatusDto = unused("deliveryProof")
    override suspend fun loadShipment(id: String, sid: String, file: MultipartBody.Part, loadedBeams: RequestBody, loadedBlocks: RequestBody, idempotencyKey: String, authorization: String): ShipmentDto = unused("loadShipment")

    override suspend fun deleteLoadedPhoto(id: String, photoId: String): DeletedIdDto = unused("deleteLoadedPhoto")
    override suspend fun createShipment(id: String): ShipmentDto = unused("createShipment")
    override suspend fun deleteShipment(id: String, sid: String): DeletedDto = unused("deleteShipment")
    override suspend fun dispatchShipment(id: String, sid: String, body: ShipmentDispatchRequest): DispatchedDto = unused("dispatchShipment")
    override suspend fun deliverShipment(id: String, sid: String): DeliveredDto = unused("deliverShipment")
    override suspend fun createDispatch(id: String, body: DispatchCreateRequest): DispatchDto = unused("createDispatch")
    override suspend fun markDispatchReturned(id: String): DispatchDto = unused("markDispatchReturned")
    override suspend fun setDeliveryLocation(id: String, body: JsonObject): DeliveryLocationDto = unused("setDeliveryLocation")
    override suspend fun resolveMapLink(body: ResolveLinkRequest): LatLngDto = unused("resolveMapLink")
    override suspend fun drivers(activeOnly: String?): List<DriverListItemDto> = unused("drivers")
    override suspend fun createDriver(body: DriverCreateRequest): DriverListItemDto = unused("createDriver")
    override suspend fun updateDriver(id: String, body: DriverUpdateRequest): DriverListItemDto = unused("updateDriver")
    override suspend fun setDriverActive(id: String, body: DriverActiveRequest): DriverListItemDto = unused("setDriverActive")

    override suspend fun payments(orderId: String?, status: String?): List<PaymentRowDto> = unused("payments")
    override suspend fun recordPayment(body: PaymentRecordRequest, idempotencyKey: String): PaymentRowDto = unused("recordPayment")
    override suspend fun confirmPayment(id: String, body: PaymentConfirmRequest): PaymentRowDto = unused("confirmPayment")
    override suspend fun rejectPayment(id: String, body: PaymentRejectRequest): PaymentRowDto = unused("rejectPayment")
    override suspend fun addPaymentReceipt(id: String, file: MultipartBody.Part, idempotencyKey: String, authorization: String): ReceiptDto = unused("addPaymentReceipt")
    override suspend fun discrepancies(status: String?): List<DiscrepancyDto> = unused("discrepancies")
    override suspend fun updateDiscrepancy(id: String, body: DiscrepancyUpdateRequest): DiscrepancyDto = unused("updateDiscrepancy")

    override suspend fun clients(q: String?, page: Int, pageSize: Int): ClientsPageDto = unused("clients")
    override suspend fun createClient(body: ClientWriteRequest): ClientRowDto = unused("createClient")
    override suspend fun client(id: String): ClientDetailDto = unused("client")
    override suspend fun updateClient(id: String, body: ClientWriteRequest): ClientRowDto = unused("updateClient")
    override suspend fun dashboard(): DashboardDto = unused("dashboard")
}
