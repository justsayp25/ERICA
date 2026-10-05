import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import {
  applyKeyEventHook,
  applyFlagSecure,
  applyGradleProjectName,
  applyPanicIntentHooks,
} from '../plugins/withEricaAndroidConfig';

const KOTLIN_ACTIVITY = `package com.erica.sos

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
  }
}
`;

test('config plugin: MainActivity key hook is injected once and survives prebuild re-runs', () => {
  const once = applyKeyEventHook(applyFlagSecure(KOTLIN_ACTIVITY, 'kt'), 'kt');
  assert.ok(once.includes('PhysicalTriggersModule.onKeyEvent(event)'));
  assert.ok(once.includes('FLAG_SECURE'));
  assert.strictEqual(applyKeyEventHook(once, 'kt'), once, 'must be idempotent');
  assert.ok(once.trimEnd().endsWith('}'), 'hook must be inside the class body');
});

test('config plugin: panic-intent hooks are generated and do not suppress the key hook', () => {
  const generated = applyKeyEventHook(
    applyPanicIntentHooks(applyFlagSecure(KOTLIN_ACTIVITY, 'kt'), 'kt'),
    'kt'
  );
  assert.ok(generated.includes('setShowWhenLocked(true)'));
  assert.ok(generated.includes('handleIncomingIntent(intent)'));
  assert.ok(generated.includes('PhysicalTriggersModule.sendPanicEvent(panicSource)'));
  // Regression: the key hook used to skip any file already mentioning PhysicalTriggersModule.
  assert.ok(generated.includes('PhysicalTriggersModule.onKeyEvent(event)'));
  assert.strictEqual(applyPanicIntentHooks(generated, 'kt'), generated, 'must be idempotent');
});

test('config plugin: Gradle project name has no dots (Gradle 9)', () => {
  assert.strictEqual(
    applyGradleProjectName("rootProject.name = 'E.R.I.C.A.'\ninclude ':app'"),
    "rootProject.name = 'ERICA'\ninclude ':app'"
  );
});

test('committed android/ matches what the plugin generates', () => {
  const activity = fs.readFileSync('android/app/src/main/java/com/erica/sos/MainActivity.kt', 'utf8');
  assert.ok(activity.includes('PhysicalTriggersModule.onKeyEvent(event)'));
  assert.ok(activity.includes('handleIncomingIntent(intent)'));
  const manifest = fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
  assert.ok(manifest.includes('android:allowBackup="false"'));
});

test('module XML comments never contain "--" (Android\'s manifest merger rejects the file)', () => {
  const xmlFiles = (dir: string): string[] =>
    fs.readdirSync(dir).flatMap((name: string): string[] => {
      const path = `${dir}/${name}`;
      if (fs.statSync(path).isDirectory()) return name === 'build' ? [] : xmlFiles(path);
      return name.endsWith('.xml') ? [path] : [];
    });
  const files = xmlFiles('modules');
  assert.ok(files.length >= 4, 'expected the module manifests to be found');
  for (const file of files) {
    for (const [, body] of fs.readFileSync(file, 'utf8').matchAll(/<!--([\s\S]*?)-->/g)) {
      assert.ok(!body.includes('--'), `${file}: comment contains "--": ${body.trim().slice(0, 60)}`);
    }
  }
});

test('volume trigger survives a process restart: config is persisted and restored natively', () => {
  const dir = 'modules/physical-triggers/android/src/main/java/expo/modules/physicaltriggers';
  const module = fs.readFileSync(`${dir}/PhysicalTriggersModule.kt`, 'utf8');
  const service = fs.readFileSync(`${dir}/EricaAccessibilityService.kt`, 'utf8');
  const start = module.indexOf('AsyncFunction("configureVolumeTrigger")');
  const configure = module.slice(start, module.indexOf('AsyncFunction(', start + 1));
  assert.ok(configure.includes('saveVolumeConfig('), 'configureVolumeTrigger must persist what JS set');
  const connected = service.slice(service.indexOf('fun onServiceConnected'), service.indexOf('fun onAccessibilityEvent'));
  assert.ok(connected.includes('restoreVolumeConfig('), 'the accessibility service must restore it on connect');
});

