import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { clearHistory, getHistory, type HistoryEntry } from './historyStorage';
import { getEvidenceSummaries, clearEvidence, type EvidenceSummary } from '../evidence';

function formatDate(ms: number) {
  return new Date(ms).toLocaleString();
}

/** Readable name for how an alert was started. */
export function triggerLabel(source: string): string {
  if (/volume/i.test(source)) return 'Volume buttons';
  if (/held/i.test(source)) return 'SOS button (held)';
  if (/manual|button/i.test(source)) return 'SOS button';
  return source;
}

function evidenceText(audio: number, photos: number): string {
  const parts: string[] = [];
  if (audio > 0) parts.push(`${audio} audio ${audio === 1 ? 'recording' : 'recordings'}`);
  if (photos > 0) parts.push(`${photos} ${photos === 1 ? 'photo' : 'photos'}`);
  return `Saved on this phone: ${parts.join(', ')}`;
}

export function HistoryScreen() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [evidenceMap, setEvidenceMap] = useState<Record<string, EvidenceSummary[]>>({});

  const load = useCallback(() => {
    getHistory().then(setHistory);
    // Only counts are shown, so load summaries; getEvidence() would pull every recording
    // and photo into memory.
    getEvidenceSummaries().then((evList) => {
      const map: Record<string, EvidenceSummary[]> = {};
      evList.forEach((ev) => {
        if (!map[ev.sessionId]) map[ev.sessionId] = [];
        map[ev.sessionId].push(ev);
      });
      setEvidenceMap(map);
    });
  }, []);

  useFocusEffect(load);

  const onClear = () => {
    Alert.alert('Clear history?', 'This deletes the list and any saved recordings and photos.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await clearHistory();
          await clearEvidence();
          setHistory([]);
          setEvidenceMap({});
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.title}>History</Text>
        {history.length > 0 ? (
          <Pressable onPress={onClear} style={styles.clearBtn}>
            <Text style={styles.clearText}>Clear</Text>
          </Pressable>
        ) : null}
      </View>
      <FlatList
        data={history}
        keyExtractor={(h) => h.sessionId}
        ListEmptyComponent={<Text style={styles.empty}>No alerts yet.</Text>}
        renderItem={({ item }) => {
          const sessionEvidence = evidenceMap[item.sessionId] || [];
          const audioCount = sessionEvidence.filter((e) => e.type === 'audio').length;
          const photoCount = sessionEvidence.filter((e) => e.type === 'photo').length;

          return (
            <View style={styles.row}>
              <View style={styles.rowHeader}>
                <Text style={styles.source}>{triggerLabel(item.triggerSource)}</Text>
                <Text style={[styles.statusBadge, item.resolvedAt ? styles.resolved : styles.active]}>
                  {item.resolvedAt ? 'Marked safe' : 'Active'}
                </Text>
              </View>
              <Text style={styles.detail}>Started: {formatDate(item.startedAt)}</Text>
              {item.resolvedAt ? <Text style={styles.detail}>Marked safe: {formatDate(item.resolvedAt)}</Text> : null}
              <Text style={styles.detail}>{item.locationCaptured ? 'Location sent' : 'No location was available'}</Text>
              {sessionEvidence.length > 0 ? (
                <View style={styles.evidenceContainer}>
                  <Text style={styles.evidenceBadge}>
                    {evidenceText(audioCount, photoCount)}
                  </Text>
                </View>
              ) : null}
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0B0F', padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { color: 'white', fontSize: 26, fontWeight: '700' },
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
  evidenceContainer: { marginTop: 6 },
  evidenceBadge: {
    color: '#4EBA6F',
    backgroundColor: '#1B3B22',
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
    overflow: 'hidden',
  },
});
