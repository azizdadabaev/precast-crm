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
     * rows one at a time via `OutboxDao.claimNext`), so one named unique work is enough — but it
     * must be APPEND_OR_REPLACE, not KEEP. KEEP would drop this call outright if a drain is
     * already running: a row committed to the outbox right after that drain's last `claimNext`
     * returned null, but before WorkManager finishes recording the run as complete, would then
     * have no worker left to see it — the running drain already decided the queue was empty, and
     * this "no-op" schedule() call was its only other chance. APPEND_OR_REPLACE instead chains a
     * fresh run after the current one (or starts one immediately if none is in flight/it already
     * finished or failed), so that row is always covered by a subsequent read of the queue.
     */
    override fun schedule(id: String) {
        val request = OneTimeWorkRequestBuilder<OutboxWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .addTag(TAG)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(TAG, ExistingWorkPolicy.APPEND_OR_REPLACE, request)
    }

    companion object { const val TAG = "outbox-drain" }
}