test('settings save on every change: no Save button, and every control goes through update()', () => {
  const screen = fs.readFileSync('src/features/settings/SettingsScreen.tsx', 'utf8');
  const update = screen.slice(screen.indexOf('const update = (patch'), screen.indexOf('const loud ='));
  assert.ok(update.includes('saveSettings(next)'), 'update() must persist immediately');
  assert.ok(update.includes('configureVolumeTrigger('), 'volume changes must reach the native detector');
  assert.ok(!screen.includes('Save Settings'), 'there must be no Save button to forget');
  for (const key of ['deterrenceSirenEnabled', 'deterrenceStrobeEnabled', 'vibrationEnabled', 'volumeTriggerEnabled']) {
    assert.ok(screen.includes(`update({ ${key}: v })`), `${key} must save on change`);
  }
});

test('removed features stay removed: no shake detector, PIN, app lock, duress or decoy code', () => {
  const triggers = 'modules/physical-triggers';
  assert.ok(!fs.existsSync(`${triggers}/android/src/main/java/expo/modules/physicaltriggers/ShakeDetector.kt`));
  for (const file of [
    `${triggers}/index.ts`,
    `${triggers}/src/PhysicalTriggers.types.ts`,
    `${triggers}/android/src/main/java/expo/modules/physicaltriggers/PhysicalTriggersModule.kt`,
    'App.tsx',
    'src/features/settings/settingsStorage.ts',
  ]) {
    assert.ok(!/shake/i.test(fs.readFileSync(file, 'utf8')), `${file} still mentions shake`);
  }
  for (const gone of [
    'src/features/security/pinAuth.ts',
    'src/features/security/appLockController.ts',
    'src/features/security/LockScreen.tsx',
    'src/features/security/biometrics.ts',
    'src/features/contacts/DecoyScreen.tsx',
    'src/features/dispatch/duressDispatch.ts',
  ]) {
    assert.ok(!fs.existsSync(gone), `${gone} should be deleted`);
  }
  assert.ok(!/LockScreen|useAppLock|DecoyScreen/.test(fs.readFileSync('App.tsx', 'utf8')), 'App.tsx must not gate on a PIN');
});

test('siren plays at full alarm volume and puts the old volume back when it stops', () => {
  const siren = fs.readFileSync(
    'modules/deterrence-evidence/android/src/main/java/expo/modules/deterrenceevidence/SirenController.kt',
    'utf8'
  );
  const start = siren.slice(siren.indexOf('fun startSiren('), siren.indexOf('fun stopSiren('));
  const stop = siren.slice(siren.indexOf('fun stopSiren('), siren.indexOf('private fun raiseAlarmVolume'));
  assert.ok(start.includes('raiseAlarmVolume()'), 'startSiren must raise the alarm volume');
  assert.ok(stop.includes('restoreAlarmVolume()'), 'stopSiren must restore it');
  assert.ok(siren.includes('getStreamMaxVolume(AudioManager.STREAM_ALARM)'));
});

test('boot receiver ships in the library and reads the outbox where expo-sqlite stores it', () => {
  const manifest = fs.readFileSync('modules/foreground-service/android/src/main/AndroidManifest.xml', 'utf8');
  assert.ok(manifest.includes('expo.modules.foregroundservice.EricaBootReceiver'));
  assert.ok(manifest.includes('RECEIVE_BOOT_COMPLETED'));
  const receiver = fs.readFileSync(
    'modules/foreground-service/android/src/main/java/expo/modules/foregroundservice/EricaBootReceiver.kt',
    'utf8'
  );
  assert.ok(receiver.includes('File(File(context.filesDir, "SQLite"), "erica_outbox.db")'));
  assert.ok(!receiver.includes('context.getDatabasePath('), 'getDatabasePath points outside expo-sqlite storage');
  assert.ok(!fs.existsSync('android/app/src/main/java/com/erica/sos/EricaBootReceiver.kt'));
});

test('foreground service declares a specialUse fallback for Android 14+', () => {
  const manifest = fs.readFileSync('modules/foreground-service/android/src/main/AndroidManifest.xml', 'utf8');
  assert.ok(manifest.includes('location|specialUse'));
  assert.ok(manifest.includes('FOREGROUND_SERVICE_SPECIAL_USE'));
  assert.ok(manifest.includes('PROPERTY_SPECIAL_USE_FGS_SUBTYPE'));
});

test('accessibility service lives in the library and does not subscribe to all UI events', () => {
  const manifest = fs.readFileSync('modules/physical-triggers/android/src/main/AndroidManifest.xml', 'utf8');
  assert.ok(manifest.includes('EricaAccessibilityService'));
  const config = fs.readFileSync(
    'modules/physical-triggers/android/src/main/res/xml/erica_accessibility_service_config.xml',
    'utf8'
  );
  assert.ok(!config.includes('typeAllMask'));
  assert.ok(config.includes('flagRequestFilterKeyEvents'));
});

