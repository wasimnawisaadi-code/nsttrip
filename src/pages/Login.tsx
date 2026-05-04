import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Plane, Globe, Hotel, Shield, MapPin, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { recordLoginAttendance, generateDailyNotifications } from '@/lib/supabase-service';
import { getCurrentPosition, isInsideZone } from '@/lib/geofence';
import { supabase } from '@/integrations/supabase/client';
const logo = "/favicon.png";

export default function Login() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [locationStatus, setLocationStatus] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    setLocationStatus('');

    const { error: loginError } = await signIn(email, password);
    if (loginError) {
      setError(loginError);
      setLoading(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError('Login failed'); setLoading(false); return; }

    // Get role(s) & profile — pick highest privilege
    const [{ data: rolesData }, { data: profileData }] = await Promise.all([
      supabase.from('user_roles').select('role').eq('user_id', user.id),
      supabase.from('profiles').select('profile_type, assigned_zone_id').eq('user_id', user.id).single(),
    ]);

    const roleSet = new Set((rolesData || []).map((r: any) => r.role as string));
    const role = roleSet.has('superadmin') ? 'superadmin' : roleSet.has('admin') ? 'admin' : 'employee';
    const isAdminLike = role === 'admin' || role === 'superadmin';
    const profileType = profileData?.profile_type || 'office';
    const assignedZoneId = profileData?.assigned_zone_id;

    // Geofence check — for plain employees, respecting global + per-employee overrides
    let loginLat: number | null = null;
    let loginLng: number | null = null;
    let locationStatusText = 'no_zone';

    if (!isAdminLike) {
      const { getAttendanceSettings } = await import('@/lib/settings');
      const settings = await getAttendanceSettings(user.id);
      const enforce = settings.enforce_geofence !== false;

      if (enforce) {
        // Resolve zone(s) to check: 1) employee-specific  2) global default  3) all active office zones
        let zonesToCheck: any[] = [];
        if (assignedZoneId) {
          const { data: zone } = await supabase
            .from('geofence_zones').select('*').eq('id', assignedZoneId).eq('is_active', true).maybeSingle();
          if (zone) zonesToCheck = [zone];
        } else if (settings.default_zone_id) {
          const { data: zone } = await supabase
            .from('geofence_zones').select('*').eq('id', settings.default_zone_id).eq('is_active', true).maybeSingle();
          if (zone) zonesToCheck = [zone];
        } else {
          // If no specific zone and no default zone, allow login from anywhere (unrestricted)
          zonesToCheck = [];
        }

        if (zonesToCheck.length > 0) {
          setLocationStatus('Checking your location...');
          try {
            const pos = await getCurrentPosition();
            loginLat = pos.lat;
            loginLng = pos.lng;

            const matchedZone = zonesToCheck.find((z) => isInsideZone(pos, z as any));
            if (matchedZone) {
              locationStatusText = 'inside_zone';
            } else {
              if (profileType === 'office') {
                const zoneNames = zonesToCheck.map((z) => `${z.name} (${z.radius}m)`).join(', ');
                await supabase.auth.signOut();
                setError(`🚫 Unauthorized zone — login blocked. You must be physically inside: ${zoneNames}. Move to your authorized location and try again.`);
                setLoading(false);
                setLocationStatus('');
                return;
              }
              locationStatusText = 'outside_zone';
            }
          } catch {
            if (profileType === 'office') {
              await supabase.auth.signOut();
              setError('Location access is required for office employees. Please enable location services and try again.');
              setLoading(false);
              setLocationStatus('');
              return;
            }
            locationStatusText = 'location_denied';
          }
        }
      }
    }

    // Admins are bosses — never tracked in attendance
    if (!isAdminLike) {
      setLocationStatus('Recording attendance...');
      await recordLoginAttendanceWithLocation(user.id, loginLat, loginLng, locationStatusText);
    }
    await generateDailyNotifications(user.id, isAdminLike);

    navigate(isAdminLike ? '/admin/dashboard' : '/employee/dashboard');
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary flex-col items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20"><Plane className="w-16 h-16 text-primary-foreground" /></div>
          <div className="absolute top-40 right-32"><Globe className="w-20 h-20 text-primary-foreground" /></div>
          <div className="absolute bottom-32 left-40"><Hotel className="w-14 h-14 text-primary-foreground" /></div>
          <div className="absolute bottom-20 right-20"><Shield className="w-18 h-18 text-primary-foreground" /></div>
        </div>
        <div className="relative z-10 text-center px-12">
          <img src={logo} alt="Nawi Saadi" className="w-48 h-48 mx-auto mb-6 object-contain" />
          <h1 className="text-4xl font-bold text-primary-foreground font-display mb-2">NAWI SAADI</h1>
          <p className="text-xl text-primary-foreground/80 font-display mb-4">Travel & Tourism</p>
          <div className="w-16 h-0.5 bg-primary-foreground/30 mx-auto mb-6" />
          <p className="text-lg text-primary-foreground/60 italic">Powering Travel Excellence</p>
        </div>
      </div>

      {/* Right Panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md">
          <div className="lg:hidden text-center mb-8">
            <img src={logo} alt="Nawi Saadi" className="w-24 h-24 mx-auto mb-4 object-contain" />
            <h1 className="text-2xl font-bold text-primary font-display">NAWI SAADI</h1>
            <p className="text-sm text-muted-foreground">Travel & Tourism</p>
          </div>

          <h2 className="text-2xl font-bold text-foreground font-display mb-1">Welcome back</h2>
          <p className="text-muted-foreground mb-8">Sign in to your account</p>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Email Address</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="input-nawi" placeholder="you@nawisaadi.com" required autoComplete="off" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Password</label>
              <div className="relative">
                <input type={showPass ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                  className="input-nawi pr-10" placeholder="••••••••" required autoComplete="off" />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input type="checkbox" id="remember" checked={remember} onChange={(e) => setRemember(e.target.checked)}
                className="w-4 h-4 rounded border-border text-primary" />
              <label htmlFor="remember" className="text-sm text-muted-foreground">Remember me</label>
            </div>

            {error && (
              <div className="bg-destructive/10 text-destructive text-sm px-4 py-2.5 rounded-lg flex items-start gap-2">
                {error.includes('zone') && <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />}
                <span>{error}</span>
              </div>
            )}

            {locationStatus && (
              <div className="bg-primary/10 text-primary text-sm px-4 py-2.5 rounded-lg flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{locationStatus}</span>
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// Enhanced attendance with location.
// Same-day rules:
//   - First login of the day → create row (Present/Late based on grace)
//   - Logged out + re-login same day → clear logout_time so the session resumes (no double-counting)
//   - Already logged in (no logout) → leave as-is (idempotent)
async function recordLoginAttendanceWithLocation(
  userId: string, lat: number | null, lng: number | null, locationStatus: string
) {
  const today = new Date().toISOString().split('T')[0];
  const { getAttendanceSettings, classifyLogin, isWeekend } = await import('@/lib/settings');
  const settings = await getAttendanceSettings(userId);

  // Don't auto-create attendance on weekend days — they shouldn't count.
  if (isWeekend(new Date(), settings)) return;

  const { data: existing } = await supabase
    .from('attendance')
    .select('id, login_time, logout_time')
    .eq('employee_id', userId)
    .eq('date', today)
    .maybeSingle();

  const now = new Date();

  if (!existing) {
    const status = classifyLogin(now, settings);
    await supabase.from('attendance').insert({
      employee_id: userId,
      date: today,
      login_time: now.toISOString(),
      status,
      login_lat: lat,
      login_lng: lng,
      login_location_status: locationStatus,
    } as any);
    return;
  }

  // Re-login after a logout same day → resume the session
  if (existing.logout_time) {
    await supabase.from('attendance').update({
      logout_time: null,
      hours_worked: 0,
    } as any).eq('id', existing.id);
  }
  // Otherwise (already active) → no-op
}
