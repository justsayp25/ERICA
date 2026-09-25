import AsyncStorage from '@react-native-async-storage/async-storage';

export interface HistoryEntry {
  sessionId: string;
  triggerSource: string;
  startedAt: number;
  resolvedAt: number | null;
  locationCaptured: boolean;
}

const STORAGE_KEY = '@erica/history';

export async function getHistory(): Promise<HistoryEntry[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
}

export async function appendHistoryEntry(entry: HistoryEntry): Promise<void> {
  const history = await getHistory();
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([entry, ...history]));
}

export async function resolveHistoryEntry(sessionId: string, resolvedAt: number): Promise<void> {
  const history = await getHistory();
  const updated = history.map((h) => (h.sessionId === sessionId ? { ...h, resolvedAt } : h));
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}
