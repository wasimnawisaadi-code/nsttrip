import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { MessagesSquare, ChevronRight, MessageCircle, Instagram, Facebook } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  NEW: '#1A5B96', IN_PROGRESS: '#C45000', CONVERTED: '#0A7040', NOT_CONVERTED: '#C0392B',
};
const STATUS_LABELS: Record<string, string> = {
  NEW: 'New', IN_PROGRESS: 'In Progress', CONVERTED: 'Converted', NOT_CONVERTED: 'Not Converted',
};
const SOURCE_META: Record<string, { label: string; Icon: any; color: string }> = {
  whatsapp:  { label: 'WhatsApp',  Icon: MessageCircle, color: '#0A7040' },
  instagram: { label: 'Instagram', Icon: Instagram,    color: '#C45000' },
  messenger: { label: 'Messenger', Icon: Facebook,     color: '#1A5B96' },
};

export default function SocialLeadsDashboardWidget({ 
  basePath = '/admin', 
  employeeId,
  viewType = 'weekly',
  reportMonth
}: { 
  basePath?: string; 
  employeeId?: string;
  viewType?: 'monthly' | 'weekly' | 'annual';
  reportMonth?: string;
}) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{ total: number; unassigned: number; converted: number; bySource: { name: string; value: number }[]; byStatus: { name: string; value: number }[] }>({
    total: 0, unassigned: 0, converted: 0, bySource: [], byStatus: [],
  });

  useEffect(() => {
    (async () => {
      setLoading(true);
      const now = new Date();
      let fromStr = '';
      let toStr = '';

      if (viewType === 'weekly') {
        const start = new Date(); start.setDate(now.getDate() - 6);
        fromStr = start.toISOString().split('T')[0];
        toStr = now.toISOString(); // Use full ISO for upper bound
      } else if (viewType === 'monthly' && reportMonth) {
        const [y, m] = reportMonth.split('-').map(Number);
        fromStr = `${y}-${String(m).padStart(2, '0')}-01T00:00:00`;
        toStr = new Date(y, m, 0).toISOString().split('T')[0] + 'T23:59:59';
      } else if (viewType === 'annual' && reportMonth) {
        const y = reportMonth.split('-')[0];
        fromStr = `${y}-01-01T00:00:00`;
        toStr = `${y}-12-31T23:59:59`;
      }

      let query = supabase.from('social_leads').select('source, status, assigned_to, created_at');
      if (fromStr) query = query.gte('created_at', fromStr);
      if (toStr) query = query.lte('created_at', toStr);
      if (employeeId) query = query.eq('assigned_to', employeeId);
      
      const { data } = await query;
      const leads = data || [];
      const sourceMap: Record<string, number> = {};
      const statusMap: Record<string, number> = {};
      let unassigned = 0, converted = 0;
      leads.forEach((l: any) => {
        sourceMap[l.source || 'unknown'] = (sourceMap[l.source || 'unknown'] || 0) + 1;
        statusMap[l.status || 'NEW'] = (statusMap[l.status || 'NEW'] || 0) + 1;
        if (!l.assigned_to) unassigned++;
        if (l.status === 'CONVERTED') converted++;
      });
      setStats({
        total: leads.length, unassigned, converted,
        bySource: Object.entries(sourceMap).map(([name, value]) => ({ name, value })),
        byStatus: Object.entries(statusMap).map(([name, value]) => ({ name, value })),
      });
      setLoading(false);
    })();
  }, [employeeId, viewType, reportMonth]);

  const conversionRate = stats.total > 0 ? Math.round((stats.converted / stats.total) * 100) : 0;

  return (
    <div className="card-nawi space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessagesSquare className="w-5 h-5 text-secondary" />
          <h3 className="text-base font-semibold font-display">
            Social Leads — {viewType === 'weekly' ? 'Last 7 Days' : viewType === 'monthly' ? 'Monthly Overview' : 'Annual Performance'}
          </h3>
        </div>
        <Link to={`${basePath}/leads`} className="text-xs text-primary hover:underline flex items-center gap-1">View all <ChevronRight className="w-3 h-3" /></Link>
      </div>

      {loading ? (
        <div className="skeleton-nawi h-40" />
      ) : stats.total === 0 ? (
        <div className="h-48 flex flex-col items-center justify-center text-muted-foreground bg-muted/10 rounded-lg border border-dashed border-border">
          <MessagesSquare className="w-8 h-8 mb-2 opacity-20" />
          <p className="text-xs font-medium">No leads found</p>
          <p className="text-[10px] opacity-60">
            {viewType === 'weekly' ? 'Last 7 days' : viewType === 'monthly' ? 'Selected month' : 'Selected year'}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-2">
            <Stat label="Total" value={String(stats.total)} />
            <Stat label="Unassigned" value={String(stats.unassigned)} warn={stats.unassigned > 0} />
            <Stat label="Converted" value={String(stats.converted)} highlight />
            <Stat label="Conv. Rate" value={`${conversionRate}%`} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">By Source</p>
              {stats.bySource.length === 0 ? (
                <p className="text-xs text-muted-foreground py-3">None</p>
              ) : (
                <div className="space-y-1.5">
                  {stats.bySource.map((s, i) => {
                    const meta = SOURCE_META[s.name] || { label: s.name, Icon: MessagesSquare, color: '#64748B' };
                    const Icon = meta.Icon;
                    const pct = stats.total > 0 ? Math.round((s.value / stats.total) * 100) : 0;
                    return (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: meta.color }} />
                        <span className="w-20 shrink-0 truncate">{meta.label}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: meta.color }} />
                        </div>
                        <span className="w-8 text-right font-mono font-medium">{s.value}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">By Status</p>
              {stats.byStatus.length === 0 ? (
                <p className="text-xs text-muted-foreground py-3">None</p>
              ) : (
                <div className="space-y-1.5">
                  {stats.byStatus.map((s, i) => {
                    const color = STATUS_COLORS[s.name] || '#888';
                    const label = STATUS_LABELS[s.name] || s.name;
                    const pct = stats.total > 0 ? Math.round((s.value / stats.total) * 100) : 0;
                    return (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                        <span className="w-24 shrink-0 truncate">{label}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                        </div>
                        <span className="w-8 text-right font-mono font-medium">{s.value}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, highlight, warn }: { label: string; value: string; highlight?: boolean; warn?: boolean }) {
  return (
    <div className={`p-2 rounded-lg ${highlight ? 'bg-success/10' : warn ? 'bg-warning/10' : 'bg-muted/40'}`}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-sm font-bold font-display truncate ${highlight ? 'text-success' : warn ? 'text-warning' : ''}`}>{value}</p>
    </div>
  );
}
