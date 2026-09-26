import { registerWebModule, NativeModule } from 'expo';

class SilentSmsModule extends NativeModule {
  async sendSilentSms(_recipients: string[], _message: string): Promise<boolean> {
    console.warn('sendSilentSms is not supported on web.');
    return false;
  }

  async isAvailableAsync(): Promise<boolean> {
    return false;
  }
}

export default registerWebModule(SilentSmsModule, 'SilentSms');
