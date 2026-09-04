package uz.etalon.crm.core.model

enum class OrderStatus { DRAFT, PLACED, IN_PRODUCTION, LOADED, DISPATCHED, DELIVERED, CANCELED, UNKNOWN;
    companion object { fun from(s: String) = entries.firstOrNull { it.name == s } ?: UNKNOWN } }
enum class PaymentState { AWAITING_PAYMENT, PARTIALLY_PAID, FULLY_PAID, UNKNOWN;
    companion object { fun from(s: String) = entries.firstOrNull { it.name == s } ?: UNKNOWN } }
enum class PaymentStatus { PENDING_CONFIRMATION, CONFIRMED, REJECTED, UNKNOWN;
    companion object { fun from(s: String) = entries.firstOrNull { it.name == s } ?: UNKNOWN } }
enum class PaymentMethod { CASH, BANK_TRANSFER, CLICK, PAYME, OTHER, UNKNOWN;
    companion object { fun from(s: String) = entries.firstOrNull { it.name == s } ?: UNKNOWN } }
enum class ShipmentStatus { PENDING, LOADED, DISPATCHED, DELIVERED, UNKNOWN;
    companion object { fun from(s: String) = entries.firstOrNull { it.name == s } ?: UNKNOWN } }
enum class Role { OWNER, ADMIN, SALES, INVENTORY, DRIVER, ACCOUNTANT, CUSTOM, UNKNOWN;
    companion object { fun from(s: String) = entries.firstOrNull { it.name == s } ?: UNKNOWN } }
