import { sendSilentSms, isAvailableAsync } from '../../../modules/silent-sms';
import type { Contact } from '../contacts/contactsStorage';
import type { LocationResult } from '../location/locationService';
import { mapsLinkFor } from '../location/locationService';
import { getSettings } from '../settings/settingsStorage';

export interface DispatchResult {
  attempted: boolean;
  recipients: string[];
}

interface DispatchParams {
  contacts: Contact[];
  location: LocationResult | null;
  triggerSource: string;
}

/**
 * Phase 2 direct carrier SMS dispatch using native SilentSms module (android.telephony.SmsManager).
 * Dispatches silently in background IO threads with multipart support and delivery verification.
 */
export async function dispatchEmergencySms({ contacts, location, triggerSource }: DispatchParams): Promise<DispatchResult> {
  const recipients = contacts.map((c) => c.phoneNumber);
  if (recipients.length === 0 || !(await isAvailableAsync())) {
    return { attempted: false, recipients };
  }

  const settings = await getSettings();
  const who = settings.userName.trim() || 'The user';
  const body = settings.customMessage.trim() || `${who} may be in danger.`;
  const locationLine = location
    ? `Location: ${mapsLinkFor(location)}\nAccuracy: ${location.accuracy ?? 'unknown'} meters`
    : 'Location: unavailable';

  const message = [
    'EMERGENCY ALERT',
    '',
    body,
    '',
    `Triggered via: ${triggerSource}`,
    locationLine,
    '',
    `Time: ${new Date().toISOString()}`,
  ].join('\n');

  await sendSilentSms(recipients, message);
  return { attempted: true, recipients };
}

export async function dispatchSafeSms(contacts: Contact[]): Promise<DispatchResult> {
  const recipients = contacts.map((c) => c.phoneNumber);
  if (recipients.length === 0 || !(await isAvailableAsync())) {
    return { attempted: false, recipients };
  }

  await sendSilentSms(recipients, 'EMERGENCY RESOLVED\n\nThe user has marked themselves safe.');
  return { attempted: true, recipients };
}

export { sendSilentSms, isAvailableAsync };
