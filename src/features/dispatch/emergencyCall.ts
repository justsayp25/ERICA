import { placeCall } from '../../../modules/silent-sms';
import { stopSirenOnly } from '../../../modules/deterrence-evidence';
import { getContacts } from '../contacts/contactsStorage';
import { getSettings } from '../settings/settingsStorage';

export type EmergencyCallOutcome = 'off' | 'no-contact' | 'placed' | 'failed';

let caller: (number: string) => Promise<boolean> = placeCall;

/** Replace the native call (tests). Pass null to restore it. */
export function setEmergencyCallerForTesting(fn: ((number: string) => Promise<boolean>) | null): void {
  caller = fn ?? placeCall;
}

/**
 * Phones the contact chosen in Settings, if any. Runs after the alert texts are queued, so a
 * call that fails (no permission, no signal, contact deleted) never affects the SMS alert.
 */
export async function placeConfiguredEmergencyCall(): Promise<EmergencyCallOutcome> {
  const { emergencyCallContactId } = await getSettings();
  if (!emergencyCallContactId) return 'off';

  let number: string | undefined;
  try {
    number = (await getContacts()).find((c) => c.id === emergencyCallContactId)?.phoneNumber;
  } catch (err) {
    console.warn('[emergencyCall] Could not read contacts:', err);
    return 'no-contact';
  }
  if (!number) return 'no-contact';

  try {
    // The siren has been sounding since SOS was pressed; silence it so the call can be heard.
    // The flashing light and vibration carry on.
    await stopSirenOnly();
    return (await caller(number)) ? 'placed' : 'failed';
  } catch (err) {
    console.warn('[emergencyCall] Call failed:', err);
    return 'failed';
  }
}
