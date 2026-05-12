import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';
import { MessageCircle, Instagram, Facebook, RefreshCw, UserPlus, UserMinus, CheckCircle2, XCircle, Clock, Loader2, Send, StickyNote, Search, Filter, Upload, FileImage, Download, Trash2, PieChart as PieChartIcon, CalendarRange } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';
import { exportToExcel } from '@/lib/excel-export';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

type Source = 'whatsapp' | 'instagram' | 'messenger';
type Status = 'NEW' | 'IN_PROGRESS' | 'CONVERTED' | 'NOT_CONVERTED';

interface Lead {
  id: string;
  display_id: string;
  source: Source;
  unique_key: string;
  full_name: string | null;
  first_name: string | null;
  phone: string | null;
  username: string | null;
  language: string | null;
  status: Status;
  assigned_to: string | null;
  client_need: string | null;
  notes: string | null;
  follow_up_date: string | null;
  last_interaction: string | null;
  last_seen: string | null;
  created_at: string;
  proof_url: string | null;
  converted_at: string | null;
}

interface Note { id: string; author_name: string; body: string; created_at: string; }

const SOURCE_META: Record<Source, { label: string; Icon: any; color: string }> = {
  whatsapp:  { label: 'WhatsApp',  Icon: MessageCircle, color: 'text-success bg-success/10' },
  instagram: { label: 'Instagram', Icon: Instagram,    color: 'text-warning bg-warning/10' },
  messenger: { label: 'Messenger', Icon: Facebook,     color: 'text-secondary bg-secondary/10' },
};

const STATUS_META: Record<Status, { label: string; color: string }> = {
  NEW: { label: 'New', color: 'bg-primary/10 text-primary' },
  IN_PROGRESS: { label: 'In Progress', color: 'bg-warning/10 text-warning' },
  CONVERTED: { label: 'Converted', color: 'bg-success/10 text-success' },
  NOT_CONVERTED: { label: 'Not Converted', color: 'bg-destructive/10 text-destructive' },
};

const COLORS = ['#052F59', '#1A5B96', '#0A7040', '#C45000', '#C0392B', '#64748B'];

