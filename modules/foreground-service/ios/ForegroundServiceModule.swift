import ExpoModulesCore

public class ForegroundServiceModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ForegroundService")

    Events("onMarkSafe")

    AsyncFunction("startService") { (title: String?, message: String?) -> Bool in
      return false
    }

    AsyncFunction("stopService") { () -> Bool in
      return false
    }

    AsyncFunction("updateNotification") { (title: String, message: String) -> Bool in
      return false
    }

    AsyncFunction("acquireWakeLock") { (timeoutMs: Double?) -> Bool in
      return false
    }

    AsyncFunction("releaseWakeLock") { () -> Bool in
      return false
    }

    AsyncFunction("isServiceRunning") { () -> Bool in
      return false
    }

    AsyncFunction("isWakeLockActive") { () -> Bool in
      return false
    }
  }
}
