import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator, navigationRef } from './src/app';
import { initDispatchEngine } from './src/features/dispatch';
import { getSettings } from './src/features/settings';
import { getSosService } from './src/features/sos';
import { runStorageMigration, runCryptoSanityCheck } from './src/features/security';
import { configureVolumeTrigger, addPanicTriggerListener } from './modules/physical-triggers';
import { WelcomeScreen } from './src/features/onboarding/WelcomeScreen';

export async function initPhysicalTriggers(): Promise<() => void> {
  const settings = await getSettings();
  await configureVolumeTrigger({
    enabled: Boolean(settings.volumeTriggerEnabled),
    pressCount: settings.volumePressCount ?? 4,
    windowSeconds: settings.volumeWindowSeconds ?? 3,
  }).catch((err) => console.warn('[App] Failed to configure volume trigger:', err));

  const sub = addPanicTriggerListener((event) => {
    getSosService().send({ type: 'TRIGGER', source: event?.source });
    if (navigationRef.isReady()) {
      navigationRef.navigate('SOS' as never);
    }
  });

  return () => {
    sub.remove();
  };
}

export default function App() {
  const [cryptoCorrupted, setCryptoCorrupted] = useState(false);
  // null until settings are read: the name decides whether the welcome screen is shown.
  const [hasName, setHasName] = useState<boolean | null>(null);

  useEffect(() => {
    getSettings()
      .then((s) => setHasName(s.userName.trim().length > 0))
      .catch(() => setHasName(false));
  }, []);

  useEffect(() => {
    let cleanupDispatch: (() => void) | undefined;
    let cleanupTriggers: (() => void) | undefined;

    // Mini-Step 3: Silent encrypt/decrypt sanity check at app mount
    runCryptoSanityCheck()
      .then((passed) => {
        if (!passed) {
          setCryptoCorrupted(true);
          Alert.alert(
            'Security Warning',
            'Cryptographic engine self-test failed. Stored data may be inaccessible.',
            [{ text: 'OK' }]
          );
        }
      })
      .catch((err) => {
        console.warn('[App] Startup crypto self-test error:', err);
        setCryptoCorrupted(true);
        Alert.alert(
          'Security Warning',
          'Cryptographic engine self-test failed. Stored data may be inaccessible.',
          [{ text: 'OK' }]
        );
      });

    // Phase 3: Automated Safe One-Time Storage Migration
    runStorageMigration().catch((err) => {
      console.warn('[App] Failed to run storage migration:', err);
    });

    initDispatchEngine()
      .then((fn) => {
        cleanupDispatch = fn;
      })
      .catch((err) => {
        console.warn('[App] Failed to initialize dispatch engine:', err);
      });

    initPhysicalTriggers()
      .then((fn) => {
        cleanupTriggers = fn;
      })
      .catch((err) => {
        console.warn('[App] Failed to initialize physical triggers:', err);
      });

    return () => {
      cleanupDispatch?.();
      cleanupTriggers?.();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {cryptoCorrupted && (
        <View style={styles.warningBanner}>
          <Text style={styles.warningText}>
            ⚠️ Security Warning: Cryptographic engine self-test failed. Stored data may be inaccessible.
          </Text>
        </View>
      )}
      {hasName === null ? (
        <View style={styles.blank} />
      ) : hasName ? (
        <RootNavigator />
      ) : (
        <WelcomeScreen onDone={() => setHasName(true)} />
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  blank: { flex: 1, backgroundColor: '#0B0B0F' },
  warningBanner: {
    backgroundColor: '#D7263D',
    paddingVertical: 8,
    paddingHorizontal: 16,
    zIndex: 9999,
  },
  warningText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
});
