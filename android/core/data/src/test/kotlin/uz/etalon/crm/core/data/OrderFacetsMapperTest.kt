package uz.etalon.crm.core.data

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.data.mapper.toDomain
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.network.dto.OrderFacetsDto
import uz.etalon.crm.core.network.dto.OrderFacetsPaymentDto
import java.math.BigDecimal

class OrderFacetsMapperTest {
    @Test fun `unknown statuses are dropped and known ones keyed by enum`() {
        val f = OrderFacetsDto(byStatus = mapOf("PLACED" to 1, "DISPATCHED" to 2, "BOGUS" to 9), byPayment = OrderFacetsPaymentDto(6, 3), total = 3, totalArea = BigDecimal("157.8")).toDomain()
        assertEquals(mapOf(OrderStatus.PLACED to 1, OrderStatus.DISPATCHED to 2), f.byStatus)
        assertEquals(6, f.debt); assertEquals(3, f.paid); assertEquals(3, f.total)
        assertEquals(BigDecimal("157.8"), f.totalArea)
    }
}
