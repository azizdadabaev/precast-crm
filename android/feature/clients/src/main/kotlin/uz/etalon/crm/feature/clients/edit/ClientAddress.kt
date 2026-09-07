package uz.etalon.crm.feature.clients.edit

/**
 * A client address split the way it is stored. The convention is written by the web's
 * `AddressInput` widget and read by `parseAddress` in `src/lib/regions/index.ts`:
 *
 *     "<Viloyat>, <Tuman>, <street>"
 *
 * with any leading part allowed to be absent. Compose it the same way and the same address opens
 * correctly in the web CRM; compose it any other way and the web reads the whole string as a
 * street with no region at all.
 */
data class ParsedAddress(val viloyat: String, val tuman: String, val street: String)

internal fun findViloyatByName(name: String): Viloyat? =
    VILOYATS.firstOrNull { it.name == name || it.nameUz == name }

internal fun findTumanByName(name: String): Tuman? =
    TUMANS.firstOrNull { it.name == name || it.nameUz == name }

/** The tumans of one viloyat, or all of them when nothing is chosen yet. */
internal fun tumansOf(viloyatName: String): List<Tuman> {
    val v = findViloyatByName(viloyatName) ?: return TUMANS
    return TUMANS.filter { it.viloyatId == v.id }
}

/** Mirrors `composeAddress` in src/lib/regions/index.ts, case for case: a blank part is an
 *  absent part, and what is left is joined with ", ". */
fun composeAddress(viloyat: String, tuman: String, street: String): String =
    listOf(viloyat, tuman, street).map { it.trim() }.filter { it.isNotEmpty() }.joinToString(", ")

/**
 * Mirrors `parseAddress`, with two deliberate differences from the TS:
 *
 * 1. It keeps the SPELLING that was stored rather than canonicalising to the Latin `name`. The
 *    web widget writes the Cyrillic `nameUz` and then parses it back to Latin, so an operator
 *    who opens a client and saves an unrelated field silently flips the whole address into
 *    Latin. Nothing here needs that, and a phone edit should not rewrite an address.
 * 2. It has no legacy 14-city fallback (`src/lib/uzbekistan-cities.ts`). An address that
 *    predates the region widget simply lands whole in [ParsedAddress.street] — which composes
 *    back to the identical string, so it survives an edit untouched either way.
 */
fun parseAddress(address: String?): ParsedAddress {
    val raw = address?.trim().orEmpty()
    if (raw.isEmpty()) return ParsedAddress("", "", "")
    val parts = raw.split(',').map { it.trim() }
    val rest = { from: Int -> parts.drop(from).joinToString(", ").trim() }

    // [Viloyat, Tuman, street] — only when the two heads actually belong together.
    if (parts.size >= 2) {
        val v = findViloyatByName(parts[0])
        val t = findTumanByName(parts[1])
        if (v != null && t != null && t.viloyatId == v.id) {
            return ParsedAddress(parts[0], parts[1], rest(2))
        }
    }
    // [Viloyat, street]
    if (findViloyatByName(parts[0]) != null) return ParsedAddress(parts[0], "", rest(1))
    // [Tuman, street] — a bare tuman snaps to its viloyat, in the alphabet it was written in.
    findTumanByName(parts[0])?.let { t ->
        val v = VILOYATS.firstOrNull { it.id == t.viloyatId }
        val viloyat = v?.let { if (parts[0] == t.nameUz) it.nameUz else it.name }.orEmpty()
        return ParsedAddress(viloyat, parts[0], rest(1))
    }
    return ParsedAddress("", "", raw)
}
