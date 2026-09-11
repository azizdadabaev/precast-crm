package uz.etalon.crm.core.network.dto

import kotlinx.serialization.Serializable
import uz.etalon.crm.core.network.BigDecimalSerializer
import java.math.BigDecimal

@Serializable data class ClientDto(val id: String, val name: String, val phone: String, val address: String? = null)
@Serializable data class OrderSummaryDto(
    val id: String, val orderNumber: String, val status: String, val paymentState: String,
    val totalPrice: String, val confirmedPaid: String,
    val totalArea: String, val totalBlocks: Int, val totalBeams: Int,
    val scheduledAt: String, val placedAt: String, val client: ClientDto,
    // Kept last (with a default) so the existing positional-argument test fixtures still
    // compile unchanged.
    val writeOffAmount: String = "0",
)
@Serializable data class OrderFacetsPaymentDto(val debt: Int = 0, val paid: Int = 0)
@Serializable data class OrderFacetsDto(
    val byStatus: Map<String, Int> = emptyMap(),
    val byPayment: OrderFacetsPaymentDto = OrderFacetsPaymentDto(),
    val total: Int = 0,
    @Serializable(with = BigDecimalSerializer::class) val totalArea: BigDecimal = BigDecimal.ZERO,
)
@Serializable data class OrdersPageDto(
    val items: List<OrderSummaryDto>, val total: Int, val page: Int, val pageSize: Int, val totalPages: Int,
    /** Absent from a server older than Task 1; the list then shows no counts rather than failing to decode. */
    val facets: OrderFacetsDto? = null,
)

@Serializable data class NameDto(val id: String, val name: String)
@Serializable data class CalculationDto(val name: String? = null, val innerWidth: String, val innerLength: String, val pattern: String, val beamLength: String, val beamCount: Int, val totalBlocks: Int, val billedArea: String, val subtotal: String)
@Serializable data class ProjectDto(val calculations: List<CalculationDto> = emptyList())
@Serializable data class ReceiptDto(val id: String, val imageUrl: String)
@Serializable data class PaymentDto(val id: String, val amount: String, val method: String, val status: String, val recordedAt: String, val recordedBy: NameDto? = null, val receipts: List<ReceiptDto> = emptyList())
@Serializable data class DriverDto(val id: String, val name: String)
@Serializable
data class ShipmentDto(
    val id: String,
    val number: Int,
    val status: String,
    val loadedBeams: Map<String, Int>? = null,   // keys are two-decimal beam lengths, e.g. "3.30"
    val loadedBlocks: Int? = null,
    val loadedPhotoUrl: String? = null,
    val loadedAt: String? = null,
    val dispatchedAt: String? = null,
    val deliveredAt: String? = null,
    val driverWillCollectCash: Boolean = false,
    val cashToCollect: String? = null,
    val truckIdentifier: String? = null,
    val notes: String? = null,
    val driver: DriverDto? = null,
)
@Serializable data class OrderEventDto(val id: String, val type: String, val message: String? = null, val actor: NameDto? = null, val createdAt: String)
@Serializable
data class GalleryPhotoDto(
    val id: String,
    val url: String,
    val kind: String? = null,
    val uploadedAt: String? = null,
)
@Serializable data class OrderDetailDto(
    val id: String, val orderNumber: String, val status: String, val paymentState: String,
    val totalPrice: String, val confirmedPaid: String, val totalArea: String, val totalBlocks: Int, val totalBeams: Int,
    val scheduledAt: String, val placedAt: String, val client: ClientDto, val notes: String? = null,
    val deliveryLat: Double? = null, val deliveryLng: Double? = null, val deliveryLocationUrl: String? = null, val deliveryLocationLabel: String? = null,
    val roomsSubtotal: String, val discountAmount: String, val deliveryCost: String, val otherCost: String, val writeOffAmount: String = "0",
    val deliveryProofUrl: String? = null,
    val project: ProjectDto = ProjectDto(),
    val payments: List<PaymentDto> = emptyList(),
    val shipments: List<ShipmentDto> = emptyList(),
    val events: List<OrderEventDto> = emptyList(),
    val galleryPhotos: List<GalleryPhotoDto> = emptyList(),
    val dispatch: DispatchDto? = null,
)
