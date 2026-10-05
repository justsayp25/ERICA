import { setup, assign, fromPromise, fromCallback, createActor } from 'xstate';
import { useCallback } from 'react';
import { useSelector } from '@xstate/react';
import { getContacts } from '../contacts/contactsStorage';
import { getSettings } from '../settings/settingsStorage';
import { getCurrentLocation, type LocationResult } from '../location/locationService';
import { dispatchEmergencySms, dispatchSafeSms, dispatchLocationUpdateSms } from '../dispatch/smsDispatch';
import { appendHistoryEntry, resolveHistoryEntry } from '../history/historyStorage';
import { placeConfiguredEmergencyCall } from '../dispatch/emergencyCall';
import {
  startEmergencyForegroundService,
  stopEmergencyForegroundService,
  updateEmergencyNotification,
  acquireEmergencyWakeLock,
  releaseEmergencyWakeLock,
} from '../../../modules/foreground-service';
import {
  startEmergencyDeterrence,
  startEmergencyEvidence,
  stopEmergencyDeterrenceAndEvidence,
} from '../evidence/evidenceCoordinator';

export interface SosContext {
  triggerSource: string;
  countdownTotal: number;
  secondsRemaining: number;
  startedAt: number | null;
  sessionId: string | null;
  location: LocationResult | null;
  lastError: string | null;
}

export type SosEvent =
  | { type: 'TRIGGER'; source?: string }
  | { type: 'CANCEL' }
  | { type: 'TICK' }
  | { type: 'MARK_SAFE' }
  | { type: 'DISMISS' }
  | { type: 'SETTINGS_UPDATED'; countdownSeconds: number };

const initialContext: SosContext = {
  triggerSource: 'Manual Button',
  countdownTotal: 10,
  secondsRemaining: 10,
  startedAt: null,
  sessionId: null,
  location: null,
  lastError: null,
};

// Ticks once a second while armed. A real countdown, not a fixed 10s
// constant — SOS-alerter hardcoded this despite exposing a "configurable"
// field for it.
const countdownTicker = fromCallback(({ sendBack }) => {
  const id = setInterval(() => sendBack({ type: 'TICK' }), 1000);
  return () => clearInterval(id);
});

const loadSettings = fromPromise(async () => getSettings());

/**
 * Live location: while the alert is active, text the contacts a fresh position every
 * `liveLocationIntervalSeconds` (0 = off). It is an invoked actor on the `active` state, so
 * leaving that state (I'M SAFE, dismiss) stops it with the rest of the emergency (LAWS.md
 * Law 4); `cancelled` also drops an update that was still in flight at that moment.
 */
const liveLocation = fromCallback(() => {
  let cancelled = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const sendUpdate = async () => {
    try {
      const contacts = await getContacts();
      const location = await getCurrentLocation();
      if (cancelled || !location || contacts.length === 0) return;
      await dispatchLocationUpdateSms(contacts, location);
    } catch (err) {
      console.warn('[sosMachine] Live location update failed:', err);
    }
  };

  getSettings()
    .then((settings) => {
      const seconds = settings.liveLocationIntervalSeconds ?? 0;
      if (cancelled || !(seconds > 0)) return;
      timer = setInterval(() => {
        sendUpdate();
      }, seconds * 1000);
    })
    .catch((err) => console.warn('[sosMachine] Live location settings read failed:', err));

  return () => {
    cancelled = true;
    if (timer) clearInterval(timer);
  };
});

const SMS_UNAVAILABLE_WARNING =
  'ERICA cannot send texts right now (no SMS permission or no signal). Your alert is queued and will send automatically.';

