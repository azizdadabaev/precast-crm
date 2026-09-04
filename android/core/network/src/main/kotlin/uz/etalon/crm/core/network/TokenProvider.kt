package uz.etalon.crm.core.network

interface TokenProvider {
    suspend fun token(): String?
    /** Called once per 401 so the session can be cleared and the PIN screen shown. */
    suspend fun onUnauthorized()
}
