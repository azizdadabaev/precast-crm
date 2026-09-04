package uz.etalon.crm.core.network.dto

import kotlinx.serialization.Serializable

@Serializable data class LoginRequest(val loginName: String, val pin: String, val client: String = "android")
@Serializable data class UserDto(val id: String, val name: String, val email: String? = null, val role: String, val permissions: List<String>, val mustChangePassword: Boolean, val isActive: Boolean = true)
@Serializable data class LoginResponse(val token: String, val user: UserDto, val redirectTo: String)
@Serializable data class ChangePinRequest(val currentPin: String = "", val newPin: String)
@Serializable data class ChangedDto(val changed: Boolean)
@Serializable data class DeviceRegisterRequest(val fcmToken: String, val platform: String = "android", val appVersion: String? = null)
@Serializable data class DeviceDto(val id: String, val fcmToken: String)
@Serializable data class DeletedDto(val deleted: Boolean)
