import AsyncStorage from '@react-native-async-storage/async-storage';

export type AlertMode = 'loud' | 'silent';

export interface Settings {
  countdownSeconds: number;
  userName: string;
  customMessage: string;
  retryCeilingSeconds?: number;

  // Strict Safety Defaults: All physical triggers remain OFF by default
  volumeTriggerEnabled?: boolean;
  volumePressCount?: number;
  volumeWindowSeconds?: number;

  shakeTriggerEnabled?: boolean;
  shakeThreshold?: number;
  shakeMinCount?: number;
  shakeHighPassAlpha?: number;

  // App Lock & Biometric Gatekeeper
  appLockTimeoutSeconds?: number; // 0 = Immediate, 15, 30, 60
  biometricsEnabled?: boolean;

  // Duress PIN & Anti-Coercion Protection
  duressSilentSosEnabled?: boolean;
  decoyContactsType?: 'mock' | 'empty';

  // Deterrence & Alarms. 'loud' runs the siren, strobe and vibration switched on below;
  // 'silent' runs none of them (alert and consented evidence only).
  alertMode?: AlertMode;
  deterrenceSirenEnabled?: boolean;
  deterrenceStrobeEnabled?: boolean;
  vibrationEnabled?: boolean;
  respectSilentMode?: boolean;

  // Parity features
  /** Re-send the current position by SMS this often while an alert is active. 0 = off. */
  liveLocationIntervalSeconds?: number;
  /** Require holding the SOS button instead of a single tap. */
  holdToTrigger?: boolean;

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

  shakeTriggerEnabled: false,
  shakeThreshold: 25,
  shakeMinCount: 3,
  shakeHighPassAlpha: 0.8,

  // App Lock Defaults: Immediate lock, Biometrics enabled
  appLockTimeoutSeconds: 0,
  biometricsEnabled: true,

  // Duress PIN Defaults: Silent SOS off by default, Mock contacts default
  duressSilentSosEnabled: false,
  decoyContactsType: 'mock',

  // Loud by default (siren, flashing light, vibration); evidence capture below still needs
  // explicit consent. Respect Silent Mode stays ON so a phone set to silent/vibrate does not
  // sound the siren.
  alertMode: 'loud',
  deterrenceSirenEnabled: true,
  deterrenceStrobeEnabled: true,
  vibrationEnabled: true,
  respectSilentMode: true,
  liveLocationIntervalSeconds: 0,
  holdToTrigger: false,
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
