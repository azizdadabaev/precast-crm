package uz.etalon.crm.feature.clients.edit

/**
 * Re-exports the shared Uzbekistan region catalogue from `:core:ui` (`core/ui/regions/Regions.kt`)
 * so this module and `formatAddressLine` (used by orders and client screens across the app) stay
 * on one copy of the 14 viloyats / 206 tumans rather than two that can drift apart. This module
 * still owns [findViloyatByName]/[findTumanByName]/[tumansOf]/[ClientAddress.kt]'s address
 * composer — only the raw table moved.
 */
internal typealias Viloyat = uz.etalon.crm.core.ui.regions.Viloyat
internal typealias Tuman = uz.etalon.crm.core.ui.regions.Tuman
internal val VILOYATS = uz.etalon.crm.core.ui.regions.VILOYATS
internal val TUMANS = uz.etalon.crm.core.ui.regions.TUMANS
