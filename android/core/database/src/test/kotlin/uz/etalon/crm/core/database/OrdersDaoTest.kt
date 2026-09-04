package uz.etalon.crm.core.database

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import app.cash.turbine.test
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import uz.etalon.crm.core.database.entity.OrderDetailEntity
import uz.etalon.crm.core.database.entity.OrderSummaryEntity

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class OrdersDaoTest {
    private fun db() = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext<Context>(), EtalonDatabase::class.java).allowMainThreadQueries().build()
    private fun row(id: String, key: String, pos: Int) = OrderSummaryEntity(
        id = id, orderNumber = "2026-09-00$pos", status = "PLACED", paymentState = "AWAITING_PAYMENT",
        totalPrice = "100.00", confirmedPaid = "0.00", totalArea = "10.000", totalBlocks = 1, totalBeams = 1,
        scheduledAt = 0, placedAt = 0, clientId = "c", clientName = "Азизов", clientPhone = "998901112233", clientAddress = null,
        listKey = key, position = pos, cachedAt = 0,
    )

    @Test fun replaceList_keepsOrderAndIsolatesKeys() = runTest {
        val d = db().ordersDao()
        d.replaceList("all", listOf(row("a", "all", 1), row("b", "all", 0)))
        d.replaceList("placed", listOf(row("a", "placed", 0)))
        d.observeList("all").test {
            assertEquals(listOf("b", "a"), awaitItem().map { it.id })
            cancelAndIgnoreRemainingEvents()
        }
        d.replaceList("all", listOf(row("c", "all", 0)))
        d.observeList("all").test { assertEquals(listOf("c"), awaitItem().map { it.id }); cancelAndIgnoreRemainingEvents() }
        d.observeList("placed").test { assertEquals(listOf("a"), awaitItem().map { it.id }); cancelAndIgnoreRemainingEvents() }
    }

    @Test fun deleteOrder_removesSummaryAndDetail() = runTest {
        val d = db().ordersDao()
        d.replaceList("all", listOf(row("a", "all", 0)))
        d.upsertDetail(OrderDetailEntity("a", "{}", 0))
        d.deleteOrder("a")
        d.observeList("all").test { assertTrue(awaitItem().isEmpty()); cancelAndIgnoreRemainingEvents() }
        d.observeDetail("a").test { assertNull(awaitItem()); cancelAndIgnoreRemainingEvents() }
    }
}
