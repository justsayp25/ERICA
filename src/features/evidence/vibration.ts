import { Platform, Vibration } from 'react-native';

/** Buzz-pause pattern (ms): wait 0, vibrate 800, pause 400, repeated until cancelled. */
export const ALERT_VIBRATION_PATTERN = [0, 800, 400];

/**
 * Repeating vibration for an active alert. Plain JS, no native bridge. Android may suppress
 * vibration from a backgrounded app, so this is best effort next to the siren and strobe.
 */
export function startAlertVibration(): void {
  if (Platform.OS !== 'android') return;
  try {
    Vibration.vibrate(ALERT_VIBRATION_PATTERN, true);
  } catch (err) {
    console.warn('[vibration] start failed:', err);
  }
}

export function stopAlertVibration(): void {
  try {
    Vibration.cancel();
  } catch (err) {
    console.warn('[vibration] stop failed:', err);
  }
}
