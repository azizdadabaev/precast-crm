package uz.etalon.crm.feature.clients.edit

/**
 * Re-exports the shared Uzbekistan region catalogue from `:core:ui` (`core/ui/regions/Regions.kt`)
 * so this module and `formatAddressLine` (used by orders and client screens across the app) stay
 * on one copy of the 14 viloyats / 206 tumans rather than two that can drift apart.
 *
 * `ParsedAddress`/`composeAddress`/`parseAddress`/`findViloyatByName`/`findTumanByName`/`tumansOf`
 * moved to `:core:ui` too (`core/ui/regions/ClientAddress.kt` and `Regions.kt`) — the calculator's
 * client bar needs the same address convention. What is re-exported here is unchanged so this
 * module's own call sites (and tests) compile without edits.
 */
internal typealias Viloyat = uz.etalon.crm.core.ui.regions.Viloyat
internal typealias Tuman = uz.etalon.crm.core.ui.regions.Tuman
internal val VILOYATS = uz.etalon.crm.core.ui.regions.VILOYATS
internal val TUMANS = uz.etalon.crm.core.ui.regions.TUMANS
internal fun composeAddress(v: String, t: String, s: String) = uz.etalon.crm.core.ui.regions.composeAddress(v, t, s)
internal fun parseAddress(a: String?) = uz.etalon.crm.core.ui.regions.parseAddress(a)
internal fun findViloyatByName(n: String) = uz.etalon.crm.core.ui.regions.findViloyatByName(n)
internal fun findTumanByName(n: String) = uz.etalon.crm.core.ui.regions.findTumanByName(n)
internal fun tumansOf(v: String) = uz.etalon.crm.core.ui.regions.tumansOf(v)
