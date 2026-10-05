export interface PanicTriggerEvent {
  source: 'Volume Button Pattern' | string;
  timestamp: number;
}

export interface VolumeTriggerConfig {
  enabled: boolean;
  pressCount: number;
  windowSeconds: number;
  debounceMs?: number;
  cooldownMs?: number;
}

export interface PhysicalTriggersAdapter {
  configureVolumeTrigger(config: VolumeTriggerConfig): Promise<boolean>;
  simulateVolumePress(): Promise<boolean>;
  isVolumeTriggerEnabled(): Promise<boolean>;
}

export type PanicTriggerListener = (event: PanicTriggerEvent) => void;
