import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Contact {
  id: string;
  name: string;
  phoneNumber: string;
}

const STORAGE_KEY = '@erica/contacts';

export async function getContacts(): Promise<Contact[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as Contact[]) : [];
}

async function saveContacts(contacts: Contact[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
}

export async function addContact(contact: Omit<Contact, 'id'>): Promise<Contact[]> {
  const contacts = await getContacts();
  const updated = [...contacts, { ...contact, id: `${Date.now()}` }];
  await saveContacts(updated);
  return updated;
}

export async function updateContact(updatedContact: Contact): Promise<Contact[]> {
  const contacts = await getContacts();
  const updated = contacts.map((c) => (c.id === updatedContact.id ? updatedContact : c));
  await saveContacts(updated);
  return updated;
}

export async function removeContact(id: string): Promise<Contact[]> {
  const contacts = await getContacts();
  const updated = contacts.filter((c) => c.id !== id);
  await saveContacts(updated);
  return updated;
}

