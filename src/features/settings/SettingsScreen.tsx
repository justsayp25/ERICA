import React, { useCallback, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Switch, Alert, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { getSettings, saveSettings, DEFAULT_SETTINGS, type AlertMode, type Settings } from './settingsStorage';
import { startAlertVibration, stopAlertVibration } from '../evidence/vibration';
import { requestEvidencePermission } from '../permissions/emergencyPermissions';
import { configureVolumeTrigger, VolumePatternEngine } from '../../../modules/physical-triggers';
import { startDeterrence, stopDeterrence } from '../../../modules/deterrence-evidence';

const RED = '#D7263D';

function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowTitle}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable
          style={styles.stepperButton}
          onPress={() => onChange(Math.max(min, value - step))}
          accessibilityLabel={`Decrease ${label}`}
        >
          <Text style={styles.stepperButtonText}>−</Text>
        </Pressable>
        <Text style={styles.stepperValue}>
          {value}
          {unit}
        </Text>
        <Pressable
          style={styles.stepperButton}
          onPress={() => onChange(Math.min(max, value + step))}
          accessibilityLabel={`Increase ${label}`}
        >
          <Text style={styles.stepperButtonText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Toggle({
  title,
  subtitle,
  value,
  onChange,
}: {
  title: string;
  subtitle?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ false: '#3A3A3C', true: RED }} thumbColor="#FFFFFF" />
    </View>
  );
}

