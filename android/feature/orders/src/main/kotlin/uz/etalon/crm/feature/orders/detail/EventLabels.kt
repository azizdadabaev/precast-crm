package uz.etalon.crm.feature.orders.detail

import androidx.annotation.StringRes
import uz.etalon.crm.feature.orders.R

// ── Event-type names ──────────────────────────────────────────────
//
// Every `OrderEventType` this client reasons about by NAME lives here, beside the map that spells
// all of them — never as a second literal in the screen or the timeline that applies the rule. A
// type renamed on the server then breaks in one file, and `EventLabelsTest`'s literal enum list is
// what catches it.

/** The one event type whose server `message` is English prose written for the desk, so «Тарих»
 *  prints [orderEventLabel]'s Uzbek wording instead of it. */
internal const val STOCK_WARNING = "STOCK_WARNING"

/** The whole-order load: one photo, one status change. A split order writes [SHIPMENT_LOADED] per
 *  truck instead, which is why `timelineFor` falls back to the shipments' own `loadedAt`. */
internal const val ORDER_LOADED = "ORDER_LOADED"

/** A split order's per-truck load — the event `timelineFor` does NOT read (a truck's own
 *  `loadedAt` carries the instant; this only names the type for the label map). */
internal const val SHIPMENT_LOADED = "SHIPMENT_LOADED"

/** A split order's per-truck delivery. A whole-order delivery writes `STATUS_CHANGED` with the new
 *  status in a `payload` this client does not carry, so that case falls through to the check. */
internal const val SHIPMENT_DELIVERED = "SHIPMENT_DELIVERED"

/**
 * Uzbek Cyrillic wording for every `OrderEventType` the server has
 * (`precast-crm/prisma/schema.prisma`, written by the routes under `precast-crm/src/app/api`).
 *
 * «Тарих» falls back to `OrderEventLine.type` when an event carries no `message`, and most of them
 * do not — so the timeline printed raw English enum names («SHIPMENT_DISPATCHED») at an operator
 * who reads Uzbek. The server's `message`, when it has one, still wins: it carries the specifics
 * (which driver, how much) that a type name cannot.
 *
 * A type this client does not know reads as «Ҳодиса» — something happened, said honestly, rather
 * than a guess or a raw identifier. `EventLabelsTest` pins the map against the enum spelled out
 * literally, so a type added on the server shows up as a failing test here rather than as English
 * on a phone.
 *
 * @return the string resource for [type], or null if this client has no wording for it.
 */
@StringRes
internal fun orderEventLabel(type: String): Int? = when (type) {
    "ORDER_PLACED" -> R.string.event_order_placed
    "STATUS_CHANGED" -> R.string.event_status_changed
    "SCHEDULED_DATE_CHANGED" -> R.string.event_scheduled_date_changed
    "DISCOUNT_APPLIED" -> R.string.event_discount_applied
    "ORDER_CANCELED" -> R.string.event_order_canceled
    "ORDER_EDITED" -> R.string.event_order_edited
    "NOTE_ADDED" -> R.string.event_note_added
    STOCK_WARNING -> R.string.event_stock_warning
    "ORDER_DISPATCHED" -> R.string.event_order_dispatched
    "DISPATCH_RETURNED" -> R.string.event_dispatch_returned
    "PAYMENT_RECORDED" -> R.string.event_payment_recorded
    "PAYMENT_HANDED_OVER" -> R.string.event_payment_handed_over
    "PAYMENT_CONFIRMED" -> R.string.event_payment_confirmed
    "PAYMENT_REJECTED" -> R.string.event_payment_rejected
    "PAYMENT_ADJUSTED" -> R.string.event_payment_adjusted
    "DISCREPANCY_OPENED" -> R.string.event_discrepancy_opened
    "DISCREPANCY_RESOLVED" -> R.string.event_discrepancy_resolved
    ORDER_LOADED -> R.string.event_order_loaded
    "SHIPMENT_CREATED" -> R.string.event_shipment_created
    SHIPMENT_LOADED -> R.string.event_shipment_loaded
    "SHIPMENT_DISPATCHED" -> R.string.event_shipment_dispatched
    SHIPMENT_DELIVERED -> R.string.event_shipment_delivered
    else -> null
}
