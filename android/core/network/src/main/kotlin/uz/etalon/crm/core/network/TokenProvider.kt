package uz.etalon.crm.core.network

interface TokenProvider {
    suspend fun token(): String?
    /** Called once per 401 so the session can be cleared and the PIN screen shown. */
    suspend fun onUnauthorized()

    /**
     * The inbox's own unlock token, when one has been obtained.
     *
     * A second gate on top of the session: `inbox.access` says who may read the messages, this
     * says the password has been entered recently. Defaulted to null so every other implementation
     * — the tests' among them — is unaffected.
     */
    suspend fun inboxUnlockToken(): String? = null
}
