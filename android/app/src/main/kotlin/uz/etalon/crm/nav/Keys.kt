package uz.etalon.crm.nav

import androidx.navigation3.runtime.NavKey
import kotlinx.serialization.Serializable

/** Navigation 3 keys. @Serializable so rememberNavBackStack can restore the stack
 *  across process death. */
@Serializable sealed interface Key : NavKey

@Serializable data object Login : Key
@Serializable data class ChangePin(val forced: Boolean) : Key
@Serializable data object Orders : Key
@Serializable data class OrderDetail(val id: String) : Key
@Serializable data object More : Key

/** A bottom-bar destination whose feature module has not landed yet. */
@Serializable data class ComingSoon(val labelRes: Int) : Key
