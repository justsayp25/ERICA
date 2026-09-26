import SilentSmsModule from './src/SilentSmsModule';

export * from './src/SilentSms.types';

/**
 * Sends a silent SMS directly via carrier dispatch without opening an SMS composer.
 * Offloaded to background IO threads; supports multipart payloads exceeding 160 characters.
 *
 * @param recipients List of destination phone numbers
 * @param message The SMS text payload
 * @returns Promise that resolves true if carrier handoff is confirmed
 */
export async function sendSilentSms(recipients: string[], message: string): Promise<boolean> {
  return await SilentSmsModule.sendSilentSms(recipients, message);
}

/**
 * Checks whether telephony hardware and SEND_SMS permission are available.
 */
export async function isAvailableAsync(): Promise<boolean> {
  return await SilentSmsModule.isAvailableAsync();
}

export default {
  sendSilentSms,
  isAvailableAsync,
};
