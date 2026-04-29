import { useState, useEffect, useMemo } from 'react';
import { exportToExcel } from '@/lib/excel-export';
import { Link } from 'react-router-dom';
import { Calendar as CalendarIcon, AlertTriangle, Bell, Download, Search, MessageCircle, LayoutGrid, CalendarDays, ChevronLeft, ChevronRight, BellOff } from 'lucide-react';
import { formatDate, daysUntil } from '@/lib/supabase-service';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/integrations/supabase/client';
import WhatsAppTemplateModal from '@/components/WhatsAppTemplateModal';
import { toast } from 'sonner';

/** Auto-detect category from a free-form date name to pick an icon, color and template. */
function detectCategory(name: string): { key: string; emoji: string; color: string } {
  const n = name.toLowerCase();
  if (n.includes('birthday') || n === 'dob' || n.includes('birth')) return { key: 'birthday', emoji: '🎂', color: 'bg-purple-100 text-purple-700' };
  if (n.includes('anniversary') || n.includes('wedding')) return { key: 'anniversary', emoji: '💍', color: 'bg-pink-100 text-pink-700' };
  if (n.includes('passport')) return { key: 'passport', emoji: '📕', color: 'bg-destructive/10 text-destructive' };
  if (n.includes('visa')) return { key: 'visa', emoji: '🪪', color: 'bg-warning/10 text-warning' };
  if (n.includes('emirates') || n.includes('eid')) return { key: 'emiratesId', emoji: '🆔', color: 'bg-primary/10 text-primary' };
  if (n.includes('medical') || n.includes('health') || n.includes('insurance')) return { key: 'medical', emoji: '🏥', color: 'bg-success/10 text-success' };
  if (n.includes('travel') || n.includes('flight') || n.includes('departure') || n.includes('return')) return { key: 'travel', emoji: '✈️', color: 'bg-secondary/10 text-secondary' };
  if (n.includes('booking') || n.includes('hotel') || n.includes('check-in') || n.includes('checkin')) return { key: 'booking', emoji: '🏨', color: 'bg-secondary/10 text-secondary' };
  if (n.includes('contract') || n.includes('agreement')) return { key: 'contract', emoji: '📄', color: 'bg-muted text-muted-foreground' };
  if (n.includes('payment') || n.includes('due') || n.includes('invoice')) return { key: 'payment', emoji: '💰', color: 'bg-warning/10 text-warning' };
  return { key: 'other', emoji: '📅', color: 'bg-muted text-muted-foreground' };
}

/** Recurring categories use day-of-year matching; everything else uses absolute date. */
const RECURRING = new Set(['birthday', 'anniversary']);

function getDaysFor(name: string, dateStr: string): number {
  const cat = detectCategory(name);
  if (RECURRING.has(cat.key)) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const src = new Date(dateStr);
    const next = new Date(today.getFullYear(), src.getMonth(), src.getDate());
    if (next < today) next.setFullYear(today.getFullYear() + 1);
    return Math.ceil((next.getTime() - today.getTime()) / 86400000);
  }
  return daysUntil(dateStr);
}

