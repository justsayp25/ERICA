import React, { useCallback, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { getSettings, saveSettings, type Settings } from './settingsStorage';

const DEFAULTS: Settings = { countdownSeconds: 10, userName: '', customMessage: '' };

export function SettingsScreen() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [countdownText, setCountdownText] = useState('10');
  const [retryCeilingText, setRetryCeilingText] = useState('60');
  const [saved, setSaved] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getSettings().then((s) => {
        setSettings(s);
        setCountdownText(String(s.countdownSeconds));
        setRetryCeilingText(String(s.retryCeilingSeconds ?? 60));
      });
    }, [])
  );

  const onCountdownChange = (text: string) => {
    setCountdownText(text);
    const parsed = parseInt(text, 10);
    if (!isNaN(parsed) && parsed > 0) {
      setSettings((s) => ({ ...s, countdownSeconds: parsed }));
    }
  };

  const onRetryCeilingChange = (text: string) => {
    setRetryCeilingText(text);
    const parsed = parseInt(text, 10);
    if (!isNaN(parsed) && parsed > 0) {
      setSettings((s) => ({ ...s, retryCeilingSeconds: parsed }));
    }
  };

  const onSave = async () => {
    const finalCountdown = Math.max(3, parseInt(countdownText, 10) || 10);
    const finalRetryCeiling = Math.max(5, parseInt(retryCeilingText, 10) || 60);
    const toSave: Settings = {
      ...settings,
      countdownSeconds: finalCountdown,
      retryCeilingSeconds: finalRetryCeiling,
    };
    await saveSettings(toSave);
    setSettings(toSave);
    setCountdownText(String(finalCountdown));
    setRetryCeilingText(String(finalRetryCeiling));
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
        <Text style={styles.title}>Settings</Text>

        <Text style={styles.label}>Countdown length (seconds)</Text>
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          value={countdownText}
          onChangeText={onCountdownChange}
          placeholder="Min 3 seconds"
          placeholderTextColor="#8E8E93"
        />
        <Text style={styles.helperText}>Configurable countdown before emergency dispatch (min 3s).</Text>

        <Text style={styles.label}>Retry backoff ceiling (seconds)</Text>
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          value={retryCeilingText}
          onChangeText={onRetryCeilingChange}
          placeholder="e.g. 60"
          placeholderTextColor="#8E8E93"
        />
        <Text style={styles.helperText}>Maximum delay ceiling between retries during cellular dead zones (min 5s).</Text>

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
          <Text style={styles.saveButtonText}>{saved ? 'Saved ✓' : 'Save Settings'}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0B0B0F' },
  container: { flex: 1, backgroundColor: '#0B0B0F' },
  title: { color: 'white', fontSize: 20, fontWeight: '700', marginBottom: 16 },
  label: { color: '#C7C7CC', marginBottom: 6, marginTop: 12 },
  helperText: { color: '#8E8E93', fontSize: 12, marginTop: 4 },
  input: { borderWidth: 1, borderColor: '#3A3A3C', borderRadius: 8, padding: 12, color: 'white' },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  saveButton: { backgroundColor: '#D7263D', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 24 },
  saveButtonText: { color: 'white', fontWeight: '700' },
});

