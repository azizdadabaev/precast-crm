package uz.etalon.crm.feature.orders.detail

import androidx.annotation.StringRes
import uz.etalon.crm.feature.orders.R

// ── Event-type names ──────────────────────────────────────────────
//
// Every `OrderEventType` this client reasons about by NAME lives here, beside the map that spells
// all of them — never as a second literal in the screen or the timeline that applies the rule. A
// type renamed on the server then breaks in one file, and `EventLabelsTest`'s literal enum list is
// what catches it.

/** The type this carve-out started with: the server writes its `message` as English prose for the
 *  desk, so «Тарих» prints [orderEventLabel]'s Uzbek wording instead. It is one of
 *  [DESK_ENGLISH_EVENTS] now — see [eventMessage]. */
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

/**
 * Every event type whose `message` the web writes as English prose for the desk.
 *
 * Audited against the writers themselves — `precast-crm/src/lib/create-order.ts`,
 * `src/lib/order-load.ts` and every `orderEvent.create` under `src/app/api` — rather than guessed
 * from the type names. What each one writes, in the order this set is spelled:
 * «Order placed for {client}» · «Delivered — proof photo uploaded» · «Schedule moved: … → …» ·
 * «Order edited: total … → …» · «Client contact corrected · …» · «Stock went negative for …» ·
 * «Dispatched: driver …» · «Driver returned to office» · «{n} UZS in cash recorded at office …» ·
 * «Cash handed over to office (payment …)» · «Payment … confirmed: …» · «Payment … rejected: …» ·
 * «Payment … adjusted: … → …» · «Discrepancy …: short by …» · «Discrepancy …: … → …».
 *
 * NOT in the set: `ORDER_CANCELED`, whose `message` is the operator's own reason typed into the
 * cancel dialog, and the four `SHIPMENT_*` types plus `ORDER_LOADED`, which the routes already
 * write in Uzbek. `DISCOUNT_APPLIED` has no writer at all.
 *
 * The server strings are the web's to fix (its own order page prints them too); this client refuses
 * to show them, which is all it can do from here.
 */
private val DESK_ENGLISH_EVENTS = setOf(
    "ORDER_PLACED",
    "STATUS_CHANGED",
    "SCHEDULED_DATE_CHANGED",
    "ORDER_EDITED",
    "NOTE_ADDED",
    STOCK_WARNING,
    "ORDER_DISPATCHED",
    "DISPATCH_RETURNED",
    "PAYMENT_RECORDED",
    "PAYMENT_HANDED_OVER",
    "PAYMENT_CONFIRMED",
    "PAYMENT_REJECTED",
    "PAYMENT_ADJUSTED",
    "DISCREPANCY_OPENED",
    "DISCREPANCY_RESOLVED",
)

/**
 * What «Тарих» prints for one event: the server's own [message], or null when this client's Uzbek
 * label should win instead (`orderEventLabel`, falling through to «Ҳодиса»).
 *
 * The server's `message` is normally the better line — it carries the specifics a type name cannot
 * (which driver, how much, from what to what). For [DESK_ENGLISH_EVENTS] it is English prose
 * written for a desk, and an operator who reads Uzbek got «Order placed for Yusupov & Sons» in
 * their history.
 *
 * Two of those types are written by more than one route, and not all of them in English:
 * `order-load.ts` writes `STATUS_CHANGED` as «Ишлаб чиқаришга ўтказилди», `settle-remaining`
 * writes `DISCREPANCY_RESOLVED` with «Қолдиқ ҳисобдан чиқарилди …», and `PAYMENT_REJECTED` quotes
 * the operator's own reason inside its English sentence. So the carve-out asks the message: one
 * carrying Uzbek is either a route that already writes Uzbek or somebody's own words, and throwing
 * either away for a bare label would lose more than it saved. One with no Cyrillic in it at all is
 * the desk English this rule exists for.
 */
internal fun eventMessage(type: String, message: String?): String? =
    message?.takeUnless { type in DESK_ENGLISH_EVENTS && it.none { c -> c.isCyrillic() } }

/** U+0400…U+04FF, the Cyrillic block — every letter the UI's Uzbek is written in. A plain range
 *  rather than `Character.UnicodeBlock`, which brings the whole block table in to answer the same
 *  question. */
private fun Char.isCyrillic(): Boolean = this in 'Ѐ'..'ӿ'
