const { createRunOncePlugin, withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');

const ERICA_PERMISSIONS = [
  'android.permission.SEND_SMS',
  'android.permission.READ_PHONE_STATE',
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_LOCATION',
  'android.permission.WAKE_LOCK',
  'android.permission.RECEIVE_BOOT_COMPLETED',
];

/**
 * Expo Config Plugin to inject required native Android permissions into AndroidManifest.xml.
 *
 * Permissions:
 * - SEND_SMS: Allows silent sending of SMS for SOS dispatch
 * - READ_PHONE_STATE: Allows inspecting carrier and SIM readiness
 * - ACCESS_BACKGROUND_LOCATION: Allows background location fixes when screen is off
 * - FOREGROUND_SERVICE: Allows persistent emergency foreground service
 * - FOREGROUND_SERVICE_LOCATION: Android 14+ compliance for location foreground service type
 * - WAKE_LOCK: Prevents CPU sleep during active SOS dispatch sequence
 * - RECEIVE_BOOT_COMPLETED: Allows auto-recovery / watchdog readiness after device reboot
 */
const withEricaAndroidPermissions = (config) => {
  return withAndroidManifest(config, async (config) => {
    AndroidConfig.Permissions.ensurePermissions(config.modResults, ERICA_PERMISSIONS);
    return config;
  });
};

module.exports = createRunOncePlugin(
  withEricaAndroidPermissions,
  'withEricaAndroidConfig',
  '1.0.0'
);
