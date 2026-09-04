package uz.etalon.crm.core.model

/** What every repository Flow emits: cached data first, then the network outcome. */
sealed interface Resource<out T> {
    data class Loading<T>(val cached: T? = null) : Resource<T>
    data class Success<T>(val data: T) : Resource<T>
    data class Error<T>(val cached: T?, val error: AppError) : Resource<T>
    val dataOrNull: T? get() = when (this) { is Loading -> cached; is Success -> data; is Error -> cached }
}

/** Typed failures the UI can react to. `message` is the Uzbek half of the server's bilingual string. */
sealed class AppError(open val message: String) {
    data class Network(override val message: String) : AppError(message)
    data object Unauthorized : AppError("Сессия тугади")
    data class Forbidden(override val message: String) : AppError(message)
    data class Validation(override val message: String, val fields: Map<String, String>) : AppError(message)
    data class Conflict(override val message: String, val code: String?) : AppError(message)
    data class Server(override val message: String, val status: Int) : AppError(message)
}
