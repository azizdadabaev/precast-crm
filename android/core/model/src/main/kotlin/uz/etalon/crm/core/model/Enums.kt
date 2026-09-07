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
// No `from(...)` here, unlike its neighbours: the source is only ever SENT (the record form picks
// one and `record` writes `source.name`), never parsed back — no response on this client carries
// one. A parser with no caller is dead code.
enum class PaymentSource { IN_OFFICE_CASH, BANK_OR_ONLINE, FROM_DRIVER_AT_DELIVERY, UNKNOWN }
enum class DiscrepancyStatus { OPEN, RESOLVED_RECOVERED, RESOLVED_DISCOUNT, RESOLVED_WRITEOFF, DISPUTED, UNKNOWN;
    companion object { fun from(s: String?) = entries.firstOrNull { it.name == s } ?: UNKNOWN } }
