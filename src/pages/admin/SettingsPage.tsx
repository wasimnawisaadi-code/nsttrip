import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { getAttendanceSettings, saveAttendanceSettings, DEFAULT_ATTENDANCE, type AttendanceSettings } from '@/lib/settings';
import { auditLog } from '@/lib/supabase-service';
import { Clock, Save, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function SettingsPage() {
  const { user } = useAuth();
  const [att, setAtt] = useState<AttendanceSettings>(DEFAULT_ATTENDANCE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getAttendanceSettings().then(s => { setAtt(s); setLoading(false); });
  }, []);

  const toggleDay = (d: number) => {
    setAtt(s => ({ ...s, weekend_days: s.weekend_days.includes(d) ? s.weekend_days.filter(x => x !== d) : [...s.weekend_days, d].sort() }));
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await saveAttendanceSettings(att, user?.id);
    setSaving(false);
    if (error) { toast.error('Failed to save settings'); return; }
    await auditLog('settings_updated', 'app_settings', 'attendance', att as unknown as Record<string, unknown>);
    toast.success('Attendance settings saved');
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
      </div>
    </div>
  );
}
