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
 * This runs the real registered chain — `ALL_MIGRATIONS`, the same array the production builder
 * installs via `.addMigrations(*ALL_MIGRATIONS)` — against a real SQLite file built from the
 * committed schema 3, so a future migration that drops or rewrites `outbox`, or one that is written
 * but never added to that array, fails here. Going back to `fallbackToDestructiveMigration` fails
 * here too: with no migration registered for a step, `runMigrationsAndValidate` throws instead of
 * quietly recreating the tables.
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

        helper.runMigrationsAndValidate(4, ALL_MIGRATIONS.toList()).use { db ->
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

        helper.runMigrationsAndValidate(4, ALL_MIGRATIONS.toList()).use { db ->
            db.prepare("SELECT COUNT(*) FROM order_details").use { stmt ->
                assertTrue(stmt.step())
                assertEquals(0, stmt.getInt(0))
            }
        }
    }

    /** The same invariant, for the row a payment-receipt capture writes: `kind` is a String column
     *  precisely so this step needs no DDL, but that only holds if the row itself — owner, file,
     *  cash payload, state — survives the bump untouched. */
    @Test fun `bumping the schema from 4 to 5 keeps a queued payment receipt`() {
        val payload = """{"note":"receipt"}"""
        helper.createDatabase(4).use { db ->
            db.execSQL(
                """
                INSERT INTO outbox
                    (id, ownerId, kind, orderId, shipmentId, paymentId, filePath, payloadJson,
                     state, attempts, lastError, createdAt, updatedAt)
                VALUES ('row-2', 'u1', 'ADD_PAYMENT_RECEIPT', 'o1', NULL, 'p1',
                        '/data/outbox/row-2.jpg', '$payload', 'QUEUED', 0, NULL, 10, 10)
                """.trimIndent()
            )
        }

        helper.runMigrationsAndValidate(6, ALL_MIGRATIONS.toList()).use { db ->
            db.prepare("SELECT ownerId, filePath, payloadJson, state FROM outbox WHERE id = 'row-2'").use { stmt ->
                assertTrue("the queued payment receipt must survive the version bump", stmt.step())
                assertEquals("u1", stmt.getText(0))
                assertEquals("/data/outbox/row-2.jpg", stmt.getText(1))
                assertEquals("the payload must come through unchanged", payload, stmt.getText(2))
                assertEquals("QUEUED", stmt.getText(3))
            }
        }
    }

    /** The calculator draft table (schema 6) must not disturb a row already queued under the
     *  older schema — the same "additive only" guarantee [MIGRATION_5_6]'s own KDoc states. */
    @Test fun `schema 6 adds the draft table without disturbing a queued upload`() {
        helper.createDatabase(5).use { db ->
            db.execSQL(
                """
                INSERT INTO outbox
                    (id, ownerId, kind, orderId, shipmentId, paymentId, filePath, payloadJson,
                     state, attempts, lastError, createdAt, updatedAt)
                VALUES ('row-2','u1','LOAD_TRUCK','o1',NULL,NULL,'/p.jpg','{}','QUEUED',0,NULL,10,10)
                """.trimIndent()
            )
        }
        helper.runMigrationsAndValidate(6, ALL_MIGRATIONS.toList()).use { db ->
            db.prepare("SELECT COUNT(*) FROM calculator_draft").use { s -> assertTrue(s.step()); assertEquals(0, s.getInt(0)) }
            db.prepare("SELECT state FROM outbox WHERE id = 'row-2'").use { s -> assertTrue(s.step()); assertEquals("QUEUED", s.getText(0)) }
        }
    }

    private inline fun <T> SQLiteConnection.use(block: (SQLiteConnection) -> T): T =
        try { block(this) } finally { close() }
}
