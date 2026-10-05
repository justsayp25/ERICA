import { NativeModule, requireNativeModule } from 'expo';
import type { VolumeTriggerConfig } from './PhysicalTriggers.types';

declare class PhysicalTriggersModule extends NativeModule {
  configureVolumeTrigger(config: VolumeTriggerConfig): Promise<boolean>;
  simulateVolumePress(): Promise<boolean>;
  isVolumeTriggerEnabled(): Promise<boolean>;
  addListener(eventName: string, listener: (event: any) => void): { remove: () => void };
  removeListeners(count: number): void;
}

export default requireNativeModule<PhysicalTriggersModule>('PhysicalTriggers');
