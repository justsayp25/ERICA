import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Platform, Linking, Vibration } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useSosService } from './sosMachine';
import { getSettings, type AlertMode } from '../settings/settingsStorage';
import { getContacts } from '../contacts/contactsStorage';
import { requestEmergencyPermissions } from '../permissions/emergencyPermissions';
import { addMarkSafeListener } from '../../../modules/foreground-service';

/** How long the SOS button must be held when "hold to trigger" is on. */
export const HOLD_TO_TRIGGER_MS = 1500;

export function SosScreen() {
  const [state, send] = useSosService();
  const isIdle = state.matches('idle');
  const [smsPermissionMissing, setSmsPermissionMissing] = useState(false);
  const [holdToTrigger, setHoldToTrigger] = useState(false);
  const [alertMode, setAlertMode] = useState<AlertMode>('loud');
  const [contactCount, setContactCount] = useState<number | null>(null);

  // Physical panic triggers are handled once, globally, in App.tsx. Listening here as well
  // sent every trigger to the machine twice.
  useEffect(() => {
    const markSafeSub = addMarkSafeListener(() => {
      send({ type: 'MARK_SAFE' });
    });
    return () => {
      markSafeSub.remove();
    };
  }, [send]);

  // Ask for SEND_SMS / location / notifications before an emergency, not during one.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    requestEmergencyPermissions().then((p) => setSmsPermissionMissing(!p.sms));
  }, []);

  const onGrantSmsPermission = async () => {
    const p = await requestEmergencyPermissions();
    setSmsPermissionMissing(!p.sms);
    if (!p.sms) {
      // Denied with "don't ask again": only the system settings page can grant it now.
      Linking.openSettings().catch(() => {});
    }
  };

  // Depends on `isIdle`, not the whole snapshot: SETTINGS_UPDATED produces a new snapshot,
  // which re-ran this effect, which sent SETTINGS_UPDATED again — an endless storage loop.
  useFocusEffect(
    useCallback(() => {
      if (isIdle) {
        getSettings().then((s) => {
          setHoldToTrigger(Boolean(s.holdToTrigger));
          setAlertMode(s.alertMode ?? 'loud');
          send({ type: 'SETTINGS_UPDATED', countdownSeconds: s.countdownSeconds });
        });
        getContacts()
          .then((c) => setContactCount(c.length))
          .catch(() => setContactCount(null));
      }
    }, [isIdle, send])
  );

  return (
    <SafeAreaView style={styles.container}>
      {state.matches('idle') && (
        <View style={styles.idleContainer}>
          <Pressable
            style={styles.sosButton}
            delayLongPress={HOLD_TO_TRIGGER_MS}
            onPress={holdToTrigger ? undefined : () => send({ type: 'TRIGGER', source: 'Manual Button' })}
            onLongPress={
              holdToTrigger
                ? () => {
                    Vibration.vibrate(60);
                    send({ type: 'TRIGGER', source: 'Manual Button (held)' });
                  }
                : undefined
            }
          >
            <Text style={styles.sosButtonText}>SOS</Text>
          </Pressable>
          <Text style={styles.subtext}>
            {holdToTrigger
              ? `Hold the button for ${HOLD_TO_TRIGGER_MS / 1000} seconds to send an alert.`
              : 'Tap the button to send an alert.'}{' '}
            You have {state.context.countdownTotal} seconds to cancel.
          </Text>
          {contactCount === 0 ? (
            <Text style={styles.warning}>You have no contacts yet. Add someone in the Contacts tab.</Text>
          ) : (
            <Text style={styles.status}>
              {alertMode === 'loud' ? 'Loud mode' : 'Silent mode'}
              {contactCount !== null ? ` · ${contactCount} ${contactCount === 1 ? 'contact' : 'contacts'}` : ''}
            </Text>
          )}
          {smsPermissionMissing ? (
            <Pressable style={styles.permissionBanner} onPress={onGrantSmsPermission}>
              <Text style={styles.permissionBannerText}>
                ERICA cannot send texts yet. Tap here to allow SMS.
              </Text>
            </Pressable>
          ) : null}
        </View>
      )}

      {state.matches('countdown') && (
        <View style={styles.centered}>
          <Text style={styles.countdown}>{state.context.secondsRemaining}</Text>
          <Text style={styles.hint}>Your alert sends when the countdown ends.</Text>
          <Pressable style={styles.cancelButton} onPress={() => send({ type: 'CANCEL' })}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      )}

      {(state.matches('dispatching') || state.matches('resolving')) && (
        <View style={styles.centered}>
          <Text style={styles.hint}>
            {state.matches('dispatching')
              ? 'Getting your location and texting your contacts…'
              : 'Letting your contacts know you are safe…'}
          </Text>
        </View>
      )}

      {state.matches('active') && (
        <View style={styles.centered}>
          <Text style={styles.activeTitle}>SOS active</Text>
          <Text style={styles.hint}>
            {state.context.lastError ? 'There was a problem sending your alert:' : 'Your contacts were alerted.'}
          </Text>
          {state.context.lastError ? <Text style={styles.errorHint}>{state.context.lastError}</Text> : null}
          <View style={styles.activeButtonRow}>
            {state.context.lastError ? (
              <Pressable style={styles.dismissButton} onPress={() => send({ type: 'DISMISS' })}>
                <Text style={styles.dismissButtonText}>Dismiss</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.safeButton} onPress={() => send({ type: 'MARK_SAFE' })}>
              <Text style={styles.safeButtonText}>I'M SAFE</Text>
            </Pressable>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0B0B0F' },
  idleContainer: { alignItems: 'center', gap: 20 },
  subtext: { color: '#C7C7CC', fontSize: 15, textAlign: 'center', maxWidth: 300, lineHeight: 21 },
  centered: { alignItems: 'center', gap: 16, paddingHorizontal: 24 },
  sosButton: { width: 160, height: 160, borderRadius: 80, backgroundColor: '#D7263D', alignItems: 'center', justifyContent: 'center' },
  sosButtonText: { color: 'white', fontSize: 32, fontWeight: '700' },
  countdown: { color: 'white', fontSize: 72, fontWeight: '700' },
  hint: { color: '#C7C7CC', fontSize: 16, textAlign: 'center' },
  errorHint: { color: '#FF9F43', fontSize: 14, textAlign: 'center', marginVertical: 4 },
  cancelButton: { borderWidth: 1, borderColor: 'white', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 24 },
  cancelText: { color: 'white', fontWeight: '600' },
  activeTitle: { color: '#D7263D', fontSize: 24, fontWeight: '700' },
  activeButtonRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  dismissButton: { borderWidth: 1, borderColor: '#3A3A3C', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24 },
  dismissButtonText: { color: '#C7C7CC', fontWeight: '600' },
  safeButton: { backgroundColor: '#2E7D32', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  safeButtonText: { color: 'white', fontWeight: '700' },
  status: { color: '#8E8E93', fontSize: 13 },
  warning: { color: '#FF9F43', fontSize: 13, textAlign: 'center', maxWidth: 280 },
  permissionBanner: { borderWidth: 1, borderColor: '#FF9F43', borderRadius: 12, padding: 12, maxWidth: 300 },
  permissionBannerText: { color: '#FF9F43', fontSize: 13, textAlign: 'center' },
});