function buildTemplate(category: string, clientName: string, label: string, days: number, dateStr: string): string {
  const niceDate = formatDate(dateStr);
  const when = days === 0 ? 'today' : days === 1 ? 'tomorrow' : days < 0 ? `${Math.abs(days)} days ago` : `in ${days} days`;
  switch (category) {
    case 'birthday':
      return `Dear ${clientName},\n\n🎂 Wishing you a very Happy Birthday! May the year ahead bring joy, success, and unforgettable journeys.\n\nWarm regards,\nNawi Saadi Travel & Tourism`;
    case 'anniversary':
      return `Dear ${clientName},\n\n💍 Happy Anniversary! Wishing you and your loved one many more beautiful years together.\n\nWarm regards,\nNawi Saadi Travel & Tourism`;
    case 'passport':
      return `Dear ${clientName},\n\n📕 Friendly reminder: your passport is expiring ${when} (${niceDate}). Please consider renewing it soon to avoid travel disruptions.\n\nWe're happy to assist with the renewal process.\n\nNawi Saadi Travel & Tourism`;
    case 'visa':
      return `Dear ${clientName},\n\n🪪 Reminder: your visa (${label}) ${days < 0 ? 'expired' : 'expires'} ${when} (${niceDate}). Contact us for renewal or extension assistance.\n\nNawi Saadi Travel & Tourism`;
    case 'emiratesId':
      return `Dear ${clientName},\n\n🆔 Your Emirates ID is ${days < 0 ? 'expired' : 'expiring'} ${when} (${niceDate}). Please renew it at your earliest convenience.\n\nNawi Saadi Travel & Tourism`;
    case 'medical':
      return `Dear ${clientName},\n\n🏥 Reminder: your ${label} expires ${when} (${niceDate}). Please schedule a renewal soon.\n\nNawi Saadi Travel & Tourism`;
    case 'travel':
      return `Dear ${clientName},\n\n✈️ Your travel date (${label}) is ${when} — ${niceDate}.\n\nWe wish you a safe and pleasant journey! Let us know if you need any pre-travel assistance.\n\nNawi Saadi Travel & Tourism`;
    case 'booking':
      return `Dear ${clientName},\n\n🏨 Reminder: your ${label} is ${when} (${niceDate}). All confirmations are with you — please reach out if you need any changes.\n\nNawi Saadi Travel & Tourism`;
    case 'contract':
      return `Dear ${clientName},\n\n📄 Your ${label} ${days < 0 ? 'ended' : 'ends'} ${when} (${niceDate}). Please contact us to discuss next steps.\n\nNawi Saadi Travel & Tourism`;
    case 'payment':
      return `Dear ${clientName},\n\n💰 Reminder: ${label} is due ${when} (${niceDate}). Kindly arrange the payment at your convenience.\n\nNawi Saadi Travel & Tourism`;
    default:
      return `Dear ${clientName},\n\n📅 Reminder: ${label} is ${when} (${niceDate}).\n\nNawi Saadi Travel & Tourism`;
  }
}

interface DateRow {
  clientId: string;
  clientName: string;
  mobile: string;
  email?: string;
  nationality?: string;
  service?: string;
  label: string;        // free-form date name from client record
  category: string;     // detected key
  emoji: string;
  color: string;
  date: string;         // ISO date string
  days: number;
  status: 'overdue' | 'urgent' | 'warning' | 'safe';
}

