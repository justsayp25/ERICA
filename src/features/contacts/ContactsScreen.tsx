import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import {
  addContact,
  getContacts,
  removeContact,
  updateContact,
  DecryptionFailedError,
  type Contact,
} from './contactsStorage';
import { isAlreadyAdded, loadPhoneContacts, type ImportCandidate } from './phoneContactImport';

function describeError(err: unknown, fallback: string): string {
  if (err instanceof DecryptionFailedError) {
    return 'Your saved contacts could not be read. Nothing was changed.';
  }
  return err instanceof Error && err.message ? err.message : fallback;
}

export function ContactsScreen() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [candidates, setCandidates] = useState<ImportCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const load = useCallback(() => {
    setErrorMessage(null);
    getContacts()
      .then(setContacts)
      .catch((err) => setErrorMessage(describeError(err, 'Could not load your contacts.')));
  }, []);

  useFocusEffect(load);

  const onSave = async () => {
    if (!name.trim() || !phone.trim()) {
      setErrorMessage('Enter a name and a phone number.');
      return;
    }
    try {
      if (editingId) {
        setContacts(await updateContact({ id: editingId, name: name.trim(), phoneNumber: phone.trim() }));
        setEditingId(null);
      } else {
        setContacts(await addContact({ name: name.trim(), phoneNumber: phone.trim() }));
      }
      setName('');
      setPhone('');
      setErrorMessage(null);
    } catch (err) {
      setErrorMessage(describeError(err, 'Could not save the contact.'));
    }
  };

  const onRemove = (contact: Contact) => {
    Alert.alert('Remove contact?', `${contact.name} will no longer get your alerts.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          removeContact(contact.id)
            .then((updated) => {
              setContacts(updated);
              setErrorMessage(null);
            })
            .catch((err) => setErrorMessage(describeError(err, 'Could not remove the contact.')));
        },
      },
    ]);
  };

  const onStartEdit = (contact: Contact) => {
    setEditingId(contact.id);
    setName(contact.name);
    setPhone(contact.phoneNumber);
  };

  const onCancelEdit = () => {
    setEditingId(null);
    setName('');
    setPhone('');
  };

  const onOpenImport = async () => {
    try {
      const result = await loadPhoneContacts();
      if (result.status === 'denied') {
        Alert.alert('Permission needed', 'Allow ERICA to read your contacts to import them. You can still add people by hand.');
        return;
      }
      setCandidates(result.candidates);
      setSelected(new Set());
      setSearch('');
      setImportOpen(true);
    } catch (err) {
      setErrorMessage(describeError(err, 'Could not open your phone contacts.'));
    }
  };

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const onImportSelected = async () => {
    try {
      let updated = contacts;
      for (const candidate of candidates) {
        if (selected.has(candidate.key) && !isAlreadyAdded(candidate, updated)) {
          updated = await addContact({ name: candidate.name, phoneNumber: candidate.phoneNumber });
        }
      }
      setContacts(updated);
      setImportOpen(false);
      setErrorMessage(null);
    } catch (err) {
      setErrorMessage(describeError(err, 'Could not import the contacts.'));
      setImportOpen(false);
    }
  };

  const visibleCandidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? candidates.filter((c) => c.name.toLowerCase().includes(q) || c.phoneNumber.includes(q))
      : candidates;
  }, [candidates, search]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Text style={styles.title}>Contacts</Text>
        <Text style={styles.subtitle}>These people get your alert by text message.</Text>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Name"
            placeholderTextColor="#8E8E93"
            value={name}
            onChangeText={setName}
            returnKeyType="next"
          />
          <TextInput
            style={styles.input}
            placeholder="Phone number"
            placeholderTextColor="#8E8E93"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
          <View style={styles.buttonRow}>
            {editingId ? (
              <Pressable style={[styles.secondaryButton, styles.flex]} onPress={onCancelEdit}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
            ) : (
              <Pressable style={[styles.secondaryButton, styles.flex]} onPress={onOpenImport}>
                <Text style={styles.secondaryButtonText}>Import from phone</Text>
              </Pressable>
            )}
            <Pressable style={[styles.primaryButton, styles.flex]} onPress={onSave}>
              <Text style={styles.primaryButtonText}>{editingId ? 'Save' : 'Add'}</Text>
            </Pressable>
          </View>
        </View>

        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

        <FlatList
          data={contacts}
          keyExtractor={(c) => c.id}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Text style={styles.empty}>No contacts yet. Add at least one person above.</Text>}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.flex}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.phone}>{item.phoneNumber}</Text>
              </View>
              <Pressable onPress={() => onStartEdit(item)} style={styles.rowAction}>
                <Text style={styles.edit}>Edit</Text>
              </Pressable>
              <Pressable onPress={() => onRemove(item)} style={styles.rowAction}>
                <Text style={styles.remove}>Remove</Text>
              </Pressable>
            </View>
          )}
        />
      </KeyboardAvoidingView>

      <Modal visible={importOpen} animationType="slide" onRequestClose={() => setImportOpen(false)}>
        <SafeAreaView style={styles.container}>
          <Text style={styles.title}>Import from phone</Text>
          <Text style={styles.subtitle}>Choose who should get your alerts.</Text>
          <TextInput
            style={styles.input}
            placeholder="Search"
            placeholderTextColor="#8E8E93"
            value={search}
            onChangeText={setSearch}
          />
          <FlatList
            style={styles.importList}
            data={visibleCandidates}
            keyExtractor={(c) => c.key}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={styles.empty}>No phone contacts with a number.</Text>}
            renderItem={({ item }) => {
              const added = isAlreadyAdded(item, contacts);
              const checked = selected.has(item.key);
              return (
                <Pressable style={styles.row} disabled={added} onPress={() => toggle(item.key)}>
                  <View style={[styles.checkbox, (checked || added) && styles.checkboxOn]}>
                    {checked || added ? <Text style={styles.checkmark}>✓</Text> : null}
                  </View>
                  <View style={styles.flex}>
                    <Text style={[styles.name, added && styles.muted]}>{item.name}</Text>
                    <Text style={styles.phone}>{added ? `${item.phoneNumber} · already added` : item.phoneNumber}</Text>
                  </View>
                </Pressable>
              );
            }}
          />
          <View style={styles.buttonRow}>
            <Pressable style={[styles.secondaryButton, styles.flex]} onPress={() => setImportOpen(false)}>
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryButton, styles.flex, selected.size === 0 && styles.disabled]}
              disabled={selected.size === 0}
              onPress={onImportSelected}
            >
              <Text style={styles.primaryButtonText}>
                {selected.size === 0 ? 'Import' : `Import ${selected.size}`}
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0B0F', padding: 16 },
  flex: { flex: 1 },
  title: { color: 'white', fontSize: 26, fontWeight: '700' },
  subtitle: { color: '#8E8E93', fontSize: 14, marginTop: 4, marginBottom: 16 },
  form: { gap: 10, marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#3A3A3C',
    borderRadius: 10,
    padding: 12,
    color: 'white',
    backgroundColor: '#16161C',
  },
  buttonRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  primaryButton: { backgroundColor: '#D7263D', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  primaryButtonText: { color: 'white', fontSize: 15, fontWeight: '700' },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#3A3A3C',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryButtonText: { color: 'white', fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.4 },
  error: { color: '#FF9F43', fontSize: 14, marginBottom: 8 },
  empty: { color: '#8E8E93', marginTop: 24, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
  },
  rowAction: { paddingVertical: 6, paddingHorizontal: 6 },
  name: { color: 'white', fontSize: 16, fontWeight: '600' },
  phone: { color: '#8E8E93', fontSize: 14, marginTop: 2 },
  muted: { color: '#8E8E93' },
  edit: { color: '#4A90E2', fontWeight: '600' },
  remove: { color: '#D7263D', fontWeight: '600' },
  importList: { marginTop: 8 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#3A3A3C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: '#D7263D', borderColor: '#D7263D' },
  checkmark: { color: 'white', fontSize: 14, fontWeight: '700' },
});