const dispatchEmergency = fromPromise(async ({ input }: { input: { context: SosContext } }): Promise<{
  location: LocationResult | null;
  warning?: string | null;
}> => {
  const { context } = input;

  // Defensive wrap around contact decryption (Non-Negotiable Safety Law)
  let contacts: any[] = [];
  let contactDecryptionFailed = false;

  try {
    contacts = await getContacts();
  } catch (err) {
    console.warn('[sosMachine] Defensive fallback: contact decryption failed (e.g. lost key):', err);
    contactDecryptionFailed = true;
  }

  // Acquire live GPS coordinates (must proceed regardless of contact decryption failure)
  let location: LocationResult | null = null;
  try {
    location = await getCurrentLocation();
  } catch (locErr) {
    console.warn('[sosMachine] Failed to acquire GPS coordinates:', locErr);
  }

  if (contactDecryptionFailed) {
    // Non-Negotiable Safety Law: Never crash or abort emergency when vault is locked/corrupted.
    // Acquire live GPS coordinates, maintain emergency state, and display verified guidance:
    try {
      await appendHistoryEntry({
        sessionId: context.sessionId as string,
        triggerSource: context.triggerSource,
        startedAt: context.startedAt as number,
        resolvedAt: null,
        locationCaptured: location !== null,
      });
    } catch {
      // Emergency history logging failure must never abort emergency
    }

    const fallbackError = new Error(
      'Your contacts could not be read, so no text was sent. Call emergency services (911).'
    );
    (fallbackError as any).location = location;
    throw fallbackError;
  }

  const result = await dispatchEmergencySms({ contacts, location, triggerSource: context.triggerSource });
  if (!result.attempted) {
    if (contacts.length === 0) {
      throw new Error('You have no contacts yet. Add someone in the Contacts tab.');
    }
    throw new Error('This phone cannot send text messages.');
  }

  // The alert is already queued; a failed history write must not report the SOS as failed.
  await appendHistoryEntry({
    sessionId: context.sessionId as string,
    triggerSource: context.triggerSource,
    startedAt: context.startedAt as number,
    resolvedAt: null,
    locationCaptured: location !== null,
  }).catch((err) => console.warn('[sosMachine] Failed to log history entry:', err));

  return { location, warning: result.smsAvailable === false ? SMS_UNAVAILABLE_WARNING : null };
});

const dispatchSafe = fromPromise(async ({ input }: { input: { context: SosContext } }) => {
  const { context } = input;
  let contacts: any[] = [];
  try {
    contacts = await getContacts();
  } catch (err) {
    console.warn('[sosMachine] Defensive fallback in dispatchSafe: contact decryption failed:', err);
  }

  if (contacts.length > 0) {
    try {
      await dispatchSafeSms(contacts);
    } catch (smsErr) {
      console.warn('[sosMachine] Safe SMS dispatch error:', smsErr);
    }
  }

  if (context.sessionId) {
    try {
      await resolveHistoryEntry(context.sessionId, Date.now());
    } catch {}
  }
});