export default function ImportantDates() {
  const { user, isAdmin } = useAuth();
  const [clients, setClients] = useState<any[]>([]);
  const [prefs, setPrefs] = useState<Record<string, boolean>>({}); // key: clientId::label -> silenced
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [timeFilter, setTimeFilter] = useState('all');
  const [nationalityFilter, setNationalityFilter] = useState('all');
  const [view, setView] = useState<'cards' | 'calendar'>('cards');
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [waModal, setWaModal] = useState<{ row: DateRow; message: string } | null>(null);
  const basePath = isAdmin ? '/admin' : '/employee';

  const loadPrefs = async () => {
    const { data } = await supabase.from('date_reminder_prefs').select('client_id, date_label, silenced');
    const map: Record<string, boolean> = {};
    (data || []).forEach((p: any) => { map[`${p.client_id}::${p.date_label}`] = p.silenced; });
    setPrefs(map);
  };

  useEffect(() => {
    const load = async () => {
      let q = supabase.from('clients').select('*');
      if (!isAdmin && user) q = q.or(`assigned_to.eq.${user.id},created_by.eq.${user.id}`);
      const { data } = await q;
      setClients(data || []);
    };
    load();
    loadPrefs();
  }, [isAdmin, user]);

  const toggleSilence = async (row: DateRow) => {
    const key = `${row.clientId}::${row.label}`;
    const newSilenced = !prefs[key];
    setPrefs(p => ({ ...p, [key]: newSilenced }));
    const { error } = await supabase.from('date_reminder_prefs').upsert({
      client_id: row.clientId, date_label: row.label, silenced: newSilenced, updated_by: user?.id,
    }, { onConflict: 'client_id,date_label' });
    if (error) {
      setPrefs(p => ({ ...p, [key]: !newSilenced }));
      toast.error(error.message);
    } else {
      toast.success(newSilenced ? '🔕 Reminders OFF for this date' : '🔔 Reminders ON — auto-WhatsApp at 1d & 3d');
    }
  };

  const allDates: DateRow[] = useMemo(() => {
    const rows: DateRow[] = [];
    clients.forEach((c: any) => {
      const dates = (c.important_dates || {}) as Record<string, string>;
      // Dedupe: collapse multiple keys mapping to the same category for the same client.
      // E.g. "DOB", "Date of Birth", "Birth Date" → keep only one (earliest non-empty value),
      // and standardize the displayed label to the canonical name.
      const CANONICAL: Record<string, string> = {
        birthday: 'Date of Birth',
        passport: 'Passport Expiry',
        visa: 'Visa Expiry',
        emiratesId: 'Emirates ID Expiry',
      };
      const seenByCategory = new Set<string>();
      // Sort entries so duplicates with empty values lose to ones with values
      const entries = Object.entries(dates)
        .filter(([label, val]) => val && label !== 'passportNo');
      entries.forEach(([label, val]) => {
        const cat = detectCategory(label);
        // For categories that should be unique per client, only keep the first occurrence
        if (CANONICAL[cat.key]) {
          const dedupKey = `${c.id}::${cat.key}`;
          if (seenByCategory.has(dedupKey)) return;
          seenByCategory.add(dedupKey);
        }
        const displayLabel = CANONICAL[cat.key] || label;
        const days = getDaysFor(displayLabel, val);
        const status: DateRow['status'] = days < 0 ? 'overdue' : days <= 2 ? 'urgent' : days <= 30 ? 'warning' : 'safe';
        rows.push({
          clientId: c.id, clientName: c.name, mobile: c.mobile, email: c.email,
          nationality: c.nationality, service: c.service,
          label: displayLabel, category: cat.key, emoji: cat.emoji, color: cat.color,
          date: val, days, status,
        });
      });
    });
    return rows;
  }, [clients]);

  const categories = useMemo(() => ['All', ...Array.from(new Set(allDates.map(d => d.category)))], [allDates]);
  const nationalities = useMemo(() => Array.from(new Set(clients.map((c: any) => c.nationality).filter(Boolean))), [clients]);

  const filtered = useMemo(() => {
    let f = allDates;
    if (filter !== 'All') f = f.filter(d => d.category === filter);
    if (search) f = f.filter(d => d.clientName.toLowerCase().includes(search.toLowerCase()) || d.label.toLowerCase().includes(search.toLowerCase()));
    if (nationalityFilter !== 'all') f = f.filter(d => d.nationality === nationalityFilter);
    if (timeFilter === 'today') f = f.filter(d => d.days === 0);
    else if (timeFilter === 'tomorrow') f = f.filter(d => d.days === 1);
    else if (timeFilter === '3days') f = f.filter(d => d.days >= 0 && d.days <= 3);
    else if (timeFilter === 'week') f = f.filter(d => d.days >= 0 && d.days <= 7);
    else if (timeFilter === 'month') f = f.filter(d => d.days >= 0 && d.days <= 30);
    else if (timeFilter === '90days') f = f.filter(d => d.days >= 0 && d.days <= 90);
    else if (timeFilter === 'overdue') f = f.filter(d => d.days < 0);
    return [...f].sort((a, b) => a.days - b.days);
  }, [allDates, filter, search, timeFilter, nationalityFilter]);

  const overdue = filtered.filter(d => d.status === 'overdue');
  const urgent = filtered.filter(d => d.status === 'urgent');
  const warning = filtered.filter(d => d.status === 'warning');
  const safe = filtered.filter(d => d.status === 'safe');

  const exportCSV = () => {
    if (filtered.length === 0) return;
    const rows = filtered.map(d => ({
      Client: d.clientName, Mobile: d.mobile, Email: d.email || '',
      DateName: d.label, Category: d.category, Date: formatDate(d.date),
      DaysLeft: d.days, Status: d.status, Service: d.service || '', Nationality: d.nationality || '',
    }));
    exportToExcel(rows, `important_dates_${new Date().toISOString().slice(0, 10)}`, 'ImportantDates');
  };

  const openReminder = (row: DateRow) => {
    setWaModal({ row, message: buildTemplate(row.category, row.clientName, row.label, row.days, row.date) });
  };

  const statusBorder: Record<DateRow['status'], string> = {
    safe: 'border-success/20 bg-success/5',
    warning: 'border-warning/20 bg-warning/5',
    urgent: 'border-destructive/20 bg-destructive/5',
    overdue: 'border-destructive/30 bg-destructive/10',
  };

  const DateCard = ({ d }: { d: DateRow }) => {
    const silenced = !!prefs[`${d.clientId}::${d.label}`];
    return (
      <div className={`p-3 rounded-xl border ${statusBorder[d.status]} hover:shadow-md transition-all`}>
        <div className="flex items-center justify-between mb-1">
          <span className={`text-xs px-2 py-0.5 rounded-full ${d.color}`}>{d.emoji} {d.label}</span>
          <span className={`text-xs font-bold ${d.days < 0 ? 'text-destructive' : d.days <= 2 ? 'text-destructive' : d.days <= 7 ? 'text-warning' : d.days <= 30 ? 'text-warning' : 'text-success'}`}>
            {d.days < 0 ? `${Math.abs(d.days)}d overdue` : d.days === 0 ? '🔴 TODAY' : d.days === 1 ? '🟠 TOMORROW' : `${d.days}d left`}
          </span>
        </div>
        <Link to={`${basePath}/clients/${d.clientId}`} className="hover:underline">
          <p className="text-sm font-medium">{d.clientName}</p>
        </Link>
        <p className="text-xs text-muted-foreground">{formatDate(d.date)} • {d.mobile || '—'}{d.nationality ? ` • ${d.nationality}` : ''}</p>
        <div className="flex items-center justify-between mt-2 gap-2">
          <button onClick={() => openReminder(d)} className="text-xs text-success hover:underline flex items-center gap-1">
            <MessageCircle className="w-3 h-3" /> Send Now
          </button>
          <button
            onClick={() => toggleSilence(d)}
            title={silenced ? 'Currently UNSENT — tap to enable auto WhatsApp reminders (1d / 3d before)' : 'Auto WhatsApp reminder will be SENT — tap to mark as Unsent'}
            className={`flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full transition-colors ${silenced ? 'bg-muted text-muted-foreground' : 'bg-success/15 text-success'}`}
          >
            {silenced ? <><BellOff className="w-3 h-3" /> Unsent</> : <><Bell className="w-3 h-3" /> Message sent</>}
          </button>
        </div>
      </div>
    );
  };

  const Section = ({ title, items, emoji }: { title: string; items: DateRow[]; emoji: string }) => items.length > 0 ? (
    <div>
      <h3 className="text-sm font-semibold mb-2 uppercase tracking-wider flex items-center gap-2">{emoji} {title} ({items.length})</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((d, i) => <DateCard key={`${d.clientId}-${d.label}-${i}`} d={d} />)}
      </div>
    </div>
  ) : null;

  // ───── Calendar grid ─────
  const calendarDays = useMemo(() => {
    const first = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1);
    const startDow = first.getDay();
    const daysInMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(calMonth.getFullYear(), calMonth.getMonth(), d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [calMonth]);

  const datesByDay = useMemo(() => {
    const map = new Map<string, DateRow[]>();
    filtered.forEach(d => {
      const dt = new Date(d.date);
      // for recurring dates, project to current year of calendar
      const year = calMonth.getFullYear();
      const projected = RECURRING.has(d.category) ? new Date(year, dt.getMonth(), dt.getDate()) : dt;
      if (projected.getMonth() !== calMonth.getMonth() || projected.getFullYear() !== calMonth.getFullYear()) return;
      const key = projected.toISOString().slice(0, 10);
      const arr = map.get(key) || [];
      arr.push(d);
      map.set(key, arr);
    });
    return map;
  }, [filtered, calMonth]);

  const todayKey = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
      <h2 className="text-xl font-bold font-display flex items-center gap-2"><CalendarIcon className="w-5 h-5 text-primary" /> Important Dates</h2>
        <div className="flex items-center gap-2">
          <div className="flex border border-border rounded-lg p-0.5">
            <button onClick={() => setView('cards')} className={`px-3 py-1 text-xs rounded ${view === 'cards' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}><LayoutGrid className="w-3 h-3 inline mr-1" /> Cards</button>
            <button onClick={() => setView('calendar')} className={`px-3 py-1 text-xs rounded ${view === 'calendar' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}><CalendarDays className="w-3 h-3 inline mr-1" /> Calendar</button>
          </div>
          <button onClick={exportCSV} className="btn-outline"><Download className="w-4 h-4" /> Export</button>
        </div>
      </div>

      <div className="card-nawi bg-primary/5 border-primary/20 py-2.5 px-3 flex items-start gap-2 text-xs">
        <Bell className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
        <p className="text-muted-foreground">
          <strong className="text-primary">Auto reminders:</strong> Each date has a 🔔 <em>Message sent</em> / 🔕 <em>Unsent</em> toggle. When set to <em>Message sent</em>, the system auto-sends a WhatsApp reminder 3 days and 1 day before. Tap to mark individual dates as Unsent (no auto reminder).
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} className="input-nawi pl-9" placeholder="Search client or date name..." />
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value)} className="input-nawi w-auto">
          {categories.map(c => <option key={c} value={c}>{c === 'All' ? 'All Categories' : c}</option>)}
        </select>
        <select value={timeFilter} onChange={e => setTimeFilter(e.target.value)} className="input-nawi w-auto">
          <option value="all">All Time</option>
          <option value="overdue">Overdue</option>
          <option value="today">Today</option>
          <option value="tomorrow">Tomorrow</option>
          <option value="3days">Next 3 Days</option>
          <option value="week">Next 7 Days</option>
          <option value="month">Next 30 Days</option>
          <option value="90days">Next 90 Days</option>
        </select>
        {nationalities.length > 0 && (
          <select value={nationalityFilter} onChange={e => setNationalityFilter(e.target.value)} className="input-nawi w-auto">
            <option value="all">All Nationalities</option>
            {nationalities.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        {overdue.length > 0 && <div className="flex items-center gap-2 px-3 py-1.5 bg-destructive/10 text-destructive rounded-full text-sm font-medium"><AlertTriangle className="w-4 h-4" />{overdue.length} Overdue</div>}
        {urgent.length > 0 && <div className="flex items-center gap-2 px-3 py-1.5 bg-destructive/10 text-destructive rounded-full text-sm font-medium"><Bell className="w-4 h-4" />{urgent.length} Urgent (0-2d)</div>}
        {warning.length > 0 && <div className="flex items-center gap-2 px-3 py-1.5 bg-warning/10 text-warning rounded-full text-sm font-medium">{warning.length} Coming up (3-30d)</div>}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-muted text-muted-foreground rounded-full text-sm">{filtered.length} total</div>
      </div>

      {view === 'cards' ? (
        <>
          <Section title="Overdue" items={overdue} emoji="⚠️" />
          <Section title="Urgent (0-2 days)" items={urgent} emoji="🔴" />
          <Section title="Coming Up (3-30 days)" items={warning} emoji="🟠" />
          <Section title="Safe (30+ days)" items={safe} emoji="🟢" />
          {filtered.length === 0 && (
            <div className="text-center py-16">
              <CalendarIcon className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No important dates found</p>
            </div>
          )}
        </>
      ) : (
        <div className="card-nawi">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))} className="btn-outline p-2"><ChevronLeft className="w-4 h-4" /></button>
            <h3 className="text-lg font-bold font-display">{calMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h3>
            <button onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))} className="btn-outline p-2"><ChevronRight className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-xs font-semibold text-center text-muted-foreground mb-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d} className="py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day, i) => {
              if (!day) return <div key={i} className="min-h-[88px] bg-muted/30 rounded" />;
              const key = day.toISOString().slice(0, 10);
              const items = datesByDay.get(key) || [];
              const isToday = key === todayKey;
              return (
                <div key={i} className={`min-h-[88px] p-1.5 rounded border ${isToday ? 'border-primary bg-primary/5' : 'border-border bg-card'} flex flex-col`}>
                  <div className={`text-xs font-bold mb-1 ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>{day.getDate()}</div>
                  <div className="space-y-0.5 overflow-hidden">
                    {items.slice(0, 3).map((d, j) => (
                      <button key={j} onClick={() => openReminder(d)} className={`w-full text-left text-[10px] px-1 py-0.5 rounded truncate ${d.color} hover:opacity-80`} title={`${d.clientName} — ${d.label}`}>
                        {d.emoji} {d.clientName}
                      </button>
                    ))}
                    {items.length > 3 && <div className="text-[10px] text-muted-foreground px-1">+{items.length - 3} more</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <WhatsAppTemplateModal
        open={!!waModal}
        onClose={() => setWaModal(null)}
        mobile={waModal?.row.mobile || ''}
        defaultMessage={waModal?.message || ''}
        title={waModal ? `Reminder — ${waModal.row.label}` : 'Send Reminder'}
      />
    </div>
  );
}
