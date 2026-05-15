import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit, Save, X, MapPin, Power, PowerOff, Trash2, Clock, Shield } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency, formatDate, auditLog, safeTime } from '@/lib/supabase-service';
import StatusBadge from '@/components/ui/StatusBadge';
import PasswordConfirmDialog from '@/components/PasswordConfirmDialog';
import { getAttendanceSettings, getAttendanceOverrides, saveAttendanceOverrides, type EmployeeOverride } from '@/lib/settings';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

export default function EmployeeProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [emp, setEmp] = useState<any>(null);
  const [empRole, setEmpRole] = useState<'admin' | 'superadmin' | 'employee'>('employee');
  const [tab, setTab] = useState('overview');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const [clients, setClients] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [leave, setLeave] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [pwdAction, setPwdAction] = useState<'save' | 'activate' | 'deactivate' | 'delete' | null>(null);
  const [zones, setZones] = useState<any[]>([]);
  const [globalAtt, setGlobalAtt] = useState<any>(null);
  const [override, setOverride] = useState<EmployeeOverride>({});
  const [savingZone, setSavingZone] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);

  useEffect(() => {
    const fetchAll = async () => {
      // id here is the profile id or user_id — try both
      let { data: profile } = await supabase.from('profiles').select('*').eq('user_id', id!).maybeSingle();
      if (!profile) {
        const res = await supabase.from('profiles').select('*').eq('id', id!).maybeSingle();
        profile = res.data;
      }
      if (!profile) return;

      // Detect role — admins are shown read-only (no delete/deactivate, no schedule edits)
      const { data: roleRows } = await supabase.from('user_roles').select('role').eq('user_id', profile.user_id);
      const roles = new Set((roleRows || []).map((r: any) => r.role));
      const detectedRole: 'admin' | 'superadmin' | 'employee' =
        roles.has('superadmin') ? 'superadmin' : roles.has('admin') ? 'admin' : 'employee';
      setEmpRole(detectedRole);

      setEmp(profile);
      setForm(profile);

      const userId = profile.user_id;
      const [cRes, tRes, aRes, lRes, gRes, zRes, ovAll, baseAtt] = await Promise.all([
        supabase.from('clients').select('*').or(`assigned_to.eq.${userId},created_by.eq.${userId}`),
        supabase.from('tasks').select('*').or(`assigned_to.eq.${userId},created_by.eq.${userId}`),
        supabase.from('attendance').select('*').eq('employee_id', userId).order('date', { ascending: false }).limit(50),
        supabase.from('leave_requests').select('*').eq('employee_id', userId).order('created_at', { ascending: false }),
        supabase.from('goals').select('*').or(`assigned_to.eq.${userId},assigned_to.is.null`),
        supabase.from('geofence_zones').select('*').eq('is_active', true).order('name'),
        getAttendanceOverrides(),
        getAttendanceSettings(),
      ]);
      setClients(cRes.data || []);
      setTasks(tRes.data || []);
      setAttendance(aRes.data || []);
      setLeave(lRes.data || []);
      setGoals(gRes.data || []);
      setZones(zRes.data || []);
      setGlobalAtt(baseAtt);
      setOverride(ovAll[userId] || {});
    };
    fetchAll();
  }, [id]);

  if (!emp) return <div className="skeleton-nawi h-64 w-full" />;

  const handleSave = async () => {
    const updates: any = { name: form.name, email: form.email, mobile: form.mobile, passport_no: form.passport_no, emirates_id: form.emirates_id, base_salary: Number(form.base_salary) || 0 };
    await supabase.from('profiles').update(updates).eq('id', emp.id);
    await auditLog('employee_updated', 'employee', emp.user_id, updates);
    setEmp({ ...emp, ...updates });
    setEditing(false);
    toast.success('Employee updated');
  };

  const runPwdAction = async () => {
    if (!pwdAction || !emp) return;
    if (pwdAction === 'save') return handleSave();
    if (pwdAction === 'activate') {
      await supabase.from('profiles').update({ status: 'active' }).eq('user_id', emp.user_id);
      await auditLog('employee_activated', 'employee', emp.user_id, { name: emp.name });
      setEmp({ ...emp, status: 'active' });
      toast.success('Activated');
    } else if (pwdAction === 'deactivate') {
      await supabase.from('profiles').update({ status: 'inactive' }).eq('user_id', emp.user_id);
      await auditLog('employee_deactivated', 'employee', emp.user_id, { name: emp.name });
      setEmp({ ...emp, status: 'inactive' });
      toast.success('Deactivated — login disabled');
    } else if (pwdAction === 'delete') {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-delete-employee`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ user_id: emp.user_id }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error || 'Delete failed'); return; }
      await auditLog('employee_deleted', 'employee', emp.user_id, { name: emp.name });
      toast.success('Employee deleted permanently');
      navigate('/admin/employees');
    }
  };

  const handleAssignZone = async (zoneId: string | null) => {
    setSavingZone(true);
    const { error } = await supabase.from('profiles').update({ assigned_zone_id: zoneId }).eq('id', emp.id);
    setSavingZone(false);
    if (error) { toast.error('Failed to assign zone'); return; }
    setEmp({ ...emp, assigned_zone_id: zoneId });
    await auditLog('employee_zone_assigned', 'employee', emp.user_id, { zone_id: zoneId });
    toast.success(zoneId ? 'Zone assigned' : 'Zone cleared');
  };

  const handleSaveSchedule = async () => {
    setSavingSchedule(true);
    const allOverrides = await getAttendanceOverrides();
    const cleaned: EmployeeOverride = { ...override };
    Object.keys(cleaned).forEach(k => {
      const v = (cleaned as any)[k];
      if (v === '' || v === undefined || v === null) delete (cleaned as any)[k];
    });
    const next = { ...allOverrides };
    if (Object.keys(cleaned).length === 0) delete next[emp.user_id]; else next[emp.user_id] = cleaned;
    const { error } = await saveAttendanceOverrides(next);
    setSavingSchedule(false);
    if (error) { toast.error('Save failed'); return; }
    await auditLog('employee_schedule_updated', 'employee', emp.user_id, cleaned as any);
    toast.success('Schedule saved');
  };

  const tabs = ['overview', 'clients', 'tasks', 'attendance', 'leave', 'goals'];
  const assignedZone = zones.find(z => z.id === emp?.assigned_zone_id);
  const effective = { ...(globalAtt || {}), ...override };

  const getMapsEmbed = (lat: number, lng: number, radius?: number) => {
    const zoom = radius ? Math.max(13, Math.min(18, 17 - Math.log2(radius / 50))) : 15;
    return `https://maps.google.com/maps?q=${lat},${lng}&z=${Math.round(zoom)}&output=embed`;
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <Link to="/admin/employees" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Back</Link>
      <div className="card-nawi flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="relative">
          {emp.photo_url ? (
            <img src={emp.photo_url} alt="" className="w-16 h-16 rounded-full object-cover" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-xl font-bold text-primary-foreground">
              {emp.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
            </div>
          )}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-foreground font-display">{emp.name}</h1>
            {empRole !== 'employee' && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20 inline-flex items-center gap-1">
                <Shield className="w-3 h-3" /> {empRole === 'superadmin' ? 'SUPERADMIN' : 'ADMIN'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <StatusBadge status={emp.status} />
            <span className="text-xs text-muted-foreground">Joined {formatDate(emp.created_at)}</span>
            {assignedZone ? (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium inline-flex items-center gap-1">
                <MapPin className="w-3 h-3" /> {assignedZone.name}
              </span>
            ) : (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-warning/10 text-warning font-medium inline-flex items-center gap-1">
                <MapPin className="w-3 h-3" /> Any location allowed
              </span>
            )}
            {Object.keys(override).length > 0 && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground font-medium">Custom schedule</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {empRole === 'employee' ? (
            <>
              {emp.status === 'active' ? (
                <button onClick={() => setPwdAction('deactivate')} className="btn-outline text-warning border-warning/30 hover:bg-warning/10"><PowerOff className="w-4 h-4" /> Deactivate</button>
              ) : (
                <button onClick={() => setPwdAction('activate')} className="btn-outline text-success border-success/30 hover:bg-success/10"><Power className="w-4 h-4" /> Activate</button>
              )}
              <button onClick={() => setPwdAction('delete')} className="btn-danger"><Trash2 className="w-4 h-4" /> Delete</button>
            </>
          ) : (
            <span className="text-xs text-muted-foreground italic">Admin profile — protected from deactivation/deletion</span>
          )}
        </div>
      </div>

      <PasswordConfirmDialog
        open={!!pwdAction}
        onClose={() => setPwdAction(null)}
        onConfirm={runPwdAction}
        title={
          pwdAction === 'delete' ? `Delete ${emp.name}` :
          pwdAction === 'activate' ? `Activate ${emp.name}` :
          pwdAction === 'deactivate' ? `Deactivate ${emp.name}` :
          'Confirm changes'
        }
        description={
          pwdAction === 'delete' ? 'Permanently deletes this employee, their login, and unassigns all clients/tasks. Cannot be undone.' :
          pwdAction === 'activate' ? 'Re-enable login for this employee.' :
          pwdAction === 'deactivate' ? 'Disable login. The profile is kept for records.' :
          'Save profile changes.'
        }
        actionLabel={
          pwdAction === 'delete' ? 'Delete Permanently' :
          pwdAction === 'activate' ? 'Activate' :
          pwdAction === 'deactivate' ? 'Deactivate' : 'Save'
        }
        destructive={pwdAction !== 'activate' && pwdAction !== 'save'}
      />

      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2.5 text-sm font-medium capitalize whitespace-nowrap transition-colors ${tab === t ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}>{t}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="card-nawi">
            <div className="flex justify-end mb-4">
              {editing ? (
                <div className="flex gap-2"><button onClick={handleSave} className="btn-primary"><Save className="w-4 h-4" /> Save</button><button onClick={() => { setEditing(false); setForm(emp); }} className="btn-outline"><X className="w-4 h-4" /></button></div>
              ) : (
                <button onClick={() => setEditing(true)} className="btn-outline"><Edit className="w-4 h-4" /> Edit Profile</button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { label: 'Full Name', key: 'name' }, { label: 'Email', key: 'email' },
                { label: 'Mobile', key: 'mobile' }, { label: 'Passport No.', key: 'passport_no' },
                { label: 'Emirates ID', key: 'emirates_id' }, { label: 'Base Salary', key: 'base_salary' },
              ].map(({ label, key }) => (
                <div key={key}>
                  <label className="block text-xs text-muted-foreground mb-1">{label}</label>
                  {editing ? (
                    <input value={form[key] || ''} onChange={(e) => setForm({ ...form, [key]: key === 'base_salary' ? Number(e.target.value) : e.target.value })} className="input-nawi" type={key === 'base_salary' ? 'number' : 'text'} />
                  ) : (
                    <p className="text-sm font-medium text-foreground">{key === 'base_salary' ? formatCurrency(emp[key] || 0) : (emp[key] || '—')}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="card-nawi space-y-4">
            <h3 className="text-lg font-bold font-display flex items-center gap-2">
              <MapPin className="w-5 h-5 text-primary" /> Workplace & Geofencing
            </h3>
            <p className="text-sm text-muted-foreground">
              Select the zone where this employee is authorized to work and log in.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Assigned Zone</label>
                  <select 
                    className="input-nawi"
                    value={emp.assigned_zone_id || ''}
                    onChange={(e) => handleAssignZone(e.target.value || null)}
                    disabled={savingZone}
                  >
                    <option value="" disabled>— Select a Zone —</option>
                    {zones.map(z => (
                      <option key={z.id} value={z.id}>{z.name}</option>
                    ))}
                  </select>
                  {savingZone && <p className="text-[10px] text-primary animate-pulse mt-1">Saving workplace...</p>}
                </div>

                <div className="p-4 rounded-xl bg-muted/30 border border-border flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-bold">Bypass Geofence</Label>
                    <p className="text-[10px] text-muted-foreground">Allow login from any location (disables location check)</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Switch 
                      checked={override.enforce_geofence === false} 
                      onCheckedChange={(checked) => {
                        setOverride(prev => ({ ...prev, enforce_geofence: !checked }));
                      }}
                    />
                    <button 
                      onClick={handleSaveSchedule} 
                      disabled={savingSchedule}
                      className="text-[10px] font-bold text-primary hover:underline disabled:opacity-50"
                    >
                      {savingSchedule ? 'Saving...' : 'Apply Bypass'}
                    </button>
                  </div>
                </div>

                {assignedZone && (
                  <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
                    <p className="text-xs font-medium text-primary mb-1">Zone Details</p>
                    <div className="text-[11px] space-y-1 text-muted-foreground">
                      <p>Center: {assignedZone.latitude.toFixed(6)}, {assignedZone.longitude.toFixed(6)}</p>
                      <p>Allowed Radius: {assignedZone.radius} meters</p>
                    </div>
                  </div>
                )}
              </div>

              {assignedZone && (
                <div className="h-48 rounded-xl border border-border overflow-hidden shadow-inner">
                  <iframe 
                    width="100%" 
                    height="100%" 
                    frameBorder="0" 
                    scrolling="no" 
                    marginHeight={0} 
                    marginWidth={0} 
                    src={getMapsEmbed(assignedZone.latitude, assignedZone.longitude, assignedZone.radius)}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Schedule tab removed — managed under Settings → Attendance & Geofence Management */}

      {tab === 'clients' && (
        <div className="card-nawi p-0 overflow-x-auto">
          {clients.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No clients assigned</p> : (
            <table className="table-nawi w-full">
              <thead><tr><th>ID</th><th>Name</th><th>Service</th><th>Status</th><th>Revenue</th></tr></thead>
              <tbody>{clients.map(c => <tr key={c.id}><td className="font-mono text-xs">{c.display_id}</td><td>{c.name}</td><td>{c.service}</td><td><StatusBadge status={c.status} /></td><td>{formatCurrency(c.revenue || 0)}</td></tr>)}</tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'tasks' && (
        <div className="card-nawi p-0 overflow-x-auto">
          {tasks.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No tasks</p> : (
            <table className="table-nawi w-full">
              <thead><tr><th>ID</th><th>Title</th><th>Client</th><th>Due</th><th>Status</th></tr></thead>
              <tbody>{tasks.map(t => <tr key={t.id}><td className="font-mono text-xs">{t.display_id}</td><td>{t.title}</td><td>{t.client_name}</td><td>{formatDate(t.due_date)}</td><td><StatusBadge status={t.status} /></td></tr>)}</tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'attendance' && (
        <div className="card-nawi p-0 overflow-x-auto">
          {attendance.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No records</p> : (
            <table className="table-nawi w-full">
              <thead><tr><th>Date</th><th>Login</th><th>Logout</th><th>Hours</th><th>Work Summary</th><th>Status</th></tr></thead>
              <tbody>{attendance.map(a => (
                <tr key={a.id}>
                  <td>{formatDate(a.date)}</td>
                  <td>{safeTime(a.login_time)}</td>
                  <td>{safeTime(a.logout_time)}</td>
                  <td>{a.hours_worked || 0}h</td>
                  <td className="max-w-[200px] truncate text-xs">{a.work_summary || '—'}</td>
                  <td><StatusBadge status={a.status} /></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'leave' && (
        <div className="card-nawi p-0 overflow-x-auto">
          {leave.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No leave records</p> : (
            <table className="table-nawi w-full">
              <thead><tr><th>Type</th><th>Dates</th><th>Days</th><th>Reason</th><th>Status</th></tr></thead>
              <tbody>{leave.map(l => <tr key={l.id}><td><span className="badge-new text-xs">{l.leave_type}</span></td><td>{formatDate(l.start_date)} - {formatDate(l.end_date)}</td><td>{l.days}</td><td className="max-w-[150px] truncate">{l.reason}</td><td><StatusBadge status={l.status} /></td></tr>)}</tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'goals' && (
        <div className="card-nawi">
          {goals.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No goals assigned</p> : (
            <div className="space-y-3">
              {goals.map(g => (
                <div key={g.id} className="p-3 border border-border rounded-lg">
                  <p className="font-medium">{g.title || g.service}</p>
                  <p className="text-xs text-muted-foreground">{g.start_date ? `${formatDate(g.start_date)} → ${formatDate(g.end_date)}` : g.year_month}</p>
                  {g.description && <p className="text-xs text-muted-foreground mt-1">{g.description}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
