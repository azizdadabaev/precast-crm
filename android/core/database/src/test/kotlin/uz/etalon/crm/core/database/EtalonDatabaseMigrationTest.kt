package uz.etalon.crm.core.database

import android.content.Context
import androidx.room.testing.MigrationTestHelper
import androidx.sqlite.SQLiteConnection
import androidx.sqlite.driver.AndroidSQLiteDriver
import androidx.sqlite.execSQL
import androidx.test.core.app.ApplicationProvider
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File

/**
 * The invariant a schema bump must never break: an outbox row is the only durable record that an
 * operator photographed a loaded truck or a delivery and counted cash against it. Losing it loses
 * both the photo (its file path lives in the row) and the money figure, with nothing on screen to
 * say so. The order cache in the same file is the opposite — throwing it away costs one refresh.
 *
 * This runs the real 3 → 4 step against a real SQLite file built from the committed schema 3, so a
 * future migration that drops or rewrites `outbox` fails here. Going back to
 * `fallbackToDestructiveMigration` fails here too: with no migration registered for the step,
 * `runMigrationsAndValidate` throws instead of quietly recreating the tables.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class EtalonDatabaseMigrationTest {

    private val context: Context get() = ApplicationProvider.getApplicationContext()

    @get:Rule
    val helper = MigrationTestHelper(
        instrumentation = InstrumentationRegistry.getInstrumentation(),
        file = File(context.cacheDir, "migration-test.db"),
        driver = AndroidSQLiteDriver(),
        databaseClass = EtalonDatabase::class,
    )

    @Test fun `bumping the schema keeps a queued upload and its cash payload`() {
        val payload = """{"cashAmount":"1500000.00","noCashCollected":"false"}"""
        helper.createDatabase(3).use { db ->
            db.execSQL(
                """
                INSERT INTO outbox
                    (id, ownerId, kind, orderId, shipmentId, paymentId, filePath, payloadJson,
                     state, attempts, lastError, createdAt, updatedAt)
                VALUES ('row-1', 'u1', 'DELIVERY_PROOF', 'o1', NULL, NULL,
                        '/data/outbox/row-1.jpg', '$payload', 'QUEUED', 0, NULL, 10, 10)
                """.trimIndent()
            )
        }

        helper.runMigrationsAndValidate(4, listOf(MIGRATION_3_4)).use { db ->
            db.prepare("SELECT ownerId, filePath, payloadJson, state FROM outbox WHERE id = 'row-1'").use { stmt ->
                assertTrue("the queued delivery proof must survive the version bump", stmt.step())
                assertEquals("u1", stmt.getText(0))
                assertEquals("/data/outbox/row-1.jpg", stmt.getText(1))
                assertEquals("the cash figure must come through unchanged", payload, stmt.getText(2))
                assertEquals("QUEUED", stmt.getText(3))
            }
        }
    }

    /** The other half of the same rule: the cache is not precious, and the migration is what says
     *  so — explicitly, per table, rather than by a builder flag that could not tell them apart. */
    @Test fun `bumping the schema drops the order cache`() {
        helper.createDatabase(3).use { db ->
            db.execSQL("INSERT INTO order_details (id, json, cachedAt) VALUES ('o1', '{}', 10)")
        }

        helper.runMigrationsAndValidate(4, listOf(MIGRATION_3_4)).use { db ->
            db.prepare("SELECT COUNT(*) FROM order_details").use { stmt ->
                assertTrue(stmt.step())
                assertEquals(0, stmt.getInt(0))
            }
        }
    }

    private inline fun <T> SQLiteConnection.use(block: (SQLiteConnection) -> T): T =
        try { block(this) } finally { close() }
}