export default function SocialLeads() {
  const { user, profile } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [employees, setEmployees] = useState<Record<string, { name: string; photo: string | null }>>({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filterSource, setFilterSource] = useState<'all' | Source>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | Status>('all');
  const [search, setSearch] = useState('');
  const [quickFilter, setQuickFilter] = useState<'all' | 'today' | 'yesterday' | 'week' | 'month' | 'custom'>('all');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [openLead, setOpenLead] = useState<Lead | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState<'pool' | 'mine' | 'all' | 'analytics'>('pool');

  const load = async () => {
    const { data } = await supabase
      .from('social_leads').select('*')
      .order('last_interaction', { ascending: false, nullsFirst: false });
    setLeads((data as Lead[]) || []);
    setLoading(false);
  };

  const loadEmps = async () => {
    const { data } = await supabase.from('profiles').select('user_id, name, photo_url');
    const map: Record<string, any> = {};
    (data || []).forEach((e: any) => { map[e.user_id] = { name: e.name, photo: e.photo_url }; });
    setEmployees(map);
  };

  useEffect(() => {
    load(); loadEmps();
    if (user) {
      supabase.from('user_roles').select('role').eq('user_id', user.id).single().then(({ data }) => {
        const admin = data?.role === 'admin' || data?.role === 'superadmin' || profile?.email === 'admin@nawisaadi.com';
        setIsAdmin(admin);
        if (admin) setActiveTab('all');
      });
    }
    const channel = supabase
      .channel('social-leads-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'social_leads' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-social-leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Sync failed');
      
      const t = json.summary;
      const results = ['whatsapp', 'instagram', 'messenger'].map(s => {
        const d = t[s];
        if (!d || d.error) return `${s.toUpperCase()}: Error`;
        return `${s.toUpperCase()}: ${d.total} total (${d.new} new, ${d.updated} updated)`;
      }).join(' | ');

      toast.success(`Sync complete: ${results}`, { duration: 6000 });
      load();
    } catch (e: any) {
      toast.error(e.message || 'Sync failed');
    } finally { setSyncing(false); }
  };

  const takeLead = async (lead: Lead) => {
    if (lead.assigned_to && lead.assigned_to !== user?.id) {
      toast.error(`Already taken by ${employees[lead.assigned_to]?.name || 'another employee'}`);
      return;
    }
    const { error } = await supabase
      .from('social_leads')
      .update({ assigned_to: user!.id, assigned_at: new Date().toISOString(), status: lead.status === 'NEW' ? 'IN_PROGRESS' : lead.status })
      .eq('id', lead.id);
    if (error) { toast.error(error.message); return; }
    
    // 🔔 Notify admins that lead has been taken
    try {
      const { data: admins } = await supabase.from('user_roles').select('user_id').in('role', ['admin', 'superadmin']);
      if (admins) {
        const leadName = lead.full_name || lead.username || lead.phone || lead.display_id;
        const rows = admins.map((a: any) => ({
          user_id: a.user_id,
          title: 'Lead Assigned',
          message: `${profile?.name || 'An employee'} has taken lead ${leadName} (${lead.display_id}).`,
          type: 'lead_assigned',
        }));
        if (rows.length > 0) await supabase.from('notifications').insert(rows);
      }
    } catch { /* non-fatal */ }

    toast.success('Lead assigned to you');
    load();
  };

  const untakeLead = async (lead: Lead) => {
    if (lead.assigned_to !== user?.id && !isAdmin) {
      toast.error('Only the owner or admin can untake');
      return;
    }
    const { error } = await supabase
      .from('social_leads')
      .update({ assigned_to: null, assigned_at: null, status: 'NEW' })
      .eq('id', lead.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Lead released back to pool');
    load();
  };

  const filtered = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    const startOfWeek = new Date(today); startOfWeek.setDate(today.getDate() - 7);
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    return leads.filter(l => {
      // Tab Filtering
      if (activeTab === 'pool') {
        if (l.assigned_to) return false;
      } else if (activeTab === 'mine') {
        if (l.assigned_to !== user?.id) return false;
      }

      // Source & Status
      if (filterSource !== 'all' && l.source !== filterSource) return false;
      if (filterStatus !== 'all' && l.status !== filterStatus) return false;
      
      // Search
      if (search) {
        const q = search.toLowerCase();
        if (!(l.full_name || '').toLowerCase().includes(q)
          && !(l.phone || '').includes(q)
          && !(l.username || '').toLowerCase().includes(q)
          && !(l.display_id || '').toLowerCase().includes(q)) return false;
      }

      // Date Filtering
      const createdAt = new Date(l.created_at);
      if (quickFilter !== 'all') {
        if (quickFilter === 'today') {
          if (createdAt < today) return false;
        } else if (quickFilter === 'yesterday') {
          if (createdAt < yesterday || createdAt >= today) return false;
        } else if (quickFilter === 'week') {
          if (createdAt < startOfWeek) return false;
        } else if (quickFilter === 'month') {
          if (createdAt < startOfMonth) return false;
        } else if (quickFilter === 'custom') {
          if (dateRange.start) {
            const start = new Date(dateRange.start);
            if (createdAt < start) return false;
          }
          if (dateRange.end) {
            const end = new Date(dateRange.end);
            end.setHours(23, 59, 59, 999);
            if (createdAt > end) return false;
          }
        }
      }

      return true;
    });
  }, [leads, filterSource, filterStatus, search, quickFilter, dateRange, activeTab, user]);

  const counts = useMemo(() => ({
    total: leads.length,
    new: leads.filter(l => l.status === 'NEW').length,
    inProgress: leads.filter(l => l.status === 'IN_PROGRESS').length,
    converted: leads.filter(l => l.status === 'CONVERTED').length,
  }), [leads]);

  // Conversion analytics — by source × period (week / month)
  const analytics = useMemo(() => {
    const now = new Date();
    const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - 7); startOfWeek.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const empty = () => ({ whatsapp: 0, instagram: 0, messenger: 0, total: 0 });
    const week = empty();
    const month = empty();
    const allTime = empty();

    leads.forEach(l => {
      if (l.status !== 'CONVERTED' || !l.converted_at) return;
      const d = new Date(l.converted_at);
      const src = l.source as 'whatsapp' | 'instagram' | 'messenger';
      allTime[src]++; allTime.total++;
      if (d >= startOfMonth) { month[src]++; month.total++; }
      if (d >= startOfWeek) { week[src]++; week.total++; }
    });
    return { week, month, allTime };
  }, [leads]);

  const handleExport = () => {
    if (filtered.length === 0) { toast.error('No leads to export'); return; }
    const rows = filtered.map((l) => ({
      'Lead ID': l.display_id,
      Source: SOURCE_META[l.source]?.label || l.source,
      Status: STATUS_META[l.status]?.label || l.status,
      Name: l.full_name || '',
      Username: l.username || '',
      Phone: l.phone || '',
      Language: l.language || '',
      'Client Need': l.client_need || '',
      Notes: l.notes || '',
      'Follow-up Date': l.follow_up_date || '',
      'Assigned To': l.assigned_to ? (employees[l.assigned_to]?.name || l.assigned_to) : 'Unassigned',
      'Last Interaction': l.last_interaction ? new Date(l.last_interaction).toLocaleString('en-GB') : '',
      'Created At': new Date(l.created_at).toLocaleString('en-GB'),
      'Converted At': l.converted_at ? l.converted_at : '',
      'Proof URL': l.proof_url || '',
    }));
    exportToExcel(rows, `social-leads-${new Date().toISOString().slice(0, 10)}`, 'Leads');
    toast.success(`Exported ${rows.length} leads`);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold font-display">Social Media Leads</h2>
          <p className="text-sm text-muted-foreground">Auto-synced from WhatsApp, Instagram & Messenger every 15 minutes.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExport} className="btn-outline">
            <Download className="w-4 h-4" /> Export Excel
          </button>
          <button onClick={handleSync} disabled={syncing} className="btn-primary disabled:opacity-50">
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {syncing ? 'Syncing…' : 'Sync Now'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total" value={counts.total} color="text-foreground" />
        <StatCard label="New" value={counts.new} color="text-primary" />
        <StatCard label="In Progress" value={counts.inProgress} color="text-warning" />
        <StatCard label="Converted" value={counts.converted} color="text-success" />
      </div>

      {/* Conversion Analytics — by source × period */}
      <div className="card-nawi space-y-3 hidden sm:block">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-semibold font-display flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-success" /> Conversion Analytics
          </h3>
          <p className="text-[11px] text-muted-foreground">Live count of converted leads by channel</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {([['This Week', analytics.week], ['This Month', analytics.month], ['All Time', analytics.allTime]] as const).map(([label, data]) => (
            <div key={label} className="border border-border rounded-lg p-3 space-y-2 bg-muted/20">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="text-xl font-bold font-display text-success">{data.total}</p>
              </div>
              <div className="space-y-1">
                {(['whatsapp', 'instagram', 'messenger'] as const).map(src => {
                  const meta = SOURCE_META[src];
                  const Icon = meta.Icon;
                  const pct = data.total > 0 ? Math.round((data[src] / data.total) * 100) : 0;
                  return (
                    <div key={src} className="flex items-center gap-2 text-xs">
                      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="w-20">{meta.label}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full ${src === 'whatsapp' ? 'bg-success' : src === 'instagram' ? 'bg-warning' : 'bg-secondary'}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-8 text-right font-mono">{data[src]}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex border-b border-border overflow-x-auto hide-scrollbar">
        <button onClick={() => setActiveTab('pool')} className={`whitespace-nowrap px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'pool' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>Open Pool</button>
        <button onClick={() => setActiveTab('mine')} className={`whitespace-nowrap px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'mine' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>My Leads</button>
        {isAdmin && (
          <button onClick={() => setActiveTab('all')} className={`whitespace-nowrap px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'all' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>All Active (Admin)</button>
        )}
        <button onClick={() => setActiveTab('analytics')} className={`whitespace-nowrap px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'analytics' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'} flex items-center gap-1.5`}>
          <PieChartIcon className="w-3.5 h-3.5" /> My Analytics Dashboard
        </button>
      </div>

      {activeTab === 'analytics' ? (
        <SocialLeadsAnalytics leads={leads} employees={employees} user={user} isAdmin={isAdmin} />
      ) : (
        <>
          <div className="flex flex-wrap gap-2 items-center bg-muted/30 p-3 rounded-lg border border-border">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} className="input-nawi pl-9" placeholder="Search name, phone, username…" />
        </div>
        
        <div className="flex items-center gap-2 flex-wrap">
          <select value={filterSource} onChange={e => setFilterSource(e.target.value as any)} className="input-nawi w-full sm:w-auto text-sm py-1.5">
            <option value="all">All Channels</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="instagram">Instagram</option>
            <option value="messenger">Messenger</option>
          </select>

          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)} className="input-nawi w-full sm:w-auto text-sm py-1.5">
            <option value="all">All Statuses</option>
            <option value="NEW">New</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="CONVERTED">Converted</option>
            <option value="NOT_CONVERTED">Not Converted</option>
          </select>

          {/* ── Date Range Filter ── */}
          <div className="w-full border border-border/60 rounded-lg bg-background/60 p-2 space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              <CalendarRange className="w-3.5 h-3.5" /> Date Range
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(['all', 'today', 'yesterday', 'week', 'month', 'custom'] as const).map(opt => {
                const labels: Record<string, string> = { all: 'Any Time', today: 'Today', yesterday: 'Yesterday', week: 'This Week', month: 'This Month', custom: 'Custom…' };
                return (
                  <button
                    key={opt}
                    onClick={() => { setQuickFilter(opt); if (opt !== 'custom') setDateRange({ start: '', end: '' }); }}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      quickFilter === opt
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    {labels[opt]}
                  </button>
                );
              })}
            </div>
            {quickFilter === 'custom' && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <div className="flex items-center gap-1.5 flex-1 min-w-[140px]">
                  <label className="text-[10px] text-muted-foreground whitespace-nowrap">From</label>
                  <input
                    type="date"
                    value={dateRange.start}
                    onChange={e => setDateRange({ ...dateRange, start: e.target.value })}
                    className="input-nawi text-xs py-1 h-8 flex-1"
                  />
                </div>
                <div className="flex items-center gap-1.5 flex-1 min-w-[140px]">
                  <label className="text-[10px] text-muted-foreground whitespace-nowrap">To</label>
                  <input
                    type="date"
                    value={dateRange.end}
                    min={dateRange.start || undefined}
                    onChange={e => setDateRange({ ...dateRange, end: e.target.value })}
                    className="input-nawi text-xs py-1 h-8 flex-1"
                  />
                </div>
                {(dateRange.start || dateRange.end) && (
                  <button
                    onClick={() => setDateRange({ start: '', end: '' })}
                    className="text-[11px] text-muted-foreground hover:text-destructive flex items-center gap-0.5"
                  >
                    <XCircle className="w-3 h-3" /> Reset dates
                  </button>
                )}
              </div>
            )}
          </div>

          {(filterSource !== 'all' || filterStatus !== 'all' || search || quickFilter !== 'all') && (
            <button 
              onClick={() => { setSearch(''); setFilterSource('all'); setFilterStatus('all'); setQuickFilter('all'); setDateRange({ start: '', end: '' }); }}
              className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 px-2"
            >
              <XCircle className="w-3 h-3" /> Clear All
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="skeleton-nawi h-64" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<MessageCircle className="w-8 h-8 text-muted-foreground" />}
          title={activeTab === 'pool' ? "Open Pool is empty" : activeTab === 'mine' ? "You have no assigned leads" : "No leads found"}
          description={activeTab === 'pool' ? "Click 'Sync Now' to pull the latest leads." : "Take a lead from the Open Pool to start working."}
          action={activeTab === 'pool' && <button onClick={handleSync} className="btn-primary"><RefreshCw className="w-4 h-4" /> Sync Now</button>}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map(lead => {
            const meta = SOURCE_META[lead.source];
            const Icon = meta.Icon;
            const status = STATUS_META[lead.status];
            const owner = lead.assigned_to ? employees[lead.assigned_to] : null;
            const isMine = lead.assigned_to === user?.id;
            return (
              <div key={lead.id} className="card-nawi hover:shadow-elevated transition-shadow space-y-3">
                <div className="flex items-start gap-3">
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center ${meta.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold truncate">{lead.full_name || lead.username || 'Unnamed'}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${status.color}`}>{status.label}</span>
                      <span className="text-[10px] font-mono text-muted-foreground">{lead.display_id}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {lead.phone && <span>📱 {lead.phone}</span>}
                      {lead.username && <span> @{lead.username}</span>}
                      {lead.language && <span> • {lead.language}</span>}
                    </p>
                    {lead.last_interaction && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        <Clock className="w-3 h-3 inline" /> {new Date(lead.last_interaction).toLocaleString('en-GB')}
                      </p>
                    )}
                  </div>
                </div>

                {/* Employee progress block — visible to all, key for admin oversight */}
                {(lead.client_need || lead.follow_up_date || lead.notes || lead.proof_url || lead.converted_at) && (
                  <div className="border border-border/60 rounded-lg p-2.5 bg-muted/30 space-y-1.5">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Employee Progress</p>
                    {lead.client_need && (
                      <p className="text-xs"><strong className="text-muted-foreground">Need:</strong> {lead.client_need}</p>
                    )}
                    {lead.follow_up_date && (
                      <p className="text-xs"><strong className="text-muted-foreground">Follow-up:</strong> {new Date(lead.follow_up_date).toLocaleDateString('en-GB')}</p>
                    )}
                    {lead.notes && (
                      <p className="text-xs line-clamp-2"><strong className="text-muted-foreground">Notes:</strong> {lead.notes}</p>
                    )}
                    {lead.converted_at && (
                      <p className="text-xs text-success"><CheckCircle2 className="w-3 h-3 inline" /> <strong>Converted</strong> on {new Date(lead.converted_at).toLocaleDateString('en-GB')}</p>
                    )}
                    {lead.proof_url && (
                      <a href={lead.proof_url} target="_blank" rel="noopener" className="inline-flex items-center gap-2 mt-1">
                        <img src={lead.proof_url} alt="Conversion proof" className="w-16 h-16 rounded border border-border object-cover hover:opacity-80 transition-opacity" />
                        <span className="text-[11px] text-primary underline">View proof</span>
                      </a>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-xs text-muted-foreground flex items-center flex-wrap gap-2">
                    {owner ? (
                      <span className="flex items-center gap-1">
                        {owner.photo
                          ? <img src={owner.photo} className="w-5 h-5 rounded-full object-cover" alt="" />
                          : <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[9px] flex items-center justify-center font-bold">{owner.name.slice(0, 2)}</span>}
                        Handled by <strong>{isMine ? 'you' : owner.name}</strong>
                      </span>
                    ) : <span className="text-warning font-medium">Unassigned</span>}

                    {isAdmin && (
                      <select
                        value={lead.assigned_to || ''}
                        onChange={async (e) => {
                          const newOwner = e.target.value || null;
                          const { error } = await supabase.from('social_leads').update({
                            assigned_to: newOwner,
                            assigned_at: newOwner ? new Date().toISOString() : null,
                            status: newOwner && lead.status === 'NEW' ? 'IN_PROGRESS' : lead.status
                          }).eq('id', lead.id);
                          if (!error) { toast.success('Lead reassigned'); load(); }
                          else { toast.error(error.message); }
                        }}
                        className="bg-transparent border border-border rounded text-[10px] px-1 py-0.5"
                      >
                        <option value="">Unassign</option>
                        {Object.entries(employees).map(([id, emp]) => (
                          <option key={id} value={id}>{emp.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {!lead.assigned_to && (
                      <button onClick={() => takeLead(lead)} className="btn-outline text-xs">
                        <UserPlus className="w-3 h-3" /> Take Lead
                      </button>
                    )}
                    {isMine && lead.status !== 'CONVERTED' && (
                      <button onClick={() => untakeLead(lead)} className="btn-outline text-xs text-warning">
                        <UserMinus className="w-3 h-3" /> Untake
                      </button>
                    )}
                    <button onClick={() => setOpenLead(lead)} className="btn-primary text-xs">
                      <StickyNote className="w-3 h-3" /> Manage
                    </button>
                    {isAdmin && (
                      <button 
                        onClick={async () => {
                          if (!confirm('Permanently delete this lead?')) return;
                          const { error } = await supabase.from('social_leads').delete().eq('id', lead.id);
                          if (!error) { toast.success('Deleted'); load(); }
                        }} 
                        className="btn-outline text-xs border-destructive text-destructive hover:bg-destructive/10 px-2" 
                        title="Delete Lead"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
        </>
      )}

      {openLead && (
        <LeadModal
          lead={openLead}
          onClose={() => setOpenLead(null)}
          onSaved={() => { setOpenLead(null); load(); }}
          canEdit={!openLead.assigned_to || openLead.assigned_to === user?.id || isAdmin}
          currentUserId={user!.id}
          currentUserName={profile?.name || 'Unknown'}
          isAdmin={isAdmin}
          allEmployees={employees}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="card-nawi py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold font-display ${color}`}>{value}</p>
    </div>
  );
}

function LeadModal({ lead, onClose, onSaved, canEdit, currentUserId, currentUserName, isAdmin, allEmployees }: {
  lead: Lead; onClose: () => void; onSaved: () => void; canEdit: boolean; currentUserId: string; currentUserName: string; isAdmin: boolean; allEmployees: Record<string, { name: string }>;
}) {
  const [form, setForm] = useState({
    status: lead.status, client_need: lead.client_need || '', notes: lead.notes || '',
    follow_up_date: lead.follow_up_date || '', assigned_to: lead.assigned_to || '',
  });
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(lead.proof_url);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    supabase.from('lead_notes').select('*').eq('lead_id', lead.id).order('created_at', { ascending: false }).then(({ data }) => {
      setNotes((data as Note[]) || []);
    });
  }, [lead.id]);

  const save = async () => {
    if (form.status === 'CONVERTED' && !proofUrl && !proofFile) {
      toast.error('Please upload proof (ticket/payment) before marking as Converted');
      return;
    }
    setSaving(true);
    let finalProof = proofUrl;
    if (proofFile) {
      setUploading(true);
      const ext = proofFile.name.split('.').pop() || 'bin';
      const path = `${lead.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('lead-proofs').upload(path, proofFile, { upsert: true });
      setUploading(false);
      if (upErr) { setSaving(false); toast.error(`Upload failed: ${upErr.message}`); return; }
      const { data: pub } = supabase.storage.from('lead-proofs').getPublicUrl(path);
      finalProof = pub.publicUrl;
    }
    const update: any = {
      status: form.status,
      client_need: form.client_need || null,
      notes: form.notes || null,
      follow_up_date: form.follow_up_date || null,
      proof_url: finalProof,
    };
    
    // Handle Admin assignment change
    if (isAdmin && form.assigned_to !== (lead.assigned_to || '')) {
      update.assigned_to = form.assigned_to || null;
      update.assigned_at = form.assigned_to ? new Date().toISOString() : null;
      if (form.assigned_to && update.status === 'NEW') update.status = 'IN_PROGRESS';
    }

    const isNewConversion = form.status === 'CONVERTED' && !lead.converted_at;
    if (isNewConversion) update.converted_at = new Date().toISOString();
    const { error } = await supabase.from('social_leads').update(update).eq('id', lead.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }

    // 🔔 Notify all admins on new conversion or non-conversion
    if (isNewConversion || form.status === 'NOT_CONVERTED') {
      try {
        const { data: adminRoles } = await supabase.from('user_roles').select('user_id').in('role', ['admin', 'superadmin']);
        const sourceLabel = SOURCE_META[lead.source].label;
        const leadName = lead.full_name || lead.username || lead.phone || lead.display_id;
        const title = form.status === 'CONVERTED' ? `🎉 Lead Converted — ${sourceLabel}` : `❌ Lead Lost — ${sourceLabel}`;
        const message = form.status === 'CONVERTED' 
          ? `${currentUserName} converted ${leadName} (${lead.display_id}). ${form.client_need ? 'Need: ' + form.client_need : ''}`.trim()
          : `${currentUserName} marked ${leadName} as Not Converted. ${form.notes ? 'Reason: ' + form.notes : ''}`.trim();

        const rows = (adminRoles || []).map((a: any) => ({
          user_id: a.user_id,
          title,
          message,
          type: form.status === 'CONVERTED' ? 'lead_converted' : 'lead_lost',
        }));
        if (rows.length > 0) await supabase.from('notifications').insert(rows);
      } catch { /* non-fatal */ }
    }

    toast.success(isNewConversion ? '🎉 Conversion logged & admins notified' : 'Lead updated');
    onSaved();
  };

  const deleteLead = async () => {
    if (!isAdmin) return;
    if (!confirm('Are you sure you want to PERMANENTLY delete this lead? This cannot be undone.')) return;
    setSaving(true);
    const { error } = await supabase.from('social_leads').delete().eq('id', lead.id);
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success('Lead permanently deleted');
    onSaved();
  };

  const addNote = async () => {
    if (!newNote.trim()) return;
    const { data, error } = await supabase.from('lead_notes').insert({
      lead_id: lead.id, author_id: currentUserId, author_name: currentUserName, body: newNote.trim(),
    }).select().single();
    if (error) { toast.error(error.message); return; }
    setNotes(n => [data as Note, ...n]);
    setNewNote('');
  };

  const meta = SOURCE_META[lead.source];

  return (
    <div className="fixed inset-0 bg-foreground/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-xl shadow-elevated w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-border flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold font-display">{lead.full_name || lead.username || 'Lead'}</h3>
            <p className="text-xs text-muted-foreground font-mono">{lead.display_id} • {meta.label}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><XCircle className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Info label="Phone" value={lead.phone} />
            <Info label="Username" value={lead.username} />
            <Info label="Language" value={lead.language} />
            <Info label="Last Seen" value={lead.last_seen ? new Date(lead.last_seen).toLocaleString('en-GB') : null} />
          </div>

          <div className="space-y-3 pt-2 border-t border-border">
            {isAdmin && (
              <div>
                <label className="block text-xs font-medium mb-1">Assign To Employee (Admin Only)</label>
                <select value={form.assigned_to} onChange={e => setForm({ ...form, assigned_to: e.target.value })} className="input-nawi">
                  <option value="">Unassigned (Open Pool)</option>
                  {Object.entries(allEmployees).map(([id, emp]) => (
                    <option key={id} value={id}>{emp.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium mb-1">Status</label>
              <select disabled={!canEdit} value={form.status} onChange={e => setForm({ ...form, status: e.target.value as Status })} className="input-nawi disabled:opacity-60">
                <option value="NEW">New</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="CONVERTED">Converted</option>
                <option value="NOT_CONVERTED">Not Converted</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Client Need (visa, ticket, package…)</label>
              <input disabled={!canEdit} value={form.client_need} onChange={e => setForm({ ...form, client_need: e.target.value })} className="input-nawi disabled:opacity-60" placeholder="e.g. UAE Visa, Family Trip" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Follow-up Date</label>
              <input disabled={!canEdit} type="date" value={form.follow_up_date} onChange={e => setForm({ ...form, follow_up_date: e.target.value })} className="input-nawi disabled:opacity-60" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Summary Notes</label>
              <textarea disabled={!canEdit} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} className="input-nawi disabled:opacity-60" />
            </div>
            {canEdit && (
              <div className="flex gap-2 pt-2">
                <button onClick={save} disabled={saving} className="btn-primary flex-1 disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
                {isAdmin && (
                  <button onClick={deleteLead} disabled={saving} className="btn-outline border-destructive text-destructive hover:bg-destructive/10 px-3" title="Delete Lead permanently">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
            {!canEdit && (
              <p className="text-xs text-muted-foreground text-center italic">Read-only — only the assigned employee or admin can edit.</p>
            )}
          </div>

          {(form.status === 'CONVERTED' || proofUrl) && canEdit && (
            <div className="pt-4 border-t border-border space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <FileImage className="w-4 h-4" /> Conversion Proof <span className="text-destructive">*</span>
              </h4>
              {proofUrl && !proofFile && (
                <div className="flex items-center gap-3 p-2 border border-border rounded-lg bg-muted/30">
                  {/\.(jpe?g|png|gif|webp)$/i.test(proofUrl) ? (
                    <img src={proofUrl} alt="proof" className="w-16 h-16 rounded object-cover border border-border" />
                  ) : (
                    <div className="w-16 h-16 rounded bg-muted flex items-center justify-center"><FileImage className="w-6 h-6 text-muted-foreground" /></div>
                  )}
                  <div className="flex-1 min-w-0">
                    <a href={proofUrl} target="_blank" rel="noopener" className="text-xs text-primary underline block truncate">View current proof ↗</a>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Pick a new file below to replace.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { if (confirm('Remove the current proof?')) { setProofUrl(null); setProofFile(null); } }}
                    title="Remove proof"
                    className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
              <label className="block">
                <span className="text-[11px] text-muted-foreground">{proofUrl ? 'Replace with' : 'Upload'} image or PDF</span>
                <input type="file" accept="image/*,application/pdf" onChange={e => setProofFile(e.target.files?.[0] || null)} className="input-nawi text-xs mt-1" />
              </label>
              {proofFile && (
                <div className="flex items-center justify-between p-2 border border-primary/30 rounded-lg bg-primary/5">
                  <p className="text-[11px] text-primary"><Upload className="w-3 h-3 inline" /> {proofFile.name} ready</p>
                  <button type="button" onClick={() => setProofFile(null)} className="text-[11px] text-muted-foreground hover:text-destructive">Cancel</button>
                </div>
              )}
              {uploading && <p className="text-[11px] text-primary">Uploading…</p>}
            </div>
          )}

          <div className="pt-4 border-t border-border space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-1.5"><StickyNote className="w-4 h-4" /> Activity Log</h4>
            <div className="flex gap-2">
              <input value={newNote} onChange={e => setNewNote(e.target.value)} onKeyDown={e => e.key === 'Enter' && addNote()} placeholder="Add a note…" className="input-nawi flex-1" />
              <button onClick={addNote} className="btn-primary"><Send className="w-4 h-4" /></button>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {notes.length === 0 ? <p className="text-xs text-muted-foreground italic">No notes yet.</p> :
                notes.map(n => (
                  <div key={n.id} className="bg-muted/40 rounded p-2 text-xs">
                    <p className="text-foreground">{n.body}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{n.author_name} • {new Date(n.created_at).toLocaleString('en-GB')}</p>
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium">{value || '—'}</p>
    </div>
  );
}

function SocialLeadsAnalytics({ leads, employees, user, isAdmin }: { leads: Lead[]; employees: Record<string, {name: string, photo: string | null}>; user: any; isAdmin: boolean }) {
  const relevantLeads = isAdmin ? leads : leads.filter(l => l.assigned_to === user?.id);

  const total = relevantLeads.length;
  const newLeads = relevantLeads.filter(l => l.status === 'NEW').length;
  const inProgress = relevantLeads.filter(l => l.status === 'IN_PROGRESS').length;
  const converted = relevantLeads.filter(l => l.status === 'CONVERTED').length;
  const notConverted = relevantLeads.filter(l => l.status === 'NOT_CONVERTED').length;
  const conversionRate = total > 0 ? Math.round((converted / total) * 100) : 0;

  const bySource = [
    { name: 'WhatsApp', value: relevantLeads.filter(l => l.source === 'whatsapp').length },
    { name: 'Instagram', value: relevantLeads.filter(l => l.source === 'instagram').length },
    { name: 'Messenger', value: relevantLeads.filter(l => l.source === 'messenger').length },
  ].filter(s => s.value > 0);

  const employeeStats = isAdmin ? Object.entries(employees).map(([id, emp]) => {
    const empLeads = leads.filter(l => l.assigned_to === id);
    const conv = empLeads.filter(l => l.status === 'CONVERTED').length;
    return {
      name: emp.name,
      photo: emp.photo,
      assigned: empLeads.length,
      converted: conv,
      rate: empLeads.length > 0 ? Math.round((conv / empLeads.length) * 100) : 0
    };
  }).filter(e => e.assigned > 0).sort((a, b) => b.converted - a.converted) : [];

  return (
    <div className="space-y-6 animate-fade-in py-2">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label={isAdmin ? "Total Leads" : "My Assigned Leads"} value={total} color="text-foreground" />
        <StatCard label="In Progress" value={inProgress} color="text-warning" />
        <StatCard label="Converted" value={converted} color="text-success" />
        <StatCard label="Conv. Rate" value={conversionRate + '%'} color="text-primary" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card-nawi">
          <h3 className="text-base font-semibold font-display mb-4">Conversion by Channel</h3>
          {bySource.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">No leads data</p> : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={bySource} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} label>
                  {bySource.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {isAdmin && (
          <div className="card-nawi">
            <h3 className="text-base font-semibold font-display mb-4">Top Converters</h3>
            {employeeStats.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">No assignments yet</p> : (
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                {employeeStats.map((emp, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-muted/50 transition-colors">
                    <span className="text-xs font-bold text-muted-foreground w-4">{i + 1}</span>
                    {emp.photo ? <img src={emp.photo} alt="" className="w-10 h-10 rounded-full object-cover" /> :
                      <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-sm font-bold text-primary-foreground">{emp.name.slice(0, 2).toUpperCase()}</div>}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{emp.name}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{emp.assigned} total leads</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-success font-display">{emp.converted}</p>
                      <p className="text-[10px] text-muted-foreground">({emp.rate}%)</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
