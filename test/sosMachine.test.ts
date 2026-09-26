import test from 'node:test';
import assert from 'node:assert';
import { createActor, fromPromise } from 'xstate';
import { sosMachine } from '../src/features/sos/sosMachine';
import type { LocationResult } from '../src/features/location';
import {
  configureForegroundServiceOverrides,
  resetForegroundServiceOverrides,
  addMarkSafeListener,
  notifyMarkSafe,
} from '../modules/foreground-service';

test('1. ForegroundService: Transitions into countdown starts service with persistent notification', async () => {
  let startCalled = false;
  let startedTitle = '';
  let startedMessage = '';

  configureForegroundServiceOverrides({
    startService: async (title, message) => {
      startCalled = true;
      startedTitle = title ?? '';
      startedMessage = message ?? '';
      return true;
    },
  });

  const actor = createActor(sosMachine).start();

  try {
    actor.send({ type: 'TRIGGER', source: 'Test Button' });
    const snapshot = actor.getSnapshot();

    assert.strictEqual(snapshot.value, 'countdown');
    assert.strictEqual(startCalled, true, 'startService should be called when entering countdown');
    assert.ok(startedTitle.includes('EMERGENCY ARMED'), 'Title should reflect armed countdown state');
    assert.ok(startedMessage.includes('Countdown in progress'), 'Message should indicate countdown');
  } finally {
    actor.stop();
    resetForegroundServiceOverrides();
  }
});

test('2. ForegroundService: CANCEL during countdown stops service and releases WakeLock', async () => {
  let stopCalled = false;
  let releaseCalled = false;

  configureForegroundServiceOverrides({
    stopService: async () => {
      stopCalled = true;
      return true;
    },
    releaseWakeLock: async () => {
      releaseCalled = true;
      return true;
    },
  });

  const actor = createActor(sosMachine).start();

  try {
    actor.send({ type: 'TRIGGER' });
    assert.strictEqual(actor.getSnapshot().value, 'countdown');

    actor.send({ type: 'CANCEL' });
    assert.strictEqual(actor.getSnapshot().value, 'idle');
    assert.strictEqual(stopCalled, true, 'stopService should be called upon returning to idle');
    assert.strictEqual(releaseCalled, true, 'releaseWakeLock should be called upon returning to idle');
  } finally {
    actor.stop();
    resetForegroundServiceOverrides();
  }
});

test('3. ForegroundService: Quick native action button "I\'M SAFE" during countdown cancels to idle', async () => {
  let stopCalled = false;

  configureForegroundServiceOverrides({
    stopService: async () => {
      stopCalled = true;
      return true;
    },
  });

  const actor = createActor(sosMachine).start();

  try {
    actor.send({ type: 'TRIGGER' });
    assert.strictEqual(actor.getSnapshot().value, 'countdown');

    // Simulate tapping "I'M SAFE" from the native notification
    actor.send({ type: 'MARK_SAFE' });
    assert.strictEqual(actor.getSnapshot().value, 'idle');
    assert.strictEqual(stopCalled, true, 'stopService should be called when marked safe from countdown');
  } finally {
    actor.stop();
    resetForegroundServiceOverrides();
  }
});

test('4. WakeLock & Dispatching: Acquires temporary partial WakeLock during active dispatch only, released on active', async () => {
  let wakeLockAcquired = false;
  let wakeLockReleased = false;
  let notificationUpdated = false;

  configureForegroundServiceOverrides({
    acquireWakeLock: async () => {
      wakeLockAcquired = true;
      return true;
    },
    releaseWakeLock: async () => {
      wakeLockReleased = true;
      return true;
    },
    updateNotification: async (title, message) => {
      if (title.includes('ACTIVE')) {
        notificationUpdated = true;
      }
      return true;
    },
  });

  // Mock machine with direct dispatching entry to inspect transition lifecycle
  const testMachine = sosMachine.provide({
    actors: {
      dispatchEmergency: fromPromise(async (): Promise<{ location: LocationResult | null }> => {
        assert.strictEqual(wakeLockAcquired, true, 'WakeLock must be active while dispatchEmergency is running');
        return { location: null };
      }),
    },
  });

  const actor = createActor(testMachine).start();

  try {
    // Configure 1s countdown while in idle
    actor.send({ type: 'SETTINGS_UPDATED', countdownSeconds: 1 });
    actor.send({ type: 'TRIGGER' });
    // Ticking triggers countdownFinished (secondsRemaining <= 1) -> enters dispatching
    actor.send({ type: 'TICK' });

    // Wait microtask for dispatchEmergency promise to resolve
    await new Promise((r) => setTimeout(r, 60));

    const snapshot = actor.getSnapshot();
    assert.strictEqual(snapshot.value, 'active');
    assert.strictEqual(wakeLockAcquired, true, 'WakeLock must be acquired on dispatching entry');
    assert.strictEqual(wakeLockReleased, true, 'WakeLock must be released immediately upon entering active to conserve battery');
    assert.strictEqual(notificationUpdated, true, 'Persistent notification should update to EMERGENCY ACTIVE');
  } finally {
    actor.stop();
    resetForegroundServiceOverrides();
  }
});

test('5. Native Action Button: addMarkSafeListener and notifyMarkSafe bridge', async () => {
  let listenerCalled = false;

  const subscription = addMarkSafeListener(() => {
    listenerCalled = true;
  });

  try {
    notifyMarkSafe();
    assert.strictEqual(listenerCalled, true, 'notifyMarkSafe should invoke registered mark-safe listener');
  } finally {
    subscription.remove();
  }
});

test('6. Resolution: MARK_SAFE transitions through resolving to idle and stops service', async () => {
  let stopServiceCalled = false;
  let wakeLockReleasedCount = 0;

  configureForegroundServiceOverrides({
    stopService: async () => {
      stopServiceCalled = true;
      return true;
    },
    releaseWakeLock: async () => {
      wakeLockReleasedCount++;
      return true;
    },
  });

  const testMachine = sosMachine.provide({
    actors: {
      dispatchEmergency: fromPromise(async (): Promise<{ location: LocationResult | null }> => ({ location: null })),
      dispatchSafe: fromPromise(async () => {}),
    },
  });

  const actor = createActor(testMachine).start();

  try {
    // Jump straight to active state for resolution test
    actor.send({ type: 'SETTINGS_UPDATED', countdownSeconds: 1 });
    actor.send({ type: 'TRIGGER' });
    actor.send({ type: 'TICK' });

    await new Promise((r) => setTimeout(r, 50));
    assert.strictEqual(actor.getSnapshot().value, 'active');

    // Trigger MARK_SAFE (as if tapped on notification quick action button)
    actor.send({ type: 'MARK_SAFE' });

    await new Promise((r) => setTimeout(r, 50));

    assert.strictEqual(actor.getSnapshot().value, 'idle', 'Should transition to idle after resolving');
    assert.strictEqual(stopServiceCalled, true, 'Service should be stopped when returning to idle');
    assert.ok(wakeLockReleasedCount > 0, 'WakeLock must be released upon resolution to conserve battery');
  } finally {
    actor.stop();
    resetForegroundServiceOverrides();
  }
});
