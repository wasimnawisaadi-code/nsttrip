import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/integrations/supabase/client';
import { formatDate } from '@/lib/supabase-service';
import StatusBadge from '@/components/ui/StatusBadge';
import { LogOut, Clock } from 'lucide-react';

export default function AttendancePage() {
  const { user, profile } = useAuth();
  const [yearMonth, setYearMonth] = useState(() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`; });
  const [showCheckout, setShowCheckout] = useState(false);
  const [workSummary, setWorkSummary] = useState('');
  const [attendance, setAttendance] = useState<any[]>([]);
  const [todayRecord, setTodayRecord] = useState<any>(null);

  const today = new Date().toISOString().split('T')[0];

  const load = async () => {
    if (!user) return;
    const { data: monthData } = await supabase
      .from('attendance')
      .select('*')
      .eq('employee_id', user.id)
      .gte('date', `${yearMonth}-01`)
      .lte('date', `${yearMonth}-31`)
      .order('date', { ascending: false });
    setAttendance(monthData || []);

    const { data: todayData } = await supabase
      .from('attendance')
      .select('*')
      .eq('employee_id', user.id)
      .eq('date', today)
      .maybeSingle();
    setTodayRecord(todayData);
  };

  useEffect(() => { load(); }, [user, yearMonth]);

  const present = attendance.filter(a => a.status === 'Present').length;
  const late = attendance.filter(a => a.status === 'Late').length;
  const totalHours = attendance.reduce((s, a) => s + (a.hours_worked || 0), 0);

  const handleCheckout = async () => {
    if (todayRecord && !todayRecord.logout_time) {
      const logoutTime = new Date().toISOString();
      const loginDate = new Date(todayRecord.login_time);
      const logoutDate = new Date(logoutTime);
      
      // Calculate net hours: (Total time) - (Break time)
      const totalMs = logoutDate.getTime() - loginDate.getTime();
      const breakMs = (todayRecord.total_break_minutes || 0) * 60000;
      const hoursWorked = Math.round(((totalMs - breakMs) / 3600000) * 10) / 10;

      // Best-effort capture of logout location
      let logoutLat: number | null = null;
      let logoutLng: number | null = null;
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
        });
        logoutLat = pos.coords.latitude;
        logoutLng = pos.coords.longitude;
      } catch { /* ignore */ }

      await supabase.from('attendance').update({
        logout_time: logoutTime,
        hours_worked: Math.max(0, hoursWorked),
        logout_lat: logoutLat,
        logout_lng: logoutLng,
        work_summary: workSummary.trim() || null,
        is_auto_logout: false
      } as any).eq('id', todayRecord.id);
      setShowCheckout(false);
      setWorkSummary('');
      load();
    }
  };

  const handleBreak = async (isStart: boolean) => {
    if (!todayRecord) return;
    const now = new Date();
    if (isStart) {
      await supabase.from('attendance').update({ 
        break_start_time: now.toISOString() 
      } as any).eq('id', todayRecord.id);
    } else if (todayRecord.break_start_time) {
      const start = new Date(todayRecord.break_start_time);
      const diffMin = Math.round((now.getTime() - start.getTime()) / 60000);
      const newTotal = (todayRecord.total_break_minutes || 0) + diffMin;
      await supabase.from('attendance').update({ 
        break_start_time: null,
        total_break_minutes: newTotal
      } as any).eq('id', todayRecord.id);
    }
    load();
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold font-display">My Attendance</h2>
        <div className="flex items-center gap-2">
           {todayRecord && !todayRecord.logout_time && (
             <>
               {todayRecord.break_start_time ? (
                 <button onClick={() => handleBreak(false)} className="bg-success text-success-foreground px-4 py-1.5 rounded-lg text-sm font-bold animate-pulse">End Break</button>
               ) : (
                 <button onClick={() => handleBreak(true)} className="bg-warning text-warning-foreground px-4 py-1.5 rounded-lg text-sm font-bold">Start Break</button>
               )}
             </>
           )}
           <input type="month" value={yearMonth} onChange={(e) => setYearMonth(e.target.value)} className="input-nawi w-auto py-1.5" />
        </div>
      </div>

      {todayRecord && (
        <div className="card-nawi border-l-4 border-primary">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center"><Clock className="w-5 h-5 text-primary" /></div>
              <div>
                <p className="text-sm font-semibold flex items-center gap-2">
                   Today's Session 
                   {todayRecord.is_auto_logout && <span className="text-[10px] bg-destructive/10 text-destructive px-1.5 py-0.5 rounded">Auto-Logged Out</span>}
                   {todayRecord.break_start_time && <span className="text-[10px] bg-warning/10 text-warning px-1.5 py-0.5 rounded animate-pulse">On Break</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  Login: {todayRecord.login_time ? new Date(todayRecord.login_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}
                  {todayRecord.logout_time && ` → Logout: ${new Date(todayRecord.logout_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`}
                  {todayRecord.total_break_minutes > 0 && ` · Break: ${todayRecord.total_break_minutes}m`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge status={todayRecord.status} />
              {!todayRecord.logout_time && (
                <button onClick={() => setShowCheckout(true)} className="btn-outline text-sm"><LogOut className="w-4 h-4" /> Check Out</button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="stat-card"><div className="stat-card-icon bg-success"><span className="text-primary-foreground font-bold">{present}</span></div><div><p className="text-xs text-muted-foreground">Present</p></div></div>
        <div className="stat-card"><div className="stat-card-icon bg-warning"><span className="text-primary-foreground font-bold">{late}</span></div><div><p className="text-xs text-muted-foreground">Late</p></div></div>
        <div className="stat-card"><div className="stat-card-icon bg-primary"><span className="text-primary-foreground font-bold">{Math.round(totalHours)}</span></div><div><p className="text-xs text-muted-foreground">Work Hours</p></div></div>
      </div>

      <div className="card-nawi p-0 overflow-x-auto">
        <table className="table-nawi w-full text-xs">
          <thead><tr><th>Date</th><th>Login</th><th>Logout</th><th>Break</th><th>Work</th><th>Summary</th><th>Status</th></tr></thead>
          <tbody>
            {attendance.length === 0 ? <tr><td colSpan={7} className="text-center text-muted-foreground py-8">No records</td></tr> :
              attendance.map((a) => (
                <tr key={a.id} className={a.is_auto_logout ? 'bg-destructive/5' : ''}>
                  <td>{formatDate(a.date)}</td>
                  <td>{a.login_time ? new Date(a.login_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td>
                    {a.logout_time ? new Date(a.logout_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}
                    {a.is_auto_logout && <span className="block text-[9px] text-destructive font-bold uppercase">Auto</span>}
                  </td>
                  <td>{a.total_break_minutes || 0}m</td>
                  <td><span className="font-bold">{a.hours_worked || 0}h</span></td>
                  <td className="max-w-[150px] truncate">{a.work_summary || '—'}</td>
                  <td><StatusBadge status={a.status} /></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {showCheckout && (
        <div className="fixed inset-0 bg-foreground/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCheckout(false)}>
          <div className="bg-card rounded-xl shadow-elevated w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold font-display mb-4">📝 Daily Check Out</h2>
            <p className="text-sm text-muted-foreground mb-4">Please describe what you worked on today:</p>
            <textarea value={workSummary} onChange={e => setWorkSummary(e.target.value)} className="input-nawi" rows={4} placeholder="e.g., Processed 5 visa applications, followed up with 3 clients..." />
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setShowCheckout(false)} className="btn-outline">Cancel</button>
              <button onClick={handleCheckout} className="btn-primary"><LogOut className="w-4 h-4" /> Check Out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
