package uz.etalon.crm.core.data

import uz.etalon.crm.core.data.mapper.toDomain
import uz.etalon.crm.core.model.Driver
import uz.etalon.crm.core.network.EtalonApi
import uz.etalon.crm.core.network.dto.DriverActiveRequest
import uz.etalon.crm.core.network.dto.DriverCreateRequest
import uz.etalon.crm.core.network.dto.DriverUpdateRequest
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class DriversRepository @Inject constructor(private val api: EtalonApi) {
    suspend fun list(activeOnly: Boolean = false): Result<List<Driver>> =
        runCatchingCancellable { api.drivers(if (activeOnly) "true" else null).map { it.toDomain() } }

    suspend fun create(name: String, phone: String, notes: String?): Result<Driver> =
        runCatchingCancellable { api.createDriver(DriverCreateRequest(name, phone, notes)).toDomain() }

    suspend fun update(id: String, name: String?, phone: String?, notes: String?): Result<Driver> =
        runCatchingCancellable { api.updateDriver(id, DriverUpdateRequest(name, phone, notes)).toDomain() }

    suspend fun setActive(id: String, active: Boolean): Result<Driver> =
        runCatchingCancellable { api.setDriverActive(id, DriverActiveRequest(active)).toDomain() }
}
