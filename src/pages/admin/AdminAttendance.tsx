import { useState, useEffect } from 'react';
import { exportToExcel } from '@/lib/excel-export';
import { Download, Clock, Users, AlertTriangle, Plus, Calendar, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatDate, generateDisplayId, auditLog } from '@/lib/supabase-service';
import StatusBadge from '@/components/ui/StatusBadge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { getAttendanceSettings } from '@/lib/settings';

const COLORS = ['hsl(var(--success))', 'hsl(var(--warning))', 'hsl(var(--destructive))', 'hsl(var(--muted))'];

export default function AdminAttendance() {
  const now = new Date();
  const [yearMonth, setYearMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [view, setView] = useState<'overview' | 'calendar' | 'employee'>('overview');
  const [selectedDate, setSelectedDate] = useState(now.toISOString().split('T')[0]);
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualForm, setManualForm] = useState({ employeeId: '', date: '', loginTime: '09:00', logoutTime: '18:00', status: 'Present', workSummary: '' });
  const [showMarkLeave, setShowMarkLeave] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ employeeId: '', date: '', leaveType: 'Annual', reason: '' });
  const [employees, setEmployees] = useState<any[]>([]);
  const [allAttendance, setAllAttendance] = useState<any[]>([]);
  const [allLeave, setAllLeave] = useState<any[]>([]);
  const [weekendDays, setWeekendDays] = useState<number[]>([0]); // Default to Sunday only

  const loadData = async () => {
    const [empRes, attRes, leaveRes, rolesRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('status', 'active'),
      supabase.from('attendance').select('*'),
      supabase.from('leave_requests').select('*'),
      supabase.from('user_roles').select('user_id, role'),
    ]);
    // Admins are bosses — exclude from attendance tracking lists
    const adminIds = new Set((rolesRes.data || []).filter((r: any) => r.role === 'admin' || r.role === 'superadmin').map((r: any) => r.user_id));
    setEmployees((empRes.data || []).filter((e: any) => !adminIds.has(e.user_id)));
    setAllAttendance(attRes.data || []);
    setAllLeave(leaveRes.data || []);
    
    const settings = await getAttendanceSettings();
    setWeekendDays(settings.weekend_days);
  };

  useEffect(() => { loadData(); }, []);

  const monthAttendance = allAttendance.filter(a => a.date?.startsWith(yearMonth));
  const [y, m] = yearMonth.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const firstDayOfWeek = new Date(y, m - 1, 1).getDay();
  const presentCount = monthAttendance.filter(a => a.status === 'Present').length;
  const lateCount = monthAttendance.filter(a => a.status === 'Late').length;
  const absentCount = monthAttendance.filter(a => a.status === 'Absent').length;

  const dailyData: any[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${yearMonth}-${String(d).padStart(2, '0')}`;
    const dayRecs = allAttendance.filter(a => a.date === dateStr);
    dailyData.push({ day: d, present: dayRecs.filter(a => a.status === 'Present').length, late: dayRecs.filter(a => a.status === 'Late').length, absent: dayRecs.filter(a => a.status === 'Absent').length });
  }
  const pieData = [{ name: 'Present', value: presentCount }, { name: 'Late', value: lateCount }, { name: 'Absent', value: absentCount }].filter(d => d.value > 0);

  const empSummary = employees.map(emp => {
    const recs = monthAttendance.filter(a => a.employee_id === emp.user_id);
    let totalHours = recs.reduce((s, a) => s + (a.hours_worked || 0), 0);
    
    // Include live shift duration for currently logged-in employees
    const active = recs.find(a => a.login_time && !a.logout_time && a.date === now.toISOString().split('T')[0]);
    if (active) {
      const liveDuration = (new Date().getTime() - new Date(active.login_time).getTime()) / 3600000;
      totalHours += liveDuration;
    }

    const empLeave = allLeave.filter(l => l.employee_id === emp.user_id && l.status === 'Approved' && (l.start_date?.startsWith(yearMonth) || l.end_date?.startsWith(yearMonth)));
    return {
      ...emp, present: recs.filter(a => a.status === 'Present').length,
      late: recs.filter(a => a.status === 'Late').length,
      absent: recs.filter(a => a.status === 'Absent').length,
      totalHours: Math.round(totalHours * 10) / 10,
      avgHours: recs.length > 0 ? Math.round((totalHours / recs.length) * 10) / 10 : 0,
      leaveCount: empLeave.reduce((s, l) => s + (l.days || 0), 0),
    };
  });

  const getDateInfo = (day: number) => {
    const dateStr = `${yearMonth}-${String(day).padStart(2, '0')}`;
    const recs = allAttendance.filter(a => a.date === dateStr);
    const leaves = allLeave.filter(l => l.status === 'Approved' && l.start_date <= dateStr && l.end_date >= dateStr);
    const dow = new Date(y, m - 1, day).getDay();
    return { dateStr, recs, leaves, isWeekend: weekendDays.includes(dow), isToday: dateStr === now.toISOString().split('T')[0] };
  };

  const handleManualEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    const existing = allAttendance.find(a => a.employee_id === manualForm.employeeId && a.date === manualForm.date);
    const hoursWorked = Math.round(((new Date(`${manualForm.date}T${manualForm.logoutTime}`).getTime() - new Date(`${manualForm.date}T${manualForm.loginTime}`).getTime()) / 3600000) * 10) / 10;
    if (existing) {
      await supabase.from('attendance').update({
        login_time: `${manualForm.date}T${manualForm.loginTime}:00`, logout_time: `${manualForm.date}T${manualForm.logoutTime}:00`,
        status: manualForm.status as any, work_summary: manualForm.workSummary, hours_worked: hoursWorked,
      }).eq('id', existing.id);
    } else {
      await supabase.from('attendance').insert({
        employee_id: manualForm.employeeId, date: manualForm.date,
        login_time: `${manualForm.date}T${manualForm.loginTime}:00`, logout_time: `${manualForm.date}T${manualForm.logoutTime}:00`,
        status: manualForm.status as any, work_summary: manualForm.workSummary, hours_worked: hoursWorked,
      });
    }
    await auditLog('attendance_manual', 'attendance', manualForm.employeeId, { date: manualForm.date });
    setShowManualEntry(false);
    setManualForm({ employeeId: '', date: '', loginTime: '09:00', logoutTime: '18:00', status: 'Present', workSummary: '' });
    loadData();
  };

  const handleMarkLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    const emp = employees.find(em => em.user_id === leaveForm.employeeId);
    const displayId = await generateDisplayId('LVE');
    await supabase.from('leave_requests').insert({
      display_id: displayId, employee_id: leaveForm.employeeId, employee_name: emp?.name || '',
      start_date: leaveForm.date, end_date: leaveForm.date, days: 1,
      reason: leaveForm.reason, leave_type: leaveForm.leaveType,
      status: 'Approved', reviewed_by: 'Admin', reviewed_at: new Date().toISOString(),
    });
    await auditLog('leave_marked', 'leave', leaveForm.employeeId, { date: leaveForm.date });
    setShowMarkLeave(false);
    setLeaveForm({ employeeId: '', date: '', leaveType: 'Annual', reason: '' });
    loadData();
  };

  const exportCSV = () => {
    const rows = empSummary.map(e => ({
      Employee: e.name, 'Present Days': e.present, 'Late Days': e.late, 'Absent Days': e.absent,
      'Leave Days': e.leaveCount, 'Total Hours': e.totalHours, 'Avg Hours/Day': e.avgHours,
    }));
    exportToExcel(rows, `attendance_${yearMonth}`, 'Attendance');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold font-display">Attendance Management</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="month" value={yearMonth} onChange={(e) => setYearMonth(e.target.value)} className="input-nawi w-auto" />
          <div className="flex border border-border rounded-lg overflow-hidden">
            {(['overview', 'calendar', 'employee'] as const).map(v => (
              <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 text-xs capitalize ${view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>{v}</button>
            ))}
          </div>
          <button onClick={() => setShowManualEntry(true)} className="btn-outline text-sm"><Plus className="w-4 h-4" /> Manual Entry</button>
          <button onClick={() => setShowMarkLeave(true)} className="btn-outline text-sm"><Calendar className="w-4 h-4" /> Mark Leave</button>
          <button onClick={exportCSV} className="btn-outline text-sm"><Download className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="stat-card"><div className="stat-card-icon bg-primary"><Users className="w-5 h-5 text-primary-foreground" /></div><div><p className="text-xs text-muted-foreground">Employees</p><p className="text-xl font-bold font-display">{employees.length}</p></div></div>
        <div className="stat-card"><div className="stat-card-icon bg-success"><Clock className="w-5 h-5 text-primary-foreground" /></div><div><p className="text-xs text-muted-foreground">Present</p><p className="text-xl font-bold font-display text-success">{presentCount}</p></div></div>
        <div className="stat-card"><div className="stat-card-icon bg-warning"><Clock className="w-5 h-5 text-primary-foreground" /></div><div><p className="text-xs text-muted-foreground">Late</p><p className="text-xl font-bold font-display text-warning">{lateCount}</p></div></div>
        <div className="stat-card"><div className="stat-card-icon bg-destructive"><AlertTriangle className="w-5 h-5 text-primary-foreground" /></div><div><p className="text-xs text-muted-foreground">Absent</p><p className="text-xl font-bold font-display text-destructive">{absentCount}</p></div></div>
        <div className="stat-card"><div><p className="text-xs text-muted-foreground">Total Records</p><p className="text-xl font-bold font-display">{monthAttendance.length}</p></div></div>
      </div>

      {view === 'overview' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="card-nawi lg:col-span-2">
              <h3 className="text-base font-semibold font-display mb-4">Daily Attendance</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip />
                  <Bar dataKey="present" fill="hsl(var(--success))" stackId="a" name="Present" />
                  <Bar dataKey="late" fill="hsl(var(--warning))" stackId="a" name="Late" />
                  <Bar dataKey="absent" fill="hsl(var(--destructive))" stackId="a" radius={[4, 4, 0, 0]} name="Absent" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="card-nawi">
              <h3 className="text-base font-semibold font-display mb-4">Distribution</h3>
              {pieData.length === 0 ? <p className="text-sm text-muted-foreground text-center py-16">No data</p> : (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart><Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie><Tooltip /></PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
          <div className="card-nawi p-0 overflow-x-auto">
            <table className="table-nawi w-full">
              <thead><tr><th>Employee</th><th>Present</th><th>Late</th><th>Absent</th><th>Leave</th><th>Total Hours</th><th>Avg/Day</th><th></th></tr></thead>
              <tbody>
                  <tr key={e.user_id}>
                    <td className="font-medium">
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          {e.name}
                          {e.last_seen_at && (new Date().getTime() - new Date(e.last_seen_at).getTime() < 300000) && (
                            <span className="absolute -left-2 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-success shadow-[0_0_8px_rgba(34,197,94,0.6)]" title="Online now" />
                          )}
                        </div>
                      </div>
                    </td>
                    <td><span className="text-success font-medium">{e.present}</span></td>
                    <td><span className="text-warning font-medium">{e.late}</span></td>
                    <td><span className="text-destructive font-medium">{e.absent}</span></td>
                    <td>{e.leaveCount}</td>
                    <td>{e.totalHours}h</td>
                    <td>{e.avgHours}h</td>
                    <td><button onClick={() => { setSelectedEmpId(e.user_id); setView('employee'); }} className="text-primary text-xs hover:underline"><Eye className="w-3 h-3 inline mr-1" />View</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {view === 'calendar' && (
        <div className="card-nawi">
          <h3 className="text-base font-semibold font-display mb-4">📅 Monthly Calendar — {yearMonth}</h3>
          <div className="grid grid-cols-7 gap-1 text-center text-xs mb-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => (
              <div key={d} className={`py-1 font-semibold ${weekendDays.includes(i) ? 'text-destructive/60' : 'text-muted-foreground'}`}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array(firstDayOfWeek).fill(null).map((_, i) => <div key={`empty-${i}`} />)}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
              const info = getDateInfo(day);
              const presentC = info.recs.filter(r => r.status === 'Present').length;
              const lateC = info.recs.filter(r => r.status === 'Late').length;
              const leaveC = info.leaves.length;
              const isSelected = info.dateStr === selectedDate;
              return (
                <button key={day} onClick={() => setSelectedDate(info.dateStr)}
                  className={`p-1.5 rounded-lg text-xs min-h-[60px] border transition-all flex flex-col items-center gap-0.5
                    ${info.isWeekend ? 'bg-muted/30 border-transparent' : 'border-border hover:border-primary/50'}
                    ${info.isToday ? 'ring-2 ring-primary' : ''} ${isSelected ? 'border-primary bg-primary/5' : ''}`}>
                  <span className={`font-medium ${info.isToday ? 'text-primary' : info.isWeekend ? 'text-muted-foreground' : ''}`}>{day}</span>
                  {presentC > 0 && <span className="text-[9px] bg-success/20 text-success px-1 rounded">{presentC}✓</span>}
                  {lateC > 0 && <span className="text-[9px] bg-warning/20 text-warning px-1 rounded">{lateC}⏰</span>}
                  {leaveC > 0 && <span className="text-[9px] bg-secondary/20 text-secondary px-1 rounded">{leaveC}🏖</span>}
                </button>
              );
            })}
          </div>
          {selectedDate && (
            <div className="mt-4 pt-4 border-t border-border">
              <h4 className="text-sm font-semibold mb-3">{formatDate(selectedDate)} — Employee Status</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {employees.map(emp => {
                  const rec = allAttendance.find(a => a.employee_id === emp.user_id && a.date === selectedDate);
                  const leave = allLeave.find(l => l.employee_id === emp.user_id && l.status === 'Approved' && l.start_date <= selectedDate && l.end_date >= selectedDate);
                  return (
                    <div key={emp.user_id} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                      <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-primary-foreground">{emp.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{emp.name}</p>
                        {rec ? (
                          <div className="text-xs">
                            <StatusBadge status={rec.status} />
                            <span className="text-muted-foreground ml-1">
                              {rec.login_time ? new Date(rec.login_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : ''}
                              {rec.logout_time ? ` → ${new Date(rec.logout_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}` : ' (Active)'}
                            </span>
                          </div>
                        ) : leave ? (
                          <span className="text-xs text-secondary">🏖 On Leave ({leave.leave_type})</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">No record</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {view === 'employee' && (
        <div className="card-nawi">
          <div className="flex items-center gap-3 mb-4">
            <select value={selectedEmpId} onChange={e => setSelectedEmpId(e.target.value)} className="input-nawi w-auto">
              <option value="">Select Employee</option>
              {employees.map(e => <option key={e.user_id} value={e.user_id}>{e.name}</option>)}
            </select>
          </div>
          {selectedEmpId && (() => {
            const emp = employees.find(e => e.user_id === selectedEmpId);
            const empRecs = allAttendance.filter(a => a.employee_id === selectedEmpId && a.date?.startsWith(yearMonth)).sort((a, b) => b.date.localeCompare(a.date));
            return (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center font-bold text-primary-foreground">{emp?.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</div>
                  <div><p className="font-semibold">{emp?.name}</p></div>
                </div>
                <div className="overflow-x-auto">
                  <table className="table-nawi w-full text-sm">
                    <thead><tr><th>Date</th><th>Login</th><th>Logout</th><th>Hours</th><th>Status</th><th>Work Summary</th></tr></thead>
                    <tbody>
                      {empRecs.map(a => (
                        <tr key={a.id}>
                          <td>{formatDate(a.date)}</td>
                          <td>{a.login_time ? new Date(a.login_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                          <td>{a.logout_time ? new Date(a.logout_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                          <td>
                            {a.logout_time ? `${a.hours_worked || 0}h` : 
                              a.login_time && a.date === new Date().toISOString().split('T')[0] ? 
                              `${Math.round(((new Date().getTime() - new Date(a.login_time).getTime()) / 3600000) * 10) / 10}h (Active)` : 
                              '—'}
                          </td>
                          <td><StatusBadge status={a.status} /></td>
                          <td className="max-w-[200px] truncate text-xs">{a.work_summary || '—'}</td>
                        </tr>
                      ))}
                      {empRecs.length === 0 && <tr><td colSpan={6} className="text-center text-muted-foreground py-8">No records for this month</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {showManualEntry && (
        <div className="fixed inset-0 bg-foreground/50 z-50 flex items-center justify-center p-4" onClick={() => setShowManualEntry(false)}>
          <div className="bg-card rounded-xl shadow-elevated w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold font-display mb-4">Manual Attendance Entry</h2>
            <form onSubmit={handleManualEntry} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Employee *</label>
                <select value={manualForm.employeeId} onChange={e => setManualForm({ ...manualForm, employeeId: e.target.value })} className="input-nawi" required>
                  <option value="">Select</option>
                  {employees.map(e => <option key={e.user_id} value={e.user_id}>{e.name}</option>)}
                </select>
              </div>
              <div><label className="block text-sm font-medium mb-1">Date *</label><input type="date" value={manualForm.date} onChange={e => setManualForm({ ...manualForm, date: e.target.value })} className="input-nawi" required /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium mb-1">Login Time</label><input type="time" value={manualForm.loginTime} onChange={e => setManualForm({ ...manualForm, loginTime: e.target.value })} className="input-nawi" /></div>
                <div><label className="block text-sm font-medium mb-1">Logout Time</label><input type="time" value={manualForm.logoutTime} onChange={e => setManualForm({ ...manualForm, logoutTime: e.target.value })} className="input-nawi" /></div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Status</label>
                <select value={manualForm.status} onChange={e => setManualForm({ ...manualForm, status: e.target.value })} className="input-nawi">
                  <option>Present</option><option>Late</option><option>Absent</option>
                </select>
              </div>
              <div><label className="block text-sm font-medium mb-1">Work Summary</label><textarea value={manualForm.workSummary} onChange={e => setManualForm({ ...manualForm, workSummary: e.target.value })} className="input-nawi" rows={2} /></div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowManualEntry(false)} className="btn-outline">Cancel</button>
                <button type="submit" className="btn-primary">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showMarkLeave && (
        <div className="fixed inset-0 bg-foreground/50 z-50 flex items-center justify-center p-4" onClick={() => setShowMarkLeave(false)}>
          <div className="bg-card rounded-xl shadow-elevated w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold font-display mb-4">Quick Mark Leave</h2>
            <form onSubmit={handleMarkLeave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Employee *</label>
                <select value={leaveForm.employeeId} onChange={e => setLeaveForm({ ...leaveForm, employeeId: e.target.value })} className="input-nawi" required>
                  <option value="">Select</option>
                  {employees.map(e => <option key={e.user_id} value={e.user_id}>{e.name}</option>)}
                </select>
              </div>
              <div><label className="block text-sm font-medium mb-1">Date *</label><input type="date" value={leaveForm.date} onChange={e => setLeaveForm({ ...leaveForm, date: e.target.value })} className="input-nawi" required /></div>
              <div>
                <label className="block text-sm font-medium mb-1">Leave Type</label>
                <select value={leaveForm.leaveType} onChange={e => setLeaveForm({ ...leaveForm, leaveType: e.target.value })} className="input-nawi">
                  <option>Annual</option><option>Sick</option><option>Emergency</option><option>Bereavement</option><option>Hajj</option><option>Maternity</option><option>Paternity</option>
                </select>
              </div>
              <div><label className="block text-sm font-medium mb-1">Reason</label><input value={leaveForm.reason} onChange={e => setLeaveForm({ ...leaveForm, reason: e.target.value })} className="input-nawi" /></div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowMarkLeave(false)} className="btn-outline">Cancel</button>
                <button type="submit" className="btn-primary">Mark Leave</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
