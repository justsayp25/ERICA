import { setup, assign, fromPromise, fromCallback } from 'xstate';
import { getContacts } from '../contacts/contactsStorage';
import { getSettings } from '../settings/settingsStorage';
import { getCurrentLocation, type LocationResult } from '../location/locationService';
import { dispatchEmergencySms, dispatchSafeSms } from '../dispatch/smsDispatch';
import { appendHistoryEntry, resolveHistoryEntry } from '../history/historyStorage';

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

const dispatchEmergency = fromPromise(async ({ input }: { input: { context: SosContext } }) => {
  const { context } = input;
  const [contacts, location] = await Promise.all([getContacts(), getCurrentLocation()]);
  const result = await dispatchEmergencySms({ contacts, location, triggerSource: context.triggerSource });
  if (!result.attempted) {
    if (contacts.length === 0) {
      throw new Error('No trusted contacts configured. Please add contacts in the Contacts tab first.');
    }
    throw new Error('SMS service is unavailable on this device.');
  }
  await appendHistoryEntry({
    sessionId: context.sessionId as string,
    triggerSource: context.triggerSource,
    startedAt: context.startedAt as number,
    resolvedAt: null,
    locationCaptured: location !== null,
  });
  return { location };
});

const dispatchSafe = fromPromise(async ({ input }: { input: { context: SosContext } }) => {
  const { context } = input;
  const contacts = await getContacts();
  await dispatchSafeSms(contacts);
  if (context.sessionId) {
    await resolveHistoryEntry(context.sessionId, Date.now());
  }
});

export const sosMachine = setup({
  types: {} as {
    context: SosContext;
    events: SosEvent;
  },
  actors: { countdownTicker, loadSettings, dispatchEmergency, dispatchSafe },
  guards: {
    countdownFinished: ({ context }: { context: SosContext }) => context.secondsRemaining <= 1,
  },
}).createMachine({
  id: 'sos',
  context: initialContext,
  initial: 'idle',
  states: {
    idle: {
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
      invoke: { src: 'countdownTicker' },
      on: {
        CANCEL: 'idle',
        TICK: [
          { guard: 'countdownFinished', target: 'dispatching' },
          { actions: assign(({ context }) => ({ secondsRemaining: context.secondsRemaining - 1 })) },
        ],
      },
    },
    dispatching: {
      entry: assign({
        startedAt: () => Date.now(),
        sessionId: () => `${Date.now()}`,
        lastError: () => null,
      }),
      invoke: {
        src: 'dispatchEmergency',
        input: ({ context }) => ({ context }),
        onDone: {
          target: 'active',
          actions: assign(({ event }) => ({ location: event.output.location })),
        },
        onError: {
          target: 'active',
          actions: assign({
            lastError: ({ event }) =>
              event.error instanceof Error ? event.error.message : String(event.error),
          }),
        },
      },
    },
    active: {
      on: {
        MARK_SAFE: 'resolving',
        DISMISS: {
          target: 'idle',
          actions: assign(() => initialContext),
        },
      },
    },
    resolving: {
      invoke: {
        src: 'dispatchSafe',
        input: ({ context }) => ({ context }),
        onDone: { target: 'idle', actions: assign(() => initialContext) },
        onError: { target: 'idle', actions: assign(() => initialContext) },
      },
    },
  },
});
