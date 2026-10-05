import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { Vibration } from 'react-native';
import { resetMockSecureStore } from './mockExpo.mjs';
import { resetMockLocation } from './mockLocation.mjs';
import AsyncStorage from './mockAsyncStorage.mjs';
import { MockSQLiteDatabase } from './mockDatabase';
import { initDispatchEngine, resetDispatchEngineOverrides } from '../src/features/dispatch/queueProcessor';
import { composeEmergencyMessage, composeLocationUpdateMessage } from '../src/features/dispatch/smsDispatch';
import { saveContacts } from '../src/features/contacts/contactsStorage';
import { DEFAULT_SETTINGS, saveSettings } from '../src/features/settings/settingsStorage';
import { wipeMasterKeyMemory } from '../src/features/security';
import { getSosService, resetSosService } from '../src/features/sos/sosMachine';
import {
  startEmergencyDeterrenceAndEvidence,
  stopEmergencyDeterrenceAndEvidence,
} from '../src/features/evidence/evidenceCoordinator';
import {
  configureDeterrenceEvidenceOverrides,
  resetDeterrenceEvidenceOverrides,
} from '../modules/deterrence-evidence';

// The mocked react-native exposes the calls it received; the real Vibration type does not.
const vibrationCalls = () => (Vibration as unknown as { _calls: { type: string }[] })._calls;
const resetVibration = () => (Vibration as unknown as { _reset: () => void })._reset();

const waitFor = async (predicate: () => boolean, timeoutMs = 4000) => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
};

test.beforeEach(async () => {
  resetMockSecureStore();
  resetMockLocation();
  wipeMasterKeyMemory();
  await AsyncStorage.clear();
  resetDispatchEngineOverrides();
  resetDeterrenceEvidenceOverrides();
  resetVibration();
  resetSosService();
});

test('defaults: loud mode with siren, strobe and vibration on; live location off; evidence consent still off', () => {
  assert.strictEqual(DEFAULT_SETTINGS.alertMode, 'loud');
  assert.strictEqual(DEFAULT_SETTINGS.deterrenceSirenEnabled, true);
  assert.strictEqual(DEFAULT_SETTINGS.deterrenceStrobeEnabled, true);
  assert.strictEqual(DEFAULT_SETTINGS.vibrationEnabled, true);
  assert.strictEqual(DEFAULT_SETTINGS.respectSilentMode, true);
  assert.strictEqual(DEFAULT_SETTINGS.liveLocationIntervalSeconds, 0);
  assert.strictEqual(DEFAULT_SETTINGS.holdToTrigger, false);
  assert.strictEqual(DEFAULT_SETTINGS.evidenceAudioConsentEnabled, false);
  assert.strictEqual(DEFAULT_SETTINGS.evidencePhotoConsentEnabled, false);
});

test('loud mode: an alert starts siren, strobe and vibration, and stopping ends the vibration immediately', async () => {
  const started: string[] = [];
  configureDeterrenceEvidenceOverrides({
    getRingerMode: async () => 'normal',
    startSiren: async () => {
      started.push('siren');
      return { started: true, suppressedBySilentMode: false };
    },
    startStrobe: async () => {
      started.push('strobe');
      return true;
    },
  });
  await saveSettings({ ...DEFAULT_SETTINGS });

  await startEmergencyDeterrenceAndEvidence('s1');
  assert.deepStrictEqual(started.sort(), ['siren', 'strobe']);
  assert.ok(vibrationCalls().some((c) => c.type === 'vibrate'), 'vibration must start');

  resetVibration();
  const stopping = stopEmergencyDeterrenceAndEvidence();
  assert.ok(
    vibrationCalls().some((c) => c.type === 'cancel'),
    'vibration must be cancelled synchronously, before the native teardown finishes'
  );
  await stopping;
});

test('silent mode: no siren, strobe or vibration, whatever the individual switches say', async () => {
  const started: string[] = [];
  configureDeterrenceEvidenceOverrides({
    getRingerMode: async () => 'normal',
    startSiren: async () => {
      started.push('siren');
      return { started: true, suppressedBySilentMode: false };
    },
    startStrobe: async () => {
      started.push('strobe');
      return true;
    },
  });
  await saveSettings({ ...DEFAULT_SETTINGS, alertMode: 'silent' });

  await startEmergencyDeterrenceAndEvidence('s2');
  await stopEmergencyDeterrenceAndEvidence();

  assert.deepStrictEqual(started, []);
  assert.ok(!vibrationCalls().some((c) => c.type === 'vibrate'), 'silent mode must not vibrate');
});

test('loud mode honours the individual switches (vibration only)', async () => {
  const started: string[] = [];
  configureDeterrenceEvidenceOverrides({
    startSiren: async () => {
      started.push('siren');
      return { started: true, suppressedBySilentMode: false };
    },
    startStrobe: async () => {
      started.push('strobe');
      return true;
    },
  });
  await saveSettings({ ...DEFAULT_SETTINGS, deterrenceSirenEnabled: false, deterrenceStrobeEnabled: false });

  await startEmergencyDeterrenceAndEvidence('s3');
  await stopEmergencyDeterrenceAndEvidence();

  assert.deepStrictEqual(started, []);
  assert.ok(vibrationCalls().some((c) => c.type === 'vibrate'));
});

