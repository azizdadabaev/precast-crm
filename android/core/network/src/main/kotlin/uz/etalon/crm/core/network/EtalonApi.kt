package uz.etalon.crm.core.network

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
}
