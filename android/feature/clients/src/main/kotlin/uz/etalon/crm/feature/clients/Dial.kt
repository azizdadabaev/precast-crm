package uz.etalon.crm.feature.clients

import android.content.Context
import android.content.Intent
import android.net.Uri

/**
 * Opens the dialer with the number filled in — `ACTION_DIAL`, never `ACTION_CALL`, which needs
 * the `CALL_PHONE` permission and would place a real call to a customer on a mis-tap.
 *
 * Guarded: a device with no dialer at all (an emulator image, a warehouse tablet) throws
 * ActivityNotFoundException straight out of the tap handler and takes the screen down with it.
 * The same shape `OrderCard.dial` uses.
 *
 * [phone] is the stored digits-only form. It is never logged.
 */
internal fun dial(ctx: Context, phone: String) {
    runCatching { ctx.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:+$phone"))) }
}