export const sosMachine = setup({
  types: {} as {
    context: SosContext;
    events: SosEvent;
  },
  actors: { countdownTicker, loadSettings, liveLocation, dispatchEmergency, dispatchSafe },
  guards: {
    countdownFinished: ({ context }: { context: SosContext }) => context.secondsRemaining <= 1,
  },
  actions: {
    startCountdownService: () => {
      startEmergencyForegroundService({
        title: 'SOS starting',
        message: 'Your alert sends when the countdown ends. Tap I\'M SAFE to cancel.',
      }).catch((err) => console.warn('[sosMachine] startCountdownService error:', err));
    },
    startDispatchingService: () => {
      startEmergencyForegroundService({
        title: 'Sending your alert',
        message: 'Getting your location and texting your contacts.',
      }).catch((err) => console.warn('[sosMachine] startDispatchingService error:', err));
    },
    updateActiveNotification: () => {
      updateEmergencyNotification(
        'SOS active',
        'Your contacts were alerted. Tap I\'M SAFE when you are safe.'
      ).catch((err) => console.warn('[sosMachine] updateActiveNotification error:', err));
    },
    stopService: () => {
      stopEmergencyForegroundService().catch((err) =>
        console.warn('[sosMachine] stopService error:', err)
      );
    },
    acquireWakeLock: () => {
      acquireEmergencyWakeLock().catch((err) =>
        console.warn('[sosMachine] acquireWakeLock error:', err)
      );
    },
    releaseWakeLock: () => {
      releaseEmergencyWakeLock().catch((err) =>
        console.warn('[sosMachine] releaseWakeLock error:', err)
      );
    },
    // Loud mode sounds the siren and flashes as soon as SOS is pressed, during the countdown.
    startDeterrence: () => {
      startEmergencyDeterrence().catch((err) => console.warn('[sosMachine] startDeterrence error:', err));
    },
    startEvidence: ({ context }) => {
      const sessionId = context.sessionId || `${Date.now()}`;
      startEmergencyEvidence(sessionId).catch((err) =>
        console.warn('[sosMachine] startEvidence error:', err)
      );
    },
    placeEmergencyCall: () => {
      placeConfiguredEmergencyCall().catch((err) =>
        console.warn('[sosMachine] placeEmergencyCall error:', err)
      );
    },
    stopDeterrenceAndEvidence: () => {
      stopEmergencyDeterrenceAndEvidence().catch((err) =>
        console.warn('[sosMachine] stopDeterrenceAndEvidence error:', err)
      );
    },
  },
}).createMachine({
  id: 'sos',
  context: initialContext,
  initial: 'idle',
  states: {
    idle: {
      entry: ['stopService', 'releaseWakeLock', 'stopDeterrenceAndEvidence'],
      invoke: {
        src: 'loadSettings',
        onDone: {
          actions: assign(({ event }) => ({
            countdownTotal: event.output.countdownSeconds,
            secondsRemaining: event.output.countdownSeconds,
          })),
        },
      },
      on: {
        SETTINGS_UPDATED: {
          actions: assign(({ event }) => ({
            countdownTotal: event.countdownSeconds,
            secondsRemaining: event.countdownSeconds,
          })),
        },
        TRIGGER: {
          target: 'countdown',
          actions: assign(({ context, event }) => ({
            triggerSource: event.source ?? 'Manual Button',
            secondsRemaining: context.countdownTotal,
          })),
        },
      },
    },
    countdown: {
      entry: ['startCountdownService', 'startDeterrence'],
      invoke: { src: 'countdownTicker' },
      on: {
        CANCEL: {
          target: 'idle',
          actions: 'stopDeterrenceAndEvidence',
        },
        MARK_SAFE: {
          target: 'idle',
          actions: 'stopDeterrenceAndEvidence',
        },
        TICK: [
          { guard: 'countdownFinished', target: 'dispatching' },
          { actions: assign(({ context }) => ({ secondsRemaining: context.secondsRemaining - 1 })) },
        ],
      },
    },
    dispatching: {
      entry: [
        'startDispatchingService',
        'acquireWakeLock',
        assign({
          startedAt: () => Date.now(),
          sessionId: () => `${Date.now()}`,
          lastError: () => null,
        }),
        'startEvidence',
      ],
      exit: 'releaseWakeLock',
      invoke: {
        src: 'dispatchEmergency',
        input: ({ context }) => ({ context }),
        onDone: {
          target: 'active',
          actions: [
            assign(({ event }) => ({ location: event.output.location, lastError: event.output.warning ?? null })),
            'updateActiveNotification',
            'releaseWakeLock',
            // After the texts are queued, so the call can never hold up or replace them.
            'placeEmergencyCall',
          ],
        },
        onError: {
          target: 'active',
          actions: [
            assign({
              lastError: ({ event }) =>
                event.error instanceof Error ? event.error.message : String(event.error),
              location: ({ event }) =>
                event.error && typeof event.error === 'object' && 'location' in event.error
                  ? (event.error as any).location
                  : null,
            }),
            'releaseWakeLock',
          ],
        },
      },
    },
    active: {
      entry: 'releaseWakeLock',
      invoke: { src: 'liveLocation' },
      on: {
        MARK_SAFE: 'resolving',
        DISMISS: {
          target: 'idle',
          actions: ['stopDeterrenceAndEvidence', assign(() => initialContext)],
        },
      },
    },
    resolving: {
      entry: ['acquireWakeLock', 'stopDeterrenceAndEvidence'],
      exit: 'releaseWakeLock',
      invoke: {
        src: 'dispatchSafe',
        input: ({ context }) => ({ context }),
        onDone: { target: 'idle', actions: assign(() => initialContext) },
        onError: { target: 'idle', actions: assign(() => initialContext) },
      },
    },
  },
});

let sharedSosService: ReturnType<typeof createActor<typeof sosMachine>> | null = null;

/**
 * Returns the singleton running instance of the emergency state machine actor.
 * Ensures hardware panic triggers (volume / shake) immediately execute background
 * dispatch and SMS sending without requiring UI presence or PIN unlock.
 */
export function getSosService() {
  if (!sharedSosService) {
    sharedSosService = createActor(sosMachine);
    sharedSosService.start();
  }
  return sharedSosService;
}

/**
 * Resets the singleton emergency state machine actor (stops it and clears reference).
 * Useful for test suites and security resets.
 */
export function resetSosService(): void {
  if (sharedSosService) {
    try {
      sharedSosService.stop();
    } catch {}
    sharedSosService = null;
  }
}

/**
 * React hook to subscribe to the global emergency state machine.
 */
export function useSosService() {
  const service = getSosService();
  const snapshot = useSelector(service, (s) => s);
  // Stable identity: a fresh closure per render re-ran every effect depending on `send`
  // once a second during the countdown.
  const send = useCallback((event: SosEvent) => service.send(event), [service]);
  return [snapshot, send] as const;
}

