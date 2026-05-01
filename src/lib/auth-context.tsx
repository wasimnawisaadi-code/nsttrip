import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isInsideZone, watchPosition, type GeoPosition, type GeofenceZone } from '@/lib/geofence';
import type { User, Session } from '@supabase/supabase-js';
import { toast } from 'sonner';

interface Profile {
  id: string;
  user_id: string;
  name: string;
  email: string;
  mobile: string | null;
  passport_no: string | null;
  emirates_id: string | null;
  photo_url: string | null;
  profile_type: 'office' | 'sales';
  allowed_ips: string[];
  base_salary: number;
  leave_balance: number;
  status: string;
  assigned_zone_id: string | null;
}

export type AppRole = 'superadmin' | 'admin' | 'employee';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: AppRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  isAdmin: boolean;       // true for admin OR superadmin
  isSuperAdmin: boolean;  // true only for superadmin
  isInZone: boolean | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [isInZone, setIsInZone] = useState<boolean | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const [browserSessionId] = useState(() => crypto.randomUUID());

  const fetchProfile = async (userId: string) => {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (profileData) setProfile(profileData as unknown as Profile);

    // A user may have multiple roles; pick the highest-privilege one.
    const { data: rolesData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);

    const roleSet = new Set((rolesData || []).map((r: any) => r.role as string));
    const userRole: AppRole = roleSet.has('superadmin')
      ? 'superadmin'
      : roleSet.has('admin')
        ? 'admin'
        : 'employee';
    setRole(userRole);

    // Single-device login enforcement (Employees only)
    if (userRole === 'employee') {
      await supabase.from('profiles').update({ current_session_id: browserSessionId }).eq('user_id', userId);
    }

    // Start geofence watching only for plain employees with assigned zones
    if (userRole === 'employee' && profileData?.assigned_zone_id) {
      startZoneWatching(profileData.assigned_zone_id as string, profileData.profile_type as string, userId);
    } else {
      setIsInZone(true); // No restriction
    }
  };

  const startZoneWatching = async (zoneId: string, profileType: string, userId: string) => {
    // Honor settings: skip watching if geofence is disabled or auto-logout is off
    const { getAttendanceSettings } = await import('@/lib/settings');
    const settings = await getAttendanceSettings(userId);
    if (settings.enforce_geofence === false || settings.auto_logout_outside_zone === false) {
      setIsInZone(true);
      return;
    }

    const { data: zone } = await supabase
      .from('geofence_zones')
      .select('*')
      .eq('id', zoneId)
      .eq('is_active', true)
      .single();

    if (!zone) { setIsInZone(true); return; }

    const geoZone = zone as unknown as GeofenceZone;

    // Watch position and auto-logout if leaving zone (office employees)
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }

    watchIdRef.current = watchPosition(
      (pos: GeoPosition) => {
        const inside = isInsideZone(pos, geoZone);
        setIsInZone(inside);
        if (!inside && profileType === 'office') {
          toast.error('You have left the authorized zone. Auto-logging out...');
          setTimeout(() => signOut(), 3000);
        }
      },
      () => { /* ignore errors during watching */ }
    );
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          setTimeout(() => fetchProfile(session.user.id), 0);
        } else {
          setProfile(null);
          setRole(null);
          setIsInZone(null);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  // Listen for session changes (Single device login)
  useEffect(() => {
    if (user && role === 'employee') {
      const channel = supabase.channel(`session-${user.id}`)
        .on('postgres_changes', { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'profiles', 
          filter: `user_id=eq.${user.id}` 
        }, (payload) => {
          const dbSessionId = payload.new.current_session_id;
          if (dbSessionId && dbSessionId !== browserSessionId) {
            toast.error('Logged in from another device. Signing out...');
            setTimeout(() => signOut(), 2500);
          }
        })
        .subscribe();
      
      return () => { channel.unsubscribe(); };
    }
  }, [user, role, browserSessionId]);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    if (data.user) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('status')
        .eq('user_id', data.user.id)
        .maybeSingle();
      if (prof && prof.status === 'inactive') {
        await supabase.auth.signOut();
        return { error: 'Your account is deactivated. Please contact your administrator.' };
      }
    }
    return { error: null };
  };

  const signOut = async () => {
    // Stop watching
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    // Admins are bosses — skip attendance logging on logout
    const isAdminLike = role === 'admin' || role === 'superadmin';
    if (user && !isAdminLike) {
      const today = new Date().toISOString().split('T')[0];
      const { data: todayRecord } = await supabase
        .from('attendance')
        .select('*')
        .eq('employee_id', user.id)
        .eq('date', today)
        .is('logout_time', null)
        .maybeSingle();

      if (todayRecord && todayRecord.login_time) {
        const logoutTime = new Date().toISOString();
        const loginDate = new Date(todayRecord.login_time as string);
        const logoutDate = new Date(logoutTime);
        const hoursWorked = Math.round(((logoutDate.getTime() - loginDate.getTime()) / 3600000) * 10) / 10;

        // Get current position for logout location
        let logoutLat = null, logoutLng = null;
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
          });
          logoutLat = pos.coords.latitude;
          logoutLng = pos.coords.longitude;
        } catch { /* ignore */ }

        await supabase
          .from('attendance')
          .update({
            logout_time: logoutTime,
            hours_worked: hoursWorked,
            logout_lat: logoutLat,
            logout_lng: logoutLng,
          } as any)
          .eq('id', todayRecord.id);
      }
    }
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{
      user, session, profile, role, loading,
      signIn, signOut,
      isAdmin: role === 'admin' || role === 'superadmin',
      isSuperAdmin: role === 'superadmin',
      isInZone,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
