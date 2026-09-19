import * as Location from 'expo-location';

export interface LocationResult {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: number;
}

// SOS-alerter's approach (GPS then network provider, whichever answers first)
// is a real technique worth keeping — falling back to a last-known fix beats
// sending no location at all when a fresh GPS lock times out mid-emergency.
export async function getCurrentLocation(): Promise<LocationResult | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    return null;
  }

  try {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    return toResult(position);
  } catch {
    const lastKnown = await Location.getLastKnownPositionAsync();
    return lastKnown ? toResult(lastKnown) : null;
  }
}

function toResult(position: Location.LocationObject): LocationResult {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    timestamp: position.timestamp,
  };
}

export function mapsLinkFor(location: LocationResult): string {
  return `https://maps.google.com/?q=${location.latitude},${location.longitude}`;
}
