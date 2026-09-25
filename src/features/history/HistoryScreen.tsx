import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { clearHistory, getHistory, type HistoryEntry } from './historyStorage';

function formatDate(ms: number) {
  return new Date(ms).toLocaleString();
}

export function HistoryScreen() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const load = useCallback(() => {
    getHistory().then(setHistory);
  }, []);

  useFocusEffect(load);

  const onClear = async () => {
    await clearHistory();
    setHistory([]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.title}>Emergency History</Text>
        {history.length > 0 ? (
          <Pressable onPress={onClear} style={styles.clearBtn}>
            <Text style={styles.clearText}>Clear Log</Text>
          </Pressable>
        ) : null}
      </View>
      <FlatList
        data={history}
        keyExtractor={(h) => h.sessionId}
        ListEmptyComponent={<Text style={styles.empty}>No emergencies logged yet.</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowHeader}>
              <Text style={styles.source}>{item.triggerSource}</Text>
              <Text style={[styles.statusBadge, item.resolvedAt ? styles.resolved : styles.active]}>
                {item.resolvedAt ? 'Resolved' : 'Active / Pending'}
              </Text>
            </View>
            <Text style={styles.detail}>Started: {formatDate(item.startedAt)}</Text>
            {item.resolvedAt ? <Text style={styles.detail}>Resolved: {formatDate(item.resolvedAt)}</Text> : null}
            <Text style={styles.detail}>{item.locationCaptured ? '✓ Location captured' : '✗ Location unavailable'}</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0B0F', padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { color: 'white', fontSize: 20, fontWeight: '700' },
  clearBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  clearText: { color: '#8E8E93', fontSize: 14 },
  empty: { color: '#8E8E93', marginTop: 24, textAlign: 'center' },
  row: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1C1C1E' },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  source: { color: 'white', fontSize: 16, fontWeight: '600' },
  statusBadge: { fontSize: 12, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, overflow: 'hidden' },
  resolved: { color: '#4CD964', backgroundColor: 'rgba(76, 217, 100, 0.15)' },
  active: { color: '#FF9500', backgroundColor: 'rgba(255, 149, 0, 0.15)' },
  detail: { color: '#8E8E93', fontSize: 13, marginTop: 2 },
});

