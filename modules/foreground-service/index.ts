import ForegroundServiceModule from './src/ForegroundServiceModule';
import type {
  ForegroundServiceOptions,
  ForegroundServiceListener,
} from './src/ForegroundService.types';

export * from './src/ForegroundService.types';

export interface ForegroundServiceAdapter {
  startService(title?: string, message?: string): Promise<boolean>;
  stopService(): Promise<boolean>;
  updateNotification(title: string, message: string): Promise<boolean>;
  acquireWakeLock(timeoutMs?: number): Promise<boolean>;
  releaseWakeLock(): Promise<boolean>;
  isServiceRunning(): Promise<boolean>;
  isWakeLockActive(): Promise<boolean>;
}

const defaultAdapter: ForegroundServiceAdapter = {
  startService: (title, message) => ForegroundServiceModule.startService(title, message),
  stopService: () => ForegroundServiceModule.stopService(),
  updateNotification: (title, message) => ForegroundServiceModule.updateNotification(title, message),
  acquireWakeLock: (timeoutMs) => ForegroundServiceModule.acquireWakeLock(timeoutMs),
  releaseWakeLock: () => ForegroundServiceModule.releaseWakeLock(),
  isServiceRunning: () => ForegroundServiceModule.isServiceRunning(),
  isWakeLockActive: () => ForegroundServiceModule.isWakeLockActive(),
};

let activeAdapter: ForegroundServiceAdapter = { ...defaultAdapter };

/**
 * Overrides foreground service adapter methods for unit testing and simulations.
 */
export function configureForegroundServiceOverrides(adapter: Partial<ForegroundServiceAdapter>): void {
  activeAdapter = { ...activeAdapter, ...adapter };
}

/**
 * Resets foreground service adapter back to default native module bindings.
 */
export function resetForegroundServiceOverrides(): void {
  activeAdapter = { ...defaultAdapter };
}

/**
 * Starts the persistent Android ForegroundService with a non-dismissible notification.
 */
export async function startEmergencyForegroundService(options?: ForegroundServiceOptions): Promise<boolean> {
  return await activeAdapter.startService(options?.title, options?.message);
}

/**
 * Stops the ForegroundService and removes the persistent notification.
 */
export async function stopEmergencyForegroundService(): Promise<boolean> {
  return await activeAdapter.stopService();
}

/**
 * Updates the persistent emergency notification title and message.
 */
export async function updateEmergencyNotification(title: string, message: string): Promise<boolean> {
  return await activeAdapter.updateNotification(title, message);
}

/**
 * Acquires a temporary partial WakeLock during active dispatch only.
 */
export async function acquireEmergencyWakeLock(timeoutMs?: number): Promise<boolean> {
  return await activeAdapter.acquireWakeLock(timeoutMs);
}

/**
 * Releases the partial WakeLock immediately upon resolution to conserve battery.
 */
export async function releaseEmergencyWakeLock(): Promise<boolean> {
  return await activeAdapter.releaseWakeLock();
}

/**
 * Checks whether the ForegroundService is currently running.
 */
export async function isEmergencyServiceRunning(): Promise<boolean> {
  return await activeAdapter.isServiceRunning();
}

/**
 * Checks whether the partial WakeLock is currently held.
 */
export async function isEmergencyWakeLockActive(): Promise<boolean> {
  return await activeAdapter.isWakeLockActive();
}

const markSafeListeners = new Set<ForegroundServiceListener>();

try {
  ForegroundServiceModule.addListener?.('onMarkSafe', () => {
    markSafeListeners.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        console.error('[ForegroundService] Listener error:', err);
      }
    });
  });
} catch {
  // Ignored in test/web environments where event emitter might be absent
}

/**
 * Registers a listener for when the user taps the native "I'M SAFE" quick action button in the notification.
 */
export function addMarkSafeListener(listener: ForegroundServiceListener): { remove: () => void } {
  markSafeListeners.add(listener);
  return {
    remove: () => {
      markSafeListeners.delete(listener);
    },
  };
}

/**
 * Triggers the "I'M SAFE" listeners (useful for testing native action button events).
 */
export function notifyMarkSafe(): void {
  markSafeListeners.forEach((fn) => {
    try {
      fn();
    } catch (err) {
      console.error('[ForegroundService] notifyMarkSafe error:', err);
    }
  });
}

export default {
  startEmergencyForegroundService,
  stopEmergencyForegroundService,
  updateEmergencyNotification,
  acquireEmergencyWakeLock,
  releaseEmergencyWakeLock,
  isEmergencyServiceRunning,
  isEmergencyWakeLockActive,
  addMarkSafeListener,
  notifyMarkSafe,
  configureForegroundServiceOverrides,
  resetForegroundServiceOverrides,
};
