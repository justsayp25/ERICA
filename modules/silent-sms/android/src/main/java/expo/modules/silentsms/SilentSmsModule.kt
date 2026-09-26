package expo.modules.silentsms

import android.Manifest
import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.telephony.SmsManager
import android.util.Log
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withTimeoutOrNull
import java.util.UUID
import java.util.concurrent.atomic.AtomicInteger

private const val TAG = "SilentSmsModule"
private const val CARRIER_HANDOFF_TIMEOUT_MS = 30_000L
private const val DELIVERY_LISTENER_TIMEOUT_MS = 60_000L

class SilentSmsModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("SilentSms")

    AsyncFunction("isAvailableAsync") { promise: Promise ->
      CoroutineScope(Dispatchers.IO).launch {
        try {
          val hasTelephony = context.packageManager.hasSystemFeature(PackageManager.FEATURE_TELEPHONY)
          val hasPermission = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.SEND_SMS
          ) == PackageManager.PERMISSION_GRANTED
          promise.resolve(hasTelephony && hasPermission)
        } catch (e: Throwable) {
          promise.reject("AVAILABILITY_CHECK_FAILED", e.message, e)
        }
      }
    }

    AsyncFunction("sendSilentSms") { recipients: List<String>, message: String, promise: Promise ->
      CoroutineScope(Dispatchers.IO).launch {
        try {
          val result = sendDirectSms(recipients, message)
          promise.resolve(result)
        } catch (e: Throwable) {
          promise.reject("SMS_SEND_FAILED", e.message, e)
        }
      }
    }
  }

  private suspend fun sendDirectSms(recipients: List<String>, message: String): Boolean {
    if (recipients.isEmpty()) {
      return true
    }
    if (message.isEmpty()) {
      throw IllegalArgumentException("SMS message cannot be empty")
    }
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.SEND_SMS) != PackageManager.PERMISSION_GRANTED) {
      throw SecurityException("SEND_SMS permission has not been granted")
    }

    val smsManager: SmsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      context.getSystemService(SmsManager::class.java)
        ?: @Suppress("DEPRECATION") SmsManager.getDefault()
    } else {
      @Suppress("DEPRECATION")
      SmsManager.getDefault()
    } ?: throw IllegalStateException("Unable to obtain SmsManager system service")

    // Divide message into multipart chunks to prevent truncation for payloads >160 chars
    val parts: ArrayList<String> = smsManager.divideMessage(message)
    if (parts.isEmpty()) {
      throw IllegalArgumentException("Divided message resulted in zero parts")
    }

    val results = recipients.map { recipient ->
      CoroutineScope(Dispatchers.IO).async {
        sendToRecipient(smsManager, recipient, parts)
      }
    }.awaitAll()

    return results.all { it }
  }

  private suspend fun sendToRecipient(
    smsManager: SmsManager,
    recipient: String,
    parts: ArrayList<String>
  ): Boolean {
    val totalParts = parts.size
    val dispatchId = UUID.randomUUID().toString()
    val actionSent = "com.erica.sos.SMS_SENT_${dispatchId}"
    val actionDelivered = "com.erica.sos.SMS_DELIVERED_${dispatchId}"

    val handoffDeferred = CompletableDeferred<Boolean>()
    val deliveryDeferred = CompletableDeferred<Unit>()

    val partsHandoffAckCount = AtomicInteger(0)
    val partsDeliveredCount = AtomicInteger(0)

    val sentReceiver = object : BroadcastReceiver() {
      override fun onReceive(recvContext: Context?, intent: Intent?) {
        val code = resultCode
        val partIndex = intent?.getIntExtra("partIndex", -1) ?: -1
        Log.d(TAG, "SMS_SENT broadcast received for part $partIndex/$totalParts to $recipient with code $code")

        if (code == Activity.RESULT_OK) {
          val acked = partsHandoffAckCount.incrementAndGet()
          if (acked >= totalParts) {
            handoffDeferred.complete(true)
          }
        } else {
          val errorMsg = smsSentErrorCodeToString(code)
          handoffDeferred.completeExceptionally(
            IllegalStateException("Carrier handoff failed for $recipient (part $partIndex): $errorMsg (code $code)")
          )
        }
      }
    }

    val deliveredReceiver = object : BroadcastReceiver() {
      override fun onReceive(recvContext: Context?, intent: Intent?) {
        val code = resultCode
        val partIndex = intent?.getIntExtra("partIndex", -1) ?: -1
        Log.d(TAG, "SMS_DELIVERED broadcast received for part $partIndex/$totalParts to $recipient with code $code")

        val delivered = partsDeliveredCount.incrementAndGet()
        if (delivered >= totalParts) {
          deliveryDeferred.complete(Unit)
        }
      }
    }

    val filterSent = IntentFilter(actionSent)
    val filterDelivered = IntentFilter(actionDelivered)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      context.registerReceiver(sentReceiver, filterSent, Context.RECEIVER_EXPORTED)
      context.registerReceiver(deliveredReceiver, filterDelivered, Context.RECEIVER_EXPORTED)
    } else {
      context.registerReceiver(sentReceiver, filterSent)
      context.registerReceiver(deliveredReceiver, filterDelivered)
    }

    // Keep deliveredReceiver registered in background until delivery confirmation or timeout
    CoroutineScope(Dispatchers.IO).launch {
      try {
        withTimeoutOrNull(DELIVERY_LISTENER_TIMEOUT_MS) {
          deliveryDeferred.await()
        }
      } finally {
        try {
          context.unregisterReceiver(deliveredReceiver)
        } catch (_: IllegalArgumentException) {}
      }
    }

    try {
      val pendingIntentFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
      } else {
        PendingIntent.FLAG_UPDATE_CURRENT
      }

      val sentIntents = ArrayList<PendingIntent>(totalParts)
      val deliveryIntents = ArrayList<PendingIntent>(totalParts)

      for (i in 0 until totalParts) {
        val sentIntent = Intent(actionSent).apply {
          setPackage(context.packageName)
          putExtra("partIndex", i)
          putExtra("totalParts", totalParts)
          putExtra("recipient", recipient)
        }
        val sentPi = PendingIntent.getBroadcast(
          context,
          i,
          sentIntent,
          pendingIntentFlags
        )
        sentIntents.add(sentPi)

        val deliveredIntent = Intent(actionDelivered).apply {
          setPackage(context.packageName)
          putExtra("partIndex", i)
          putExtra("totalParts", totalParts)
          putExtra("recipient", recipient)
        }
        val deliveredPi = PendingIntent.getBroadcast(
          context,
          i,
          deliveredIntent,
          pendingIntentFlags
        )
        deliveryIntents.add(deliveredPi)
      }

      Log.d(TAG, "Dispatching multipart SMS to $recipient ($totalParts parts)")
      smsManager.sendMultipartTextMessage(
        recipient,
        null,
        parts,
        sentIntents,
        deliveryIntents
      )

      // Confirm carrier handoff with timeout
      withTimeout(CARRIER_HANDOFF_TIMEOUT_MS) {
        handoffDeferred.await()
      }

      return true
    } finally {
      try {
        context.unregisterReceiver(sentReceiver)
      } catch (_: IllegalArgumentException) {}
    }
  }

  private fun smsSentErrorCodeToString(code: Int): String {
    return when (code) {
      Activity.RESULT_OK -> "OK"
      SmsManager.RESULT_ERROR_GENERIC_FAILURE -> "Generic failure"
      SmsManager.RESULT_ERROR_RADIO_OFF -> "Radio off (airplane mode or no cellular signal)"
      SmsManager.RESULT_ERROR_NULL_PDU -> "Null PDU"
      SmsManager.RESULT_ERROR_NO_SERVICE -> "No cellular service"
      else -> "Error code $code"
    }
  }
}
