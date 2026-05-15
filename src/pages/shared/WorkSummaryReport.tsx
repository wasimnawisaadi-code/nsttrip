import { useEffect, useState } from 'react';
import { exportToExcel } from '@/lib/excel-export';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { formatDate, safeTime } from '@/lib/supabase-service';
import StatusBadge from '@/components/ui/StatusBadge';
import { ClipboardList, Download, Users as UsersIcon, Briefcase, Clock, FileText } from 'lucide-react';

/**
 * Daily Status Report — per-employee summary of today's work.
 * Admins see everyone; employees see only themselves.
 */
export default function DailyStatusReport() {
  const { user, isAdmin } = useAuth();
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const empRes = isAdmin
      ? await supabase.from('profiles').select('user_id, name, photo_url, profile_type').eq('status', 'active')
      : { data: user ? [{ user_id: user.id }] : [], error: null };

    const [attRes, taskRes, clientRes, leaveRes] = await Promise.all([
      supabase.from('attendance').select('*').eq('date', date),
      supabase.from('tasks').select('*').or(`completed_date.eq.${date},created_at.gte.${date}T00:00:00,due_date.eq.${date}`),
      supabase.from('clients').select('id, display_id, name, service, created_at, created_by, assigned_to, status').gte('created_at', `${date}T00:00:00`).lte('created_at', `${date}T23:59:59`),
      supabase.from('leave_requests').select('*').eq('status', 'Approved').lte('start_date', date).gte('end_date', date),
    ]);

    setEmployees(empRes.data || []);
    setAttendance(attRes.data || []);
    setTasks(taskRes.data || []);
    setClients(clientRes.data || []);
    setLeaves(leaveRes.data || []);
    setLoading(false);
  };

  useEffect(() => { if (user) load(); /* eslint-disable-next-line */ }, [user, isAdmin, date]);

  const rows = (isAdmin ? employees : employees).map((emp: any) => {
    const att = attendance.find(a => a.employee_id === emp.user_id);
    const empTasks = tasks.filter(t => t.assigned_to === emp.user_id || t.created_by === emp.user_id);
    const completed = empTasks.filter(t => t.completed_date === date).length;
    const inProgress = empTasks.filter(t => t.status === 'Processing').length;
    const newClients = clients.filter(c => c.created_by === emp.user_id).length;
    const leave = leaves.find(l => l.employee_id === emp.user_id);
    return { emp, att, completed, inProgress, newClients, leave, summary: att?.work_summary || '' };
  });

  const exportCSV = () => {
    const data = rows.map(r => ({
      Employee: r.emp.name || '—',
      Status: r.leave ? `Leave (${r.leave.leave_type})` : (r.att?.status || 'No record'),
      Login: safeTime(r.att?.login_time),
      Logout: safeTime(r.att?.logout_time),
      Hours: r.att?.hours_worked || 0,
      'Clients Added': r.newClients,
      'Tasks Done': r.completed,
      'In Progress': r.inProgress,
      'Work Summary': r.summary || '',
    }));
    exportToExcel(data, `dsr_${date}`, 'DSR');
  };

  const totals = {
    present: rows.filter(r => r.att?.status === 'Present' || r.att?.status === 'Late').length,
    onLeave: rows.filter(r => r.leave).length,
    absent: rows.filter(r => !r.att && !r.leave).length,
    clients: rows.reduce((s, r) => s + r.newClients, 0),
    tasks: rows.reduce((s, r) => s + r.completed, 0),
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <ClipboardList className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold font-display">Daily Status Report</h2>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input-nawi w-auto text-sm" />
        </div>
        <button onClick={exportCSV} className="btn-outline text-sm"><Download className="w-4 h-4" /> Export Excel</button>
      </div>

      {isAdmin && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="stat-card"><div className="stat-card-icon bg-success"><UsersIcon className="w-4 h-4 text-primary-foreground" /></div><div><p className="text-xs text-muted-foreground">Present</p><p className="text-lg font-bold font-display text-success">{totals.present}</p></div></div>
          <div className="stat-card"><div className="stat-card-icon bg-warning"><Clock className="w-4 h-4 text-primary-foreground" /></div><div><p className="text-xs text-muted-foreground">On Leave</p><p className="text-lg font-bold font-display text-warning">{totals.onLeave}</p></div></div>
          <div className="stat-card"><div className="stat-card-icon bg-destructive"><UsersIcon className="w-4 h-4 text-primary-foreground" /></div><div><p className="text-xs text-muted-foreground">Absent</p><p className="text-lg font-bold font-display text-destructive">{totals.absent}</p></div></div>
          <div className="stat-card"><div className="stat-card-icon bg-secondary"><Briefcase className="w-4 h-4 text-primary-foreground" /></div><div><p className="text-xs text-muted-foreground">New Clients</p><p className="text-lg font-bold font-display">{totals.clients}</p></div></div>
          <div className="stat-card"><div className="stat-card-icon bg-primary"><FileText className="w-4 h-4 text-primary-foreground" /></div><div><p className="text-xs text-muted-foreground">Tasks Done</p><p className="text-lg font-bold font-display">{totals.tasks}</p></div></div>
        </div>
      )}

      <div className="card-nawi p-0 overflow-x-auto">
        <table className="table-nawi w-full text-sm">
          <thead><tr><th>Employee</th><th>Status</th><th>Login → Logout</th><th>Hours</th><th>New Clients</th><th>Tasks Done</th><th>In Progress</th><th>Work Summary</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="text-center text-muted-foreground py-8">Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={8} className="text-center text-muted-foreground py-8">No records for {formatDate(date)}</td></tr>}
            {rows.map(r => (
              <tr key={r.emp.user_id}>
                <td className="font-medium">{r.emp.name || '—'}</td>
                <td>
                  {r.leave ? <span className="badge-new text-xs bg-secondary/20 text-secondary">Leave • {r.leave.leave_type}</span>
                    : r.att ? <StatusBadge status={r.att.status} />
                    : <span className="text-destructive text-xs">No record</span>}
                </td>
                <td className="text-xs">
                  {safeTime(r.att?.login_time)}
                  {' → '}
                  {safeTime(r.att?.logout_time)}
                </td>
                <td>{r.att?.hours_worked || 0}h</td>
                <td>{r.newClients}</td>
                <td className="text-success">{r.completed}</td>
                <td className="text-warning">{r.inProgress}</td>
                <td className="max-w-[280px] text-xs text-muted-foreground"><div className="line-clamp-2">{r.summary || '—'}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
