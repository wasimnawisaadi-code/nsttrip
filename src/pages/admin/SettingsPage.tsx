import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { 
  getAttendanceSettings, 
  saveAttendanceSettings, 
  DEFAULT_ATTENDANCE, 
  type AttendanceSettings,
  getSecuritySettings,
  saveSecuritySettings,
  DEFAULT_SECURITY,
  type SecuritySettings
} from '@/lib/settings';
import { auditLog } from '@/lib/supabase-service';
import { Clock, Save, AlertCircle, Database, RotateCcw, Shield, Lock, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function SettingsPage() {
  const { user } = useAuth();
  const [att, setAtt] = useState<AttendanceSettings>(DEFAULT_ATTENDANCE);
  const [sec, setSec] = useState<SecuritySettings>(DEFAULT_SECURITY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingSec, setSavingSec] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    Promise.all([
      getAttendanceSettings(),
      getSecuritySettings()
    ]).then(([a, s]) => { 
      setAtt(a); 
      setSec(s);
      setLoading(false); 
    });
  }, []);

  const toggleDay = (d: number) => {
    setAtt(s => ({ ...s, weekend_days: s.weekend_days.includes(d) ? s.weekend_days.filter(x => x !== d) : [...s.weekend_days, d].sort() }));
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await saveAttendanceSettings(att, user?.id);
    setSaving(false);
    if (error) { toast.error('Failed to save attendance settings'); return; }
    await auditLog('settings_updated', 'app_settings', 'attendance', att as unknown as Record<string, unknown>);
    toast.success('Attendance settings saved');
  };

  const handleSaveSecurity = async () => {
    setSavingSec(true);
    const { error } = await saveSecuritySettings(sec, user?.id);
    setSavingSec(false);
    if (error) { toast.error('Failed to save security settings'); return; }
    await auditLog('settings_updated', 'app_settings', 'security', sec as unknown as Record<string, unknown>);
    toast.success('Security settings updated successfully');
  };

  if (loading) return <div className="text-center py-12 text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div>
        <h2 className="text-lg font-bold font-display">System Settings</h2>
        <p className="text-sm text-muted-foreground">Configure CRM-wide rules. Changes apply immediately to new attendance entries.</p>
      </div>

      <div className="card-nawi space-y-5">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" />
          <h3 className="font-semibold font-display">Attendance Rules</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Work Start Time</label>
            <input type="time" value={att.work_start} onChange={e => setAtt(s => ({ ...s, work_start: e.target.value }))} className="input-nawi" />
            <p className="text-xs text-muted-foreground mt-1">Standard daily start time.</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Grace Period (minutes)</label>
            <input type="number" min={0} max={120} value={att.grace_minutes}
              onChange={e => setAtt(s => ({ ...s, grace_minutes: Math.max(0, Number(e.target.value) || 0) }))}
              className="input-nawi" />
            <p className="text-xs text-muted-foreground mt-1">Logins within this window are still marked Present.</p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Weekend Days</label>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((d, i) => (
              <button key={d} type="button" onClick={() => toggleDay(i)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${att.weekend_days.includes(i) ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:border-primary/50'}`}>
                {d}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">UAE default: Friday & Saturday.</p>
        </div>

        <div className="bg-warning/10 border border-warning/20 rounded-lg p-3 flex gap-2 text-xs text-foreground/80">
          <AlertCircle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
          <p>Cutoff for Present: <strong>{att.work_start}</strong> + <strong>{att.grace_minutes} min</strong>. Logins after this time are marked <strong>Late</strong>.</p>
        </div>

        <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">
          <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Settings'}
        </button>
      {/* Advanced Security Settings */}
      <div className="card-nawi space-y-5 border-primary/20 bg-primary/5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          <h3 className="font-semibold font-display">Advanced Security & Privacy</h3>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-card border border-border rounded-xl">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Require Admin Password</span>
              </div>
              <p className="text-xs text-muted-foreground">Ask for admin password before revealing sensitive credentials in Password Manager.</p>
            </div>
            <button 
              onClick={() => setSec(s => ({ ...s, require_admin_password_for_passwords: !s.require_admin_password_for_passwords }))}
              className={`w-12 h-6 rounded-full transition-colors relative ${sec.require_admin_password_for_passwords ? 'bg-primary' : 'bg-muted'}`}
            >
              <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${sec.require_admin_password_for_passwords ? 'translate-x-6' : ''}`} />
            </button>
          </div>

          <div className="flex items-center justify-between p-3 bg-card border border-border rounded-xl">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Numeric Captcha Verification</span>
              </div>
              <p className="text-xs text-muted-foreground">Require solving a math puzzle after password confirmation for extra bot protection.</p>
            </div>
            <button 
              onClick={() => setSec(s => ({ ...s, require_captcha_for_passwords: !s.require_captcha_for_passwords }))}
              className={`w-12 h-6 rounded-full transition-colors relative ${sec.require_captcha_for_passwords ? 'bg-primary' : 'bg-muted'}`}
            >
              <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${sec.require_captcha_for_passwords ? 'translate-x-6' : ''}`} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Session Timeout (minutes)</label>
              <input 
                type="number" 
                min={1} 
                max={1440} 
                value={sec.session_timeout_min}
                onChange={e => setSec(s => ({ ...s, session_timeout_min: Math.max(1, Number(e.target.value) || 1) }))}
                className="input-nawi" 
              />
              <p className="text-xs text-muted-foreground mt-1">Automatic session expiry after inactivity.</p>
            </div>
          </div>
        </div>

        <button onClick={handleSaveSecurity} disabled={savingSec} className="btn-primary text-sm shadow-lg shadow-primary/20">
          <Save className="w-4 h-4" /> {savingSec ? 'Updating…' : 'Update Security Settings'}
        </button>
      </div>

      <div className="card-nawi space-y-5">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-secondary" />
          <h3 className="font-semibold font-display">System Maintenance</h3>
        </div>

        <div className="space-y-3">
          <p className="text-sm text-foreground/80">Synchronize database templates and system-defined modules.</p>
          <button 
            onClick={async () => {
              setSyncing(true);
              try {
                const template = {
                  template_key: 'group_sheets',
                  name: 'Group Sheets',
                  icon: '📋',
                  description: 'Group flight bookings and sheets',
                  columns: [
                    {"key":"s_no","label":"S.NO","type":"text"},
                    {"key":"pax_name","label":"PAX NAME","type":"text","required":true},
                    {"key":"travel_details","label":"TRAVEL DATE FLIGHT DETAILS","type":"text"},
                    {"key":"issue_for","label":"ISSUE FOR","type":"text"},
                    {"key":"fare","label":"FARE","type":"number","financial":"cost"},
                    {"key":"sell","label":"SELL","type":"number","financial":"sale"},
                    {"key":"issue_date","label":"ISSUE DATE","type":"date"},
                    {"key":"pnr","label":"PNR","type":"text"},
                    {"key":"time_limit","label":"TIME LIMIT","type":"text"},
                    {"key":"dep_time","label":"DEP TIME","type":"text"},
                    {"key":"arr_time","label":"ARR TIME","type":"text"},
                    {"key":"issued_by","label":"ISSUED BY","type":"text"},
                    {"key":"remarks","label":"REMARKS","type":"textarea"}
                  ],
                  is_active: true
                };

                const { error } = await supabase
                  .from('dsr_templates')
                  .upsert(template, { onConflict: 'template_key' });

                if (error) throw error;
                toast.success('DSR Templates synchronized successfully');
              } catch (err: any) {
                console.error(err);
                toast.error('Failed to sync: ' + (err.message || 'Unknown error'));
              } finally {
                setSyncing(false);
              }
            }} 
            disabled={syncing} 
            className="btn-outline text-xs h-9"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} /> 
            {syncing ? 'Syncing...' : 'Sync DSR Templates'}
          </button>
        </div>
      </div>
    </div>
  );
}
