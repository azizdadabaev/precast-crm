package uz.etalon.crm.nav

import androidx.navigation3.runtime.NavKey
import kotlinx.serialization.Serializable

/** Navigation 3 keys. @Serializable so rememberNavBackStack can restore the stack
 *  across process death. */
@Serializable sealed interface Key : NavKey

@Serializable data object Login : Key
@Serializable data class ChangePin(val forced: Boolean) : Key
@Serializable data object Home : Key
@Serializable data object Orders : Key
@Serializable data class OrderDetail(val id: String) : Key
@Serializable data object More : Key

// ── Clients ──────────────────────────────────────────────────────────────────
/** The bottom-bar tab (Destination.CLIENTS). Carries no back arrow, like Orders and Payments. */
@Serializable data object Clients : Key
@Serializable data class ClientDetail(val id: String) : Key

/** A bottom-bar destination whose feature module has not landed yet. */
@Serializable data class ComingSoon(val labelRes: Int) : Key

// ── Logistics ────────────────────────────────────────────────────────────────
/** [extra] distinguishes "mark this order loaded" from "just add one more photo to it". */
@Serializable data class LoadTruck(val orderId: String, val extra: Boolean) : Key
@Serializable data class Shipments(val orderId: String) : Key
@Serializable data class ShipmentLoad(val orderId: String, val shipmentId: String) : Key
/** A null [shipmentId] is the whole-order dispatch; a non-null one dispatches that truck. */
@Serializable data class Dispatch(val orderId: String, val shipmentId: String? = null) : Key
@Serializable data class DeliveryProof(val orderId: String) : Key
@Serializable data class DeliveryLocation(val orderId: String) : Key
@Serializable data object Drivers : Key

// ── Payments ─────────────────────────────────────────────────────────────────
/** The bottom-bar tab (Destination.PAYMENTS). It *is* the confirmation queue — that screen was
 *  built as a top-level destination, tabs and all — so there is no second key for the queue. */
@Serializable data object Payments : Key
@Serializable data class RecordPayment(val orderId: String) : Key
@Serializable data object Discrepancies : Key
