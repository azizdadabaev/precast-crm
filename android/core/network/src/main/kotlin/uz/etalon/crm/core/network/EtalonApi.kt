package uz.etalon.crm.core.network

import kotlinx.serialization.json.JsonObject
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.http.*
import uz.etalon.crm.core.network.dto.*

interface EtalonApi {
    @POST("/api/auth/login") suspend fun login(@Body body: LoginRequest): LoginResponse
    @GET("/api/auth/me") suspend fun me(): UserDto
    @GET("/api/mobile/bootstrap") suspend fun bootstrap(): BootstrapDto
    @POST("/api/users/me/password") suspend fun changePin(@Body body: ChangePinRequest): ChangedDto
    @PUT("/api/devices") suspend fun registerDevice(@Body body: DeviceRegisterRequest): DeviceDto
    @DELETE("/api/devices/{token}") suspend fun unregisterDevice(@Path("token") token: String): DeletedDto
    @GET("/api/orders") suspend fun orders(
        @Query("q") q: String? = null, @Query("status") status: String? = null, @Query("day") day: String? = null,
        @Query("page") page: Int = 1, @Query("pageSize") pageSize: Int = 20,
    ): OrdersPageDto
    @GET("/api/orders/{id}") suspend fun order(@Path("id") id: String): OrderDetailDto

    // ── Camera uploads. Every one of these routes is withIdempotency-wrapped on
    // the server, which is exactly why they are the operations the outbox may
    // queue and retry. The key is a client UUID reused across retries.

    @Multipart
    @POST("/api/orders/{id}/load")
    suspend fun loadTruck(
        @Path("id") id: String,
        @Part file: MultipartBody.Part,
        @Header("Idempotency-Key") idempotencyKey: String,
    ): LoadedPhotoDto

    @Multipart
    @POST("/api/orders/{id}/loaded-photos")
    suspend fun addLoadedPhoto(
        @Path("id") id: String,
        @Part file: MultipartBody.Part,
        @Header("Idempotency-Key") idempotencyKey: String,
    ): GalleryPhotoDto

    @Multipart
    @POST("/api/orders/{id}/delivery-proof")
    suspend fun deliveryProof(
        @Path("id") id: String,
        @Part file: MultipartBody.Part,
        @Part("cashAmount") cashAmount: RequestBody,
        @Part("noCashCollected") noCashCollected: RequestBody,
        @Part("noCashCollectedNote") noCashCollectedNote: RequestBody,
        @Part("driverReturned") driverReturned: RequestBody,
        @Header("Idempotency-Key") idempotencyKey: String,
    ): OrderStatusDto

    @Multipart
    @POST("/api/orders/{id}/shipments/{sid}/load")
    suspend fun loadShipment(
        @Path("id") id: String,
        @Path("sid") sid: String,
        @Part file: MultipartBody.Part,
        @Part("loadedBeams") loadedBeams: RequestBody,
        @Part("loadedBlocks") loadedBlocks: RequestBody,
        @Header("Idempotency-Key") idempotencyKey: String,
    ): ShipmentDto

    // ── Online-only mutations (no server-side idempotency, so never queued)

    @DELETE("/api/orders/{id}/loaded-photos/{photoId}")
    suspend fun deleteLoadedPhoto(@Path("id") id: String, @Path("photoId") photoId: String): DeletedIdDto

    @POST("/api/orders/{id}/shipments")
    suspend fun createShipment(@Path("id") id: String): ShipmentDto

    @DELETE("/api/orders/{id}/shipments/{sid}")
    suspend fun deleteShipment(@Path("id") id: String, @Path("sid") sid: String): DeletedDto

    @POST("/api/orders/{id}/shipments/{sid}/dispatch")
    suspend fun dispatchShipment(
        @Path("id") id: String, @Path("sid") sid: String, @Body body: ShipmentDispatchRequest,
    ): DispatchedDto

    @POST("/api/orders/{id}/shipments/{sid}/deliver")
    suspend fun deliverShipment(@Path("id") id: String, @Path("sid") sid: String): DeliveredDto

    @POST("/api/orders/{id}/dispatch")
    suspend fun createDispatch(@Path("id") id: String, @Body body: DispatchCreateRequest): DispatchDto

    @PATCH("/api/dispatches/{id}/return")
    suspend fun markDispatchReturned(@Path("id") id: String): DispatchDto

    @PATCH("/api/orders/{id}/delivery-location")
    suspend fun setDeliveryLocation(@Path("id") id: String, @Body body: JsonObject): DeliveryLocationDto

    @POST("/api/geo/resolve-link")
    suspend fun resolveMapLink(@Body body: ResolveLinkRequest): LatLngDto

    @GET("/api/drivers")
    suspend fun drivers(@Query("activeOnly") activeOnly: String? = null): List<DriverListItemDto>

    @POST("/api/drivers")
    suspend fun createDriver(@Body body: DriverCreateRequest): DriverListItemDto

    @PATCH("/api/drivers/{id}")
    suspend fun updateDriver(@Path("id") id: String, @Body body: DriverUpdateRequest): DriverListItemDto

    @PATCH("/api/drivers/{id}/deactivate")
    suspend fun setDriverActive(@Path("id") id: String, @Body body: DriverActiveRequest): DriverListItemDto
}
