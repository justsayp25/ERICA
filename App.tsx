import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/app';
import { initDispatchEngine } from './src/features/dispatch';

export default function App() {
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    initDispatchEngine()
      .then((fn) => {
        cleanup = fn;
      })
      .catch((err) => {
        console.warn('[App] Failed to initialize dispatch engine:', err);
      });

    return () => {
      cleanup?.();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <RootNavigator />
    </SafeAreaProvider>
  );
}