test('location text: a fresh fix has no age; an old fix says how old; worst case still fits one SMS', () => {
  const now = new Date(2026, 9, 4, 11, 12);
  const fix = (ageMs: number) => ({
    latitude: 14.59951,
    longitude: 120.98421,
    accuracy: 12,
    timestamp: now.getTime() - ageMs,
  });

  const fresh = composeEmergencyMessage('Help.', fix(30_000), 'Manual', now);
  assert.ok(fresh.includes('(accuracy 12m)') && !fresh.includes('old'), fresh);

  const minutes = composeEmergencyMessage('Help.', fix(14 * 60_000), 'Manual', now);
  assert.ok(minutes.includes('(accuracy 12m, 14m old)'), minutes);

  const hours = composeEmergencyMessage('Help.', fix(5 * 3_600_000), 'Manual', now);
  assert.ok(hours.includes('5h old'), hours);

  const worst = composeEmergencyMessage(
    'The user may be in danger.',
    { latitude: -89.123456789, longitude: -179.987654321, accuracy: 1234.567, timestamp: now.getTime() - 400 * 3_600_000 },
    'Duress PIN (Silent SOS)',
    now
  );
  assert.ok(worst.includes('99h old'), 'age is capped');
  assert.ok(worst.length <= 160, `must stay one segment, got ${worst.length}: ${worst}`);
  assert.ok(/^[A-Za-z0-9 .,:()'-]*$/.test(worst), worst);
  assert.ok(!/https?:\/\//.test(worst));
});

test('live location update text is short, link-free and GSM-7', () => {
  const now = new Date(2026, 9, 4, 11, 15);
  const text = composeLocationUpdateMessage(
    { latitude: 14.59951, longitude: 120.98421, accuracy: 9, timestamp: now.getTime() },
    now
  );
  assert.strictEqual(text, 'LOCATION UPDATE: 14.59951,120.98421 (accuracy 9m). 11:15');
});

test('live location: updates are texted while active and stop for good once marked safe (Law 4)', async () => {
  const sent: string[] = [];
  const teardown = await initDispatchEngine({
    customDb: new MockSQLiteDatabase(),
    subscriber: () => () => {},
    availabilityChecker: async () => true,
    silentSmsSender: async (_recipients, message) => {
      sent.push(message);
      return true;
    },
  });
  configureDeterrenceEvidenceOverrides({
    getRingerMode: async () => 'normal',
    startSiren: async () => ({ started: true, suppressedBySilentMode: false }),
    startStrobe: async () => true,
  });
  try {
    await saveSettings({ ...DEFAULT_SETTINGS, countdownSeconds: 1, liveLocationIntervalSeconds: 1 });
    await saveContacts([{ id: '1', name: 'Ana', phoneNumber: '+15550100' }]);

    const sos = getSosService();
    sos.send({ type: 'SETTINGS_UPDATED', countdownSeconds: 1 });
    sos.send({ type: 'TRIGGER', source: 'test' });
    await waitFor(() => sos.getSnapshot().matches('active'));

    await waitFor(() => sent.some((m) => m.startsWith('LOCATION UPDATE:')));
    assert.ok(sent.some((m) => m.startsWith('EMERGENCY ALERT:')), 'the alert itself still goes first');

    sos.send({ type: 'MARK_SAFE' });
    await waitFor(() => sos.getSnapshot().matches('idle'));
    const updatesAtSafe = sent.filter((m) => m.startsWith('LOCATION UPDATE:')).length;
    assert.ok(sent.some((m) => m.startsWith('EMERGENCY RESOLVED')), 'the resolved text goes out');

    await new Promise((r) => setTimeout(r, 2500));
    assert.strictEqual(
      sent.filter((m) => m.startsWith('LOCATION UPDATE:')).length,
      updatesAtSafe,
      'no location update may be sent after the emergency is over'
    );
  } finally {
    resetSosService();
    teardown();
  }
});

test('live location off by default: no updates are sent while active', async () => {
  const sent: string[] = [];
  const teardown = await initDispatchEngine({
    customDb: new MockSQLiteDatabase(),
    subscriber: () => () => {},
    availabilityChecker: async () => true,
    silentSmsSender: async (_recipients, message) => {
      sent.push(message);
      return true;
    },
  });
  configureDeterrenceEvidenceOverrides({
    getRingerMode: async () => 'normal',
    startSiren: async () => ({ started: true, suppressedBySilentMode: false }),
    startStrobe: async () => true,
  });
  try {
    await saveSettings({ ...DEFAULT_SETTINGS, countdownSeconds: 1 });
    await saveContacts([{ id: '1', name: 'Ana', phoneNumber: '+15550100' }]);
    const sos = getSosService();
    sos.send({ type: 'SETTINGS_UPDATED', countdownSeconds: 1 });
    sos.send({ type: 'TRIGGER', source: 'test' });
    await waitFor(() => sos.getSnapshot().matches('active'));
    await new Promise((r) => setTimeout(r, 1500));
    assert.ok(!sent.some((m) => m.startsWith('LOCATION UPDATE:')));
    sos.send({ type: 'MARK_SAFE' });
    await waitFor(() => sos.getSnapshot().matches('idle'));
  } finally {
    resetSosService();
    teardown();
  }
});

test('hold to trigger: the SOS button only starts an alert on a long press when the setting is on', () => {
  const screen = fs.readFileSync('src/features/sos/SosScreen.tsx', 'utf8');
  assert.ok(screen.includes('onPress={holdToTrigger ? undefined'), 'a plain tap must do nothing while hold is required');
  assert.ok(screen.includes('onLongPress'), 'long press must be wired');
  assert.ok(screen.includes('delayLongPress={HOLD_TO_TRIGGER_MS}'));
});
