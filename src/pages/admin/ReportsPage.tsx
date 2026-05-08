import { useState, useEffect } from 'react';
import { exportToExcel } from '@/lib/excel-export';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency, formatDate } from '@/lib/supabase-service';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';
import { Download, TrendingUp, Users, Briefcase, DollarSign } from 'lucide-react';

const COLORS = ['#052F59', '#1A5B96', '#0A7040', '#C45000', '#C0392B', '#64748B', '#7C3AED', '#0891B2'];

export default function ReportsPage() {
  const [tab, setTab] = useState('overview');
  const now = new Date();
  const [yearMonth, setYearMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [viewType, setViewType] = useState<'monthly' | 'weekly' | 'annual'>('monthly');
  const [clients, setClients] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [dsrEntries, setDsrEntries] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      const [c, e, t, a, dsr] = await Promise.all([
        supabase.from('clients').select('*'),
        supabase.from('profiles').select('*'),
        supabase.from('tasks').select('*'),
        supabase.from('attendance').select('*'),
        supabase.from('dsr_entries').select('*'),
      ]);
      const clientsData = c.data || [];
      const employeesData = e.data || [];
      const tasksData = t.data || [];
      const attendanceData = a.data || [];
      const dsrEntries = dsr.data || [];

      setClients(clientsData);
      setEmployees(employeesData);
      setTasks(tasksData);
      setAttendance(attendanceData);
      setDsrEntries(dsrEntries);
    };
    load();
  }, []);

  const exportCSV = (data: any[], filename: string) => {
    exportToExcel(data, filename.replace(/\.csv$/, ''), 'Sheet1');
  };

  const serviceCounts: Record<string, number> = {};
  const serviceRevenue: Record<string, number> = {};
  clients.forEach((c: any) => {
    if (c.service) {
      serviceCounts[c.service] = (serviceCounts[c.service] || 0) + 1;
      serviceRevenue[c.service] = (serviceRevenue[c.service] || 0) + (c.revenue || 0);
    }
  });
  const serviceData = Object.entries(serviceCounts).map(([name, count]) => ({ name, count, revenue: serviceRevenue[name] || 0 }));

  const leadRevenue: Record<string, number> = {};
  clients.forEach((c: any) => { if (c.lead_source) leadRevenue[c.lead_source] = (leadRevenue[c.lead_source] || 0) + (c.revenue || 0); });
  const leadData = Object.entries(leadRevenue).map(([name, revenue]) => ({ name, revenue }));

  const monthlyTrend: any[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    monthlyTrend.push({
      month: label,
      clients: clients.filter((c: any) => c.created_at?.startsWith(key)).length,
      revenue: dsrEntries.filter((e: any) => e.entry_date?.startsWith(key)).reduce((s: number, e: any) => s + (e.sale_amount || 0), 0),
      profit: dsrEntries.filter((e: any) => e.entry_date?.startsWith(key)).reduce((s: number, e: any) => s + (e.profit_amount || 0), 0),
    });
  }

  const empPerformance = employees.filter((e: any) => e.status === 'active').map((e: any) => {
    const empClients = clients.filter((c: any) => c.assigned_to === e.user_id);
    const empDsr = dsrEntries.filter((dsr: any) => dsr.employee_id === e.user_id && dsr.entry_date?.startsWith(yearMonth));
    const empTasks = tasks.filter((t: any) => t.assigned_to === e.user_id);
    const empAttendance = attendance.filter((a: any) => a.employee_id === e.user_id && a.date?.startsWith(yearMonth));
    return {
      name: e.name, id: e.user_id,
      totalClients: empClients.length,
      revenue: empDsr.reduce((s: number, dsr: any) => s + (dsr.sale_amount || 0), 0),
      profit: empDsr.reduce((s: number, dsr: any) => s + (dsr.profit_amount || 0), 0),
      tasksTotal: empTasks.length,
      tasksCompleted: empTasks.filter((t: any) => t.status === 'Completed').length,
      successRate: empClients.length > 0 ? Math.round((empClients.filter((c: any) => c.status === 'Success').length / empClients.length) * 100) : 0,
      presentDays: empAttendance.filter((a: any) => a.status === 'Present' || a.status === 'Late').length,
    };
  }).sort((a, b) => b.revenue - a.revenue);

  const totalRevenue = dsrEntries.reduce((s: number, e: any) => s + (e.sale_amount || 0), 0);
  const totalProfit = dsrEntries.reduce((s: number, e: any) => s + (e.profit_amount || 0), 0);

  const tabs = ['overview', 'clients', 'services', 'employees', 'revenue'];

  // Date-range filter for clients
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const filteredClients = clients.filter((c: any) => {
    if (!c.created_at) return true;
    const d = c.created_at.slice(0, 10);
    if (dateFrom && d < dateFrom) return false;
    if (dateTo && d > dateTo) return false;
    return true;
  });

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold font-display">Reports & Analytics</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input-nawi w-auto text-sm" placeholder="From" />
          <span className="text-xs text-muted-foreground">→</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input-nawi w-auto text-sm" placeholder="To" />
          <select value={viewType} onChange={(e) => setViewType(e.target.value as any)} className="input-nawi w-auto text-sm">
            <option value="monthly">Monthly</option><option value="weekly">Weekly</option><option value="annual">Annual</option>
          </select>
          <input type="month" value={yearMonth} onChange={(e) => setYearMonth(e.target.value)} className="input-nawi w-auto text-sm" />
        </div>
      </div>

      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {tabs.map((t) => <button key={t} onClick={() => setTab(t)} className={`px-4 py-2.5 text-sm font-medium capitalize whitespace-nowrap ${tab === t ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground'}`}>{t}</button>)}
      </div>

      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="stat-card"><div className="stat-card-icon bg-primary"><Briefcase className="w-6 h-6 text-primary-foreground" /></div><div><p className="text-xs text-muted-foreground">Total Clients</p><p className="text-xl font-bold font-display">{clients.length}</p></div></div>
            <div className="stat-card"><div className="stat-card-icon bg-success"><TrendingUp className="w-6 h-6 text-primary-foreground" /></div><div><p className="text-xs text-muted-foreground">Total Revenue</p><p className="text-xl font-bold font-display">{formatCurrency(totalRevenue)}</p></div></div>
            <div className="stat-card"><div className="stat-card-icon bg-secondary"><DollarSign className="w-6 h-6 text-primary-foreground" /></div><div><p className="text-xs text-muted-foreground">Total Profit</p><p className="text-xl font-bold font-display">{formatCurrency(totalProfit)}</p></div></div>
            <div className="stat-card"><div className="stat-card-icon bg-warning"><Users className="w-6 h-6 text-primary-foreground" /></div><div><p className="text-xs text-muted-foreground">Active Employees</p><p className="text-xl font-bold font-display">{employees.filter((e: any) => e.status === 'active').length}</p></div></div>
          </div>
          <div className="card-nawi">
            <h3 className="text-base font-semibold font-display mb-4">Revenue & Profit Trend</h3>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={monthlyTrend}>
                <defs>
                  <linearGradient id="rGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#052F59" stopOpacity={0.15} /><stop offset="95%" stopColor="#052F59" stopOpacity={0} /></linearGradient>
                  <linearGradient id="pGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0A7040" stopOpacity={0.15} /><stop offset="95%" stopColor="#0A7040" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(213,45%,92%)" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Area type="monotone" dataKey="revenue" stroke="#052F59" fill="url(#rGrad)" strokeWidth={2} name="Revenue" />
                <Area type="monotone" dataKey="profit" stroke="#0A7040" fill="url(#pGrad)" strokeWidth={2} name="Profit" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {tab === 'clients' && (
        <div className="card-nawi">
          <div className="flex justify-between items-center mb-3">
            <p className="text-xs text-muted-foreground">{filteredClients.length} of {clients.length} clients{(dateFrom || dateTo) && ' (filtered)'}</p>
            <button onClick={() => exportCSV(filteredClients.map((c: any) => ({ ID: c.display_id, Name: c.name, Service: c.service, Status: c.status, Revenue: c.revenue, Profit: c.profit, LeadSource: c.lead_source, Created: formatDate(c.created_at) })), 'clients_report.csv')} className="btn-outline text-sm"><Download className="w-4 h-4" /> Export</button>
          </div>
          <div className="overflow-x-auto">
            <table className="table-nawi w-full"><thead><tr><th>ID</th><th>Name</th><th>Service</th><th>Status</th><th>Lead Source</th><th>Revenue</th><th>Profit</th><th>Created</th></tr></thead>
              <tbody>{filteredClients.map((c: any) => <tr key={c.id}><td className="font-mono text-xs">{c.display_id}</td><td>{c.name}</td><td>{c.service}</td><td>{c.status}</td><td>{c.lead_source}</td><td>{formatCurrency(c.revenue || 0)}</td><td className="text-success">{formatCurrency(c.profit || 0)}</td><td>{formatDate(c.created_at)}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'services' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card-nawi">
            <h3 className="text-base font-semibold font-display mb-4">Service Distribution</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart><Pie data={serviceData} dataKey="count" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={100} paddingAngle={3} label>{serviceData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /></PieChart>
            </ResponsiveContainer>
          </div>
          <div className="card-nawi">
            <h3 className="text-base font-semibold font-display mb-4">Revenue by Service</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={serviceData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(213,45%,92%)" /><XAxis type="number" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} /><Bar dataKey="revenue" fill="#052F59" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {tab === 'employees' && (
        <div className="card-nawi p-0 overflow-x-auto">
          <div className="p-4 flex justify-end"><button onClick={() => exportCSV(empPerformance.map(e => ({ Name: e.name, Clients: e.totalClients, Revenue: e.revenue, Profit: e.profit, Tasks: e.tasksCompleted, SuccessRate: e.successRate + '%' })), 'employee_performance.csv')} className="btn-outline text-sm"><Download className="w-4 h-4" /> Export</button></div>
          <table className="table-nawi w-full">
            <thead><tr><th>Employee</th><th>Clients</th><th>Revenue</th><th>Profit</th><th>Tasks Done</th><th>Success Rate</th><th>Present Days</th></tr></thead>
            <tbody>{empPerformance.map((e) => (
              <tr key={e.id}>
                <td className="font-medium">{e.name}</td><td>{e.totalClients}</td>
                <td>{formatCurrency(e.revenue)}</td><td className="text-success">{formatCurrency(e.profit)}</td>
                <td>{e.tasksCompleted}/{e.tasksTotal}</td>
                <td><div className="flex items-center gap-2"><div className="w-16 h-2 bg-muted rounded-full"><div className="h-full bg-primary rounded-full" style={{ width: `${e.successRate}%` }} /></div><span className="text-xs">{e.successRate}%</span></div></td>
                <td>{e.presentDays}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {tab === 'revenue' && (
        <div className="space-y-6">
          <div className="card-nawi">
            <h3 className="text-base font-semibold font-display mb-4">Revenue by Lead Source</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={leadData}><CartesianGrid strokeDasharray="3 3" stroke="hsl(213,45%,92%)" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip formatter={(v: number) => formatCurrency(v)} /><Bar dataKey="revenue" fill="#1A5B96" radius={[4, 4, 0, 0]} /></BarChart>
            </ResponsiveContainer>
          </div>
          <div className="card-nawi">
            <h3 className="text-base font-semibold font-display mb-4">Client Acquisition Trend</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={monthlyTrend}><CartesianGrid strokeDasharray="3 3" stroke="hsl(213,45%,92%)" /><XAxis dataKey="month" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="clients" fill="#052F59" radius={[4, 4, 0, 0]} name="New Clients" /></BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      <footer className="mt-16 pb-8 text-center border-t border-border/10 pt-8">
        <p className="text-[10px] tracking-wider text-muted-foreground/60 font-medium italic">
          Designed and Developed by Mhd Wasim
        </p>
      </footer>
    </div>
  );
}
