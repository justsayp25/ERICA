import { registerWebModule, NativeModule } from 'expo';

class ForegroundServiceModule extends NativeModule {
  async startService(_title?: string, _message?: string): Promise<boolean> {
    return false;
  }
  async stopService(): Promise<boolean> {
    return false;
  }
  async updateNotification(_title: string, _message: string): Promise<boolean> {
    return false;
  }
  async acquireWakeLock(_timeoutMs?: number): Promise<boolean> {
    return false;
  }
  async releaseWakeLock(): Promise<boolean> {
    return false;
  }
  async isServiceRunning(): Promise<boolean> {
    return false;
  }
  async isWakeLockActive(): Promise<boolean> {
    return false;
  }
}

export default registerWebModule(ForegroundServiceModule, 'ForegroundService');
