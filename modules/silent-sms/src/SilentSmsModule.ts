import { NativeModule, requireNativeModule } from 'expo';

declare class SilentSmsModule extends NativeModule {
  sendSilentSms(recipients: string[], message: string): Promise<boolean>;
  isAvailableAsync(): Promise<boolean>;
}

export default requireNativeModule<SilentSmsModule>('SilentSms');
