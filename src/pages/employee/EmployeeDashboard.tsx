import { useState, useEffect } from 'react';
import { Users, TrendingUp, CheckSquare, Target, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { formatCurrency, formatDate, daysUntil } from '@/lib/supabase-service';
import StatusBadge from '@/components/ui/StatusBadge';
import { Link } from 'react-router-dom';
import DSRDashboardWidget from '@/components/dashboard/DSRDashboardWidget';
import SocialLeadsDashboardWidget from '@/components/dashboard/SocialLeadsDashboardWidget';

export default function EmployeeDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      const now = new Date();
      const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const today = now.toISOString().split('T')[0];

      const [clientsRes, tasksRes, attendanceRes, dsrRes] = await Promise.all([
        supabase.from('clients').select('*').or(`assigned_to.eq.${user.id},created_by.eq.${user.id}`),
        supabase.from('tasks').select('*').or(`assigned_to.eq.${user.id},created_by.eq.${user.id}`),
        supabase.from('attendance').select('*').eq('employee_id', user.id).eq('date', today).maybeSingle(),
        supabase.from('dsr_entries').select('*').eq('employee_id', user.id),
      ]);

      const clients = clientsRes.data || [];
      const tasks = tasksRes.data || [];
      const dsrEntries = dsrRes.data || [];

      const revenue = dsrEntries.filter(e => e.entry_date?.startsWith(thisMonth)).reduce((s, e) => s + (e.sale_amount || 0), 0);
      const todayTasks = tasks.filter(t => t.due_date === today && t.status !== 'Completed');
      const upcomingTasks = tasks.filter(t => t.due_date && t.due_date > today && t.status !== 'Completed').sort((a, b) => (a.due_date || '').localeCompare(b.due_date || '')).slice(0, 5);
      const completedTasks = tasks.filter(t => t.status === 'Completed').length;

      const upcomingDates: any[] = [];
      clients.forEach(c => {
        const dates = (c.important_dates as Record<string, string>) || {};
        Object.entries(dates).forEach(([type, val]) => {
          if (!val) return;
          const days = daysUntil(val);
          if (days >= 0 && days <= 14) upcomingDates.push({ clientName: c.name, clientId: c.id, type, date: val, days });
        });
      });
      upcomingDates.sort((a, b) => a.days - b.days);

      setData({
        totalClients: clients.length, revenue, todayTasks, upcomingTasks, completedTasks,
        upcomingDates: upcomingDates.slice(0, 8),
        recentClients: clients.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).slice(0, 5),
        attendance: attendanceRes.data,
      });
    };
    fetchData();
  }, [user]);

  if (!data) return <div className="skeleton-nawi h-96 w-full" />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card"><div className="stat-card-icon bg-secondary"><Users className="w-6 h-6 text-primary-foreground" /></div><div><p className="text-xs text-muted-foreground">My Clients</p><p className="text-xl font-bold font-display">{data.totalClients}</p></div></div>
        <div className="stat-card"><div className="stat-card-icon bg-success"><TrendingUp className="w-6 h-6 text-primary-foreground" /></div><div><p className="text-xs text-muted-foreground">Revenue This Month</p><p className="text-xl font-bold font-display">{formatCurrency(data.revenue)}</p></div></div>
        <div className="stat-card"><div className="stat-card-icon bg-warning"><CheckSquare className="w-6 h-6 text-primary-foreground" /></div><div><p className="text-xs text-muted-foreground">Tasks Due Today</p><p className="text-xl font-bold font-display">{data.todayTasks.length}</p></div></div>
        <div className="stat-card"><div className="stat-card-icon bg-primary"><Target className="w-6 h-6 text-primary-foreground" /></div><div><p className="text-xs text-muted-foreground">Tasks Completed</p><p className="text-xl font-bold font-display">{data.completedTasks}</p></div></div>
      </div>

      {data.attendance && (
        <div className="card-nawi flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-secondary" />
            <div>
              <p className="text-sm font-medium">Today's Attendance</p>
              <p className="text-xs text-muted-foreground">
                Login: {data.attendance.login_time ? new Date(data.attendance.login_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}
                {data.attendance.logout_time ? ` • Logout: ${new Date(data.attendance.logout_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}` : ' • Active'}
              </p>
            </div>
          </div>
          <StatusBadge status={data.attendance.status} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DSRDashboardWidget basePath="/employee" employeeId={user.id} />
        <SocialLeadsDashboardWidget basePath="/employee" employeeId={user.id} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card-nawi">
          <h3 className="font-semibold font-display mb-3">Today's Tasks</h3>
          {data.todayTasks.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">No tasks due today 🎉</p> : data.todayTasks.map((t: any) => (
            <div key={t.id} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted mb-2">
              <div><p className="text-sm font-medium">{t.title}</p><p className="text-xs text-muted-foreground">{t.client_name}</p></div>
              <StatusBadge status={t.status} />
            </div>
          ))}
        </div>
        <div className="card-nawi">
          <h3 className="font-semibold font-display mb-3">Upcoming Dates</h3>
          {data.upcomingDates.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">No upcoming dates</p> : data.upcomingDates.map((d: any, i: number) => (
            <Link key={i} to={`/employee/clients/${d.clientId}`} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted mb-2">
              <div><p className="text-sm font-medium">{d.clientName}</p><p className="text-xs text-muted-foreground capitalize">{d.type.replace(/([A-Z])/g, ' $1')}</p></div>
              <span className={`text-xs font-bold ${d.days <= 7 ? 'text-destructive' : 'text-warning'}`}>{d.days === 0 ? 'Today' : `${d.days}d`}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="card-nawi">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold font-display">Recent Clients</h3>
          <Link to="/employee/clients" className="text-xs text-secondary hover:underline">View All →</Link>
        </div>
        {data.recentClients.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">No clients yet</p> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.recentClients.map((c: any) => (
              <Link key={c.id} to={`/employee/clients/${c.id}`} className="p-3 border border-border rounded-lg hover:bg-muted transition-colors">
                <div className="flex items-center justify-between mb-1"><p className="text-sm font-medium truncate">{c.name}</p><StatusBadge status={c.status} /></div>
                <p className="text-xs text-muted-foreground">{c.service} • {formatDate(c.created_at)}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
      <footer className="mt-16 pb-8 text-center border-t border-border/10 pt-8">
        <p className="text-[10px] tracking-wider text-muted-foreground/60 font-medium italic">
          Designed and Developed by Mhd Wasim
        </p>
      </footer>
    </div>
  );
}
