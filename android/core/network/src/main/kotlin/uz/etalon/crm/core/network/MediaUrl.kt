package uz.etalon.crm.core.network

/** The API returns relative /uploads/… paths (served publicly by Caddy).
 *  This is the ONE place that knows the origin; if the owner later gates
 *  uploads, add the signed-URL logic here. */
object MediaUrl {
    fun absolute(base: String, path: String?): String? {
        if (path == null) return null
        if (path.startsWith("http://") || path.startsWith("https://")) return path
        return base.trimEnd('/') + "/" + path.trimStart('/')
    }
}
