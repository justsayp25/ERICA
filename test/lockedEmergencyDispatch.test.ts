import test from 'node:test';
import assert from 'node:assert';
import { resetMockSecureStore } from './mockExpo.mjs';
import { AppState } from './mockReactNative.mjs';
import { MockSQLiteDatabase } from './mockDatabase';
import {
  saveContacts,
  getContacts,
  type Contact,
} from '../src/features/contacts/contactsStorage';
import {
  getHistory,
  clearHistory,
} from '../src/features/history/historyStorage';
import {
  DEFAULT_SETTINGS,
  saveSettings,
} from '../src/features/settings/settingsStorage';
import {
  initDispatchEngine,
  configureDispatchEngineOverrides,
  resetDispatchEngineOverrides,
  getOutboxItems,
} from '../src/features/dispatch';
import {
  getSosService,
  resetSosService,
  sosMachine,
} from '../src/features/sos/sosMachine';
import {
  notifyPanicTrigger,
  addPanicTriggerListener,
  resetPhysicalTriggersOverrides,
} from '../modules/physical-triggers';

function setupPhysicalPanicBridge(): () => void {
  const sub = addPanicTriggerListener((event) => {
    // Same listener as App.tsx.
    getSosService().send({ type: 'TRIGGER', source: event?.source });
  });
  return () => sub.remove();
}

test.beforeEach(async () => {
  resetMockSecureStore();
  (AppState as any)._reset();
  resetSosService();
  await clearHistory();
  await saveSettings({
    ...DEFAULT_SETTINGS,
    countdownSeconds: 1, // Fast 1s countdown for tests
    volumeTriggerEnabled: true,
  });
  resetDispatchEngineOverrides();
  resetPhysicalTriggersOverrides();
});

test('Volume button trigger: completes the whole alert in the background, with no UI interaction', async () => {
  // 1. Trusted contacts
  const trustedContacts: Contact[] = [
    { id: 'contact_1', name: 'Guardian Alice', phoneNumber: '+15559876543' },
    { id: 'contact_2', name: 'Responder Bob', phoneNumber: '+15551234567' },
  ];
  await saveContacts(trustedContacts);

  // 3. Track SMS dispatch & background database
  let sentPayload = '';
  const sentRecipients: string[] = [];
  const mockDb = new MockSQLiteDatabase();

  configureDispatchEngineOverrides({
    silentSmsSender: async (recipients, message) => {
      sentRecipients.push(...recipients);
      sentPayload = message;
      return true;
    },
    availabilityChecker: async () => true,
  });

  const cleanupDispatch = await initDispatchEngine({
    customDb: mockDb,
    silentSmsSender: async (recipients, message) => {
      sentRecipients.push(...recipients);
      sentPayload = message;
      return true;
    },
    availabilityChecker: async () => true,
  });

  const cleanupPhysical = setupPhysicalPanicBridge();

  try {
    const sosService = getSosService();
    sosService.send({ type: 'SETTINGS_UPDATED', countdownSeconds: 1 });

    // 4. Simulate the 4-press volume pattern
    notifyPanicTrigger('Volume Button Pattern');

    // 5. Verify emergency machine transitioned to countdown
    const countdownSnapshot = sosService.getSnapshot();
    assert.strictEqual(countdownSnapshot.value, 'countdown', 'Panic trigger must engage countdown immediately');
    assert.strictEqual(countdownSnapshot.context.triggerSource, 'Volume Button Pattern');

    // 6. Complete countdown -> triggers dispatching in background
    sosService.send({ type: 'TICK' });

    // Wait for async dispatchEmergency actor to complete
    await new Promise((r) => setTimeout(r, 120));

    // 7. Verify machine reached active state
    const activeSnapshot = sosService.getSnapshot();
    assert.strictEqual(activeSnapshot.value, 'active', 'Emergency machine must reach active state');

    // 8. Verify the background dispatch
    assert.strictEqual(sentRecipients.length, 2, 'Must dispatch SMS to all trusted contacts');
    assert.ok(sentRecipients.includes('+15559876543'), 'Recipient 1 must receive alert');
    assert.ok(sentRecipients.includes('+15551234567'), 'Recipient 2 must receive alert');

    assert.ok(sentPayload.includes('EMERGENCY ALERT'), 'Must include emergency header');
    assert.ok(sentPayload.includes('Triggered via: Volume Button Pattern'), 'Must include trigger source');
    assert.ok(/Location: -?\d+\.\d{5},-?\d+\.\d{5}/.test(sentPayload), 'Must include GPS coordinates');
    assert.ok(!/https?:\/\//.test(sentPayload), 'Must not include a link (carriers drop SMS with URLs)');

    // 10. Stand down: Mark Safe
    sosService.send({ type: 'MARK_SAFE' });
    await new Promise((r) => setTimeout(r, 80));
    assert.strictEqual(sosService.getSnapshot().value, 'idle', 'Machine returns to idle on MARK_SAFE');

    const history = await getHistory();
    assert.ok(history.length >= 1, 'Emergency session must be recorded in history');
    assert.strictEqual(history[0].triggerSource, 'Volume Button Pattern');
    assert.ok(history[0].resolvedAt !== null, 'Session must be marked resolved');
  } finally {
    cleanupPhysical();
    cleanupDispatch();
  }
});

