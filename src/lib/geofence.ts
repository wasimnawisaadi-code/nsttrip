// Geofence utility functions

export interface GeoPosition {
  lat: number;
  lng: number;
}

export interface GeofenceZone {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
  zone_type: string;
  is_active: boolean;
}

// Haversine formula — distance in meters between two lat/lng points
export function distanceMeters(a: GeoPosition, b: GeoPosition): number {
  const R = 6371000; // Earth radius in meters
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinDlat = Math.sin(dLat / 2);
  const sinDlng = Math.sin(dLng / 2);
  const h = sinDlat * sinDlat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDlng * sinDlng;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function toRad(deg: number) { return deg * Math.PI / 180; }

// Check if position is inside a zone
export function isInsideZone(pos: GeoPosition, zone: GeofenceZone): boolean {
  const dist = distanceMeters(pos, { lat: zone.latitude, lng: zone.longitude });
  return dist <= zone.radius;
}

// Get current position as a promise
export function getCurrentPosition(): Promise<GeoPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

// Watch position continuously
export function watchPosition(
  onPosition: (pos: GeoPosition) => void,
  onError?: (err: GeolocationPositionError) => void
): number {
  return navigator.geolocation.watchPosition(
    (pos) => onPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
    onError,
    { enableHighAccuracy: true, maximumAge: 10000 }
  );
}
