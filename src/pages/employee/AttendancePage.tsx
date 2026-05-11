import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/integrations/supabase/client';
import { formatDate } from '@/lib/supabase-service';
import StatusBadge from '@/components/ui/StatusBadge';
import { getAttendanceSettings } from '@/lib/settings';
import { LogOut, Clock } from 'lucide-react';

export default function AttendancePage() {
  const { user, profile } = useAuth();
  const [yearMonth, setYearMonth] = useState(() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`; });
  const [showCheckout, setShowCheckout] = useState(false);
  const [workSummary, setWorkSummary] = useState('');
  const [breakTimer, setBreakTimer] = useState(0);
  const [lunchAllowance, setLunchAllowance] = useState(60);
  const [loading, setLoading] = useState(true);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [todayRecord, setTodayRecord] = useState<any>(null);

  // Ultimate safety wrapper for date formatting
  const safeTime = (dateStr: string | null | undefined) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '—';
    }
  };

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const settings = await getAttendanceSettings();
        if (settings) {
          setLunchAllowance(settings.lunch_break_min || 60);
        }
      } catch (e) {
        console.warn('Settings load failed, using defaults', e);
        setLunchAllowance(60);
      }
    };
    fetchSettings();
  }, []);

  useEffect(() => {
    let interval: any;
    const breakStart = todayRecord?.break_start_time;
    
    if (breakStart) {
      const calculateDiff = () => {
        const start = new Date(breakStart);
        if (isNaN(start.getTime())) return 0;
        return Math.floor((new Date().getTime() - start.getTime()) / 60000);
      };

      setBreakTimer(calculateDiff());
      interval = setInterval(() => {
        setBreakTimer(calculateDiff());
      }, 30000);
    } else {
      setBreakTimer(0);
    }
    return () => clearInterval(interval);
  }, [todayRecord?.break_start_time]);

  const today = new Date().toISOString().split('T')[0];

  const load = async () => {
    if (!user) return;
    try {
      setLoading(true);
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
    } catch (e) {
      console.error('Attendance load failed', e);
      toast.error('Could not load attendance data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [user, yearMonth]);

  const present = attendance.filter(a => a.status === 'Present').length;
  const late = attendance.filter(a => a.status === 'Late').length;
  const totalHours = attendance.reduce((s, a) => s + (a.hours_worked || 0), 0);

  const handleCheckout = async () => {
    try {
      if (todayRecord && !todayRecord.logout_time) {
        const logoutTime = new Date().toISOString();
        const loginTimeStr = todayRecord.login_time;
        
        if (!loginTimeStr) {
          toast.error("Login time record is missing. Please contact admin.");
          return;
        }

        const loginDate = new Date(loginTimeStr);
        const logoutDate = new Date(logoutTime);
        
        // Safety check for invalid dates
        if (isNaN(loginDate.getTime()) || isNaN(logoutDate.getTime())) {
          toast.error("Invalid time format detected.");
          return;
        }
        
        const totalMs = logoutDate.getTime() - loginDate.getTime();
        const breakMs = (Number(todayRecord.total_break_minutes) || 0) * 60000;
        const hoursWorked = Math.max(0, Math.round(((totalMs - breakMs) / 3600000) * 10) / 10);

        let logoutLat: number | null = null;
        let logoutLng: number | null = null;
        try {
          if (navigator.geolocation) {
            const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3000 });
            });
            logoutLat = pos.coords.latitude;
            logoutLng = pos.coords.longitude;
          }
        } catch (e) { console.warn('Location capture failed', e); }

        const { error } = await supabase.from('attendance').update({
          logout_time: logoutTime,
          hours_worked: isNaN(hoursWorked) ? 0 : hoursWorked,
          logout_lat: logoutLat,
          logout_lng: logoutLng,
          work_summary: (workSummary || '').trim() || null,
          is_auto_logout: false
        } as any).eq('id', todayRecord.id);

        if (error) throw error;

        setShowCheckout(false);
        setWorkSummary('');
        toast.success("Checked out successfully!");
        load();
      }
    } catch (error: any) {
      console.error('Checkout error:', error);
      toast.error("Failed to check out: " + (error.message || "Unknown error"));
    }
  };

  const handleBreak = async (isStart: boolean) => {
    try {
      if (!todayRecord) return;
      const now = new Date();
      
      if (isStart) {
        const { error } = await supabase.from('attendance').update({ 
          break_start_time: now.toISOString() 
        } as any).eq('id', todayRecord.id);
        if (error) throw error;
        toast.success("Break started");
      } else if (todayRecord.break_start_time) {
        const start = new Date(todayRecord.break_start_time);
        if (isNaN(start.getTime())) {
          toast.error("Error reading break start time.");
          return;
        }
        
        const diffMin = Math.max(0, Math.round((now.getTime() - start.getTime()) / 60000));
        const currentTotal = Number(todayRecord.total_break_minutes) || 0;
        const newTotal = currentTotal + diffMin;
        
        const { error } = await supabase.from('attendance').update({ 
          break_start_time: null,
          total_break_minutes: isNaN(newTotal) ? currentTotal : newTotal
        } as any).eq('id', todayRecord.id);

        if (error) throw error;

        await supabase.from('notifications').insert({
          user_id: todayRecord.employee_id,
          title: 'Break Finished',
          message: `You took a ${diffMin} minute break.`,
          type: 'system',
          is_read: false
        });
        toast.success("Break finished");
      }
      load();
    } catch (error: any) {
      console.error('Break error:', error);
      toast.error("Break action failed: " + (error.message || "Unknown error"));
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        <p className="text-sm font-bold text-muted-foreground animate-pulse uppercase tracking-widest">Securing Connection...</p>
      </div>
    );
  }

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
                   {todayRecord?.is_auto_logout && <span className="text-[10px] bg-destructive/10 text-destructive px-1.5 py-0.5 rounded">Auto-Logged Out</span>}
                   {todayRecord?.break_start_time && <span className="text-[10px] bg-warning/10 text-warning px-1.5 py-0.5 rounded animate-pulse">On Break</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  Login: {safeTime(todayRecord?.login_time)}
                  {todayRecord?.logout_time && ` → Logout: ${safeTime(todayRecord.logout_time)}`}
                  {(todayRecord?.total_break_minutes || 0) > 0 && ` · Break: ${todayRecord.total_break_minutes}m`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge status={todayRecord.status || 'Present'} />
              {!todayRecord.logout_time && (
                <button onClick={() => setShowCheckout(true)} className="btn-outline text-sm"><LogOut className="w-4 h-4" /> Check Out</button>
              )}
            </div>
          </div>

          {todayRecord?.break_start_time && (
            <div className="mt-4 p-3 bg-warning/5 rounded-lg border border-warning/20 flex items-center justify-between">
               <div className="flex items-center gap-2 text-warning">
                  <Clock className="w-4 h-4 animate-spin-slow" />
                  <span className="text-xs font-bold uppercase tracking-tight">Active Break Timer</span>
               </div>
               <div className="flex gap-4">
                  <div className="text-right">
                     <p className="text-[10px] text-muted-foreground uppercase font-bold">Time Used</p>
                     <p className="text-sm font-bold text-warning">{breakTimer}m</p>
                  </div>
                  <div className="text-right">
                     <p className="text-[10px] text-muted-foreground uppercase font-bold">Remaining</p>
                     <p className={`text-sm font-bold ${lunchAllowance - breakTimer <= 5 ? 'text-destructive animate-pulse' : 'text-success'}`}>
                        {Math.max(0, lunchAllowance - breakTimer)}m
                     </p>
                  </div>
               </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="stat-card">
          <div className="stat-card-icon bg-success">
            <span className="text-primary-foreground font-bold">
              {(attendance || []).filter(a => a?.status === 'Present' || a?.status === 'Overtime').length}
            </span>
          </div>
          <div><p className="text-xs text-muted-foreground">Present</p></div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon bg-warning">
            <span className="text-primary-foreground font-bold">
              {(attendance || []).filter(a => a?.status === 'Late' || a?.status === 'Half Day').length}
            </span>
          </div>
          <div><p className="text-xs text-muted-foreground">Late / Half</p></div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon bg-primary">
            <span className="text-primary-foreground font-bold">
              {Math.round((attendance || []).reduce((s, a) => s + (Number(a?.hours_worked) || 0), 0))}
            </span>
          </div>
          <div><p className="text-xs text-muted-foreground">Work Hours</p></div>
        </div>
      </div>

      <div className="card-nawi p-0 overflow-x-auto">
        <table className="table-nawi w-full text-xs">
          <thead><tr><th>Date</th><th>Login</th><th>Logout</th><th>Break</th><th>Work</th><th>Summary</th><th>Status</th></tr></thead>
          <tbody>
            {!attendance || attendance.length === 0 ? <tr><td colSpan={7} className="text-center text-muted-foreground py-8">No records found for this period</td></tr> :
              attendance.map((a) => (
                <tr key={a?.id || Math.random()} className={a?.is_auto_logout ? 'bg-destructive/5' : ''}>
                  <td>{a?.date ? formatDate(a.date) : '—'}</td>
                  <td>{safeTime(a?.login_time)}</td>
                  <td>
                    {a?.logout_time ? safeTime(a.logout_time) : '—'}
                    {a?.is_auto_logout && <span className="block text-[9px] text-destructive font-bold uppercase">Auto</span>}
                  </td>
                  <td>{a?.total_break_minutes || 0}m</td>
                  <td><span className="font-bold">{a?.hours_worked || 0}h</span></td>
                  <td className="max-w-[150px] truncate">{a?.work_summary || '—'}</td>
                  <td><StatusBadge status={a?.status || 'Present'} /></td>
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
