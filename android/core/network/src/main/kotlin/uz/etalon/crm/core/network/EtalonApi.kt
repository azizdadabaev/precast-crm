package uz.etalon.crm.core.network

import kotlinx.serialization.json.JsonObject
import okhttp3.MultipartBody
import okhttp3.RequestBody
import okhttp3.ResponseBody
import retrofit2.http.*
import uz.etalon.crm.core.network.dto.CancelOrderRequest
import uz.etalon.crm.core.network.dto.DraftDto
import uz.etalon.crm.core.network.dto.DraftsPageDto
import uz.etalon.crm.core.network.dto.GalleryPageDto
import uz.etalon.crm.core.network.dto.InboxDto
import uz.etalon.crm.core.network.dto.ChatProjectDto
import uz.etalon.crm.core.network.dto.ReplyLocationRequest
import uz.etalon.crm.core.network.dto.ReplyTextRequest
import uz.etalon.crm.core.network.dto.MessageDto
import uz.etalon.crm.core.network.dto.ThreadDto
import uz.etalon.crm.core.network.dto.InboxUnlockDto
import uz.etalon.crm.core.network.dto.InboxUnlockRequest
import uz.etalon.crm.core.network.dto.*

/**
 * How many client rows the first (and only) page of `GET /api/clients` fetches. The server's own
 * default is 50 (`DEFAULT_PAGE_SIZE` in src/lib/table-query.ts) and its cap is 200; this sends
 * the figure explicitly so the bound is stated on the client rather than inherited.
 */
