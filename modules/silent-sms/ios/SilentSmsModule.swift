import ExpoModulesCore

public class SilentSmsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SilentSms")

    AsyncFunction("isAvailableAsync") { () -> Bool in
      return false
    }

    AsyncFunction("sendSilentSms") { (recipients: [String], message: String) -> Bool in
      // Programmatic background SMS without user interaction is not permitted by iOS platform policy
      return false
    }
  }
}
