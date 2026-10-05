import { NativeModule, requireNativeModule } from 'expo';

declare class SilentSmsModule extends NativeModule {
  sendSilentSms(recipients: string[], message: string): Promise<boolean>;
  isAvailableAsync(): Promise<boolean>;
  placeCall(number: string): Promise<boolean>;
}

export default requireNativeModule<SilentSmsModule>('SilentSms');
