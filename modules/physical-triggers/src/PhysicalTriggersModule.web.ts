import { registerWebModule, NativeModule } from 'expo';
import type { VolumeTriggerConfig } from './PhysicalTriggers.types';

class PhysicalTriggersModule extends NativeModule {
  private volumeEnabled = false;

  async configureVolumeTrigger(config: VolumeTriggerConfig): Promise<boolean> {
    this.volumeEnabled = Boolean(config.enabled);
    return true;
  }

  async simulateVolumePress(): Promise<boolean> {
    return true;
  }

  async isVolumeTriggerEnabled(): Promise<boolean> {
    return this.volumeEnabled;
  }
}

export default registerWebModule(PhysicalTriggersModule, 'PhysicalTriggers');
