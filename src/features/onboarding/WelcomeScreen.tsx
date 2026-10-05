import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getSettings, saveSettings } from '../settings/settingsStorage';

/**
 * First-run screen. Asks for the name that goes into every alert, so a contact never gets an
 * alert from "The user". Shown until a name is saved; it can be changed later in Settings.
 */
export function WelcomeScreen({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const trimmed = name.trim();

  const onContinue = async () => {
    if (!trimmed) return;
    try {
      const settings = await getSettings();
      await saveSettings({ ...settings, userName: trimmed });
      onDone();
    } catch {
      setError('Could not save your name. Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={styles.content} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Text style={styles.title}>Welcome to ERICA</Text>
        <Text style={styles.body}>
          When you press SOS, ERICA texts your trusted contacts that you need help, with your location.
        </Text>
        <Text style={styles.label}>What is your name?</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          placeholderTextColor="#8E8E93"
          autoFocus
          returnKeyType="done"
          onSubmitEditing={onContinue}
        />
        <Text style={styles.hint}>
          Your contacts will read: "{trimmed || 'Your name'} may be in danger."
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={[styles.button, !trimmed && styles.disabled]} disabled={!trimmed} onPress={onContinue}>
          <Text style={styles.buttonText}>Continue</Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0B0F' },
  content: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { color: 'white', fontSize: 30, fontWeight: '700', marginBottom: 12 },
  body: { color: '#C7C7CC', fontSize: 16, lineHeight: 22, marginBottom: 32 },
  label: { color: 'white', fontSize: 16, fontWeight: '600', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#3A3A3C',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: 'white',
    backgroundColor: '#16161C',
  },
  hint: { color: '#8E8E93', fontSize: 13, marginTop: 8 },
  error: { color: '#FF9F43', fontSize: 14, marginTop: 12 },
  button: { backgroundColor: '#D7263D', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 32 },
  disabled: { opacity: 0.4 },
  buttonText: { color: 'white', fontSize: 17, fontWeight: '700' },
});
