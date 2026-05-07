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
import {
  ClipboardList, Plus, Upload, Download, FileSpreadsheet, Calendar, CalendarClock, Pencil, Trash2,
  Settings as SettingsIcon, TrendingUp, DollarSign, Users, AlertCircle, CheckCircle2, ExternalLink, BarChart3,
} from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import DSRGridEditor from '@/components/DSRGridEditor';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip as RTooltip, Legend, Cell,
} from 'recharts';

export default function DailyStatusReport() {
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

  const loadTemplates = async () => {
    if (!user) return;
    const list = isAdmin ? await fetchAllTemplates() : await fetchAssignedTemplates(user.id);
    setTemplates(list);
    if (list.length > 0 && !activeTemplate) {
      if (isAdmin) {
        // For admin, we don't force a template - we can start with "All Services"
        setActiveTemplate(null);
      } else {
        setActiveTemplate(list[0]);
      }
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

  const handleWorkingDateChange = (date: string) => {
    setWorkingDate(date);
    setFromDate(date);
    setToDate(date);
  };

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
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(r => ({ ...r, label: r.date.slice(5) })); // MM-DD
  }, [entries]);

  // Top performers (top 7 by profit) for bar chart
  const topPerformers = useMemo(() => empBreakdown.slice(0, 7).map(e => ({
    name: e.name.length > 14 ? e.name.slice(0, 12) + '…' : e.name,
    profit: Math.round(e.profit),
    sales: Math.round(e.sale),
  })), [empBreakdown]);

  const BAR_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ClipboardList className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Daily Status Report</h1>
            <p className="text-sm text-muted-foreground">
              {isAdmin ? 'Monitor all employee DSR submissions' : 'Submit your daily reports'}
            </p>
          </div>
        </div>
        {isAdmin && (
          <Button asChild variant="outline">
            <Link to="/admin/dsr-assignments"><SettingsIcon className="h-4 w-4 mr-2" />Manage Assignments</Link>
          </Button>
        )}
      </div>

      {/* Unified Control Bar */}
      <div className="bg-background/80 backdrop-blur-md sticky top-0 z-20 border-b border-border/50 pb-4 -mx-6 px-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 p-1.5 bg-muted/40 rounded-2xl border border-border/50">
            <Label className="px-3 text-[10px] font-black uppercase tracking-tighter text-muted-foreground whitespace-nowrap border-r border-border/50 mr-1">Report Period</Label>
            <div className="flex items-center gap-2 pr-2">
              <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-40 h-8 text-[11px] font-bold bg-background border-none shadow-none focus-visible:ring-1 focus-visible:ring-primary/30" />
              <span className="text-[10px] font-bold text-muted-foreground">→</span>
              <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-40 h-8 text-[11px] font-bold bg-background border-none shadow-none focus-visible:ring-1 focus-visible:ring-primary/30" />
            </div>
          </div>

          {isAdmin && (
            <div className="flex items-center gap-2 p-1.5 bg-muted/40 rounded-2xl border border-border/50">
              <Label className="px-3 text-[10px] font-black uppercase tracking-tighter text-muted-foreground border-r border-border/50 mr-1">Team Filter</Label>
              <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
                <SelectTrigger className="h-8 text-[11px] font-bold bg-transparent border-none shadow-none w-44 focus:ring-0">
                  <SelectValue placeholder="All Employees" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All Employees</SelectItem>
                  {employees.map(e => <SelectItem key={e.user_id} value={e.user_id} className="text-xs">{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {!isAdmin && (
            <div className="flex items-center gap-2 p-1.5 bg-primary/5 rounded-2xl border border-primary/20">
              <Label className="px-3 text-[10px] font-black uppercase tracking-tighter text-primary border-r border-primary/20 mr-1 flex items-center gap-1">
                <CalendarClock className="w-3 h-3" /> Working Date
              </Label>
              <Input type="date" value={workingDate} onChange={e => handleWorkingDateChange(e.target.value)} className="w-40 h-8 text-[11px] font-black bg-transparent border-none shadow-none focus-visible:ring-0" />
            </div>
          )}

          <div className="ml-auto flex gap-2">
            {activeTemplate && (
              <>
                <Button variant="outline" size="sm" className="rounded-xl h-8 text-[10px] font-black border-dashed" onClick={() => downloadTemplateExcel(activeTemplate)}><Download className="h-3.5 w-3.5 mr-1.5" />Template</Button>
                <Button variant="outline" size="sm" className="rounded-xl h-8 text-[10px] font-black border-dashed" onClick={() => exportEntriesToExcel(activeTemplate, entries)} disabled={entries.length === 0}><FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />Export</Button>
                {!isAdmin && <ExcelUploadButton template={activeTemplate} userId={user!.id} userName={profile!.name} entryDate={workingDate} onDone={loadEntries} />}
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
        <div className="flex items-center justify-between border-b border-border/50 pb-1">
          <TabsList className="bg-transparent h-auto p-0 gap-6 overflow-x-auto no-scrollbar justify-start">
            {isAdmin && (
              <TabsTrigger 
                value="dashboard" 
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 pb-3 h-auto text-xs font-black uppercase tracking-widest text-muted-foreground data-[state=active]:text-primary transition-all"
              >
                <BarChart3 className="w-3.5 h-3.5 mr-2" />
                Advanced Dashboard
              </TabsTrigger>
            )}
            {templates.map(t => (
              <TabsTrigger 
                key={t.id} 
                value={t.id} 
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 pb-3 h-auto text-xs font-black uppercase tracking-widest text-muted-foreground data-[state=active]:text-primary transition-all whitespace-nowrap"
              >
                <span className="mr-2 text-base">{t.icon}</span> {t.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="dashboard" className="space-y-8 animate-in fade-in duration-500 mt-0">
          {/* Premium KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pt-4">
            <Card className="relative overflow-hidden border-none shadow-xl bg-gradient-to-br from-indigo-600 to-blue-700 text-white group hover:scale-[1.02] transition-transform duration-300">
              <CardContent className="pt-6">
                <p className="text-white/70 text-[10px] font-bold uppercase tracking-widest">Total Volume</p>
                <div className="flex items-end justify-between mt-1">
                  <p className="text-3xl font-black">{formatCurrency(kpis.totalSale)}</p>
                  <div className="p-2 bg-white/20 rounded-xl"><DollarSign className="w-5 h-5" /></div>
                </div>
              </p>
              <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform"><DollarSign className="w-32 h-32" /></div>
            </CardContent>
            </Card>

            <Card className="relative overflow-hidden border-none shadow-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white group hover:scale-[1.02] transition-transform duration-300">
              <CardContent className="pt-6">
                <p className="text-white/70 text-[10px] font-bold uppercase tracking-widest">Net Profit</p>
                <div className="flex items-end justify-between mt-1">
                  <p className="text-3xl font-black">{formatCurrency(kpis.totalProfit)}</p>
                  <div className="p-2 bg-white/20 rounded-xl"><BarChart3 className="w-5 h-5" /></div>
                </div>
              </CardContent>
              <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform"><BarChart3 className="w-32 h-32" /></div>
            </Card>

            <Card className="relative overflow-hidden border-none shadow-xl bg-gradient-to-br from-orange-500 to-rose-500 text-white group hover:scale-[1.02] transition-transform duration-300">
              <CardContent className="pt-6">
                <p className="text-white/70 text-[10px] font-bold uppercase tracking-widest">Operating Cost</p>
                <div className="flex items-end justify-between mt-1">
                  <p className="text-3xl font-black">{formatCurrency(kpis.totalCost)}</p>
                  <div className="p-2 bg-white/20 rounded-xl"><ClipboardList className="w-5 h-5" /></div>
                </div>
              </CardContent>
              <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform"><ClipboardList className="w-32 h-32" /></div>
            </Card>

            <Card className="relative overflow-hidden border-none shadow-xl bg-gradient-to-br from-purple-600 to-fuchsia-700 text-white group hover:scale-[1.02] transition-transform duration-300">
              <CardContent className="pt-6">
                <p className="text-white/70 text-[10px] font-bold uppercase tracking-widest">Team Performance</p>
                <div className="flex items-end justify-between mt-1">
                  <p className="text-3xl font-black">{kpis.uniqueEmployees}</p>
                  <div className="p-2 bg-white/20 rounded-xl"><Users className="w-5 h-5" /></div>
                </div>
              </CardContent>
              <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform"><Users className="w-32 h-32" /></div>
            </Card>
          </div>

          {/* Charts & Analytics */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-none shadow-lg bg-background/50 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-border/50 mx-6 px-0">
                <CardTitle className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" /> Growth Analysis
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="h-[320px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dailyTrend}>
                      <defs>
                        <linearGradient id="chartColor" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fontWeight: 700 }} />
                      <YAxis tick={{ fontSize: 10, fontWeight: 700 }} tickFormatter={val => formatCurrency(val)} />
                      <RTooltip 
                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }} 
                        formatter={(val: any) => formatCurrency(val)}
                      />
                      <Area type="monotone" dataKey="profit" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#chartColor)" strokeWidth={4} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-lg bg-background/50 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-border/50 mx-6 px-0">
                <CardTitle className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-500" /> Leaderboard (By {analysisSort})
                </CardTitle>
                <div className="flex gap-1 bg-muted/30 p-0.5 rounded-lg">
                  <Button size="xs" variant={analysisSort === 'profit' ? 'default' : 'ghost'} className="h-6 text-[9px] px-2 font-bold" onClick={() => setAnalysisSort('profit')}>Profit</Button>
                  <Button size="xs" variant={analysisSort === 'sale' ? 'default' : 'ghost'} className="h-6 text-[9px] px-2 font-bold" onClick={() => setAnalysisSort('sale')}>Sales</Button>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="h-[320px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topPerformers} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.2} />
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 11, fontWeight: 800 }} />
                      <RTooltip 
                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }} 
                        formatter={(val: any) => formatCurrency(val)}
                      />
                      <Bar dataKey={analysisSort === 'profit' ? 'profit' : 'sales'} radius={[0, 8, 8, 0]} barSize={24}>
                        {topPerformers.map((_, i) => <Cell key={i} fill={analysisSort === 'profit' ? BAR_COLORS[i % BAR_COLORS.length] : '#6366f1'} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-none shadow-lg bg-background/50 backdrop-blur-sm overflow-hidden">
            <CardHeader className="bg-muted/20 border-b border-border/50">
              <CardTitle className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-500" /> Comprehensive Performance Audit
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/10 text-[10px] uppercase font-black tracking-widest text-muted-foreground border-b border-border/50">
                    <tr>
                      <th className="p-4 text-left">Employee Name</th>
                      <th className="p-4 text-center">Transactions</th>
                      <th className="p-4 text-right">Total Revenue</th>
                      <th className="p-4 text-right text-muted-foreground">Direct Cost</th>
                      <th className="p-4 text-right">Net Profit</th>
                      <th className="p-4 text-center">Profit %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {empBreakdown.map((e, i) => (
                      <tr key={i} className="hover:bg-primary/5 transition-colors">
                        <td className="p-4 text-sm font-bold">{e.name}</td>
                        <td className="p-4 text-center text-xs font-semibold">{e.count}</td>
                        <td className="p-4 text-right text-xs font-bold text-primary">{formatCurrency(e.sale)}</td>
                        <td className="p-4 text-right text-xs font-medium text-muted-foreground">{formatCurrency(e.sale - e.profit)}</td>
                        <td className="p-4 text-right">
                          <span className="text-xs font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-100 shadow-sm">
                            {formatCurrency(e.profit)}
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          <Badge variant="secondary" className="font-bold text-[10px] bg-indigo-50 text-indigo-700 border-indigo-100">
                            {((e.profit / (e.sale || 1)) * 100).toFixed(1)}%
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-2xl rounded-3xl overflow-hidden ring-1 ring-border/50">
            <CardHeader className="bg-muted/30 border-b border-border/50 py-6">
              <CardTitle className="text-lg font-black uppercase tracking-tighter">Consolidated Business Operations</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/10 text-[10px] uppercase font-black tracking-widest text-muted-foreground border-b border-border/50">
                    <tr>
                      <th className="p-5 text-left">Date</th>
                      <th className="p-5 text-left">Category</th>
                      <th className="p-5 text-left">Employee</th>
                      <th className="p-5 text-right">Revenue</th>
                      <th className="p-5 text-right">Profit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {entries.slice(0, 50).map(e => (
                      <tr key={e.id} className="hover:bg-primary/5 transition-colors group">
                        <td className="p-5 text-xs font-bold text-muted-foreground">{e.entry_date}</td>
                        <td className="p-5">
                          <Badge variant="outline" className="font-black text-[9px] uppercase border-primary/20 text-primary bg-primary/5 px-2 py-0.5 rounded-md">
                            {templates.find(t => t.id === e.template_id)?.name || 'Misc'}
                          </Badge>
                        </td>
                        <td className="p-5 text-xs font-semibold">{e.employee_name}</td>
                        <td className="p-5 text-right font-bold text-sm">{formatCurrency(e.sale_amount)}</td>
                        <td className="p-5 text-right">
                          <span className="font-black text-sm text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100 shadow-sm">
                            {formatCurrency(e.profit_amount)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {templates.map(t => (
          <TabsContent key={t.id} value={t.id} className="animate-in fade-in zoom-in duration-500 mt-0">
            <Card className="border-none shadow-2xl overflow-hidden rounded-3xl ring-1 ring-border/50">
              <DSRGridEditor 
                template={t} 
                fromDate={fromDate} 
                toDate={toDate} 
                isAdmin={isAdmin}
                employeeFilter={employeeFilter}
                workingDate={workingDate}
                onWorkingDateChange={handleWorkingDateChange}
                onChanged={() => setRefreshCount(prev => prev + 1)}
              />
            </Card>
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
