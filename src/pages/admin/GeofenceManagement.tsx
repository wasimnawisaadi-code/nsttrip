import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { MapPin, Users, Activity, ChevronDown, ChevronUp, Save, Plus, Trash2, Navigation, Edit2 } from 'lucide-react';
import { toast } from 'sonner';
import ZoneMapPicker from '@/components/ZoneMapPicker';
import {
  getAttendanceSettings,
  getAttendanceOverrides,
  saveAttendanceOverrides,
  invalidateAttendanceCache,
  DEFAULT_ATTENDANCE,
  type AttendanceSettings,
  type EmployeeOverride,
  type AttendanceOverrides,
} from '@/lib/settings';

interface Zone {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
  zone_type: string;
  is_active: boolean;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function GeofenceManagement() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [todayAtt, setTodayAtt] = useState<Record<string, any>>({});
  const [search, setSearch] = useState('');

  const [att, setAtt] = useState<AttendanceSettings>(DEFAULT_ATTENDANCE);
  const [overrides, setOverrides] = useState<AttendanceOverrides>({});

  const [expanded, setExpanded] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Zone create/edit form
  const [showZoneForm, setShowZoneForm] = useState(false);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  // Default Dubai centre — overridden as soon as we have geolocation or click
  const [zForm, setZForm] = useState({ name: '', latitude: 25.2048, longitude: 55.2708, radius: 100 });

  const loadZones = async () => {
    const { data } = await supabase.from('geofence_zones').select('*').order('created_at', { ascending: false });
    setZones((data as any[]) || []);
  };

  const loadEmployees = async () => {
    const { data: roles } = await supabase.from('user_roles').select('user_id, role');
    const adminIds = new Set((roles || []).filter((r: any) => r.role === 'admin').map((r: any) => r.user_id));
    const { data } = await supabase.from('profiles').select('id, user_id, name, email, profile_type, assigned_zone_id, photo_url').eq('status', 'active');
    setEmployees((data || []).filter((e: any) => !adminIds.has(e.user_id)));
  };

