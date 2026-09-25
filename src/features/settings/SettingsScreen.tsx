import React, { useCallback, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getSettings, saveSettings, type Settings } from './settingsStorage';

const DEFAULTS: Settings = { countdownSeconds: 10, userName: '', customMessage: '' };

export function SettingsScreen() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [saved, setSaved] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getSettings().then(setSettings);
    }, [])
  );

  const onSave = async () => {
    await saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.title}>Settings</Text>

      <Text style={styles.label}>Countdown length (seconds)</Text>
      <TextInput
        style={styles.input}
        keyboardType="number-pad"
        value={String(settings.countdownSeconds)}
        onChangeText={(v) => setSettings((s) => ({ ...s, countdownSeconds: Math.max(3, parseInt(v, 10) || 0) }))}
      />

      <Text style={styles.label}>Your name (shown to contacts)</Text>
      <TextInput
        style={styles.input}
        value={settings.userName}
        onChangeText={(v) => setSettings((s) => ({ ...s, userName: v }))}
        placeholder="e.g. Jesse"
        placeholderTextColor="#8E8E93"
      />

      <Text style={styles.label}>Custom alert message</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={settings.customMessage}
        onChangeText={(v) => setSettings((s) => ({ ...s, customMessage: v }))}
        placeholder="Leave blank to use the default message"
        placeholderTextColor="#8E8E93"
        multiline
      />

      <Pressable style={styles.saveButton} onPress={onSave}>
        <Text style={styles.saveButtonText}>{saved ? 'Saved' : 'Save Settings'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0B0F' },
  title: { color: 'white', fontSize: 20, fontWeight: '700', marginBottom: 16 },
  label: { color: '#C7C7CC', marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: '#3A3A3C', borderRadius: 8, padding: 12, color: 'white' },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  saveButton: { backgroundColor: '#D7263D', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 20 },
  saveButtonText: { color: 'white', fontWeight: '700' },
});