const val CLIENTS_PAGE_SIZE = 50

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
        @Query("payment") payment: String? = null, @Query("sort") sort: String = "asc",
    ): OrdersPageDto
    @GET("/api/orders/{id}") suspend fun order(@Path("id") id: String): OrderDetailDto

    /**
     * `GET /api/orders/capacity?from=YYYY-MM-DD&to=YYYY-MM-DD` — the calendar's day-load
     * aggregates for the visible six-week grid (design §4.3, R10). CANCELED orders are already
     * excluded server-side; days with no orders are simply omitted, not sent as zeros.
     */
    @GET("/api/orders/capacity")
    suspend fun capacity(@Query("from") from: String, @Query("to") to: String): CapacityDto

    /**
     * `GET /api/orders/export` — the owner's Excel backup (`order.exportBackup`), streamed rather
     * than buffered: the workbook can cover every order the factory has ever placed. `@Streaming`
     * stops Retrofit from reading the whole body into memory before this even returns; the caller
     * ([uz.etalon.crm.core.data.ExportRepository]) copies it straight to a cache file. Never
     * queued (R4): the route builds a fresh snapshot on every call, and a queued retry from a
     * dropped connection would only re-download what a second tap gets just as well.
     */
    @Streaming
    @GET("/api/orders/export")
    suspend fun exportBackup(): ResponseBody

    // ── Camera uploads. Every one of these routes is withIdempotency-wrapped on
    // the server, which is exactly why they are the operations the outbox may
    // queue and retry. The key is a client UUID reused across retries.
    //
    // These four alone carry their credential explicitly: the outbox drain pins the token it
    // started with and passes it here, because `AuthInterceptor` reads the store live, once per
    // call, and a row claimed under one operator must not go out under the next one's token if
    // the session changes hands mid-drain. The interceptor leaves an Authorization header the
    // caller already set. Every other route omits it and gets the live token, as before.

    /**
     * «Чатга юбориш» — the server renders the order's quote card in its own headless Chromium and
     * posts it to the customer's chat. No body and no image: rendering here would put a third
     * drawing of the same card (Compose, the web's DOM capture, Chromium) into one conversation.
     */
    @POST("/api/orders/{id}/send-to-chat")
    suspend fun sendOrderToChat(@Path("id") id: String): Unit

    // ── Drawer surfaces ─────────────────────────────────────────────

    /** «Лойиҳалар». `page` is what makes the route answer with an envelope instead of a bare array. */
    /** `order.cancel`. Answers 403 when the caller is neither OWNER/ADMIN nor sent the company
     *  cancel password — the message is the server's own Uzbek and is shown as it arrives. */
    @POST("/api/orders/{id}/cancel")
    suspend fun cancelOrder(@Path("id") id: String, @Body body: CancelOrderRequest): Unit

    @GET("/api/projects")
    suspend fun drafts(
        @Query("page") page: Int,
        @Query("pageSize") pageSize: Int,
        @Query("status") status: String?,
        @Query("q") query: String?,
    ): DraftsPageDto

    /** One saved draft, with the room inputs the calculator needs to reopen it. */
    @GET("/api/projects/{id}")
    suspend fun draft(@Path("id") id: String): DraftDto

    @GET("/api/gallery")
    suspend fun gallery(
        @Query("page") page: Int,
        @Query("pageSize") pageSize: Int,
        @Query("q") query: String?,
    ): GalleryPageDto

    /** Answers 403 with `details.code = "INBOX_LOCKED"` when the permission is held but the
     *  session is locked — see InboxRepository for what the app does with that. */
    @GET("/api/inbox")
    suspend fun inbox(): InboxDto

    /** One conversation and its last 500 messages. Reading it marks it read, server-side. */
    @GET("/api/inbox/{id}")
    suspend fun thread(@Path("id") id: String): ThreadDto

    @POST("/api/inbox/{id}/reply")
    suspend fun replyText(@Path("id") id: String, @Body body: ReplyTextRequest): MessageDto

    @Multipart
    @POST("/api/inbox/{id}/reply-photo")
    suspend fun replyPhoto(
        @Path("id") id: String,
        @Part photo: MultipartBody.Part,
        @Part("caption") caption: RequestBody,
    ): MessageDto

    /** Added for the phone: the function existed server-side, the route did not. */
    @POST("/api/inbox/{id}/reply-location")
    suspend fun replyLocation(@Path("id") id: String, @Body body: ReplyLocationRequest): MessageDto

    /** The quotes already linked to this chat. */
    @GET("/api/inbox/{id}/projects")
    suspend fun chatProjects(@Path("id") id: String): List<ChatProjectDto>

    /** Renders the draft server-side and posts it, as the order route does. */
    @POST("/api/projects/{id}/send-to-chat")
    suspend fun sendProjectToChat(@Path("id") id: String): Unit

    /** Answers 401 «Нотўғри парол» on a wrong password. NOT a session 401 — see InboxRepository. */
    @POST("/api/inbox/unlock")
    suspend fun unlockInbox(@Body body: InboxUnlockRequest): InboxUnlockDto

    @Multipart
    @POST("/api/orders/{id}/load")
    suspend fun loadTruck(
        @Path("id") id: String,
        @Part file: MultipartBody.Part,
        @Header("Idempotency-Key") idempotencyKey: String,
        @Header("Authorization") authorization: String,
    ): LoadedPhotoDto

    @Multipart
    @POST("/api/orders/{id}/loaded-photos")
    suspend fun addLoadedPhoto(
        @Path("id") id: String,
        @Part file: MultipartBody.Part,
        @Header("Idempotency-Key") idempotencyKey: String,
        @Header("Authorization") authorization: String,
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
        @Header("Authorization") authorization: String,
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
        @Header("Authorization") authorization: String,
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

    // ── Comments (Шарҳлар) ───────────────────────────────────────

    /**
     * The deal's whole thread: the server unions the comments on the order with the ones left on
     * its source draft (`Order.projectId`), oldest first. `order.view` — every operator who can
     * open the order can read and write it.
     */
    @GET("/api/orders/{id}/comments")
    suspend fun comments(@Path("id") id: String): List<CommentDto>

    /**
     * `withIdempotency`-wrapped server-side, so the key is required here as it is on
     * [recordPayment]. Unlike a payment this is never queued: a note that arrives an hour late is
     * not worth the outbox's machinery, and the composer keeps the draft when the send fails.
     */
    @POST("/api/orders/{id}/comments")
    suspend fun postComment(
        @Path("id") id: String,
        @Body body: CommentCreateRequest,
        @Header("Idempotency-Key") idempotencyKey: String,
    ): CommentDto

    // ── Payments & discrepancies ─────────────────────────────────

    @GET("/api/payments")
    suspend fun payments(@Query("orderId") orderId: String? = null, @Query("status") status: String? = null): List<PaymentRowDto>

    /**
     * The same `GET /api/payments`, but with `withCounts=1` — which switches the response from the
     * bare array [payments] reads to `{ items: [...same rows...], counts: { pending, confirmed,
     * rejected } }`. The three counts are computed with every filter EXCEPT `status`, so they stay
     * stable across a tab switch. Only the confirm queue's three tabs need them; every other
     * caller keeps using [payments].
     */
    @GET("/api/payments")
    suspend fun paymentsWithCounts(
        @Query("status") status: String? = null,
        @Query("withCounts") withCounts: Int = 1,
    ): PaymentsWithCountsDto

    // `withIdempotency`-wrapped server-side, so the key is REQUIRED here rather than optional:
    // the record screen offers a retry, and a response lost after the row committed would
    // otherwise let one tap write two real payments against the order.
    @POST("/api/payments")
    suspend fun recordPayment(
        @Body body: PaymentRecordRequest,
        @Header("Idempotency-Key") idempotencyKey: String,
    ): PaymentRowDto

    @POST("/api/payments/{id}/confirm")
    suspend fun confirmPayment(@Path("id") id: String, @Body body: PaymentConfirmRequest): PaymentRowDto

    @POST("/api/payments/{id}/reject")
    suspend fun rejectPayment(@Path("id") id: String, @Body body: PaymentRejectRequest): PaymentRowDto

    // POST /api/payments/{id}/handover is deliberately absent: the app has no office hand-over
    // surface, and a declaration with no caller is dead code. The route is still there for the
    // web, and this comes back the day a screen needs it.
    //
    // POST /api/payments/upload-receipt is absent for the same reason: a receipt always attaches
    // to an existing payment through the route below, whose response the outbox can act on. The
    // loose upload returns a bare URL that nothing on this client has anywhere to put.

    // Multipart uploads carry their own Authorization header — see the loadTruck/addLoadedPhoto/
    // deliveryProof/loadShipment comment above; the outbox drain pins the token explicitly.
    @Multipart
    @POST("/api/payments/{id}/receipts")
    suspend fun addPaymentReceipt(
        @Path("id") id: String,
        @Part file: MultipartBody.Part,
        @Header("Idempotency-Key") idempotencyKey: String,
        @Header("Authorization") authorization: String,
    ): ReceiptDto

    @GET("/api/discrepancies")
    suspend fun discrepancies(@Query("status") status: String? = null): List<DiscrepancyDto>

    @PATCH("/api/discrepancies/{id}")
    suspend fun updateDiscrepancy(@Path("id") id: String, @Body body: DiscrepancyUpdateRequest): DiscrepancyDto

    // ── Home & clients (Phase 1d) ──────────────────────────────────

    /**
     * `GET /api/clients`. **`page` is never omitted.** Sending it opts into the server's
     * paginated envelope (`isPaginated` in src/lib/table-query.ts); WITHOUT it the route answers
     * a bare array of EVERY client row, each carrying a `_count` aggregate. This client has no
     * Room cache and the bottom bar destroys the Clients NavEntry on every tab switch, so an
     * unbounded call would re-download the whole customer table each time an operator moved
     * between tabs — on a phone, on their own data.
     *
     * One bounded page, not Paging 3: the list is search-first (`q` is what an operator actually
     * uses to find a customer), and a scrolling pager with a Room-backed cache is its own slice.
     * [ClientsPageDto.total] is the count MATCHING the query server-side, so a caller can tell
     * the operator when there is more than it fetched.
     *
     * `?phone=` IS used, by the calculator's client bar and only there: it is an exact-or-prefix
     * match on the normalised number (`src/app/api/clients/route.ts:88`), which is the dedup the
     * web calculator's ClientInfoBar does. `q` stays the list screen's search — it matches names
     * and trailing digits, which is the wrong shape for "is this exact number already a customer".
     *
     * `sortBy=totalBooked` (paired with `sortDir`) orders the page by each client's live-order
     * total instead of the server's `createdAt` default — the whitelist this route enforces is
     * `CLIENT_SORT_FIELDS` in `src/app/api/clients/route.ts`.
     */
    @GET("/api/clients")
    suspend fun clients(
        @Query("q") q: String? = null,
        @Query("phone") phone: String? = null,
        @Query("page") page: Int = 1,
        @Query("pageSize") pageSize: Int = CLIENTS_PAGE_SIZE,
        @Query("sortBy") sortBy: String? = null,
        @Query("sortDir") sortDir: String? = null,
    ): ClientsPageDto

    @POST("/api/clients")
    suspend fun createClient(@Body body: ClientWriteRequest): ClientRowDto

    @GET("/api/clients/{id}")
    suspend fun client(@Path("id") id: String): ClientDetailDto

    @PATCH("/api/clients/{id}")
    suspend fun updateClient(@Path("id") id: String, @Body body: ClientWriteRequest): ClientRowDto

    @GET("/api/dashboard")
    suspend fun dashboard(): DashboardDto

    // ── Calculator draft (Phase 2b Task 8) ─────────────────────────

    /**
     * `withIdempotency`-wrapped server-side (Phase 2b Task 1), same reason `recordPayment`
     * requires the header: the calculator saves a draft over a field connection and may retry,
     * and a response lost after the Project row committed would otherwise save one quote twice
     * under two ids. A 409 `IDEMPOTENT_IN_PROGRESS` means a retry arrived while the first attempt
     * was still running — the caller must treat that as "try again shortly", never as a permanent
     * failure.
     */
    @POST("/api/projects")
    suspend fun saveProjectDraft(
        @Body body: SaveProjectDraftRequest,
        @Header("Idempotency-Key") idempotencyKey: String,
    ): ProjectSavedDto

    /**
     * `POST /api/orders` — placing the order, `withIdempotency`-wrapped server-side (Phase 2b
     * Task 1). This is the ONE non-multipart route the outbox may queue: a calculator is used at
     * a customer's site, where signal is worst, and a placement that cannot wait for a bar is a
     * deal lost. The queued row's id IS the key, so a drain retrying after a dropped connection
     * replays the first response rather than creating a second real order — with a second order
     * number, a second production commitment and a second receivable.
     *
     * [authorization] is nullable, unlike the five multipart routes' — this route has two callers,
     * not one. The outbox drain pins the token it started with and passes it, so a row claimed
     * under one operator never goes out under the next one's (`AuthInterceptor` leaves a header the
     * caller already set). The ONLINE path — the operator's own tap, right now — passes null:
     * Retrofit omits a null `@Header` entirely, and the interceptor then supplies the live token as
     * it does for every other route. Passing a placeholder instead would send a broken credential.
     *
     * A 409 `IDEMPOTENT_IN_PROGRESS` means a retry arrived while the first attempt was still
     * running — "try again shortly", never a permanent failure (`outcomeFor` treats it that way).
     * A key first used here must never be reused for a draft save or a payment: the server keys
     * are scoped `${user.id}:${key}` and answer `IDEMPOTENT_ROUTE_MISMATCH` across routes.
     */
    @POST("/api/orders")
    suspend fun placeOrder(
        @Body body: PlaceOrderRequest,
        @Header("Idempotency-Key") idempotencyKey: String,
        @Header("Authorization") authorization: String?,
    ): OrderPlacedDto
}
