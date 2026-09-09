package uz.etalon.crm.core.database

import androidx.room.migration.Migration
import androidx.sqlite.SQLiteConnection
import androidx.sqlite.execSQL

/**
 * Why this file exists at all.
 *
 * Up to schema 3 the builder carried `fallbackToDestructiveMigration(dropAllTables = true)`. That
 * was harmless while `etalon.db` held nothing but a re-fetchable order cache: a version bump threw
 * the cache away and the next refresh refilled it. Phase 1b changed what the file contains. The
 * `outbox` table is now the ONLY durable copy of a delivery photo the operator has taken and of the
 * cash figure they counted against it — the JPEG on disk is meaningless without the row that names
 * its order, its owner and its payload. Under the old builder a routine app update that bumped the
 * schema would have dropped those rows with no error, no log and no trace in the UI, and orphaned
 * the files.
 *
 * So there is no destructive fallback any more. Every version step needs an entry in [ALL], and a
 * bump without one fails loudly when the database is opened instead of quietly deleting an
 * operator's un-sent cash proof. The cache tables stay cheap to treat roughly — emptying them costs
 * one refresh — but that has to be written down as a migration, not inherited from a builder flag
 * that cannot tell the two kinds of table apart.
 */
internal val MIGRATION_3_4 = object : Migration(3, 4) {
    override fun migrate(connection: SQLiteConnection) {
        // The cache, and only the cache. Its shape is unchanged, so this is not a schema step —
        // it is the honest, table-by-table replacement for what the destructive fallback used to
        // do wholesale, written so that `outbox` is visibly not in the list.
        connection.execSQL("DELETE FROM order_summaries")
        connection.execSQL("DELETE FROM order_details")
    }
}

/** 4 → 5 adds one OutboxKind value. `kind` is a String column and unknown values
 *  already read back as UNKNOWN, so no table changes — but the migration must exist,
 *  because the destructive fallback is gone and a missing one fails at open. */
internal val MIGRATION_4_5 = object : Migration(4, 5) {
    override fun migrate(connection: SQLiteConnection) { /* no schema change */ }
}

/** 5 → 6 adds the calculator draft table. Additive only — nothing existing is touched, and the
 *  outbox in the same file is untouched by design. */
internal val MIGRATION_5_6 = object : Migration(5, 6) {
    override fun migrate(connection: SQLiteConnection) {
        connection.execSQL(
            "CREATE TABLE IF NOT EXISTS `calculator_draft` (" +
                "`ownerId` TEXT NOT NULL, `draftJson` TEXT NOT NULL, `updatedAt` INTEGER NOT NULL, " +
                "PRIMARY KEY(`ownerId`))"
        )
    }
}

/**
 * 6 → 7 makes `outbox.orderId` nullable, because a queued PLACE_ORDER row has no order yet — the
 * order is what it is going to create. SQLite cannot relax NOT NULL in place, so the table is
 * recreated and every existing row copied across UNCHANGED: those rows are the only durable record
 * of a photographed delivery and the cash counted against it.
 *
 * The column list is spelled out on both sides rather than `INSERT … SELECT *`: a bare `*` depends
 * on the old table's column ORDER matching the new one's, which is true today only by coincidence
 * of this file also being the thing that wrote it.
 */
internal val MIGRATION_6_7 = object : Migration(6, 7) {
    override fun migrate(connection: SQLiteConnection) {
        val columns = "`id`, `ownerId`, `kind`, `orderId`, `shipmentId`, `paymentId`, `filePath`, " +
            "`payloadJson`, `state`, `attempts`, `lastError`, `createdAt`, `updatedAt`"
        connection.execSQL(
            "CREATE TABLE IF NOT EXISTS `outbox_new` (`id` TEXT NOT NULL, `ownerId` TEXT NOT NULL, " +
                "`kind` TEXT NOT NULL, `orderId` TEXT, `shipmentId` TEXT, `paymentId` TEXT, " +
                "`filePath` TEXT, `payloadJson` TEXT NOT NULL, `state` TEXT NOT NULL, " +
                "`attempts` INTEGER NOT NULL, `lastError` TEXT, `createdAt` INTEGER NOT NULL, " +
                "`updatedAt` INTEGER NOT NULL, PRIMARY KEY(`id`))"
        )
        connection.execSQL("INSERT INTO `outbox_new` ($columns) SELECT $columns FROM `outbox`")
        connection.execSQL("DROP TABLE `outbox`")
        connection.execSQL("ALTER TABLE `outbox_new` RENAME TO `outbox`")
        // Dropping the old table took its indices with it; Room's exported 7.json still expects
        // all three, and `runMigrationsAndValidate` is what checks that these names match it.
        connection.execSQL("CREATE INDEX IF NOT EXISTS `index_outbox_orderId` ON `outbox` (`orderId`)")
        connection.execSQL("CREATE INDEX IF NOT EXISTS `index_outbox_ownerId` ON `outbox` (`ownerId`)")
        connection.execSQL("CREATE INDEX IF NOT EXISTS `index_outbox_state_createdAt` ON `outbox` (`state`, `createdAt`)")
    }
}

/** Every migration the builder installs. Add each new step here as the schema version rises. */
val ALL_MIGRATIONS: Array<Migration> = arrayOf(MIGRATION_3_4, MIGRATION_4_5, MIGRATION_5_6, MIGRATION_6_7)
