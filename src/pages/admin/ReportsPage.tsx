import { useState, useEffect } from 'react';
import { exportToExcel } from '@/lib/excel-export';
import { calculateFinancials } from '@/lib/accounting-logic';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency, formatDate } from '@/lib/supabase-service';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';
import { Download, TrendingUp, Users, Briefcase } from 'lucide-react';

const COLORS = ['#052F59', '#1A5B96', '#0A7040', '#C45000', '#C0392B', '#64748B', '#7C3AED', '#0891B2'];

export default function ReportsPage() {
  const [tab, setTab] = useState('overview');
  const now = new Date();
  const [yearMonth, setYearMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [viewType, setViewType] = useState<'monthly' | 'weekly' | 'annual' | 'custom'>('monthly');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [clients, setClients] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [dsrEntries, setDsrEntries] = useState<any[]>([]);
  const [dataSource, setDataSource] = useState<'combined' | 'dsr' | 'clients'>('combined');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [serviceFilter, setServiceFilter] = useState('');

  useEffect(() => {
    const load = async () => {
      let start, end;
      if (viewType === 'custom') {
        start = dateFrom || '2000-01-01';
        end = dateTo || '2100-12-31';
      } else if (viewType === 'annual') {
        const y = yearMonth.split('-')[0];
        start = `${y}-01-01`;
        end = `${y}-12-31`;
      } else if (viewType === 'weekly') {
        const [y, m] = yearMonth.split('-').map(Number);
        const lastDay = new Date(y, m, 0);
        const firstDay = new Date(lastDay);
        firstDay.setDate(lastDay.getDate() - 6);
        start = firstDay.toISOString().split('T')[0];
        end = lastDay.toISOString().split('T')[0];
      } else {
        const [y, m] = yearMonth.split('-').map(Number);
        start = `${yearMonth}-01`;
        end = new Date(y, m, 0).toISOString().split('T')[0];
      }

      const [c, e, t, a, dsr] = await Promise.all([
        supabase.from('clients').select('*').gte('created_at', start).lte('created_at', end + 'T23:59:59').limit(100000),
        supabase.from('profiles').select('*'),
        supabase.from('tasks').select('*').limit(100000),
        supabase.from('attendance').select('*').gte('date', start).lte('date', end).limit(100000),
        supabase.from('dsr_entries').select('*').gte('entry_date', start).lte('entry_date', end).limit(100000),
      ]);
      setClients(c.data || []);
      setEmployees(e.data || []);
      setTasks(t.data || []);
      setAttendance(a.data || []);
      setDsrEntries(dsr.data || []);
    };
    load();
  }, [yearMonth, viewType, dateFrom, dateTo]);

  const exportCSV = (data: any[], filename: string) => {
    exportToExcel(data, filename.replace(/\.csv$/, ''), 'Sheet1');
  };

  const [rYear, rMonth] = yearMonth.split('-').map(Number);

  const matchesFilter = (dateStr: string | null) => {
    if (!dateStr) return false;
    if (viewType === 'custom') {
      const d = dateStr.slice(0, 10);
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    }
    if (viewType === 'monthly') return dateStr.startsWith(yearMonth);
    if (viewType === 'annual') return dateStr.startsWith(String(rYear));
    if (viewType === 'weekly') {
      const d = new Date(dateStr);
      const end = new Date(rYear, rMonth, 0);
      const diff = (end.getTime() - d.getTime()) / 86400000;
      return diff >= 0 && diff < 7;
    }
    return true;
  };

  const filteredClients = clients.filter(c => {
    if (!matchesFilter(c.created_at)) return false;
    if (searchTerm && !c.name?.toLowerCase().includes(searchTerm.toLowerCase()) && !c.display_id?.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (statusFilter && c.status !== statusFilter) return false;
    if (serviceFilter && c.service !== serviceFilter) return false;
    return true;
  });
  const filteredDsr = dsrEntries.filter(e => matchesFilter(e.entry_date));
  const filteredTasks = tasks.filter(t => matchesFilter(t.created_at));

  const serviceCounts: Record<string, number> = {};
  const serviceRevenue: Record<string, number> = {};
  filteredClients.forEach((c: any) => {
    if (c.service) {
      serviceCounts[c.service] = (serviceCounts[c.service] || 0) + 1;
      serviceRevenue[c.service] = (serviceRevenue[c.service] || 0) + (c.revenue || 0);
    }
  });
  const serviceData = Object.entries(serviceCounts).map(([name, count]) => ({ name, count, revenue: serviceRevenue[name] || 0 }));

  const leadRevenue: Record<string, number> = {};
  filteredClients.forEach((c: any) => { if (c.lead_source) leadRevenue[c.lead_source] = (leadRevenue[c.lead_source] || 0) + (c.revenue || 0); });
  const leadData = Object.entries(leadRevenue).map(([name, revenue]) => ({ name, revenue }));

  const monthlyTrend: any[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    monthlyTrend.push({
      month: label,
      clients: clients.filter((c: any) => c.created_at?.startsWith(key)).length,
      revenue: dsrEntries.filter((e: any) => e.entry_date?.startsWith(key)).reduce((s: number, e: any) => s + Number(e.sale_amount || 0), 0),
      profit: dsrEntries.filter((e: any) => e.entry_date?.startsWith(key)).reduce((s: number, e: any) => s + Number(e.profit_amount || 0), 0),
    });
  }

  const empPerformance = employees.map((e: any) => {
    const empClients = clients.filter((c: any) => c.assigned_to === e.user_id && matchesFilter(c.created_at));
    const empDsr = dsrEntries.filter((dsr: any) => dsr.employee_id === e.user_id && matchesFilter(dsr.entry_date));
    const empTasks = tasks.filter((t: any) => t.assigned_to === e.user_id);
    const empAttendance = attendance.filter((a: any) => a.employee_id === e.user_id && matchesFilter(a.date));
    
    let rev = 0, prof = 0;
    if (dataSource === 'combined' || dataSource === 'dsr') {
      const stats = calculateFinancials(empDsr);
      rev += stats.revenue; prof += stats.profit;
    }
    if (dataSource === 'combined' || dataSource === 'clients') {
      const eligibleClients = empClients.filter(c => dataSource !== 'combined' || !c.dsr_entry_id);
      const stats = calculateFinancials(eligibleClients);
      rev += stats.revenue; prof += stats.profit;
    }

    return {
      name: e.name, id: e.user_id,
      totalClients: empClients.length,
      revenue: rev,
      profit: prof,
      tasksTotal: empTasks.length,
      tasksCompleted: empTasks.filter((t: any) => t.status === 'Completed').length,
      successRate: empClients.length > 0 ? Math.round((empClients.filter((c: any) => c.status === 'Success').length / empClients.length) * 100) : 0,
      presentDays: empAttendance.filter((a: any) => a.status === 'Present' || a.status === 'Late').length,
    };
  }).sort((a, b) => b.revenue - a.revenue);

  let totalRevenue = 0, totalProfit = 0;
  if (dataSource === 'combined' || dataSource === 'dsr') {
    const stats = calculateFinancials(filteredDsr);
    totalRevenue += stats.revenue; totalProfit += stats.profit;
  }
  if (dataSource === 'combined' || dataSource === 'clients') {
    const eligibleClients = filteredClients.filter(c => dataSource !== 'combined' || !c.dsr_entry_id);
    const stats = calculateFinancials(eligibleClients);
    totalRevenue += stats.revenue; totalProfit += stats.profit;
  }

  // Force client-only view when on the Clients tab
  useEffect(() => {
    if (tab === 'clients') {
      setDataSource('clients');
    }
  }, [tab]);

  // UI: show dataSource selector only for tabs other than Clients
  const renderDataSourceSelect = () => {
    if (tab === 'clients') return null;
    return (
      <select
        value={dataSource}
        onChange={(e) => setDataSource(e.target.value as any)}
        className="input-nawi w-auto text-sm bg-primary/5 font-bold border-primary/20"
      >
        <option value="combined">Combined Data</option>
        <option value="dsr">DSR Only</option>
        <option value="clients">Clients Only</option>
      </select>
    );
  };

  const tabs = ['overview', 'clients', 'services', 'employees', 'revenue'];

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold font-display">Reports & Analytics</h2>
        <div className="flex items-center gap-2 flex-wrap">
          {renderDataSourceSelect()}
          <select value={viewType} onChange={(e) => setViewType(e.target.value as any)} className="input-nawi w-auto text-sm">
            <option value="monthly">Monthly</option>
            <option value="weekly">Weekly</option>
            <option value="annual">Annual</option>
            <option value="custom">Custom Range</option>
          </select>
          {viewType === 'custom' ? (
            <div className="flex items-center gap-1">
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input-nawi w-auto text-sm" placeholder="From" />
              <span className="text-xs text-muted-foreground">→</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input-nawi w-auto text-sm" placeholder="To" />
            </div>
          ) : (
            <input type="month" value={yearMonth} onChange={(e) => setYearMonth(e.target.value)} className="input-nawi w-auto text-sm" />
          )}
        </div>
      </div>
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {tabs.map((t) => <button key={t} onClick={() => setTab(t)} className={`px-4 py-2.5 text-sm font-medium capitalize whitespace-nowrap ${tab === t ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground'}`}>{t}</button>)}
      </div>

      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="stat-card"><div className="stat-card-icon bg-primary"><Briefcase className="w-6 h-6 text-primary-foreground" /></div><div><p className="text-xs text-muted-foreground">Total Clients</p><p className="text-xl font-bold font-display">{filteredClients.length}</p></div></div>
            <div className="stat-card"><div className="stat-card-icon bg-success"><TrendingUp className="w-6 h-6 text-primary-foreground" /></div><div><p className="text-xs text-muted-foreground">Total Revenue</p><p className="text-xl font-bold font-display">{formatCurrency(totalRevenue)}</p></div></div>
            <div className="stat-card"><div className="stat-card-icon bg-secondary"><span className="text-primary-foreground font-bold text-sm">AED</span></div><div><p className="text-xs text-muted-foreground">Total Profit</p><p className="text-xl font-bold font-display">{formatCurrency(totalProfit)}</p></div></div>
            <div className="stat-card"><div className="stat-card-icon bg-warning"><Users className="w-6 h-6 text-primary-foreground" /></div><div><p className="text-xs text-muted-foreground">Total Staff (History)</p><p className="text-xl font-bold font-display">{employees.length}</p></div></div>
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
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input 
              type="text" 
              placeholder="Search by name or ID..." 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
              className="input-nawi text-sm"
            />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-nawi text-sm">
              <option value="">All Statuses</option>
              <option value="New">New</option>
              <option value="Processing">Processing</option>
              <option value="Success">Success</option>
              <option value="Failed">Failed</option>
            </select>
            <select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)} className="input-nawi text-sm">
              <option value="">All Services</option>
              {Array.from(new Set(clients.map(c => c.service).filter(Boolean))).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <div className="flex justify-end">
              <button onClick={() => exportCSV(filteredClients.map((c: any) => ({ ID: c.display_id, Name: c.name, Service: c.service, Status: c.status, Revenue: c.revenue, Profit: c.profit, LeadSource: c.lead_source, Created: formatDate(c.created_at) })), 'clients_report.csv')} className="btn-outline w-full md:w-auto text-sm"><Download className="w-4 h-4" /> Export</button>
            </div>
          </div>
          <div className="card-nawi">
            <div className="flex justify-between items-center mb-3">
              <p className="text-xs text-muted-foreground">{filteredClients.length} of {clients.length} clients showing</p>
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
