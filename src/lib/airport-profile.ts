export const AIRPORT_PROFILE_KEYS = {
  location: 'airportLocation',
  manager: 'airportManager',
  description: 'airportDescription',
} as const;

type ConfigEntry = { key: string; value: string };

export function airportProfile<T extends { configs: ConfigEntry[] }>(airport: T) {
  const values = Object.fromEntries(airport.configs.map(({ key, value }) => [key, value]));
  const { configs, ...record } = airport;
  void configs;
  return {
    ...record,
    location: values[AIRPORT_PROFILE_KEYS.location] ?? '',
    manager: values[AIRPORT_PROFILE_KEYS.manager] ?? '',
    description: values[AIRPORT_PROFILE_KEYS.description] ?? '',
  };
}

export function parseAirportCoordinates(lat: unknown, lng: unknown): { refLat: number; refLng: number } | null {
  if (lat === null || lng === null || lat === undefined || lng === undefined
    || typeof lat === 'string' && !lat.trim() || typeof lng === 'string' && !lng.trim()) return null;
  const refLat = Number(lat);
  const refLng = Number(lng);
  if (!Number.isFinite(refLat) || !Number.isFinite(refLng) || Math.abs(refLat) > 90 || Math.abs(refLng) > 180) return null;
  return { refLat, refLng };
}
