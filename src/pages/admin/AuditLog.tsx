import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatDate } from '@/lib/supabase-service';
import { Shield, Search } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';

type Range = 'day' | 'week' | 'month' | 'all';

export default function AuditLog() {
  const [logs, setLogs] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [range, setRange] = useState<Range>('week');

  useEffect(() => {
    const fetchLogs = async () => {
      const { data } = await supabase
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      setLogs(data || []);
    };
    fetchLogs();
  }, []);

  const filtered = useMemo(() => {
    const now = Date.now();
    const windows: Record<Range, number> = {
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
      all: Infinity,
    };
    const cutoff = now - windows[range];
    return logs.filter((l) => {
      if (range !== 'all' && new Date(l.created_at).getTime() < cutoff) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return l.user_name?.toLowerCase().includes(q) || l.action?.toLowerCase().includes(q) || l.target_id?.toLowerCase().includes(q);
    });
  }, [logs, search, range]);

  const actionColors: Record<string, string> = { created: 'text-success', updated: 'text-secondary', deleted: 'text-destructive' };
  const getColor = (action: string) => Object.entries(actionColors).find(([k]) => action.includes(k))?.[1] || 'text-muted-foreground';

  const ranges: { key: Range; label: string }[] = [
    { key: 'day', label: 'Day' },
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
    { key: 'all', label: 'All' },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-lg font-bold font-display">Audit Log</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-muted rounded-lg p-0.5">
            {ranges.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${range === r.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} className="input-nawi pl-9 w-64" placeholder="Search logs..." />
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{filtered.length} entries</p>
      {filtered.length === 0 ? (
        <EmptyState icon={<Shield className="w-8 h-8 text-muted-foreground" />} title="No audit logs" description="Actions will be recorded here." />
      ) : (
        <div className="card-nawi space-y-3">
          {filtered.map((l) => (
            <div key={l.id} className="flex items-start gap-3">
              <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${getColor(l.action).replace('text-', 'bg-')}`} />
              <div>
                <p className="text-sm text-foreground"><span className="font-medium">{l.user_name}</span> <span className={getColor(l.action)}>{l.action.replace(/_/g, ' ')}</span> <span className="font-mono text-xs text-muted-foreground">{l.target_id}</span></p>
                <p className="text-xs text-muted-foreground">{formatDate(l.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
