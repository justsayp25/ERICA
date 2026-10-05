import type { Contact } from './contactsStorage';

/** One phone number from the phone's address book, offered for import. */
export interface ImportCandidate {
  key: string;
  name: string;
  phoneNumber: string;
}

/** The parts of an address-book entry the import uses. */
export interface PhoneBookEntry {
  id?: string;
  name?: string;
  phoneNumbers?: { number?: string }[];
}

/** Digits only, keeping a leading +, so "0917 123 4567" and "09171234567" match. */
export function normalizeNumber(number: string): string {
  const trimmed = number.trim();
  return (trimmed.startsWith('+') ? '+' : '') + trimmed.replace(/\D/g, '');
}

/** One candidate per distinct number; entries without a usable number are skipped. */
export function toImportCandidates(entries: PhoneBookEntry[]): ImportCandidate[] {
  const candidates: ImportCandidate[] = [];
  entries.forEach((entry, entryIndex) => {
    const seen = new Set<string>();
    for (const phone of entry.phoneNumbers ?? []) {
      const raw = phone.number?.trim() ?? '';
      const normalized = normalizeNumber(raw);
      if (normalized.replace('+', '').length < 3 || seen.has(normalized)) continue;
      seen.add(normalized);
      candidates.push({
        key: `${entry.id ?? entryIndex}:${normalized}`,
        name: entry.name?.trim() || raw,
        phoneNumber: raw,
      });
    }
  });
  return candidates.sort((a, b) => a.name.localeCompare(b.name));
}

/** True when this number is already one of the trusted contacts. */
export function isAlreadyAdded(candidate: ImportCandidate, existing: Contact[]): boolean {
  const number = normalizeNumber(candidate.phoneNumber);
  return existing.some((c) => normalizeNumber(c.phoneNumber) === number);
}

export type PhoneContactsResult =
  | { status: 'ok'; candidates: ImportCandidate[] }
  | { status: 'denied' };

/** Asks for read-only contacts access and returns the phone's numbers. */
export async function loadPhoneContacts(): Promise<PhoneContactsResult> {
  // Imported lazily so the rest of the app (and the headless tests) never load the native module.
  const Contacts = await import('expo-contacts/legacy');
  const permission = await Contacts.requestPermissionsAsync();
  if (permission.status !== 'granted') {
    return { status: 'denied' };
  }
  const { data } = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
    sort: Contacts.SortTypes.FirstName,
  });
  return { status: 'ok', candidates: toImportCandidates(data) };
}
