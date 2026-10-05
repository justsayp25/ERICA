import PhysicalTriggersModule from './src/PhysicalTriggersModule';
import type {
  PanicTriggerEvent,
  PanicTriggerListener,
  PhysicalTriggersAdapter,
  VolumeTriggerConfig,
} from './src/PhysicalTriggers.types';

export * from './src/PhysicalTriggers.types';

/**
 * Pure algorithmic implementation of Volume Pattern Detection.
 * Supports multi-press sequence detection within a sliding time window,
 * key repeat filtering (prevents holding button false alarms), debouncing,
 * and post-trigger cooldown.
 */
export class VolumePatternEngine {
  private enabled: boolean;
  private pressCount: number;
  private windowMs: number;
  private debounceMs: number;
  private cooldownMs: number;
  private pressTimestamps: number[] = [];
  private lastTriggerTime = 0;
  private lastPressTime = 0;
  private onTriggerCallback?: (source: string) => void;

  constructor(options?: {
    enabled?: boolean;
    pressCount?: number;
    windowSeconds?: number;
    debounceMs?: number;
    cooldownMs?: number;
    onTrigger?: (source: string) => void;
  }) {
    this.enabled = options?.enabled ?? false;
    this.pressCount = options?.pressCount ?? 4;
    this.windowMs = (options?.windowSeconds ?? 3) * 1000;
    this.debounceMs = options?.debounceMs ?? 100;
    this.cooldownMs = options?.cooldownMs ?? 3000;
    this.onTriggerCallback = options?.onTrigger;
  }

  configure(options: Partial<VolumeTriggerConfig> & { onTrigger?: (source: string) => void }): void {
    if (options.enabled !== undefined) this.enabled = options.enabled;
    if (options.pressCount !== undefined) this.pressCount = options.pressCount;
    if (options.windowSeconds !== undefined) this.windowMs = options.windowSeconds * 1000;
    if (options.debounceMs !== undefined) this.debounceMs = options.debounceMs;
    if (options.cooldownMs !== undefined) this.cooldownMs = options.cooldownMs;
    if (options.onTrigger !== undefined) this.onTriggerCallback = options.onTrigger;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getPressCount(): number {
    return this.pressCount;
  }

  getWindowMs(): number {
    return this.windowMs;
  }

  getActivePressCount(now: number = Date.now()): number {
    const cutoff = now - this.windowMs;
    return this.pressTimestamps.filter((t) => t >= cutoff).length;
  }

  reset(): void {
    this.pressTimestamps = [];
    this.lastPressTime = 0;
  }

  onPress(timestamp: number = Date.now(), isRepeat: boolean = false): boolean {
    if (!this.enabled) {
      return false;
    }

    // STRICT FALSE ALARM CHECK: Holding down the volume button generates repeat events.
    // We strictly ignore repeat events so holding the button down never triggers panic.
    if (isRepeat) {
      return false;
    }

    // Debounce to eliminate hardware bounce
    if (timestamp - this.lastPressTime < this.debounceMs) {
      return false;
    }
    this.lastPressTime = timestamp;

    // Cooldown check following previous alert
    if (timestamp - this.lastTriggerTime < this.cooldownMs) {
      return false;
    }

    // Sliding time window: discard presses outside the window duration
    const windowStart = timestamp - this.windowMs;
    this.pressTimestamps = this.pressTimestamps.filter((t) => t >= windowStart);
    this.pressTimestamps.push(timestamp);

    if (this.pressTimestamps.length >= this.pressCount) {
      this.pressTimestamps = [];
      this.lastTriggerTime = timestamp;
      this.onTriggerCallback?.('Volume Button Pattern');
      return true;
    }

    return false;
  }
}

// Global engine instances for unified JS/Native event dispatching
export const globalVolumeEngine = new VolumePatternEngine();

const panicListeners = new Set<PanicTriggerListener>();

export function notifyPanicTrigger(source: string, timestamp: number = Date.now()): void {
  const event: PanicTriggerEvent = { source, timestamp };
  panicListeners.forEach((fn) => {
    try {
      fn(event);
    } catch (err) {
      console.error('[PhysicalTriggers] notifyPanicTrigger error:', err);
    }
  });
}

// Connect native event listener
try {
  PhysicalTriggersModule.addListener?.('onPanicTrigger', (event: PanicTriggerEvent) => {
    notifyPanicTrigger(event.source || 'Physical Trigger', event.timestamp || Date.now());
  });
} catch {
  // Ignored in test/headless environments
}

// Wire engine callbacks to notifyPanicTrigger
globalVolumeEngine.configure({
  onTrigger: (source: string) => notifyPanicTrigger(source),
});

const defaultAdapter: PhysicalTriggersAdapter = {
  configureVolumeTrigger: async (config) => {
    globalVolumeEngine.configure(config);
    return await PhysicalTriggersModule.configureVolumeTrigger(config);
  },
  simulateVolumePress: async () => {
    globalVolumeEngine.onPress(Date.now(), false);
    return await PhysicalTriggersModule.simulateVolumePress();
  },
  isVolumeTriggerEnabled: async () => {
    return globalVolumeEngine.isEnabled();
  },
};

let activeAdapter: PhysicalTriggersAdapter = { ...defaultAdapter };

export function configurePhysicalTriggersOverrides(adapter: Partial<PhysicalTriggersAdapter>): void {
  activeAdapter = { ...activeAdapter, ...adapter };
}

export function resetPhysicalTriggersOverrides(): void {
  activeAdapter = { ...defaultAdapter };
  globalVolumeEngine.reset();
}

/**
 * Registers a listener for physical panic trigger events (volume button pattern).
 */
export function addPanicTriggerListener(listener: PanicTriggerListener): { remove: () => void } {
  panicListeners.add(listener);
  return {
    remove: () => {
      panicListeners.delete(listener);
    },
  };
}

/**
 * Configures volume button pattern detector settings.
 */
export async function configureVolumeTrigger(config: VolumeTriggerConfig): Promise<boolean> {
  return await activeAdapter.configureVolumeTrigger(config);
}

export async function simulateVolumePress(): Promise<boolean> {
  return await activeAdapter.simulateVolumePress();
}

export default {
  VolumePatternEngine,
  globalVolumeEngine,
  addPanicTriggerListener,
  notifyPanicTrigger,
  configureVolumeTrigger,
  simulateVolumePress,
  configurePhysicalTriggersOverrides,
  resetPhysicalTriggersOverrides,
};
