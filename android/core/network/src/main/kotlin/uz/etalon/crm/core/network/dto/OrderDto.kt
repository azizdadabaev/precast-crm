package uz.etalon.crm.core.network.dto

import kotlinx.serialization.Serializable

@Serializable data class ClientDto(val id: String, val name: String, val phone: String, val address: String? = null)
@Serializable data class OrderSummaryDto(
    val id: String, val orderNumber: String, val status: String, val paymentState: String,
    val totalPrice: String, val confirmedPaid: String, val totalArea: String, val totalBlocks: Int, val totalBeams: Int,
    val scheduledAt: String, val placedAt: String, val client: ClientDto,
)
@Serializable data class OrdersPageDto(val items: List<OrderSummaryDto>, val total: Int, val page: Int, val pageSize: Int, val totalPages: Int)

@Serializable data class NameDto(val id: String, val name: String)
@Serializable data class CalculationDto(val name: String? = null, val innerWidth: String, val innerLength: String, val pattern: String, val beamLength: String, val beamCount: Int, val totalBlocks: Int, val billedArea: String, val subtotal: String)
@Serializable data class ProjectDto(val calculations: List<CalculationDto> = emptyList())
@Serializable data class ReceiptDto(val id: String, val imageUrl: String)
@Serializable data class PaymentDto(val id: String, val amount: String, val method: String, val status: String, val recordedAt: String, val recordedBy: NameDto? = null, val receipts: List<ReceiptDto> = emptyList())
@Serializable data class DriverDto(val id: String, val name: String)
@Serializable data class ShipmentDto(val id: String, val number: Int, val status: String, val loadedBlocks: Int? = null, val loadedPhotoUrl: String? = null, val driver: DriverDto? = null, val truckIdentifier: String? = null)
@Serializable data class OrderEventDto(val id: String, val type: String, val message: String? = null, val actor: NameDto? = null, val createdAt: String)
@Serializable data class GalleryPhotoDto(val id: String, val url: String)
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
)
