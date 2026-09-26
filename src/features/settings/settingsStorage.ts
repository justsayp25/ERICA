import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Settings {
  countdownSeconds: number;
  userName: string;
  customMessage: string;
  retryCeilingSeconds?: number;
}

const STORAGE_KEY = '@erica/settings';

const DEFAULT_SETTINGS: Settings = {
  countdownSeconds: 10,
  userName: '',
  customMessage: '',
  retryCeilingSeconds: 60,
};

export async function getSettings(): Promise<Settings> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULT_SETTINGS;
}

export async function saveSettings(settings: Settings): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
