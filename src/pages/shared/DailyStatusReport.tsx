import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import {
  DSRTemplate, DSREntry, fetchAllTemplates, fetchAssignedTemplates,
  fetchEntries, createEntry, updateEntry, deleteEntry,
  parseExcelForTemplate, bulkCreateEntries, downloadTemplateExcel, exportEntriesToExcel,
  ExcelParseResult,
} from '@/lib/dsr-service';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/supabase-service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import DSRGridEditor from '@/components/DSRGridEditor';
import {
  ClipboardList, Plus, Upload, Download, FileSpreadsheet, Calendar, CalendarClock, Pencil, Trash2,
  Settings as SettingsIcon, TrendingUp, DollarSign, Users, AlertCircle, CheckCircle2, ExternalLink, BarChart2, Star, LayoutDashboard,
} from 'lucide-react';
import { toast } from 'sonner';
import { Link, useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip as RTooltip, Legend, Cell,
} from 'recharts';

export default function DailyStatusReport() {
  const navigate = useNavigate();
  const { user, profile, isAdmin } = useAuth();
  const [templates, setTemplates] = useState<DSRTemplate[]>([]);
  const [activeTemplate, setActiveTemplate] = useState<DSRTemplate | null>(null);
  const [entries, setEntries] = useState<DSREntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [employeeFilter, setEmployeeFilter] = useState<string>('all');
  const [employees, setEmployees] = useState<{ user_id: string; name: string }[]>([]);
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<DSREntry | null>(null);
  const [workingDate, setWorkingDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [refreshCount, setRefreshCount] = useState(0);
  const [analysisSort, setAnalysisSort] = useState<'profit' | 'sale'>('profit');
  const [linkedClientIds, setLinkedClientIds] = useState<Record<string, string>>({});
  const [showWalkinPanel, setShowWalkinPanel] = useState(true);

  const loadTemplates = async () => {
    if (!user) return;
    const list = isAdmin ? await fetchAllTemplates() : await fetchAssignedTemplates(user.id);
    setTemplates(list);
      if (list.length > 0 && !activeTemplate) {
        // We don't force a template - we can start with "All Services" (Dashboard)
        setActiveTemplate(null);
      }
    
    // FETCH ASSIGNED TASKS (like UAE Visa)
    const { data: svcs } = await supabase
      .from('client_services')
      .select('*, clients(name, mobile, passport_no)')
      .eq('status', 'New');
    setAssignedTasks(svcs || []);
  };

  const [assignedTasks, setAssignedTasks] = useState<any[]>([]);
  const [showTasks, setShowTasks] = useState(false);

  const loadEntries = async () => {
    setLoading(true);
    try {
      const data = await fetchEntries({
        templateId: activeTemplate?.id,
        fromDate, toDate,
        employeeId: employeeFilter !== 'all' ? employeeFilter : undefined,
        isAdmin, currentUserId: user?.id,
      });
      setEntries(data);
    } catch (e: any) {
      toast.error(e.message);
    } finally { setLoading(false); }
  };

  const loadEmployees = async () => {
    if (!isAdmin) return;
    const { data } = await supabase.from('profiles').select('user_id, name').eq('status', 'active').order('name');
    setEmployees((data || []) as any);
  };

  useEffect(() => { loadTemplates(); loadEmployees(); }, [user, isAdmin]);
  useEffect(() => { loadEntries(); }, [activeTemplate, fromDate, toDate, employeeFilter, refreshCount]);

  // Sync linked clients
  useEffect(() => {
    if (entries.length === 0) { setLinkedClientIds({}); return; }
    const entryIds = entries.map(e => e.id);
    supabase.from('clients').select('id, dsr_entry_id').in('dsr_entry_id', entryIds).then(({ data }) => {
      const map: Record<string, string> = {};
      data?.forEach(c => { if (c.dsr_entry_id) map[c.dsr_entry_id] = c.id; });
      setLinkedClientIds(map);
    });
  }, [entries]);

  const WALKIN_REGEX = /walk[\s-]?in/i;
  const todayWalkins = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    if (activeTemplate?.name !== 'Air Ticket') return [];
    return entries.filter(e => 
      e.entry_date === today && 
      Object.values(e.data || {}).some(v => WALKIN_REGEX.test(String(v || '')))
    );
  }, [entries, activeTemplate]);

  const handleConvertToClient = (entry: DSREntry) => {
    const p = entry.data;
    const params = new URLSearchParams({
      from_dsr: '1',
      dsr_entry_id: entry.id,
      name: p['Passenger Name'] || p['passenger_name'] || '',
      pnr: p['PNR'] || p['pnr'] || '',
      flight_no: p['Flight No'] || p['flight_no'] || '',
      sector: p['Sector'] || p['sector'] || '',
      travel_date: p['Travel Date'] || p['travel_date'] || '',
      ticket_no: p['Ticket No'] || p['ticket_no'] || '',
      supplier: p['Supplier'] || p['supplier'] || '',
      sold: String(entry.sale_amount || ''),
      profit: String(entry.profit_amount || ''),
      mobile: p['Mobile'] || p['Mobile No'] || p['Phone'] || p['Phone No'] || p['WhatsApp'] || p['whatsapp'] || p['mobile'] || '',
    });
    const path = isAdmin ? '/admin' : '/employee';
    navigate(`${path}/clients/new?${params.toString()}`);
  };

  const handleWorkingDateChange = (date: string) => {
    setWorkingDate(date);
    setFromDate(date);
    setToDate(date);
  };

  const setRangePreset = (preset: 'today' | '7d' | 'month' | 'lastMonth' | 'custom') => {
    const now = new Date();
    let start = new Date();
    let end = new Date();

    if (preset === 'today') {
      // already set
    } else if (preset === '7d') {
      start.setDate(now.getDate() - 7);
    } else if (preset === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (preset === 'lastMonth') {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 0);
    } else if (preset === '6m') {
      start.setMonth(now.getMonth() - 6);
    } else if (preset === '1y') {
      start.setFullYear(now.getFullYear() - 1);
    }

    setFromDate(start.toISOString().split('T')[0]);
    setToDate(end.toISOString().split('T')[0]);
    if (preset !== 'custom') setShowAdvanced(false);
  };

  const [showAdvanced, setShowAdvanced] = useState(false);

  // Aggregate KPIs for current view
  const kpis = useMemo(() => {
    const totalSale = entries.reduce((s, e) => s + Number(e.sale_amount || 0), 0);
    const totalCost = entries.reduce((s, e) => s + Number(e.cost_amount || 0), 0);
    const totalProfit = entries.reduce((s, e) => s + Number(e.profit_amount || 0), 0);
    const uniqueEmployees = new Set(entries.map(e => e.employee_id)).size;
    return { totalSale, totalCost, totalProfit, count: entries.length, uniqueEmployees };
  }, [entries]);

  // Per-employee breakdown for admin dashboard
  const empBreakdown = useMemo(() => {
    const map = new Map<string, { name: string; count: number; sale: number; profit: number }>();
    entries.forEach(e => {
      const k = e.employee_id;
      const existing = map.get(k) || { name: e.employee_name || 'Unknown', count: 0, sale: 0, profit: 0 };
      existing.count++;
      existing.sale += Number(e.sale_amount || 0);
      existing.profit += Number(e.profit_amount || 0);
      map.set(k, existing);
    });
    return Array.from(map.values()).sort((a, b) => {
      return analysisSort === 'profit' ? b.profit - a.profit : b.sale - a.sale;
    });
  }, [entries, analysisSort]);

  // Daily trend for charts (sales/profit/count over time)
  const dailyTrend = useMemo(() => {
    const map = new Map<string, { date: string; sales: number; profit: number; count: number }>();
    entries.forEach(e => {
      const d = e.entry_date;
      const cur = map.get(d) || { date: d, sales: 0, profit: 0, count: 0 };
      cur.sales += Number(e.sale_amount || 0);
      cur.profit += Number(e.profit_amount || 0);
      cur.count += 1;
      map.set(d, cur);
    });
    return Array.from(map.values())
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      .map(r => ({ ...r, label: r.date ? r.date.slice(5) : '?' })); // MM-DD
  }, [entries]);

  // Top performers (top 7 by profit) for bar chart
  const topPerformers = useMemo(() => empBreakdown.slice(0, 7).map(e => ({
    name: e.name.length > 14 ? e.name.slice(0, 12) + '…' : e.name,
    profit: Math.round(e.profit),
    sales: Math.round(e.sale),
  })), [empBreakdown]);

  const BAR_COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--success))', 'hsl(var(--warning))', '#8b5cf6', '#06b6d4', '#ec4899'];

  const handleSaveEntry = async (data: Record<string, any>) => {
    if (!activeTemplate || !user || !profile) return;
    try {
      if (editingEntry) {
        await updateEntry(editingEntry.id, activeTemplate, data);
        toast.success('Entry updated');
      } else {
        await createEntry(activeTemplate, user.id, profile.name, fromDate, data);
        toast.success('Entry added');
      }
      setShowEntryModal(false);
      setEditingEntry(null);
      loadEntries();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this entry?')) return;
    try {
      await deleteEntry(id);
      toast.success('Deleted');
      loadEntries();
    } catch (e: any) { toast.error(e.message); }
  };

  if (templates.length === 0) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <ClipboardList className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Daily Status Report</h1>
            <p className="text-sm text-muted-foreground">Track daily bookings, visas, and tours</p>
          </div>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <h3 className="font-semibold mb-2">
              {isAdmin ? 'No DSR templates yet' : 'No templates assigned to you'}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {isAdmin
                ? 'Create or activate templates to begin tracking daily reports.'
                : 'Ask your admin to assign DSR templates to you.'}
            </p>
            {isAdmin && (
              <Button asChild>
                <Link to="/admin/dsr-assignments"><SettingsIcon className="h-4 w-4 mr-2" />Manage Templates</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold font-display text-primary">Daily Status Report</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin ? 'Monitor organizational performance and employee DSRs' : 'Track and submit your daily operational reports'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <Button asChild variant="outline" className="rounded-lg shadow-sm">
              <Link to="/admin/dsr-assignments"><SettingsIcon className="h-4 w-4 mr-2" />Manage Assignments</Link>
            </Button>
          )}
        </div>
      </div>

      {/* Unified Control Bar */}
      <div className="bg-card p-4 rounded-xl border border-border shadow-card mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 pr-4 border-r border-border/50">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mr-2">Quick View</Label>
            <div className="flex gap-1 bg-muted p-1 rounded-lg">
              <Button size="sm" variant="ghost" className="h-7 text-[10px] px-2 font-bold" onClick={() => setRangePreset('today')}>Today</Button>
              <Button size="sm" variant="ghost" className="h-7 text-[10px] px-2 font-bold" onClick={() => setRangePreset('7d')}>7 Days</Button>
              <Button size="sm" variant="ghost" className="h-7 text-[10px] px-2 font-bold" onClick={() => setRangePreset('month')}>Month</Button>
              <Button size="sm" variant="ghost" className="h-7 text-[10px] px-2 font-bold" onClick={() => setRangePreset('6m')}>6 Months</Button>
              <Button size="sm" variant="ghost" className="h-7 text-[10px] px-2 font-bold" onClick={() => setRangePreset('1y')}>1 Year</Button>
            </div>
            <Button size="sm" variant={showAdvanced ? 'secondary' : 'outline'} className="h-7 text-[10px] px-2 font-bold ml-2" onClick={() => setShowAdvanced(!showAdvanced)}>
              Advanced Range {showAdvanced ? '↑' : '↓'}
            </Button>
          </div>

          {showAdvanced && (
            <div className="flex items-center gap-3 pr-4 border-r border-border/50 animate-in fade-in slide-in-from-top-1">
              <div className="flex items-center gap-2">
                <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-36 h-9 input-nawi text-xs" />
                <span className="text-muted-foreground font-medium">-</span>
                <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-36 h-9 input-nawi text-xs" />
              </div>
            </div>
          )}

          {isAdmin && (
            <div className="flex items-center gap-3 pr-4 border-r border-border/50">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Employee</Label>
              <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
                <SelectTrigger className="h-9 input-nawi w-44">
                  <SelectValue placeholder="All Employees" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Employees</SelectItem>
                  {employees.map(e => <SelectItem key={e.user_id} value={e.user_id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {!isAdmin && (
            <div className="flex items-center gap-3 pr-4 border-r border-border/50">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-1">
                <CalendarClock className="w-3.5 h-3.5" /> Work Date
              </Label>
              <Input type="date" value={workingDate} onChange={e => handleWorkingDateChange(e.target.value)} className="w-40 h-9 input-nawi font-bold" />
            </div>
          )}

          <div className="ml-auto flex gap-2">
            {activeTemplate && (
              <>
                <Button variant="outline" size="sm" className="rounded-lg h-9 border-dashed" onClick={() => downloadTemplateExcel(activeTemplate)}><Download className="h-4 w-4 mr-2" />Template</Button>
                <Button variant="outline" size="sm" className="rounded-lg h-9 border-dashed" onClick={() => exportEntriesToExcel(activeTemplate, entries)} disabled={entries.length === 0}><FileSpreadsheet className="h-4 w-4 mr-2" />Export</Button>
                {!isAdmin && <ExcelUploadButton template={activeTemplate} userId={user?.id || ''} userName={profile?.name || 'User'} entryDate={workingDate} onDone={loadEntries} />}
              </>
            )}
          </div>
        </div>
      </div>

      <Tabs 
        value={activeTemplate ? activeTemplate.id : 'dashboard'} 
        onValueChange={(v) => {
          if (v === 'dashboard') setActiveTemplate(null);
          else setActiveTemplate(templates.find(t => t.id === v) || null);
        }}
        className="space-y-6"
      >
        <div className="border-b border-border">
          <TabsList className="bg-transparent h-auto p-0 gap-6 overflow-x-auto no-scrollbar justify-start">
              <TabsTrigger 
                value="dashboard" 
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 pb-2 h-auto text-sm font-semibold text-muted-foreground data-[state=active]:text-primary transition-all"
              >
                <LayoutDashboard className="w-4 h-4 mr-2" /> Dashboard
              </TabsTrigger>
            {templates.map(t => (
              <TabsTrigger 
                key={t.id} 
                value={t.id} 
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 pb-2 h-auto text-sm font-semibold text-muted-foreground data-[state=active]:text-primary transition-all whitespace-nowrap"
              >
                <span className="mr-2">{t.icon}</span> {t.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="dashboard" className="space-y-6 animate-in fade-in duration-500 mt-0">
          {/* KPI Stat Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="stat-card">
              <div className="stat-card-icon bg-primary/10 text-primary"><DollarSign className="w-6 h-6" /></div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Total Volume</p>
                <p className="text-xl font-bold font-display">{formatCurrency(kpis.totalSale)}</p>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-card-icon bg-success/10 text-success"><CheckCircle2 className="w-6 h-6" /></div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Net Profit</p>
                <p className="text-xl font-bold font-display">{formatCurrency(kpis.totalProfit)}</p>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-card-icon bg-warning/10 text-warning"><FileSpreadsheet className="w-6 h-6" /></div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Operating Cost</p>
                <p className="text-xl font-bold font-display">{formatCurrency(kpis.totalCost)}</p>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-card-icon bg-secondary/10 text-secondary"><Users className="w-6 h-6" /></div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Active Agents</p>
                <p className="text-xl font-bold font-display">{kpis.uniqueEmployees}</p>
              </div>
            </div>
          </div>

          <div className={`grid grid-cols-1 ${isAdmin ? 'lg:grid-cols-2' : ''} gap-6`}>
            <div className="card-nawi">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-bold font-display flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary" /> {isAdmin ? 'Growth Trend' : 'My Performance Trend'}</h3>
              </div>
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyTrend}>
                    <defs>
                      <linearGradient id="chartColor" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={val => formatCurrency(val)} />
                    <RTooltip 
                      contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', boxShadow: 'var(--shadow-elevated)' }} 
                      formatter={(val: any) => formatCurrency(val)}
                    />
                    <Area type="monotone" dataKey="profit" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#chartColor)" strokeWidth={3} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {isAdmin && (
              <div className="card-nawi">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-sm font-bold font-display flex items-center gap-2"><Star className="w-4 h-4 text-warning" /> Leaderboard</h3>
                  <div className="flex gap-1 bg-muted p-1 rounded-lg">
                    <Button size="sm" variant={analysisSort === 'profit' ? 'secondary' : 'ghost'} className="h-6 text-[10px] px-2 font-bold" onClick={() => setAnalysisSort('profit')}>Profit</Button>
                    <Button size="sm" variant={analysisSort === 'sale' ? 'secondary' : 'ghost'} className="h-6 text-[10px] px-2 font-bold" onClick={() => setAnalysisSort('sale')}>Sales</Button>
                  </div>
                </div>
                <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topPerformers} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.1} />
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 11, fontWeight: 600 }} />
                      <RTooltip 
                        contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', boxShadow: 'var(--shadow-elevated)' }} 
                        formatter={(val: any) => formatCurrency(val)}
                      />
                      <Bar dataKey={analysisSort === 'profit' ? 'profit' : 'sales'} radius={[0, 4, 4, 0]} barSize={20}>
                        {topPerformers.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>

          {isAdmin && (
            <div className="card-nawi overflow-hidden">
              <h3 className="text-sm font-bold font-display flex items-center gap-2 mb-4"><BarChart2 className="w-4 h-4 text-primary" /> Performance Audit</h3>
              <div className="overflow-x-auto -mx-5 px-5">
              <table className="w-full table-nawi">
                <thead>
                  <tr>
                    <th className="p-3">Employee Name</th>
                    <th className="p-3 text-center">Orders</th>
                    <th className="p-3 text-right">Revenue</th>
                    <th className="p-3 text-right">Net Profit</th>
                    <th className="p-3 text-center">Efficiency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {empBreakdown.map((e, i) => (
                    <tr key={i}>
                      <td className="p-3 font-medium">{e.name}</td>
                      <td className="p-3 text-center">{e.count}</td>
                      <td className="p-3 text-right font-semibold text-primary">{formatCurrency(e.sale)}</td>
                      <td className="p-3 text-right font-bold text-success">{formatCurrency(e.profit)}</td>
                      <td className="p-3 text-center">
                        <span className="badge-new bg-primary/5 text-primary">
                          {((e.profit / (e.sale || 1)) * 100).toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          )}

          <div className="card-nawi overflow-hidden">
            <h3 className="text-sm font-bold font-display flex items-center gap-2 mb-4"><ClipboardList className="w-4 h-4 text-primary" /> Recent Operations</h3>
            <div className="overflow-x-auto -mx-5 px-5">
              <table className="w-full table-nawi">
                <thead>
                  <tr>
                    <th className="p-3">Date</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Employee</th>
                    <th className="p-3 text-right">Revenue</th>
                    <th className="p-3 text-right">Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {entries.slice(0, 50).map(e => (
                    <tr key={e.id}>
                      <td className="p-3 text-xs text-muted-foreground">{e.entry_date}</td>
                      <td className="p-3">
                        <span className="badge-new">
                          {templates.find(t => t.id === e.template_id)?.name || 'Misc'}
                        </span>
                      </td>
                      <td className="p-3 font-medium">{e.employee_name}</td>
                      <td className="p-3 text-right font-semibold">{formatCurrency(e.sale_amount)}</td>
                      <td className="p-3 text-right">
                        <span className="badge-success">
                          {formatCurrency(e.profit_amount)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {templates.map(t => (
          <TabsContent key={t.id} value={t.id} className="animate-in fade-in duration-300 mt-0">
            {/* Walk-in Detection Alert */}
            {t.name === 'Air Ticket' && todayWalkins.length > 0 && showWalkinPanel && (
              <div className="mb-4 bg-orange-50 border border-orange-200 rounded-xl p-4 shadow-sm animate-in slide-in-from-top-2 duration-500">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center">
                      <Users className="w-4 h-4 text-orange-600" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-orange-900">Walk-ins Detected in Today's DSR</h3>
                      <p className="text-[10px] text-orange-700">These entries have "walkin" in remarks. Convert them to full client profiles for CRM tracking.</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setShowWalkinPanel(false)} className="h-7 text-orange-600 hover:bg-orange-100">Dismiss</Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {todayWalkins.map((w) => {
                    const isLinked = linkedClientIds[w.id];
                    return (
                      <div key={w.id} className="flex items-center justify-between p-2 bg-white rounded-lg border border-orange-100 shadow-sm">
                        <div className="min-w-0">
                          <p className="text-xs font-bold truncate">{w.data['Passenger Name'] || 'Unknown'}</p>
                          <p className="text-[9px] text-muted-foreground uppercase font-medium">PNR: {w.data['PNR'] || '—'}</p>
                        </div>
                        {isLinked ? (
                          <Button size="sm" variant="ghost" asChild className="h-7 text-[10px] text-green-600 font-bold hover:bg-green-50">
                            <Link to={`${isAdmin ? '/admin' : '/employee'}/clients/${isLinked}`}>View Client →</Link>
                          </Button>
                        ) : (
                          <Button size="sm" onClick={() => handleConvertToClient(w)} className="h-7 text-[10px] bg-orange-500 hover:bg-orange-600 text-white font-bold">
                            <Plus className="w-3 h-3 mr-1" /> Add Client
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            
            <div className="card-nawi overflow-hidden !p-0">
              <DSRGridEditor 
                template={t} 
                fromDate={fromDate} 
                toDate={toDate} 
                isAdmin={isAdmin}
                employeeFilter={employeeFilter}
                workingDate={workingDate}
                onWorkingDateChange={handleWorkingDateChange}
                onChanged={() => setRefreshCount(prev => prev + 1)}
                linkedClientIds={linkedClientIds}
                onConvertWalkin={handleConvertToClient}
              />
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {showEntryModal && activeTemplate && (
        <EntryModal
          template={activeTemplate}
          entry={editingEntry}
          onSave={handleSaveEntry}
          onClose={() => { setShowEntryModal(false); setEditingEntry(null); }}
        />
      )}
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, highlight }: any) {
  return (
    <Card className={highlight ? 'border-primary/40 bg-primary/5' : ''}>
      <CardContent className="pt-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><Icon className="h-3.5 w-3.5" />{label}</div>
        <div className="text-lg font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function EntryModal({ template, entry, onSave, onClose }: { template: DSRTemplate; entry: DSREntry | null; onSave: (d: Record<string, any>) => void; onClose: () => void; }) {
  const [data, setData] = useState<Record<string, any>>(entry?.data || {});
  const update = (k: string, v: any) => setData(prev => ({ ...prev, [k]: v }));

  const submit = () => {
    const missing = template.columns.filter(c => c.required && (!data[c.key] || String(data[c.key]).trim() === ''));
    if (missing.length > 0) { toast.error(`Required: ${missing.map(m => m.label).join(', ')}`); return; }
    onSave(data);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{template.icon} {entry ? 'Edit' : 'Add'} {template.name} Entry</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
          {template.columns.map(c => (
            <div key={c.key} className={c.type === 'textarea' ? 'md:col-span-2' : ''}>
              <Label className="text-xs">{c.label}{c.required && <span className="text-destructive ml-0.5">*</span>}</Label>
              {c.type === 'select' ? (
                <Select value={data[c.key] || ''} onValueChange={v => update(c.key, v)}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>{c.options?.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                </Select>
              ) : c.type === 'textarea' ? (
                <Textarea value={data[c.key] || ''} onChange={e => update(c.key, e.target.value)} rows={2} />
              ) : (
                <Input type={c.type === 'number' ? 'number' : c.type === 'date' ? 'date' : 'text'} value={data[c.key] || ''} onChange={e => update(c.key, e.target.value)} />
              )}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExcelUploadButton({ template, userId, userName, entryDate, onDone }: { template: DSRTemplate; userId: string; userName: string; entryDate: string; onDone: () => void; }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<ExcelParseResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [dateStrategy, setDateStrategy] = useState<'auto' | 'manual'>('manual');
  const today = new Date().toISOString().split('T')[0];

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const r = await parseExcelForTemplate(file, template);
      setResult(r);
    } catch (e: any) { toast.error('Could not parse file: ' + e.message); }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = ''; }
  };

  const confirm = async () => {
    if (!result?.ok || !result.parsedRows) return;
    setBusy(true);
    try {
      const rows = result.parsedRows.map(pr => pr.data);
      const dates = result.parsedRows.map(() => null); // Always use entryDate fallback
      
      const n = await bulkCreateEntries(template, userId, userName, entryDate || today, rows, dates);
      toast.success(`Imported ${n} rows`);
      setResult(null);
      onDone();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };


  return (
    <>
      <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
      <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={busy}>
        <Upload className="h-4 w-4 mr-1" />Upload Excel
      </Button>

      {result && (
        <Dialog open onOpenChange={() => setResult(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {result.ok ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <AlertCircle className="h-5 w-5 text-destructive" />}
                {result.ok ? 'Ready to Import' : 'Upload Rejected'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              {!result.ok && <div className="p-3 bg-destructive/10 text-destructive rounded">{result.reason}</div>}

              {result.ok && (
                <div className="space-y-4">
                  <div className="p-4 bg-primary/10 text-primary rounded-xl flex items-center gap-3 border border-primary/20">
                    <CheckCircle2 className="h-6 w-6" />
                    <div>
                      <p className="font-bold text-sm">Ready to Import {result.parsedRows?.length} Rows</p>
                      <p className="text-xs opacity-80">All rows will be imported using the selected date: <strong>{entryDate || today}</strong></p>
                    </div>
                  </div>
                </div>
              )}

              {result.matchedColumns && result.matchedColumns.length > 0 && (
                <div>
                  <div className="font-medium mb-1">Matched columns ({result.matchedColumns.length}):</div>
                  <div className="flex flex-wrap gap-1">
                    {result.matchedColumns.map((m, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">{m.excelHeader} → {m.label}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {result.unmatchedHeaders && result.unmatchedHeaders.length > 0 && (
                <div>
                  <div className="font-medium mb-1 text-muted-foreground">Ignored columns:</div>
                  <div className="flex flex-wrap gap-1">
                    {result.unmatchedHeaders.map((h, i) => <Badge key={i} variant="outline" className="text-xs">{h}</Badge>)}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setResult(null)}>Cancel</Button>
              {result.ok && <Button onClick={confirm} disabled={busy}>Import {result.rows?.length} rows</Button>}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
