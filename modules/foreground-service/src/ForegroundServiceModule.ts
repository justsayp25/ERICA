import { NativeModule, requireNativeModule } from 'expo';
import type { ForegroundServiceNativeModule } from './ForegroundService.types';

declare class ForegroundServiceModule extends NativeModule implements ForegroundServiceNativeModule {
  startService(title?: string, message?: string): Promise<boolean>;
  stopService(): Promise<boolean>;
  updateNotification(title: string, message: string): Promise<boolean>;
  acquireWakeLock(timeoutMs?: number): Promise<boolean>;
  releaseWakeLock(): Promise<boolean>;
  isServiceRunning(): Promise<boolean>;
  isWakeLockActive(): Promise<boolean>;
  addListener(eventName: string, listener: (event: any) => void): { remove: () => void };
  removeListeners(count: number): void;
}

export default requireNativeModule<ForegroundServiceModule>('ForegroundService');