function Choice<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.choiceRow}>
      {options.map((opt) => (
        <Pressable
          key={String(opt.value)}
          style={[styles.choice, value === opt.value && styles.choiceActive]}
          onPress={() => onChange(opt.value)}
        >
          <Text style={[styles.choiceText, value === opt.value && styles.choiceTextActive]}>{opt.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function SettingsScreen() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  // Latest settings for update(): two quick changes must not overwrite each other.
  const settingsRef = useRef<Settings>(DEFAULT_SETTINGS);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [testFeedback, setTestFeedback] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [practicePresses, setPracticePresses] = useState(0);
  const practiceEngine = useRef(new VolumePatternEngine({ enabled: true, pressCount: 4, windowSeconds: 3 }));

  useFocusEffect(
    useCallback(() => {
      getSettings().then((s) => {
        settingsRef.current = s;
        setSettings(s);
        setName(s.userName);
        setMessage(s.customMessage);
      });
    }, [])
  );

  /**
   * Every control saves the moment it changes; there is no Save button. (An earlier version
   * only saved on a button at the bottom of the screen, so changes that looked applied never
   * reached a real SOS.)
   */
  const update = (patch: Partial<Settings>) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
    saveSettings(next).catch((err) => console.warn('[Settings] Save failed:', err));
    if ('volumeTriggerEnabled' in patch || 'volumePressCount' in patch || 'volumeWindowSeconds' in patch) {
      configureVolumeTrigger({
        enabled: Boolean(next.volumeTriggerEnabled),
        pressCount: next.volumePressCount ?? 4,
        windowSeconds: next.volumeWindowSeconds ?? 3,
      }).catch((err) => console.warn('[Settings] Volume trigger config failed:', err));
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  };

  const loud = (settings.alertMode ?? 'loud') === 'loud';
  const pressCount = settings.volumePressCount ?? 4;
  const windowSeconds = settings.volumeWindowSeconds ?? 3;

  // Practice only drives a local engine: it never touches the armed detector or sends an alert.
  const onPracticePress = () => {
    practiceEngine.current.configure({ pressCount, windowSeconds });
    const fired = practiceEngine.current.onPress(Date.now(), false);
    setPracticePresses(fired ? 0 : practiceEngine.current.getActivePressCount());
    if (fired) {
      setTestFeedback(`✓ ${pressCount} presses in time. That would start an alert.`);
      setTimeout(() => setTestFeedback(null), 2500);
    }
  };

  const onTestAlarm = async () => {
    if (isTesting) return;
    if (!loud) {
      setTestFeedback('Silent mode is on, so nothing plays. Switch to Loud to test.');
      setTimeout(() => setTestFeedback(null), 3000);
      return;
    }
    const siren = Boolean(settings.deterrenceSirenEnabled);
    const strobe = Boolean(settings.deterrenceStrobeEnabled);
    const vibrate = Boolean(settings.vibrationEnabled);
    if (!siren && !strobe && !vibrate) {
      setTestFeedback('Turn on the siren, flashing light or vibration first.');
      setTimeout(() => setTestFeedback(null), 3000);
      return;
    }
    setIsTesting(true);
    setTestFeedback('Testing for 3 seconds. No alert is sent.');
    try {
      if (vibrate) startAlertVibration();
      const status =
        siren || strobe
          ? await startDeterrence({
              sirenEnabled: siren,
              strobeEnabled: strobe,
              respectSilentMode: settings.respectSilentMode ?? true,
            })
          : { suppressedBySilentMode: false };
      if (status.suppressedBySilentMode) {
        setTestFeedback('Phone is on silent/vibrate, so the siren is muted (see Advanced).');
      }
    } catch {
      setTestFeedback('Test failed.');
    }
    setTimeout(async () => {
      stopAlertVibration();
      await stopDeterrence().catch(() => {});
      setIsTesting(false);
      setTimeout(() => setTestFeedback(null), 2000);
    }, 3000);
  };

  const askEvidenceConsent = (kind: 'audio' | 'camera', on: boolean) => {
    const key = kind === 'audio' ? 'evidenceAudioConsentEnabled' : 'evidencePhotoConsentEnabled';
    if (!on) {
      update({ [key]: false });
      return;
    }
    Alert.alert(
      kind === 'audio' ? 'Record audio during an alert?' : 'Take photos during an alert?',
      kind === 'audio'
        ? 'ERICA will record sound around you while an alert is active. Recordings stay on this phone, encrypted.'
        : 'ERICA will take photos with the front and back cameras when an alert starts. Photos stay on this phone, encrypted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Allow',
          onPress: async () => {
            if (!(await requestEvidencePermission(kind))) {
              Alert.alert('Permission needed', 'Android did not grant access, so this stays off.');
              return;
            }
            update({ [key]: true });
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Settings</Text>
          {saved ? <Text style={styles.saved}>Saved ✓</Text> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Your alert</Text>
          <Text style={styles.label}>Your name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            onEndEditing={() => update({ userName: name })}
            placeholder="Shown in the alert"
            placeholderTextColor="#8E8E93"
          />
          <Text style={styles.label}>Message</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={message}
            onChangeText={setMessage}
            onEndEditing={() => update({ customMessage: message })}
            placeholder={`Default: "${name.trim() || 'The user'} may be in danger."`}
            placeholderTextColor="#8E8E93"
            multiline
          />
          <Stepper
            label="Countdown before sending"
            value={settings.countdownSeconds}
            min={3}
            max={60}
            unit="s"
            onChange={(v) => update({ countdownSeconds: v })}
          />
          <Toggle
            title="Hold to start"
            subtitle="Hold the SOS button for 1.5 s instead of tapping, so a pocket press can't start an alert."
            value={Boolean(settings.holdToTrigger)}
            onChange={(v) => update({ holdToTrigger: v })}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Volume button trigger</Text>
          <Toggle
            title="Start an alert with the volume buttons"
            subtitle={`Press volume down ${pressCount} times within ${windowSeconds} s, even with the screen locked.`}
            value={Boolean(settings.volumeTriggerEnabled)}
            onChange={(v) => update({ volumeTriggerEnabled: v })}
          />
          {settings.volumeTriggerEnabled ? (
            <>
              <Stepper
                label="Presses needed"
                value={pressCount}
                min={3}
                max={6}
                onChange={(v) => update({ volumePressCount: v })}
              />
              {Platform.OS === 'android' ? (
                <Pressable
                  style={styles.secondaryButton}
                  onPress={() =>
                    Linking.sendIntent('android.settings.ACCESSIBILITY_SETTINGS').catch(() => Linking.openSettings())
                  }
                >
                  <Text style={styles.secondaryButtonText}>Turn on ERICA in Accessibility (needed)</Text>
                </Pressable>
              ) : null}
              <Pressable style={styles.secondaryButton} onPress={onPracticePress}>
                <Text style={styles.secondaryButtonText}>
                  Practice: tap {pressCount} times quickly ({practicePresses}/{pressCount})
                </Text>
              </Pressable>
            </>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>When an alert starts</Text>
          <Choice<AlertMode>
            options={[
              { label: 'Loud', value: 'loud' },
              { label: 'Silent', value: 'silent' },
            ]}
            value={settings.alertMode ?? 'loud'}
            onChange={(v) => update({ alertMode: v })}
          />
          <Text style={styles.hint}>
            {loud
              ? 'Loud: siren, flashing light and vibration to draw attention.'
              : 'Silent: no sound, light or vibration. Your contacts still get the text.'}
          </Text>
          {loud ? (
            <>
              <Toggle
                title="Siren"
                value={Boolean(settings.deterrenceSirenEnabled)}
                onChange={(v) => update({ deterrenceSirenEnabled: v })}
              />
              <Toggle
                title="Flashing light"
                value={Boolean(settings.deterrenceStrobeEnabled)}
                onChange={(v) => update({ deterrenceStrobeEnabled: v })}
              />
              <Toggle
                title="Vibration"
                value={Boolean(settings.vibrationEnabled)}
                onChange={(v) => update({ vibrationEnabled: v })}
              />
              <Pressable style={styles.secondaryButton} onPress={onTestAlarm}>
                <Text style={styles.secondaryButtonText}>{isTesting ? 'Testing…' : 'Test for 3 seconds'}</Text>
              </Pressable>
            </>
          ) : null}
          <Text style={[styles.label, { marginTop: 16 }]}>Send my location again every</Text>
          <Choice<number>
            options={[
              { label: 'Off', value: 0 },
              { label: '1 min', value: 60 },
              { label: '2 min', value: 120 },
              { label: '5 min', value: 300 },
              { label: '10 min', value: 600 },
            ]}
            value={settings.liveLocationIntervalSeconds ?? 0}
            onChange={(v) => update({ liveLocationIntervalSeconds: v })}
          />
          <Text style={styles.hint}>One text per contact each time, until you tap I'M SAFE.</Text>
          {testFeedback ? <Text style={styles.feedback}>{testFeedback}</Text> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Evidence (optional)</Text>
          <Toggle
            title="Record audio"
            subtitle="Kept on this phone, encrypted."
            value={Boolean(settings.evidenceAudioConsentEnabled)}
            onChange={(v) => askEvidenceConsent('audio', v)}
          />
          <Toggle
            title="Take photos"
            subtitle="Front and back cameras, kept on this phone, encrypted."
            value={Boolean(settings.evidencePhotoConsentEnabled)}
            onChange={(v) => askEvidenceConsent('camera', v)}
          />
        </View>

        <Pressable style={styles.advancedHeader} onPress={() => setShowAdvanced((v) => !v)}>
          <Text style={styles.advancedHeaderText}>{showAdvanced ? '▾' : '▸'} Advanced</Text>
        </Pressable>
        {showAdvanced ? (
          <View style={styles.card}>
            <Toggle
              title="Mute the siren when the phone is on silent"
              value={settings.respectSilentMode ?? true}
              onChange={(v) => update({ respectSilentMode: v })}
            />
            <Stepper
              label="Volume press time window"
              value={windowSeconds}
              min={2}
              max={5}
              unit="s"
              onChange={(v) => update({ volumeWindowSeconds: v })}
            />
            <Stepper
              label="Longest wait between retries"
              value={settings.retryCeilingSeconds ?? 60}
              min={5}
              max={300}
              step={5}
              unit="s"
              onChange={(v) => update({ retryCeilingSeconds: v })}
            />
            {settings.evidencePhotoConsentEnabled ? (
              <Toggle
                title="Use both cameras"
                value={settings.evidenceDualCamera ?? true}
                onChange={(v) => update({ evidenceDualCamera: v })}
              />
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0B0B0F' },
  content: { padding: 16, paddingBottom: 48 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title: { color: 'white', fontSize: 26, fontWeight: '700' },
  saved: { color: '#4EBA6F', fontSize: 13, fontWeight: '600' },
  card: { backgroundColor: '#16161C', borderRadius: 14, padding: 16, marginBottom: 16 },
  cardTitle: { color: 'white', fontSize: 17, fontWeight: '700', marginBottom: 4 },
  label: { color: '#C7C7CC', fontSize: 14, marginTop: 12, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#3A3A3C',
    borderRadius: 10,
    padding: 12,
    color: 'white',
    backgroundColor: '#0B0B0F',
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  rowText: { flex: 1, paddingRight: 12 },
  rowTitle: { color: 'white', fontSize: 15, flexShrink: 1 },
  rowSubtitle: { color: '#8E8E93', fontSize: 12, marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepperButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#2A2A32',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonText: { color: 'white', fontSize: 18, fontWeight: '600' },
  stepperValue: { color: 'white', fontSize: 15, fontWeight: '600', minWidth: 40, textAlign: 'center' },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  choice: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 18, backgroundColor: '#2A2A32' },
  choiceActive: { backgroundColor: RED },
  choiceText: { color: '#C7C7CC', fontSize: 14, fontWeight: '600' },
  choiceTextActive: { color: 'white' },
  hint: { color: '#8E8E93', fontSize: 12, marginTop: 8 },
  feedback: { color: '#FF9F43', fontSize: 13, marginTop: 12 },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#3A3A3C',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  secondaryButtonText: { color: 'white', fontSize: 14, fontWeight: '600' },
  advancedHeader: { paddingVertical: 12 },
  advancedHeaderText: { color: '#8E8E93', fontSize: 15, fontWeight: '600' },
});
