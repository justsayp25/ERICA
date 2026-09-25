import * as SMS from 'expo-sms';
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

// This composer-based send (expo-sms) requires a user tap — it cannot send
// silently. That's a Phase 1 placeholder, not the final behavior: Phase 2
// replaces this with a native module calling SmsManager directly for true
// silent, no-touch dispatch. See docs/ROADMAP.md.
export async function dispatchEmergencySms({ contacts, location, triggerSource }: DispatchParams): Promise<DispatchResult> {
  const recipients = contacts.map((c) => c.phoneNumber);
  if (recipients.length === 0 || !(await SMS.isAvailableAsync())) {
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

  await SMS.sendSMSAsync(recipients, message);
  return { attempted: true, recipients };
}

export async function dispatchSafeSms(contacts: Contact[]): Promise<DispatchResult> {
  const recipients = contacts.map((c) => c.phoneNumber);
  if (recipients.length === 0 || !(await SMS.isAvailableAsync())) {
    return { attempted: false, recipients };
  }

  await SMS.sendSMSAsync(recipients, 'EMERGENCY RESOLVED\n\nThe user has marked themselves safe.');
  return { attempted: true, recipients };
}