  const loadTodayAttendance = async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase.from('attendance').select('employee_id, login_time, logout_time, login_lat, login_lng, login_location_status, status').eq('date', today);
    const map: Record<string, any> = {};
    (data || []).forEach((a: any) => { map[a.employee_id] = a; });
    setTodayAtt(map);
  };

  useEffect(() => {
    loadZones();
    loadEmployees();
    loadTodayAttendance();
    getAttendanceSettings().then(setAtt);
    getAttendanceOverrides().then(setOverrides);
    const i = setInterval(loadTodayAttendance, 30000);
    return () => clearInterval(i);
  }, []);

  const filteredEmployees = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return employees;
    return employees.filter(e => (e.name || '').toLowerCase().includes(q) || (e.email || '').toLowerCase().includes(q));
  }, [employees, search]);

  const liveCount = employees.filter(e => {
    const a = todayAtt[e.user_id];
    return a && a.login_time && !a.logout_time;
  }).length;

  // ---- Zone CRUD ----
  const openNewZone = () => {
    setEditingZoneId(null);
    setZForm({ name: '', latitude: 25.2048, longitude: 55.2708, radius: 100 });
    setShowZoneForm(true);
    // Try to centre on user's current location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => setZForm(f => ({ ...f, latitude: p.coords.latitude, longitude: p.coords.longitude })),
        () => {}
      );
    }
  };

  const openEditZone = (z: Zone) => {
    setEditingZoneId(z.id);
    setZForm({ name: z.name, latitude: z.latitude, longitude: z.longitude, radius: z.radius });
    setShowZoneForm(true);
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) return toast.error('Geolocation not supported');
    navigator.geolocation.getCurrentPosition(
      (p) => setZForm(f => ({ ...f, latitude: p.coords.latitude, longitude: p.coords.longitude })),
      () => toast.error('Could not get location')
    );
  };

  const saveZone = async () => {
    if (!zForm.name.trim()) return toast.error('Zone name is required');
    const payload = {
      name: zForm.name.trim(),
      latitude: Number(zForm.latitude),
      longitude: Number(zForm.longitude),
      radius: Number(zForm.radius) || 100,
      zone_type: 'office',
      is_active: true,
    };
    const { error } = editingZoneId
      ? await supabase.from('geofence_zones').update(payload).eq('id', editingZoneId)
      : await supabase.from('geofence_zones').insert(payload);
    if (error) return toast.error(error.message);
    toast.success(editingZoneId ? 'Zone updated' : 'Zone created');
    setShowZoneForm(false);
    setEditingZoneId(null);
    loadZones();
  };

  const deleteZone = async (id: string) => {
    if (!confirm('Delete this zone? Employees assigned to it will lose their zone.')) return;
    const { error } = await supabase.from('geofence_zones').delete().eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Zone deleted');
    loadZones();
    loadEmployees();
  };

  // ---- Per-employee save ----
  const saveEmployee = async (emp: any, patch: { zoneId?: string | null; ov?: EmployeeOverride }) => {
    setSavingId(emp.id);
    try {
      if (patch.zoneId !== undefined) {
        const { error } = await supabase.from('profiles').update({ assigned_zone_id: patch.zoneId }).eq('id', emp.id);
        if (error) throw error;
        setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, assigned_zone_id: patch.zoneId } : e));
      }
      if (patch.ov !== undefined) {
        const cleaned: EmployeeOverride = {};
        Object.entries(patch.ov).forEach(([k, v]) => {
          if (v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0 && k !== 'weekend_days')) {
            (cleaned as any)[k] = v;
          }
        });
        const next = { ...overrides, [emp.user_id]: cleaned };
        if (Object.keys(cleaned).length === 0) delete next[emp.user_id];
        const { error } = await saveAttendanceOverrides(next);
        if (error) throw error;
        setOverrides(next);
        invalidateAttendanceCache();
      }
      toast.success('Saved');
    } catch (e: any) {
      toast.error(e.message || 'Failed to save');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold font-display">Geofence Control Room</h2>
          <p className="text-sm text-muted-foreground">Assign a zone & schedule per employee. They can only login from inside their zone.</p>
        </div>
        <div className="px-3 py-1.5 rounded-full bg-success/10 text-success text-xs font-medium flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5" /> {liveCount} active now
        </div>
      </div>

      {/* ZONES */}
      <div className="card-nawi space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary" />
            <h3 className="font-semibold font-display">Zones ({zones.length})</h3>
          </div>
          <button className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1" onClick={() => showZoneForm ? setShowZoneForm(false) : openNewZone()}>
            <Plus className="w-3.5 h-3.5" /> {showZoneForm ? 'Close' : 'New Zone'}
          </button>
        </div>

        {showZoneForm && (
          <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/30">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                className="input-nawi text-sm py-1.5 sm:col-span-2"
                placeholder="Zone name (e.g. HQ Office)"
                value={zForm.name}
                onChange={e => setZForm(f => ({ ...f, name: e.target.value }))}
              />
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground whitespace-nowrap">Radius</label>
                <input
                  className="input-nawi text-sm py-1.5 flex-1"
                  type="number"
                  min={20}
                  max={5000}
                  value={zForm.radius}
                  onChange={e => setZForm(f => ({ ...f, radius: Math.max(20, Number(e.target.value) || 100) }))}
                />
                <span className="text-xs text-muted-foreground">m</span>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              <strong>Click anywhere on the map</strong> or <strong>drag the pin</strong> to set the zone centre. Blue circle = effective area employees must be inside to log in.
            </p>

            <ZoneMapPicker
              lat={zForm.latitude}
              lng={zForm.longitude}
              radius={zForm.radius}
              onChange={(lat, lng) => setZForm(f => ({ ...f, latitude: lat, longitude: lng }))}
              extraZones={zones.filter(z => z.id !== editingZoneId)}
              height={340}
            />

            <div className="flex flex-wrap gap-2 items-center justify-between">
              <p className="text-[11px] text-muted-foreground font-mono">
                {zForm.latitude.toFixed(6)}, {zForm.longitude.toFixed(6)} · {zForm.radius}m
              </p>
              <div className="flex gap-2">
                <button className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1" onClick={useMyLocation}>
                  <Navigation className="w-3.5 h-3.5" /> Use my location
                </button>
                <button className="btn-primary text-xs py-1.5 px-3" onClick={saveZone}>
                  {editingZoneId ? 'Update Zone' : 'Create Zone'}
                </button>
              </div>
            </div>
          </div>
        )}

        {zones.length === 0 ? (
          <p className="text-xs text-muted-foreground py-3 text-center">No zones yet. Create one to enforce location-based login.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {zones.map(z => (
              <div key={z.id} className="border border-border rounded-lg px-3 py-2 flex items-center justify-between text-sm gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{z.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{z.latitude.toFixed(4)}, {z.longitude.toFixed(4)} · {z.radius}m</p>
                </div>
                <button className="text-primary hover:bg-primary/10 p-1.5 rounded flex-shrink-0" title="Edit zone on map" onClick={() => openEditZone(z)}>
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button className="text-destructive hover:bg-destructive/10 p-1.5 rounded flex-shrink-0" onClick={() => deleteZone(z.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* EMPLOYEE CONTROL ROOM */}
      <div className="card-nawi space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            <h3 className="font-semibold font-display">All Employees ({employees.length})</h3>
          </div>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search employee…"
            className="input-nawi text-sm py-1.5 w-56"
          />
        </div>

        <p className="text-xs text-muted-foreground">
          Click an employee to assign their <strong>Zone</strong> & <strong>Schedule</strong>. They can only log in if they are physically inside their zone (when geofence is enforced).
        </p>

        {filteredEmployees.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No employees found.</p>
        ) : (
          <div className="space-y-2">
            {filteredEmployees.map(emp => {
              const ov = overrides[emp.user_id] || {};
              const hasOverride = Object.keys(ov).length > 0;
              const zone = zones.find(z => z.id === emp.assigned_zone_id);
              const att2 = todayAtt[emp.user_id];
              const isLive = att2 && att2.login_time && !att2.logout_time;
              const enforce = ov.enforce_geofence !== false;
              const autoLogout = ov.auto_logout_outside_zone ?? att.auto_logout_outside_zone;
              const ws = ov.work_start || att.work_start;
              const we = ov.work_end || att.work_end;
              const grace = ov.grace_minutes ?? att.grace_minutes;
              const weekend = ov.weekend_days || att.weekend_days;
              const isOpen = expanded === emp.id;

              return (
                <div key={emp.id} className="border border-border rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpanded(isOpen ? null : emp.id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
                  >
                    {emp.photo_url ? <img src={emp.photo_url} className="w-10 h-10 rounded-full object-cover flex-shrink-0" alt="" /> :
                      <div className="w-10 h-10 rounded-full bg-secondary text-secondary-foreground text-xs flex items-center justify-center font-bold flex-shrink-0">{(emp.name || '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</div>}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate">{emp.name}</p>
                        {isLive && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-success/15 text-success font-medium">● LIVE</span>}
                        {hasOverride && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">CUSTOM</span>}
                        {!enforce && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-warning/10 text-warning font-medium">GEOFENCE OFF</span>}
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {zone ? <><MapPin className="w-2.5 h-2.5 inline" /> {zone.name} ({zone.radius}m)</> : <span className="text-warning">No zone assigned</span>}
                        <span className="mx-1.5">•</span>
                        {ws}–{we} · {grace}m grace
                      </p>
                    </div>
                    {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </button>

                  {isOpen && (
                    <EmployeeEditor
                      emp={emp}
                      zones={zones}
                      defaults={att}
                      currentOv={ov}
                      saving={savingId === emp.id}
                      onSave={(zoneId, newOv) => saveEmployee(emp, { zoneId, ov: newOv })}
                      onReset={() => saveEmployee(emp, { ov: {} })}
                      weekend={weekend}
                      autoLogout={autoLogout}
                      enforce={enforce}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ============= Inline editor =============
function EmployeeEditor({
  emp, zones, defaults, currentOv, saving, onSave, onReset,
}: {
  emp: any;
  zones: Zone[];
  defaults: AttendanceSettings;
  currentOv: EmployeeOverride;
  saving: boolean;
  onSave: (zoneId: string | null, ov: EmployeeOverride) => void;
  onReset: () => void;
  weekend: number[];
  autoLogout: boolean;
  enforce: boolean;
}) {
  const [zoneId, setZoneId] = useState<string>(emp.assigned_zone_id || '');
  const [ov, setOv] = useState<EmployeeOverride>(currentOv);

  // Re-sync when parent state changes (e.g. after a save committed to the server)
  useEffect(() => { setZoneId(emp.assigned_zone_id || ''); }, [emp.assigned_zone_id]);
  useEffect(() => { setOv(currentOv); }, [JSON.stringify(currentOv)]);

  const set = (patch: Partial<EmployeeOverride>) => setOv(o => ({ ...o, ...patch }));

  const enforce = ov.enforce_geofence !== false;
  const autoLogout = ov.auto_logout_outside_zone ?? defaults.auto_logout_outside_zone;
  const weekend = ov.weekend_days || defaults.weekend_days;

  const toggleDay = (d: number) => {
    const next = weekend.includes(d) ? weekend.filter(x => x !== d) : [...weekend, d].sort();
    set({ weekend_days: next });
  };

  const selectedZone = zones.find(z => z.id === zoneId);

  return (
    <div className="border-t border-border bg-muted/20 p-4 space-y-4">
      {/* ZONE */}
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Assigned Zone</label>
        <select className="input-nawi text-sm py-1.5 w-full" value={zoneId} onChange={e => setZoneId(e.target.value)}>
          <option value="">— No zone (cannot login if geofence ON) —</option>
          {zones.map(z => (
            <option key={z.id} value={z.id}>{z.name} · {z.radius}m</option>
          ))}
        </select>
        {selectedZone && (
          <ZoneMapPicker
            lat={selectedZone.latitude}
            lng={selectedZone.longitude}
            radius={selectedZone.radius}
            onChange={() => {}}
            readOnly
            height={200}
          />
        )}
      </div>

      {/* TOGGLES */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Toggle
          label="Enforce Geofence"
          hint="If ON, employee can only log in from inside their zone."
          checked={enforce}
          onChange={(v) => set({ enforce_geofence: v ? undefined : false })}
        />
        <Toggle
          label="Auto-logout if leaves zone"
          hint="Force logout when employee exits the zone during the day."
          checked={autoLogout}
          onChange={(v) => set({ auto_logout_outside_zone: v })}
        />
      </div>

      {/* SCHEDULE */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Work Start" hint={`Default: ${defaults.work_start}`}>
          <input type="time" className="input-nawi text-sm py-1.5 w-full" value={ov.work_start || ''} onChange={e => set({ work_start: e.target.value || undefined })} />
        </Field>
        <Field label="Work End" hint={`Default: ${defaults.work_end}`}>
          <input type="time" className="input-nawi text-sm py-1.5 w-full" value={ov.work_end || ''} onChange={e => set({ work_end: e.target.value || undefined })} />
        </Field>
        <Field label="Grace (min)" hint={`Default: ${defaults.grace_minutes}m`}>
          <input type="number" min={0} max={120} className="input-nawi text-sm py-1.5 w-full"
            value={ov.grace_minutes ?? ''}
            placeholder={String(defaults.grace_minutes)}
            onChange={e => set({ grace_minutes: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) || 0) })} />
        </Field>
      </div>

      {/* WEEKEND */}
      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Weekend Days</label>
        <div className="flex gap-1.5 mt-1.5 flex-wrap">
          {WEEKDAYS.map((d, i) => (
            <button
              key={i}
              type="button"
              onClick={() => toggleDay(i)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                weekend.includes(i) ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border hover:bg-muted'
              }`}
            >{d}</button>
          ))}
        </div>
      </div>

      {/* ACTIONS */}
      <div className="flex items-center justify-between pt-2 border-t border-border flex-wrap gap-2">
        <button
          className="text-xs text-muted-foreground hover:text-destructive"
          onClick={onReset}
          disabled={saving}
        >
          Reset to defaults
        </button>
        <button
          className="btn-primary text-xs py-1.5 px-4 flex items-center gap-1.5"
          onClick={() => onSave(zoneId || null, ov)}
          disabled={saving}
        >
          <Save className="w-3.5 h-3.5" />
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</label>
      <div className="mt-1">{children}</div>
      {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-3 border border-border rounded-lg px-3 py-2 bg-background">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-muted-foreground/30'}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}
