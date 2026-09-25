import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useMachine } from '@xstate/react';
import { sosMachine } from './sosMachine';

export function SosScreen() {
  const [state, send] = useMachine(sosMachine);

  return (
    <View style={styles.container}>
      {state.matches('idle') && (
        <Pressable style={styles.sosButton} onPress={() => send({ type: 'TRIGGER', source: 'Manual Button' })}>
          <Text style={styles.sosButtonText}>SOS</Text>
        </Pressable>
      )}

      {state.matches('countdown') && (
        <View style={styles.centered}>
          <Text style={styles.countdown}>{state.context.secondsRemaining}</Text>
          <Text style={styles.hint}>Alerting your contacts…</Text>
          <Pressable style={styles.cancelButton} onPress={() => send({ type: 'CANCEL' })}>
            <Text style={styles.cancelText}>CANCEL</Text>
          </Pressable>
        </View>
      )}

      {(state.matches('dispatching') || state.matches('resolving')) && (
        <View style={styles.centered}>
          <Text style={styles.hint}>
            {state.matches('dispatching') ? 'Getting your location and alerting contacts…' : 'Marking you safe…'}
          </Text>
        </View>
      )}

      {state.matches('active') && (
        <View style={styles.centered}>
          <Text style={styles.activeTitle}>Emergency active</Text>
          <Text style={styles.hint}>Your contacts have been alerted.</Text>
          {state.context.lastError ? <Text style={styles.errorHint}>{state.context.lastError}</Text> : null}
          <Pressable style={styles.safeButton} onPress={() => send({ type: 'MARK_SAFE' })}>
            <Text style={styles.safeButtonText}>I'M SAFE NOW</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0B0B0F' },
  centered: { alignItems: 'center', gap: 16, paddingHorizontal: 24 },
  sosButton: { width: 160, height: 160, borderRadius: 80, backgroundColor: '#D7263D', alignItems: 'center', justifyContent: 'center' },
  sosButtonText: { color: 'white', fontSize: 32, fontWeight: '700' },
  countdown: { color: 'white', fontSize: 72, fontWeight: '700' },
  hint: { color: '#C7C7CC', fontSize: 16, textAlign: 'center' },
  errorHint: { color: '#FF9F43', fontSize: 13, textAlign: 'center' },
  cancelButton: { borderWidth: 1, borderColor: 'white', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 24 },
  cancelText: { color: 'white', fontWeight: '600' },
  activeTitle: { color: '#D7263D', fontSize: 24, fontWeight: '700' },
  safeButton: { backgroundColor: '#2E7D32', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  safeButtonText: { color: 'white', fontWeight: '700' },
});
