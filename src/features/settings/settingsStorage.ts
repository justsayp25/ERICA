import AsyncStorage from '@react-native-async-storage/async-storage';

export type AlertMode = 'loud' | 'silent';

export interface Settings {
  countdownSeconds: number;
  userName: string;
  customMessage: string;
  retryCeilingSeconds?: number;

  // Volume-button trigger (off until the user turns it on)
  volumeTriggerEnabled?: boolean;
  volumePressCount?: number;
  volumeWindowSeconds?: number;

  // Deterrence & Alarms. 'loud' runs the siren, strobe and vibration switched on below;
  // 'silent' runs none of them (alert and consented evidence only).
  alertMode?: AlertMode;
  deterrenceSirenEnabled?: boolean;
  deterrenceStrobeEnabled?: boolean;
  vibrationEnabled?: boolean;

  // Parity features
  /** Re-send the current position by SMS this often while an alert is active. 0 = off. */
  liveLocationIntervalSeconds?: number;
  /** Require holding the SOS button instead of a single tap. */
  holdToTrigger?: boolean;
  /**
   * Contact (by its random id, never the number) to phone right after the alert texts are
   * queued. Unset = no call. Calling emergency services is deliberately not offered.
   */
  emergencyCallContactId?: string | null;

  // Phase 4 Evidence Capture Consent Gates (Strict Consent Required: OFF by default)
  evidenceAudioConsentEnabled?: boolean;
  evidencePhotoConsentEnabled?: boolean;
  evidenceDualCamera?: boolean;
}

const STORAGE_KEY = '@erica/settings';

export const DEFAULT_SETTINGS: Settings = {
  countdownSeconds: 10,
  userName: '',
  customMessage: '',
  retryCeilingSeconds: 60,

  // Safety Defaults: strictly false/off by default
  volumeTriggerEnabled: false,
  volumePressCount: 4,
  volumeWindowSeconds: 3,

  // Loud by default (siren, flashing light, vibration); evidence capture below still needs
  // explicit consent. Loud mode is never muted by the phone's silent/vibrate switch: Silent
  // mode is the way to have no siren.
  alertMode: 'loud',
  deterrenceSirenEnabled: true,
  deterrenceStrobeEnabled: true,
  vibrationEnabled: true,
  liveLocationIntervalSeconds: 0,
  holdToTrigger: false,
  emergencyCallContactId: null,
  evidenceAudioConsentEnabled: false,
  evidencePhotoConsentEnabled: false,
  evidenceDualCamera: true,
};

export async function getSettings(): Promise<Settings> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULT_SETTINGS;
}

export async function saveSettings(settings: Settings): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
