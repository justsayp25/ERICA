import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getHistory, type HistoryEntry } from './historyStorage';

function formatDate(ms: number) {
  return new Date(ms).toLocaleString();
}

export function HistoryScreen() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useFocusEffect(
    useCallback(() => {
      getHistory().then(setHistory);
    }, [])
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Emergency History</Text>
      <FlatList
        data={history}
        keyExtractor={(h) => h.sessionId}
        ListEmptyComponent={<Text style={styles.empty}>No emergencies logged yet.</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.source}>{item.triggerSource}</Text>
            <Text style={styles.detail}>Started: {formatDate(item.startedAt)}</Text>
            <Text style={styles.detail}>{item.resolvedAt ? `Resolved: ${formatDate(item.resolvedAt)}` : 'Unresolved'}</Text>
            <Text style={styles.detail}>{item.locationCaptured ? 'Location captured' : 'Location unavailable'}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0B0F', padding: 16 },
  title: { color: 'white', fontSize: 20, fontWeight: '700', marginBottom: 12 },
  empty: { color: '#8E8E93', marginTop: 24, textAlign: 'center' },
  row: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1C1C1E' },
  source: { color: 'white', fontSize: 16, fontWeight: '600' },
  detail: { color: '#8E8E93', fontSize: 13, marginTop: 2 },
});
