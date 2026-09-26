import type { NetInfoState, NetInfoSubscription } from '@react-native-community/netinfo';

export type NetInfoSubscriber = (
  listener: (state: NetInfoState) => void
) => (() => void) | NetInfoSubscription;

export interface ConnectivityListenerOptions {
  /**
   * Invoked immediately when cellular connection is restored after a dead zone or signal drop.
   */
  onCellularRestored: () => void | Promise<void>;
  /**
   * Optional listener for all network state changes.
   */
  onStateChange?: (state: NetInfoState) => void;
  /**
   * Optional custom subscriber for dependency injection / unit testing.
   */
  subscriber?: NetInfoSubscriber;
}

/**
 * Checks whether the current NetInfoState indicates active cellular connectivity.
 */
export function isCellularConnected(state: NetInfoState): boolean {
  const isConnected = Boolean(state.isConnected);
  const typeStr = (state.type || '').toLowerCase();
  return isConnected && typeStr === 'cellular';
}

/**
 * Listens for cellular connectivity restoration via @react-native-community/netinfo
 * to trigger an immediate outbox queue flush.
 *
 * @param options Listener configuration
 * @returns Teardown / unsubscribe function
 */
export function setupConnectivityListener(options: ConnectivityListenerOptions): () => void {
  const { onCellularRestored, onStateChange, subscriber } = options;

  let wasCellularConnected = false;
  let isCancelled = false;
  let activeUnsubscribe: (() => void) | null = null;

  const handleState = (state: NetInfoState) => {
    if (isCancelled) return;
    onStateChange?.(state);

    const nowConnected = isCellularConnected(state);
    // Cellular signal returned if it's currently connected and wasn't before
    const restored = nowConnected && !wasCellularConnected;
    wasCellularConnected = nowConnected;

    if (restored) {
      try {
        const res = onCellularRestored();
        if (res && typeof (res as Promise<void>).then === 'function') {
          (res as Promise<void>).catch((err) => {
            console.warn('[ConnectivityListener] Flush error on cellular restoration:', err);
          });
        }
      } catch (err) {
        console.warn('[ConnectivityListener] Synchronous flush error:', err);
      }
    }
  };

  if (subscriber) {
    const unsub = subscriber(handleState);
    if (typeof unsub === 'function') {
      activeUnsubscribe = unsub;
    } else if (unsub && typeof (unsub as any).remove === 'function') {
      activeUnsubscribe = () => (unsub as any).remove();
    }
  } else {
    // Dynamic import ensures smooth bundling and graceful handling in test harnesses
    import('@react-native-community/netinfo')
      .then((module) => {
        if (isCancelled) return;
        const NetInfo = module.default ?? module;
        const sub = NetInfo.addEventListener(handleState);
        if (typeof sub === 'function') {
          activeUnsubscribe = sub;
        } else if (sub && typeof (sub as any).remove === 'function') {
          activeUnsubscribe = () => (sub as any).remove();
        }
      })
      .catch((err) => {
        console.warn('[ConnectivityListener] Could not load @react-native-community/netinfo:', err);
      });
  }

  return () => {
    isCancelled = true;
    if (activeUnsubscribe) {
      activeUnsubscribe();
      activeUnsubscribe = null;
    }
  };
}
