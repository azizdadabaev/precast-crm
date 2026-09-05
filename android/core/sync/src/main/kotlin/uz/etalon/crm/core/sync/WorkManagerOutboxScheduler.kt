package uz.etalon.crm.core.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import dagger.hilt.android.qualifiers.ApplicationContext
import uz.etalon.crm.core.data.OutboxScheduler
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class WorkManagerOutboxScheduler @Inject constructor(
    @param:ApplicationContext private val context: Context,
) : OutboxScheduler {

    /**
     * [id] does not key the work request. [OutboxWorker] drains the whole queue itself (it claims
     * rows one at a time via `OutboxDao.claimNext`), so one named unique work is enough: KEEP means
     * a drain that is already pending or running absorbs this newly queued row instead of a second
     * worker racing it for the same rows.
     */
    override fun schedule(id: String) {
        val request = OneTimeWorkRequestBuilder<OutboxWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .addTag(TAG)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(TAG, ExistingWorkPolicy.KEEP, request)
    }

    companion object { const val TAG = "outbox-drain" }
}
