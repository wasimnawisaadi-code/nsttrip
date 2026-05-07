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
  ClipboardList, Plus, Upload, Download, FileSpreadsheet, Calendar, Pencil, Trash2,
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

  const loadTemplates = async () => {
    if (!user) return;
    const list = isAdmin ? await fetchAllTemplates() : await fetchAssignedTemplates(user.id);
    setTemplates(list);
    if (list.length > 0 && !activeTemplate) setActiveTemplate(list[0]);
    
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
    if (!activeTemplate) { setEntries([]); return; }
    setLoading(true);
    try {
      const data = await fetchEntries({
        templateId: activeTemplate.id,
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
    return Array.from(map.values()).sort((a, b) => b.profit - a.profit);
  }, [entries]);

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

  const BAR_COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

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

      {/* Template tabs */}
      <Tabs value={activeTemplate?.id} onValueChange={(v) => setActiveTemplate(templates.find(t => t.id === v) || null)}>
        <TabsList className="flex flex-wrap h-auto">
          {templates.map(t => (
            <TabsTrigger key={t.id} value={t.id} className="gap-2">
              <span>{t.icon}</span>{t.name}
            </TabsTrigger>
          ))}
        </TabsList>

        {activeTemplate && (
          <TabsContent value={activeTemplate.id} className="space-y-4 mt-4">
            {/* Filters & actions */}
            <Card>
              <CardContent className="pt-6 flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[300px] p-4 bg-muted/20 rounded-xl border border-border/50">
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 block">Report Period Selection</Label>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="relative">
                      <Calendar className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                      <Input 
                        type="date" 
                        value={fromDate} 
                        onChange={e => setFromDate(e.target.value)} 
                        className="w-40 h-9 pl-9 text-xs font-medium bg-background" 
                      />
                    </div>
                    <span className="text-muted-foreground text-xs font-bold">—</span>
                    <div className="relative">
                      <Calendar className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                      <Input 
                        type="date" 
                        value={toDate} 
                        onChange={e => setToDate(e.target.value)} 
                        className="w-40 h-9 pl-9 text-xs font-medium bg-background" 
                      />
                    </div>
                    
                    <div className="flex gap-1 ml-2">
                      <Button variant="ghost" size="sm" className="h-8 text-[10px] px-2" onClick={() => {
                        const today = new Date().toISOString().split('T')[0];
                        setFromDate(today); setToDate(today);
                      }}>Today</Button>
                      <Button variant="ghost" size="sm" className="h-8 text-[10px] px-2" onClick={() => {
                        const d = new Date(); d.setDate(d.getDate() - 7);
                        setFromDate(d.toISOString().split('T')[0]);
                        setToDate(new Date().toISOString().split('T')[0]);
                      }}>Last 7d</Button>
                      <Button variant="ghost" size="sm" className="h-8 text-[10px] px-2" onClick={() => {
                        const d = new Date(); d.setDate(1);
                        setFromDate(d.toISOString().split('T')[0]);
                        setToDate(new Date().toISOString().split('T')[0]);
                      }}>This Month</Button>
                    </div>

                    {isAdmin && (
                      <div className="ml-auto min-w-[180px]">
                        <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
                          <SelectTrigger className="h-9 text-xs bg-background"><SelectValue placeholder="All Employees" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Employees</SelectItem>
                            {employees.map(e => <SelectItem key={e.user_id} value={e.user_id}>{e.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 ml-auto flex-wrap">
                  <Button variant="outline" size="sm" onClick={() => downloadTemplateExcel(activeTemplate)}>
                    <Download className="h-4 w-4 mr-1" />Template
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => exportEntriesToExcel(activeTemplate, entries)} disabled={entries.length === 0}>
                    <FileSpreadsheet className="h-4 w-4 mr-1" />Export
                  </Button>
                   {!isAdmin && (
                    <ExcelUploadButton template={activeTemplate} userId={user!.id} userName={profile!.name} entryDate={workingDate} onDone={loadEntries} />
                  )}
                </div>
              </CardContent>
            </Card>

            {/* PENDING ASSIGNED TASKS WIDGET */}
            {assignedTasks.length > 0 && !isAdmin && (
              <div className="card-nawi bg-warning/5 border-warning/20 mb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-warning/10 rounded-lg">
                      <AlertCircle className="w-5 h-5 text-warning" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-warning">Pending Assignments</h3>
                      <p className="text-xs text-muted-foreground">You have {assignedTasks.length} services from the Wizard that need DSR reporting.</p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setShowTasks(!showTasks)}>
                    {showTasks ? 'Hide' : 'View Tasks'}
                  </Button>
                </div>
                {showTasks && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-4 pt-4 border-t border-warning/10">
                    {assignedTasks.map(task => (
                      <div key={task.id} className="p-3 bg-card border border-border rounded-xl flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <Badge variant="secondary" className="text-[10px]">{task.service}</Badge>
                          </div>
                          <p className="text-sm font-bold">{task.clients?.name}</p>
                        </div>
                        <Button size="sm" className="mt-3 text-xs h-8" onClick={() => {
                          const tpl = templates.find(t => t.name.toLowerCase().includes(task.service.toLowerCase()));
                          if (tpl) {
                            setActiveTemplate(tpl);
                            toast.success(`Switched to ${tpl.name}. Add the details for ${task.clients?.name}!`);
                            setShowTasks(false);
                          } else {
                            toast.error(`No DSR template found for ${task.service}`);
                          }
                        }}>
                          <Plus className="w-3 h-3 mr-1" /> Add to DSR
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* KPI cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <KpiCard icon={ClipboardList} label="Entries" value={String(kpis.count)} />
              <KpiCard icon={Users} label="Employees" value={String(kpis.uniqueEmployees)} />
              <KpiCard icon={DollarSign} label="Sales" value={formatCurrency(kpis.totalSale)} />
              <KpiCard icon={DollarSign} label="Cost" value={formatCurrency(kpis.totalCost)} />
              <KpiCard icon={TrendingUp} label="Profit" value={formatCurrency(kpis.totalProfit)} highlight />
            </div>

            {/* BI Charts: trend + top performers */}
            {entries.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card className="lg:col-span-2">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-primary" /> Daily Trend
                    </CardTitle>
                    <span className="text-xs text-muted-foreground">{dailyTrend.length} day{dailyTrend.length !== 1 ? 's' : ''}</span>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={dailyTrend} margin={{ top: 5, right: 8, left: -10, bottom: 0 }}>
                          <defs>
                            <linearGradient id="dsrSales" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="hsl(var(--secondary))" stopOpacity={0.4} />
                              <stop offset="95%" stopColor="hsl(var(--secondary))" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="dsrProfit" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                          <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                          <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                          <RTooltip
                            contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                            formatter={(v: any, n: string) => [formatCurrency(Number(v)), n === 'sales' ? 'Sales' : 'Profit']}
                          />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          <Area type="monotone" dataKey="sales" stroke="hsl(var(--secondary))" strokeWidth={2} fill="url(#dsrSales)" name="Sales" />
                          <Area type="monotone" dataKey="profit" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#dsrProfit)" name="Profit" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-primary" /> Top Performers
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64">
                      {topPerformers.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-xs text-muted-foreground">No data</div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={topPerformers} layout="vertical" margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                            <XAxis type="number" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                            <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={75} stroke="hsl(var(--muted-foreground))" />
                            <RTooltip
                              contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                              formatter={(v: any) => [formatCurrency(Number(v)), 'Profit']}
                            />
                            <Bar dataKey="profit" radius={[0, 6, 6, 0]}>
                              {topPerformers.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Admin breakdown */}
            {isAdmin && empBreakdown.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Employee Performance</CardTitle></CardHeader>
                <CardContent>
                  <div className="table-container border-0">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b text-xs text-muted-foreground"><th className="text-left py-2">Employee</th><th className="text-right">Entries</th><th className="text-right">Sales</th><th className="text-right">Profit</th></tr></thead>
                      <tbody>
                        {empBreakdown.map((e, i) => (
                          <tr key={i} className="border-b last:border-0">
                            <td className="py-2 font-medium">{e.name}</td>
                            <td className="text-right">{e.count}</td>
                            <td className="text-right">{formatCurrency(e.sale)}</td>
                            <td className="text-right text-green-600 font-medium">{formatCurrency(e.profit)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Inline grid editor — Excel-like, no wizard */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">{activeTemplate.icon} {activeTemplate.name} — Entries</CardTitle>
                <Button asChild size="sm" variant="outline">
                  <a href={`https://docs.google.com/spreadsheets/create`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5 mr-1" />Open in Google Sheets
                  </a>
                </Button>
              </CardHeader>
              <CardContent>
                {activeTemplate ? (
                  <DSRGridEditor
                    key={`editor-${refreshCount}`}
                    template={activeTemplate}
                    fromDate={fromDate}
                    toDate={toDate}
                    isAdmin={isAdmin}
                    employeeFilter={employeeFilter}
                    workingDate={workingDate}
                    onWorkingDateChange={handleWorkingDateChange}
                    onChanged={() => setRefreshCount(prev => prev + 1)}
                  />
                ) : (
                  <div className="py-20 text-center text-muted-foreground">
                    Please select a template to view the report
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
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
