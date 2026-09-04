package uz.etalon.crm.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.net.toUri
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import uz.etalon.crm.BuildConfig
import uz.etalon.crm.MainActivity
import uz.etalon.crm.R
import uz.etalon.crm.core.data.DeviceRepository
import uz.etalon.crm.core.data.OrdersRepository
import uz.etalon.crm.core.data.SessionRepository
import javax.inject.Inject

@AndroidEntryPoint
class EtalonMessagingService : FirebaseMessagingService() {
    @Inject lateinit var devices: DeviceRepository
    @Inject lateinit var orders: OrdersRepository
    @Inject lateinit var session: SessionRepository
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    override fun onNewToken(token: String) {
        scope.launch { devices.register(token, BuildConfig.VERSION_NAME) }
    }

    /** Data message from src/lib/notifications.ts (Phase 0 S3): type, notificationId, title, body, orderId, ... */
    override fun onMessageReceived(msg: RemoteMessage) {
        val d = msg.data
        val orderId = d["orderId"]?.takeIf { it.isNotBlank() }
        // Only refresh while signed in: after a sign-out or a 401 the request would be
        // unauthenticated, and re-populating the cache would undo signOut()'s wipe.
        if (orderId != null) scope.launch { if (session.isLoggedIn.first()) orders.refreshDetail(orderId) }
        val channelId = channelFor(d["type"].orEmpty())
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(channelId, channelName(channelId), NotificationManager.IMPORTANCE_HIGH))
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            if (orderId != null) data = "etalon://order/$orderId".toUri()
        }
        val pi = PendingIntent.getActivity(
            this,
            orderId.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val n = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(d["title"])
            .setContentText(d["body"]?.takeIf { it.isNotBlank() })
            .setAutoCancel(true)
            .setContentIntent(pi)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()
        nm.notify(d["notificationId"].hashCode(), n)
    }

    private fun channelFor(type: String) = when {
        type.startsWith("ORDER") || type == "DELIVERY_PROOF_UPLOADED" -> "orders"
        type.startsWith("PAYMENT") -> "payments"
        type == "AGENT_ESCALATION" -> "inbox"
        else -> "comments"
    }

    private fun channelName(id: String) = when (id) {
        "orders" -> getString(R.string.channel_orders)
        "payments" -> getString(R.string.channel_payments)
        "inbox" -> getString(R.string.channel_inbox)
        else -> getString(R.string.channel_comments)
    }
}
