import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getCurrentPosition, isInsideZone, watchPosition, type GeoPosition, type GeofenceZone } from '@/lib/geofence';

interface UseGeofenceOptions {
  userId: string | undefined;
  profileType: 'office' | 'sales' | null;
  assignedZoneId: string | null;
  enabled: boolean;
}

export function useGeofence({ userId, profileType, assignedZoneId, enabled }: UseGeofenceOptions) {
  const [position, setPosition] = useState<GeoPosition | null>(null);
  const [zone, setZone] = useState<GeofenceZone | null>(null);
  const [isInZone, setIsInZone] = useState<boolean | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const watchIdRef = useRef<number | null>(null);

  // Load assigned zone
  useEffect(() => {
    if (!assignedZoneId || !enabled) return;
    supabase.from('geofence_zones').select('*').eq('id', assignedZoneId).eq('is_active', true).single()
      .then(({ data }) => { if (data) setZone(data as unknown as GeofenceZone); });
  }, [assignedZoneId, enabled]);

  // Check position against zone
  const checkPosition = useCallback(async () => {
    if (!enabled) { setIsInZone(true); return true; }
    if (!zone) {
      // No zone assigned = no restriction
      setIsInZone(true);
      return true;
    }

    setChecking(true);
    setLocationError(null);
    try {
      const pos = await getCurrentPosition();
      setPosition(pos);
      const inside = isInsideZone(pos, zone);
      setIsInZone(inside);
      setChecking(false);
      return inside;
    } catch (err: any) {
      setLocationError(err.message || 'Location access denied');
      setIsInZone(false);
      setChecking(false);
      return false;
    }
  }, [zone, enabled]);

  // Start watching position for auto-logout
  const startWatching = useCallback((onLeaveZone: () => void) => {
    if (!zone || watchIdRef.current !== null) return;
    watchIdRef.current = watchPosition(
      (pos) => {
        setPosition(pos);
        const inside = isInsideZone(pos, zone);
        setIsInZone(inside);
        if (!inside) {
          onLeaveZone();
        }
      },
      (err) => setLocationError(err.message)
    );
  }, [zone]);

  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  useEffect(() => () => stopWatching(), [stopWatching]);

  return { position, zone, isInZone, locationError, checking, checkPosition, startWatching, stopWatching };
}
