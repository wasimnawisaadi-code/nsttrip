import { useState, useEffect } from 'react';
import { exportToExcel } from '@/lib/excel-export';
import { Link } from 'react-router-dom';
import { Users, TrendingUp, CheckSquare, UserCheck, AlertTriangle, ArrowUpRight, ArrowDownRight, DollarSign, Briefcase, Download, Calendar, Clock, Target } from 'lucide-react';
import { formatCurrency, formatDate, daysUntil } from '@/lib/supabase-service';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/integrations/supabase/client';
import StatusBadge from '@/components/ui/StatusBadge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, Legend, LineChart, Line } from 'recharts';
import DSRDashboardWidget from '@/components/dashboard/DSRDashboardWidget';
import SocialLeadsDashboardWidget from '@/components/dashboard/SocialLeadsDashboardWidget';

const COLORS = ['#052F59', '#1A5B96', '#0A7040', '#C45000', '#C0392B', '#64748B', '#7C3AED', '#0891B2'];

export default function AdminDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [tab, setTab] = useState('dashboard');
  const [reportMonth, setReportMonth] = useState(() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`; });
  const [viewType, setViewType] = useState<'monthly' | 'weekly' | 'annual'>('monthly');

  useEffect(() => {
    const load = async () => {
      const [clientsRes, tasksRes, profilesRes, attendanceRes, quotationsRes, auditRes, leaveRes] = await Promise.all([
        supabase.from('clients').select('*'),
        supabase.from('tasks').select('*'),
        supabase.from('profiles').select('*'),
        supabase.from('attendance').select('*'),
        supabase.from('quotations').select('*'),
        supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(15),
        supabase.from('leave_requests').select('*'),
      ]);

      const clients = clientsRes.data || [];
      const clientIds = new Set(clients.map(c => c.id));
      
      const tasks = (tasksRes.data || []).filter((t: any) => t.client_id && clientIds.has(t.client_id));
      const employees = profilesRes.data || [];
      const attendance = attendanceRes.data || [];
      const quotations = (quotationsRes.data || []).filter((q: any) => q.client_id && clientIds.has(q.client_id));
      const auditLog = auditRes.data || [];
      const leave = leaveRes.data || [];

      const now = new Date();
      const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const lastMonth = `${now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()}-${String(now.getMonth() === 0 ? 12 : now.getMonth()).padStart(2, '0')}`;
      const today = now.toISOString().split('T')[0];

      const revenueThisMonth = clients.filter((c: any) => c.created_at?.startsWith(thisMonth)).reduce((s: number, c: any) => s + (c.revenue || 0), 0);
      const revenueLastMonth = clients.filter((c: any) => c.created_at?.startsWith(lastMonth)).reduce((s: number, c: any) => s + (c.revenue || 0), 0);
      const profitThisMonth = clients.filter((c: any) => c.created_at?.startsWith(thisMonth)).reduce((s: number, c: any) => s + (c.profit || 0), 0);
      const totalRevenue = clients.reduce((s: number, c: any) => s + (c.revenue || 0), 0);
      const totalProfit = clients.reduce((s: number, c: any) => s + (c.profit || 0), 0);

      const activeTasks = tasks.filter((t: any) => t.status === 'New' || t.status === 'Processing').length;
      const overdueTasks = tasks.filter((t: any) => (t.status === 'New' || t.status === 'Processing') && t.due_date && new Date(t.due_date) < now).length;
      const completedTasks = tasks.filter((t: any) => t.status === 'Completed' && t.completed_date?.startsWith(thisMonth)).length;
      
      const activeEmployeeIds = new Set(employees.filter(e => e.status === 'active').map(e => e.user_id));
      const employeesOnline = attendance.filter((a: any) => a.date === today && !a.logout_time && activeEmployeeIds.has(a.employee_id)).length;
      const totalActiveEmp = employees.filter((e: any) => e.status === 'active').length;
      const pendingLeave = leave.filter((l: any) => l.status === 'Pending').length;

      const clientsThisMonth = clients.filter((c: any) => c.created_at?.startsWith(thisMonth)).length;
      const clientsLastMonth = clients.filter((c: any) => c.created_at?.startsWith(lastMonth)).length;

      const serviceCounts: Record<string, number> = {};
      const serviceRevenue: Record<string, number> = {};
      clients.forEach((c: any) => {
        if (c.service) {
          serviceCounts[c.service] = (serviceCounts[c.service] || 0) + 1;
          serviceRevenue[c.service] = (serviceRevenue[c.service] || 0) + (c.revenue || 0);
        }
      });
      const serviceData = Object.entries(serviceCounts).map(([name, value]) => ({ name, value, revenue: serviceRevenue[name] || 0 }));

      const revenueData: any[] = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const label = d.toLocaleDateString('en-US', { month: 'short' });
        const rev = clients.filter((c: any) => c.created_at?.startsWith(key)).reduce((s: number, c: any) => s + (c.revenue || 0), 0);
        const prof = clients.filter((c: any) => c.created_at?.startsWith(key)).reduce((s: number, c: any) => s + (c.profit || 0), 0);
        const clt = clients.filter((c: any) => c.created_at?.startsWith(key)).length;
        revenueData.push({ month: label, revenue: rev, profit: prof, clients: clt });
      }

      const statusCounts: Record<string, number> = { New: 0, Processing: 0, Success: 0, Failed: 0 };
      clients.forEach((c: any) => { if (statusCounts[c.status] !== undefined) statusCounts[c.status]++; });

      const upcomingDates: any[] = [];
      clients.forEach((c: any) => {
        Object.entries((c.important_dates as Record<string, string>) || {}).forEach(([type, val]) => {
          if (!val || type === 'passportNo') return;
          const days = daysUntil(val as string);
          if (days >= 0 && days <= 30) upcomingDates.push({ clientName: c.name, clientId: c.id, type, date: val, days, mobile: c.mobile });
        });
      });
      upcomingDates.sort((a, b) => a.days - b.days);

      const todayAttendance = attendance
        .filter((a: any) => a.date === today && activeEmployeeIds.has(a.employee_id))
        .map((a: any) => {
          const emp = employees.find((e: any) => e.user_id === a.employee_id);
          return { ...a, name: emp?.name || 'Unknown', photo: emp?.photo_url };
        });

      const topEmployees = employees.filter((e: any) => e.status === 'active').map((e: any) => {
        const empAttendance = attendance.filter((a: any) => a.employee_id === e.user_id && a.date?.startsWith(reportMonth));
        let totalHours = empAttendance.reduce((s: number, a: any) => s + (a.hours_worked || 0), 0);
        
        // Include live shift duration for currently logged-in employees
        const active = empAttendance.find((a: any) => a.login_time && !a.logout_time && a.date === today);
        if (active) {
          const liveDuration = (new Date().getTime() - new Date(active.login_time).getTime()) / 3600000;
          totalHours += liveDuration;
        }

        const ec = clients.filter((c: any) => c.assigned_to === e.user_id);
        const successRate = ec.length > 0 ? Math.round((ec.filter((c: any) => c.status === 'Success').length / ec.length) * 100) : 0;

        return {
          name: e.name, id: e.user_id, photo: e.photo_url,
          clients: ec.length,
          revenue: ec.reduce((s: number, c: any) => s + (c.revenue || 0), 0),
          profit: ec.reduce((s: number, c: any) => s + (c.profit || 0), 0),
          tasks: tasks.filter((t: any) => t.assigned_to === e.user_id && t.status === 'Completed').length,
          successRate,
          presentDays: empAttendance.filter((a: any) => a.status === 'Present' || a.status === 'Late').length,
          totalHours: Math.round(totalHours * 10) / 10,
          avgHours: empAttendance.length > 0 ? Math.round((totalHours / empAttendance.length) * 10) / 10 : 0,
        };
      }).sort((a, b) => b.revenue - a.revenue);

      const leadCounts: Record<string, number> = {};
      const leadRevenue: Record<string, number> = {};
      clients.forEach((c: any) => {
        if (c.lead_source) {
          leadCounts[c.lead_source] = (leadCounts[c.lead_source] || 0) + 1;
          leadRevenue[c.lead_source] = (leadRevenue[c.lead_source] || 0) + (c.revenue || 0);
        }
      });
      const leadData = Object.entries(leadCounts).map(([name, value]) => ({ name, value, revenue: leadRevenue[name] || 0 }));

      const nationalityCounts: Record<string, number> = {};
      clients.forEach((c: any) => {
        const nat = c.nationality || (c.service_details as any)?.nationality || 'Unknown';
        if (nat) nationalityCounts[nat] = (nationalityCounts[nat] || 0) + 1;
      });
      const nationalityData = Object.entries(nationalityCounts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10);

      setData({
        totalClients: clients.length, clientsThisMonth, clientsLastMonth,
        revenueThisMonth, revenueLastMonth, profitThisMonth, totalRevenue, totalProfit,
        activeTasks, overdueTasks, completedTasks, pendingLeave,
        employeesOnline, totalActiveEmp,
        serviceData, revenueData, statusCounts,
        upcomingDates,
        todayAttendance,
        recentAudit: auditLog,
        topEmployees, leadData, nationalityData,
        allClients: clients, allEmployees: employees, allTasks: tasks, allQuotations: quotations,
      });
    };
    load();
  }, [reportMonth]);

  if (!data) return <div className="skeleton-nawi h-96 w-full" />;

  const revenueChange = data.revenueLastMonth > 0 ? Math.round(((data.revenueThisMonth - data.revenueLastMonth) / data.revenueLastMonth) * 100) : 0;
  const clientChange = data.clientsLastMonth > 0 ? Math.round(((data.clientsThisMonth - data.clientsLastMonth) / data.clientsLastMonth) * 100) : 0;

  const exportCSV = (rows: any[], filename: string) => {
    exportToExcel(rows, filename.replace(/\.csv$/, ''), 'Sheet1');
  };

  const tabs = ['dashboard', 'reports', 'clients', 'employees', 'services', 'revenue'];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 border-b border-border overflow-x-auto">
          {tabs.map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-2.5 text-sm font-medium capitalize whitespace-nowrap ${tab === t ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}>{t}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <select value={viewType} onChange={(e) => setViewType(e.target.value as any)} className="input-nawi w-auto text-sm">
            <option value="monthly">Monthly</option><option value="weekly">Weekly</option><option value="annual">Annual</option>
          </select>
          <input type="month" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} className="input-nawi w-auto text-sm" />
        </div>
      </div>

      {tab === 'dashboard' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="card-nawi relative overflow-hidden">
              <div className="absolute top-0 right-0 w-16 h-16 bg-secondary/10 rounded-bl-[40px]" />
              <div className="relative">
                <Users className="w-5 h-5 text-secondary mb-2" />
                <p className="text-2xl font-bold font-display">{data.totalClients}</p>
                <p className="text-xs text-muted-foreground">Clients</p>
                {clientChange !== 0 && <span className={`text-xs font-medium ${clientChange > 0 ? 'text-success' : 'text-destructive'}`}>{clientChange > 0 ? '+' : ''}{clientChange}%</span>}
              </div>
            </div>
            <div className="card-nawi relative overflow-hidden">
              <div className="absolute top-0 right-0 w-16 h-16 bg-success/10 rounded-bl-[40px]" />
              <div className="relative">
                <TrendingUp className="w-5 h-5 text-success mb-2" />
                <p className="text-2xl font-bold font-display">{formatCurrency(data.revenueThisMonth)}</p>
                <p className="text-xs text-muted-foreground">Revenue</p>
                {revenueChange !== 0 && <span className={`text-xs font-medium ${revenueChange > 0 ? 'text-success' : 'text-destructive'}`}>{revenueChange > 0 ? '+' : ''}{revenueChange}%</span>}
              </div>
            </div>
            <div className="card-nawi relative overflow-hidden">
              <div className="absolute top-0 right-0 w-16 h-16 bg-primary/10 rounded-bl-[40px]" />
              <div className="relative">
                <DollarSign className="w-5 h-5 text-primary mb-2" />
                <p className="text-2xl font-bold font-display text-success">{formatCurrency(data.profitThisMonth)}</p>
                <p className="text-xs text-muted-foreground">Profit</p>
              </div>
            </div>
            <div className="card-nawi relative overflow-hidden">
              <div className="absolute top-0 right-0 w-16 h-16 bg-warning/10 rounded-bl-[40px]" />
              <div className="relative">
                <CheckSquare className="w-5 h-5 text-warning mb-2" />
                <p className="text-2xl font-bold font-display">{data.activeTasks}</p>
                <p className="text-xs text-muted-foreground">Active Tasks</p>
                {data.overdueTasks > 0 && <span className="text-xs text-destructive font-medium">{data.overdueTasks} overdue</span>}
              </div>
            </div>
            <div className="card-nawi relative overflow-hidden">
              <div className="absolute top-0 right-0 w-16 h-16 bg-primary/10 rounded-bl-[40px]" />
              <div className="relative">
                <UserCheck className="w-5 h-5 text-primary mb-2" />
                <p className="text-2xl font-bold font-display">{data.employeesOnline}/{data.totalActiveEmp}</p>
                <p className="text-xs text-muted-foreground">Online</p>
              </div>
            </div>
            <div className="card-nawi relative overflow-hidden">
              <div className="absolute top-0 right-0 w-16 h-16 bg-warning/10 rounded-bl-[40px]" />
              <div className="relative">
                <Calendar className="w-5 h-5 text-warning mb-2" />
                <p className="text-2xl font-bold font-display">{data.pendingLeave}</p>
                <p className="text-xs text-muted-foreground">Pending Leave</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Object.entries(data.statusCounts).map(([status, count]) => (
              <div key={status} className="card-nawi flex items-center justify-between py-3">
                <StatusBadge status={status} />
                <span className="text-lg font-bold font-display">{count as number}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <DSRDashboardWidget basePath="/admin" />
            <SocialLeadsDashboardWidget basePath="/admin" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="card-nawi lg:col-span-2">
              <h3 className="text-base font-semibold font-display mb-4">Revenue & Profit Trend</h3>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={data.revenueData}>
                  <defs>
                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#052F59" stopOpacity={0.15} /><stop offset="95%" stopColor="#052F59" stopOpacity={0} /></linearGradient>
                    <linearGradient id="colorProf" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0A7040" stopOpacity={0.15} /><stop offset="95%" stopColor="#0A7040" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(213,45%,92%)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Legend />
                  <Area type="monotone" dataKey="revenue" stroke="#052F59" fill="url(#colorRev)" strokeWidth={2} name="Revenue" />
                  <Area type="monotone" dataKey="profit" stroke="#0A7040" fill="url(#colorProf)" strokeWidth={2} name="Profit" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="card-nawi">
              <h3 className="text-base font-semibold font-display mb-4">Service Distribution</h3>
              {data.serviceData.length === 0 ? <p className="text-sm text-muted-foreground text-center py-16">No data</p> : (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={data.serviceData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={75} paddingAngle={3}
                      label={({ name, percent }) => `${name.split(' ')[0]} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                      {data.serviceData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">By Status</p>
                <div className="space-y-1.5">
                  {(['New', 'Processing', 'Success', 'Failed'] as const).map(st => {
                    const count = (data.statusCounts[st] as number) || 0;
                    const total = data.totalClients || 1;
                    const pct = Math.round((count / total) * 100);
                    const color = st === 'New' ? '#1A5B96' : st === 'Processing' ? '#C45000' : st === 'Success' ? '#0A7040' : '#C0392B';
                    return (
                      <div key={st} className="flex items-center gap-2 text-xs">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                        <span className="w-20 shrink-0">{st}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                        </div>
                        <span className="w-8 text-right font-mono font-medium">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="card-nawi">
              <h3 className="text-base font-semibold font-display mb-3">Top Performers</h3>
              {data.topEmployees.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">No employees</p> : (
                <div className="space-y-2">
                  {data.topEmployees.slice(0, 5).map((emp: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors">
                      <span className="text-xs font-bold text-muted-foreground w-4">{i + 1}</span>
                      {emp.photo ? <img src={emp.photo} alt="" className="w-8 h-8 rounded-full object-cover" /> :
                        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-primary-foreground">{emp.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</div>}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{emp.name}</p>
                        <p className="text-xs text-muted-foreground">{emp.clients} clients</p>
                      </div>
                      <span className="text-sm font-semibold text-success">{formatCurrency(emp.revenue)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card-nawi">
              <h3 className="text-base font-semibold font-display mb-3">Lead Sources</h3>
              {data.leadData.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">No data</p> : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.leadData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(213,45%,92%)" />
                    <XAxis type="number" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
                    <Tooltip /><Bar dataKey="value" fill="#1A5B96" radius={[0, 4, 4, 0]} name="Clients" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="card-nawi">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold font-display">Upcoming Dates</h3>
                <Link to="/admin/important-dates" className="text-xs text-secondary hover:underline">View All →</Link>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {data.upcomingDates.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">No upcoming dates</p> :
                  data.upcomingDates.slice(0, 8).map((d: any, i: number) => (
                    <Link key={i} to={`/admin/clients/${d.clientId}`} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted transition-colors">
                      <div>
                        <p className="text-sm font-medium">{d.clientName}</p>
                        <p className="text-xs text-muted-foreground capitalize">{d.type.replace(/([A-Z])/g, ' $1').trim()}</p>
                      </div>
                      <span className={`text-xs font-bold ${d.days <= 3 ? 'text-destructive' : d.days <= 7 ? 'text-warning' : 'text-success'}`}>
                        {d.days === 0 ? 'Today!' : `${d.days}d`}
                      </span>
                    </Link>
                  ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card-nawi">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold font-display">Today's Attendance</h3>
                <Link to="/admin/attendance" className="text-xs text-secondary hover:underline">View All →</Link>
              </div>
              {data.todayAttendance.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">No records</p> : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {data.todayAttendance.map((a: any) => (
                    <div key={a.id} className="flex items-center gap-2 p-2 rounded-lg border border-border">
                      {a.photo ? <img src={a.photo} alt="" className="w-8 h-8 rounded-full object-cover" /> :
                        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-primary-foreground">{a.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</div>}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{a.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {a.login_time ? new Date(a.login_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}
                          {a.logout_time ? ` → ${new Date(a.logout_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}` : ''}
                        </p>
                      </div>
                      <StatusBadge status={a.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card-nawi">
              <h3 className="text-base font-semibold font-display mb-3">Recent Activity</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {data.recentAudit.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">No activity</p> :
                  data.recentAudit.map((a: any) => (
                    <div key={a.id} className="flex items-start gap-2 text-sm">
                      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${a.action.includes('delete') ? 'bg-destructive' : a.action.includes('create') ? 'bg-success' : 'bg-secondary'}`} />
                      <div>
                        <p><span className="font-medium">{a.user_name}</span> {a.action.replace(/_/g, ' ')}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(a.created_at)}</p>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </>
      )}

      {tab === 'reports' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="stat-card"><div className="stat-card-icon bg-primary"><Briefcase className="w-6 h-6 text-primary-foreground" /></div><div><p className="text-xs text-muted-foreground">Total Clients</p><p className="text-xl font-bold font-display">{data.totalClients}</p></div></div>
            <div className="stat-card"><div className="stat-card-icon bg-success"><TrendingUp className="w-6 h-6 text-primary-foreground" /></div><div><p className="text-xs text-muted-foreground">Total Revenue</p><p className="text-xl font-bold font-display">{formatCurrency(data.totalRevenue)}</p></div></div>
            <div className="stat-card"><div className="stat-card-icon bg-secondary"><DollarSign className="w-6 h-6 text-primary-foreground" /></div><div><p className="text-xs text-muted-foreground">Total Profit</p><p className="text-xl font-bold font-display">{formatCurrency(data.totalProfit)}</p></div></div>
            <div className="stat-card"><div className="stat-card-icon bg-warning"><Target className="w-6 h-6 text-primary-foreground" /></div><div><p className="text-xs text-muted-foreground">Conversion Rate</p><p className="text-xl font-bold font-display">{data.totalClients > 0 ? Math.round((data.statusCounts.Success / data.totalClients) * 100) : 0}%</p></div></div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card-nawi">
              <h3 className="text-base font-semibold font-display mb-4">Client Acquisition & Revenue Trend</h3>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={data.revenueData}>
                  <defs>
                    <linearGradient id="rG2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#052F59" stopOpacity={0.15} /><stop offset="95%" stopColor="#052F59" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(213,45%,92%)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip formatter={(v: number) => typeof v === 'number' && v > 100 ? formatCurrency(v) : v} />
                  <Legend />
                  <Area type="monotone" dataKey="revenue" stroke="#052F59" fill="url(#rG2)" strokeWidth={2} name="Revenue" />
                  <Line type="monotone" dataKey="clients" stroke="#C45000" strokeWidth={2} name="New Clients" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="card-nawi">
              <h3 className="text-base font-semibold font-display mb-4">Revenue by Lead Source</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.leadData}><CartesianGrid strokeDasharray="3 3" stroke="hsl(213,45%,92%)" /><XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip formatter={(v: number) => formatCurrency(v)} /><Bar dataKey="revenue" fill="#1A5B96" radius={[4, 4, 0, 0]} /></BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="card-nawi">
            <h3 className="text-base font-semibold font-display mb-4">Nationality Distribution</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data.nationalityData} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="hsl(213,45%,92%)" /><XAxis type="number" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} /><Tooltip /><Bar dataKey="value" fill="#052F59" radius={[0, 4, 4, 0]} name="Clients" /></BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {tab === 'clients' && (
        <div className="card-nawi">
          <div className="flex justify-end mb-3">
            <button onClick={() => exportCSV(data.allClients.map((c: any) => ({ ID: c.display_id, Name: c.name, Service: c.service, Status: c.status, Revenue: c.revenue, Profit: c.profit, LeadSource: c.lead_source, Nationality: c.nationality || '', Created: formatDate(c.created_at) })), 'clients_report.csv')} className="btn-outline text-sm"><Download className="w-4 h-4" /> Export</button>
          </div>
          <div className="overflow-x-auto">
            <table className="table-nawi w-full"><thead><tr><th>ID</th><th>Name</th><th>Service</th><th>Status</th><th>Lead Source</th><th>Revenue</th><th>Profit</th><th>Created</th></tr></thead>
              <tbody>{data.allClients.slice(0, 50).map((c: any) => <tr key={c.id}><td className="font-mono text-xs">{c.display_id}</td><td>{c.name}</td><td>{c.service}</td><td><StatusBadge status={c.status} /></td><td>{c.lead_source}</td><td>{formatCurrency(c.revenue || 0)}</td><td className="text-success">{formatCurrency(c.profit || 0)}</td><td>{formatDate(c.created_at)}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'employees' && (
        <div className="card-nawi p-0 overflow-x-auto">
          <div className="p-4 flex justify-end"><button onClick={() => exportCSV(data.topEmployees.map((e: any) => ({ Name: e.name, Clients: e.clients, Revenue: e.revenue, Profit: e.profit, TasksDone: e.tasks, SuccessRate: e.successRate + '%', PresentDays: e.presentDays })), 'employee_performance.csv')} className="btn-outline text-sm"><Download className="w-4 h-4" /> Export</button></div>
          <table className="table-nawi w-full">
            <thead><tr><th>Employee</th><th>Clients</th><th>Revenue</th><th>Profit</th><th>Success %</th><th>Total Hours</th><th>Avg/Day</th></tr></thead>
            <tbody>{data.topEmployees.map((e: any) => (
              <tr key={e.id}>
                <td className="font-medium">
                  <div className="flex items-center gap-2">
                    {e.photo ? <img src={e.photo} alt="" className="w-7 h-7 rounded-full object-cover" /> :
                      <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-[10px] font-bold text-primary-foreground">{e.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</div>}
                    {e.name}
                  </div>
                </td>
                <td>{e.clients}</td><td>{formatCurrency(e.revenue)}</td><td className="text-success">{formatCurrency(e.profit)}</td>
                <td><div className="flex items-center gap-2"><div className="w-16 h-2 bg-muted rounded-full"><div className="h-full bg-primary rounded-full" style={{ width: `${e.successRate}%` }} /></div><span className="text-xs">{e.successRate}%</span></div></td>
                <td className="font-semibold">{e.totalHours}h</td>
                <td className="text-primary font-medium">{e.avgHours}h</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {tab === 'services' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card-nawi">
            <h3 className="text-base font-semibold font-display mb-4">Service Distribution</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart><Pie data={data.serviceData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={100} paddingAngle={3} label>{data.serviceData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /></PieChart>
            </ResponsiveContainer>
          </div>
          <div className="card-nawi">
            <h3 className="text-base font-semibold font-display mb-4">Revenue by Service</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.serviceData} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="hsl(213,45%,92%)" /><XAxis type="number" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} /><Tooltip formatter={(v: number) => formatCurrency(v)} /><Bar dataKey="revenue" fill="#052F59" radius={[0, 4, 4, 0]} /></BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {tab === 'revenue' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card-nawi text-center"><p className="text-xs text-muted-foreground">Total Revenue</p><p className="text-2xl font-bold font-display">{formatCurrency(data.totalRevenue)}</p></div>
            <div className="card-nawi text-center"><p className="text-xs text-muted-foreground">Total Profit</p><p className="text-2xl font-bold font-display text-success">{formatCurrency(data.totalProfit)}</p></div>
            <div className="card-nawi text-center"><p className="text-xs text-muted-foreground">Profit Margin</p><p className="text-2xl font-bold font-display">{data.totalRevenue > 0 ? Math.round((data.totalProfit / data.totalRevenue) * 100) : 0}%</p></div>
          </div>
          <div className="card-nawi">
            <h3 className="text-base font-semibold font-display mb-4">Revenue vs Profit by Month</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.revenueData}><CartesianGrid strokeDasharray="3 3" stroke="hsl(213,45%,92%)" /><XAxis dataKey="month" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip formatter={(v: number) => formatCurrency(v)} /><Legend /><Bar dataKey="revenue" fill="#052F59" radius={[4, 4, 0, 0]} name="Revenue" /><Bar dataKey="profit" fill="#0A7040" radius={[4, 4, 0, 0]} name="Profit" /></BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
