import test from 'node:test';
import assert from 'node:assert';
import { createActor } from 'xstate';
import {
  VolumePatternEngine,
  addPanicTriggerListener,
  notifyPanicTrigger,
} from '../modules/physical-triggers';
import { DEFAULT_SETTINGS, getSettings, saveSettings } from '../src/features/settings/settingsStorage';
import { sosMachine } from '../src/features/sos/sosMachine';

test('1. Strict Safety Defaults: The volume trigger is OFF by default in settings and engine', async () => {
  // Verify default settings object
  assert.strictEqual(DEFAULT_SETTINGS.volumeTriggerEnabled, false, 'volumeTriggerEnabled must be false by default');
  assert.strictEqual(DEFAULT_SETTINGS.volumePressCount, 4, 'Default volume press count should be 4');
  assert.strictEqual(DEFAULT_SETTINGS.volumeWindowSeconds, 3, 'Default volume window should be 3s');

  // Verify default engine instances initialize disabled
  const volumeEngine = new VolumePatternEngine();
  assert.strictEqual(volumeEngine.isEnabled(), false, 'VolumePatternEngine must be disabled by default');

  // Verify that an unconfigured/disabled engine ignores events (zero false alarms)
  let triggerCalled = false;
  volumeEngine.configure({
    onTrigger: () => {
      triggerCalled = true;
    },
  });

  const now = 10000;
  for (let i = 0; i < 10; i++) {
    volumeEngine.onPress(now + i * 200, false);
  }
  assert.strictEqual(triggerCalled, false, 'Disabled VolumePatternEngine must never trigger');
});

test('2. Volume Button Pattern: Detects 4 presses within 3 seconds when enabled', async () => {
  let triggerSource = '';
  const engine = new VolumePatternEngine({
    enabled: true,
    pressCount: 4,
    windowSeconds: 3,
    debounceMs: 100,
    onTrigger: (source) => {
      triggerSource = source;
    },
  });

  const baseTime = 10000;
  // Press 1 at t = 0
  assert.strictEqual(engine.onPress(baseTime, false), false);
  // Press 2 at t = 400ms
  assert.strictEqual(engine.onPress(baseTime + 400, false), false);
  // Press 3 at t = 900ms
  assert.strictEqual(engine.onPress(baseTime + 900, false), false);
  // Press 4 at t = 1500ms (within 3s window) -> TRIGGER
  assert.strictEqual(engine.onPress(baseTime + 1500, false), true);

  assert.strictEqual(triggerSource, 'Volume Button Pattern');
});

test('3. Volume Button Pattern False Alarm Prevention: Incomplete presses or expired window do not trigger', async () => {
  let triggerCount = 0;
  const engine = new VolumePatternEngine({
    enabled: true,
    pressCount: 4,
    windowSeconds: 3,
    debounceMs: 100,
    onTrigger: () => {
      triggerCount++;
    },
  });

  const baseTime = 20000;
  // Case A: Only 3 presses in 3s -> Should not trigger
  engine.onPress(baseTime, false);
  engine.onPress(baseTime + 300, false);
  engine.onPress(baseTime + 600, false);
  assert.strictEqual(triggerCount, 0, '3 presses should not trigger a 4-press requirement');

  // Case B: 4 presses but spaced over 5s (outside 3s sliding window) -> Should not trigger
  engine.reset();
  engine.onPress(baseTime, false);
  engine.onPress(baseTime + 1200, false);
  engine.onPress(baseTime + 2500, false);
  // 4th press at 4000ms: first press at 0 is outside the 3000ms window (4000 - 3000 = 1000 > 0)
  // Remaining active presses in window = [1200, 2500, 4000] = 3 presses < 4
  const triggered = engine.onPress(baseTime + 4000, false);
  assert.strictEqual(triggered, false, 'Presses spread over 4s must not trigger 3s window');
  assert.strictEqual(triggerCount, 0, 'No trigger should have occurred');
});

test('4. Volume Button Pattern False Alarm Prevention: Holding button (key repeat) is strictly ignored', async () => {
  let triggerCount = 0;
  const engine = new VolumePatternEngine({
    enabled: true,
    pressCount: 4,
    windowSeconds: 3,
    debounceMs: 100,
    onTrigger: () => {
      triggerCount++;
    },
  });

  const baseTime = 30000;
  // User holds down volume button: first press is down, subsequent events are repeats
  engine.onPress(baseTime, false); // Real press down
  engine.onPress(baseTime + 200, true); // Repeat 1
  engine.onPress(baseTime + 400, true); // Repeat 2
  engine.onPress(baseTime + 600, true); // Repeat 3
  engine.onPress(baseTime + 800, true); // Repeat 4

  assert.strictEqual(triggerCount, 0, 'Holding volume button (key repeats) must NOT trigger panic');
});

test('9. Settings Persistence: Custom thresholds and safety toggles persist correctly', async () => {
  const customSettings = {
    ...DEFAULT_SETTINGS,
    volumeTriggerEnabled: true,
    volumePressCount: 5,
    volumeWindowSeconds: 4,
  };

  await saveSettings(customSettings);
  const loaded = await getSettings();

  assert.strictEqual(loaded.volumeTriggerEnabled, true);
  assert.strictEqual(loaded.volumePressCount, 5);
  assert.strictEqual(loaded.volumeWindowSeconds, 4);

  // Restore clean defaults
  await saveSettings(DEFAULT_SETTINGS);
});

test('10. End-to-End: Physical panic trigger event transitions sosMachine to countdown', async () => {
  const actor = createActor(sosMachine).start();

  try {
    assert.strictEqual(actor.getSnapshot().value, 'idle');

    // Simulate physical trigger event delivered via addPanicTriggerListener
    let receivedEventSource = '';
    const sub = addPanicTriggerListener((event) => {
      receivedEventSource = event.source;
      actor.send({ type: 'TRIGGER', source: event.source });
    });

    notifyPanicTrigger('Volume Button Pattern');

    assert.strictEqual(receivedEventSource, 'Volume Button Pattern');
    const snapshot = actor.getSnapshot();
    assert.strictEqual(snapshot.value, 'countdown');
    assert.strictEqual(snapshot.context.triggerSource, 'Volume Button Pattern');

    // Canceling properly returns to idle
    actor.send({ type: 'CANCEL' });
    assert.strictEqual(actor.getSnapshot().value, 'idle');

    sub.remove();
  } finally {
    actor.stop();
  }
});
