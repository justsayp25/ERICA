package expo.modules.physicaltriggers

import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import android.view.KeyEvent
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class PhysicalTriggersModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  companion object {
    private const val TAG = "PhysicalTriggersModule"
    private var instance: PhysicalTriggersModule? = null
    var systemContext: Context? = null
    var pendingPanicSource: String? = null

    val volumeDetector = VolumePatternDetector { source ->
      sendPanicEvent(source)
    }

    // The detector's settings live in memory, so after Android kills and restarts the process
    // (e.g. the app is swiped away) the accessibility service kept forwarding key presses to
    // a detector that had reverted to disabled. Persist the last configuration and restore it
    // whenever the process starts. Only on/off, press count and window are stored: nothing
    // about contacts, location or alerts.
    private const val PREFS = "erica_physical_triggers"
    private const val KEY_VOLUME_ENABLED = "volume_enabled"
    private const val KEY_VOLUME_PRESS_COUNT = "volume_press_count"
    private const val KEY_VOLUME_WINDOW_MS = "volume_window_ms"

    fun saveVolumeConfig(ctx: Context, enabled: Boolean, pressCount: Int?, windowMs: Long?) {
      val editor = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
        .putBoolean(KEY_VOLUME_ENABLED, enabled)
      pressCount?.let { if (it > 0) editor.putInt(KEY_VOLUME_PRESS_COUNT, it) }
      windowMs?.let { if (it > 0) editor.putLong(KEY_VOLUME_WINDOW_MS, it) }
      editor.apply()
    }

    fun restoreVolumeConfig(ctx: Context) {
      val prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      if (!prefs.contains(KEY_VOLUME_ENABLED)) return
      volumeDetector.configure(
        prefs.getBoolean(KEY_VOLUME_ENABLED, false),
        prefs.getInt(KEY_VOLUME_PRESS_COUNT, VolumePatternDetector.DEFAULT_PRESS_COUNT),
        prefs.getLong(KEY_VOLUME_WINDOW_MS, VolumePatternDetector.DEFAULT_WINDOW_MS)
      )
    }

    fun onKeyEvent(event: KeyEvent): Boolean {
      return volumeDetector.onKeyEvent(event)
    }

    fun sendPanicEvent(source: String) {
      try {
        val payload = mapOf(
          "source" to source,
          "timestamp" to System.currentTimeMillis()
        )
        if (instance != null) {
          instance?.sendEvent("onPanicTrigger", payload)
        } else {
          Log.w(TAG, "PhysicalTriggersModule instance is null (app swiped away or backgrounded). Awakening app via EmergencyForegroundService & Intent for: $source")
          pendingPanicSource = source
          val ctx = systemContext
          if (ctx != null) {
            // 1. Elevate process to EmergencyForegroundService so OS does not kill it
            try {
              val serviceIntent = Intent().apply {
                setClassName(ctx.packageName, "expo.modules.foregroundservice.EmergencyForegroundService")
                action = "expo.modules.foregroundservice.ACTION_START"
                putExtra("extra_title", "Emergency Alert Active")
                putExtra("extra_message", "Emergency triggered via $source")
              }
              if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                ctx.startForegroundService(serviceIntent)
              } else {
                ctx.startService(serviceIntent)
              }
            } catch (e: Exception) {
              Log.e(TAG, "Failed to start EmergencyForegroundService from headless trigger", e)
            }

            // 2. Launch MainActivity to wake up React Native JS runtime
            try {
              val launchIntent = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)?.apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                putExtra("extra_panic_trigger", source)
              }
              if (launchIntent != null) {
                ctx.startActivity(launchIntent)
              }
            } catch (e: Exception) {
              Log.e(TAG, "Failed to launch MainActivity from headless trigger", e)
            }
          }
        }
      } catch (e: Exception) {
        Log.e(TAG, "Error emitting onPanicTrigger event", e)
      }
    }

  }

  override fun definition() = ModuleDefinition {
    Name("PhysicalTriggers")

    Events("onPanicTrigger")

    OnCreate {
      instance = this@PhysicalTriggersModule
      systemContext = context.applicationContext
      restoreVolumeConfig(context.applicationContext)

      // Check if a panic event was captured while headless / task swiped
      val pending = pendingPanicSource
      if (pending != null) {
        pendingPanicSource = null
        sendPanicEvent(pending)
      }
    }

    OnDestroy {
      if (instance == this@PhysicalTriggersModule) {
        instance = null
      }
    }

    AsyncFunction("configureVolumeTrigger") { config: Map<String, Any>, promise: Promise ->
      try {
        val enabled = config["enabled"] as? Boolean ?: false
        val pressCount = (config["pressCount"] as? Number)?.toInt()
        val windowSeconds = (config["windowSeconds"] as? Number)?.toDouble()
        val windowMs = windowSeconds?.let { (it * 1000).toLong() }

        volumeDetector.configure(enabled, pressCount, windowMs)
        saveVolumeConfig(context.applicationContext, enabled, pressCount, windowMs)
        promise.resolve(true)
      } catch (e: Throwable) {
        Log.e(TAG, "Failed to configure volume trigger", e)
        promise.reject("CONFIG_ERROR", e.message, e)
      }
    }




    AsyncFunction("simulateVolumePress") { promise: Promise ->
      try {
        val triggered = volumeDetector.recordPress()
        promise.resolve(triggered)
      } catch (e: Throwable) {
        Log.e(TAG, "Failed to simulate volume press", e)
        promise.reject("SIMULATION_ERROR", e.message, e)
      }
    }


    AsyncFunction("isVolumeTriggerEnabled") { promise: Promise ->
      promise.resolve(volumeDetector.isEnabled)
    }

  }
}
