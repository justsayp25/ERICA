import React, { useCallback, useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { addContact, getContacts, removeContact, type Contact } from './contactsStorage';

export function ContactsScreen() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const load = useCallback(() => {
    getContacts().then(setContacts);
  }, []);

  useFocusEffect(load);

  const onAdd = async () => {
    if (!name.trim() || !phone.trim()) return;
    setContacts(await addContact({ name: name.trim(), phoneNumber: phone.trim() }));
    setName('');
    setPhone('');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Trusted Contacts</Text>
      <FlatList
        data={contacts}
        keyExtractor={(c) => c.id}
        ListEmptyComponent={<Text style={styles.empty}>No contacts yet — add at least one below.</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.phone}>{item.phoneNumber}</Text>
            </View>
            <Pressable onPress={() => removeContact(item.id).then(setContacts)}>
              <Text style={styles.remove}>Remove</Text>
            </Pressable>
          </View>
        )}
      />
      <View style={styles.form}>
        <TextInput style={styles.input} placeholder="Name" placeholderTextColor="#8E8E93" value={name} onChangeText={setName} />
        <TextInput
          style={styles.input}
          placeholder="Phone number"
          placeholderTextColor="#8E8E93"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />
        <Pressable style={styles.addButton} onPress={onAdd}>
          <Text style={styles.addButtonText}>Add Contact</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0B0F', padding: 16 },
  title: { color: 'white', fontSize: 20, fontWeight: '700', marginBottom: 12 },
  empty: { color: '#8E8E93', marginTop: 24, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
  },
  name: { color: 'white', fontSize: 16, fontWeight: '600' },
  phone: { color: '#8E8E93', fontSize: 14 },
  remove: { color: '#D7263D', fontWeight: '600' },
  form: { marginTop: 16, gap: 8 },
  input: { borderWidth: 1, borderColor: '#3A3A3C', borderRadius: 8, padding: 12, color: 'white' },
  addButton: { backgroundColor: '#D7263D', borderRadius: 8, padding: 14, alignItems: 'center' },
  addButtonText: { color: 'white', fontWeight: '700' },
});
