import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/supabase-service';
import { ClipboardList, TrendingUp, Users, ChevronRight } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

/** Compact DSR analytics widget — last 7 days. */
export default function DSRDashboardWidget({ 
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
  const [stats, setStats] = useState<{ count: number; sales: number; profit: number; employees: number; daily: { day: string; profit: number; sales: number }[]; topEmps: { name: string; profit: number }[] }>({
    count: 0, sales: 0, profit: 0, employees: 0, daily: [], topEmps: [],
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
        toStr = now.toISOString().split('T')[0];
      } else if (viewType === 'monthly' && reportMonth) {
        const [y, m] = reportMonth.split('-').map(Number);
        fromStr = `${y}-${String(m).padStart(2, '0')}-01`;
        toStr = new Date(y, m, 0).toISOString().split('T')[0];
      } else if (viewType === 'annual' && reportMonth) {
        const y = reportMonth.split('-')[0];
        fromStr = `${y}-01-01`;
        toStr = `${y}-12-31`;
      }

      let query = supabase.from('dsr_entries')
        .select('employee_id, employee_name, sale_amount, profit_amount, entry_date')
        .gte('entry_date', fromStr).lte('entry_date', toStr);
        
      if (employeeId) {
        query = query.eq('employee_id', employeeId);
      }

      const [dsrRes, profilesRes] = await Promise.all([
        query,
        !employeeId ? supabase.from('profiles').select('user_id, status').eq('status', 'active') : Promise.resolve({ data: null })
      ]);

      let entries = dsrRes.data || [];
      
      if (!employeeId) {
        const activeEmpIds = new Set((profilesRes.data || []).map((p: any) => p.user_id));
        entries = entries.filter((e: any) => activeEmpIds.has(e.employee_id));
      }

      const sales = entries.reduce((s, e: any) => s + Number(e.sale_amount || 0), 0);
      const profit = entries.reduce((s, e: any) => s + Number(e.profit_amount || 0), 0);
      const employees = new Set(entries.map((e: any) => e.employee_id)).size;

      const dailyMap = new Map<string, { profit: number; sales: number }>();
      
      // Fill dates for the chart based on viewType
      if (viewType === 'weekly') {
        for (let i = 6; i >= 0; i--) {
          const d = new Date(now); d.setDate(now.getDate() - i);
          dailyMap.set(d.toISOString().split('T')[0], { profit: 0, sales: 0 });
        }
      } else if (viewType === 'monthly' && reportMonth) {
        const [y, m] = reportMonth.split('-').map(Number);
        const daysInMonth = new Date(y, m, 0).getDate();
        for (let i = 1; i <= daysInMonth; i++) {
          dailyMap.set(`${y}-${String(m).padStart(2, '0')}-${String(i).padStart(2, '0')}`, { profit: 0, sales: 0 });
        }
      } else if (viewType === 'annual' && reportMonth) {
        // For annual, show months instead of days
        const y = reportMonth.split('-')[0];
        for (let i = 1; i <= 12; i++) {
          dailyMap.set(`${y}-${String(i).padStart(2, '0')}`, { profit: 0, sales: 0 });
        }
      }

      entries.forEach((e: any) => {
        let key = e.entry_date;
        if (viewType === 'annual') key = e.entry_date?.slice(0, 7);
        
        const ex = dailyMap.get(key);
        if (ex) { ex.profit += Number(e.profit_amount || 0); ex.sales += Number(e.sale_amount || 0); }
      });

      const daily = Array.from(dailyMap.entries()).map(([k, v]) => ({ 
        day: viewType === 'annual' ? new Date(k + '-01').toLocaleDateString('en-US', { month: 'short' }) : k.slice(k.length - 2), 
        ...v 
      }));

      const empMap = new Map<string, { name: string; profit: number }>();
      entries.forEach((e: any) => {
        const k = e.employee_id;
        const cur = empMap.get(k) || { name: e.employee_name || 'Unknown', profit: 0 };
        cur.profit += Number(e.profit_amount || 0);
        empMap.set(k, cur);
      });
      const topEmps = Array.from(empMap.values())
        .filter(e => e.profit > 0)
        .sort((a, b) => b.profit - a.profit)
        .slice(0, 5);

      setStats({ count: entries.length, sales, profit, employees, daily, topEmps });
      setLoading(false);
    })();
  }, [employeeId, viewType, reportMonth]);

  return (
    <div className="card-nawi space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-primary" />
          <h3 className="text-base font-semibold font-display">
            DSR — {viewType === 'weekly' ? 'Last 7 Days' : viewType === 'monthly' ? 'Monthly Overview' : 'Annual Performance'}
          </h3>
        </div>
        <Link to={`${basePath}/dsr`} className="text-xs text-primary hover:underline flex items-center gap-1">View all <ChevronRight className="w-3 h-3" /></Link>
      </div>

      {loading ? <div className="skeleton-nawi h-40" /> : stats.count === 0 ? (
        <div className="h-48 flex flex-col items-center justify-center text-muted-foreground bg-muted/10 rounded-lg border border-dashed border-border">
          <ClipboardList className="w-8 h-8 mb-2 opacity-20" />
          <p className="text-xs font-medium">No DSR entries found</p>
          <p className="text-[10px] opacity-60">
            {viewType === 'weekly' ? 'Last 7 days' : viewType === 'monthly' ? 'Selected month' : 'Selected year'} ({stats.employees} active employees)
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-2">
            <Stat label="Entries" value={String(stats.count)} />
            <Stat label="Employees" value={String(stats.employees)} />
            <Stat label="Sales" value={formatCurrency(stats.sales)} />
            <Stat label="Profit" value={formatCurrency(stats.profit)} highlight />
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={stats.daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(213,45%,92%)" />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
              <Bar dataKey="profit" fill="#0A7040" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          {stats.topEmps.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">Top by Profit</p>
              {stats.topEmps.map((e, i) => (
                <div key={i} className="flex items-center justify-between text-xs py-1 border-b last:border-0">
                  <span className="flex items-center gap-2"><span className="w-4 text-muted-foreground">{i + 1}</span>{e.name}</span>
                  <span className="text-success font-medium">{formatCurrency(e.profit)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`p-2 rounded-lg ${highlight ? 'bg-success/10' : 'bg-muted/40'}`}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-sm font-bold font-display truncate ${highlight ? 'text-success' : ''}`}>{value}</p>
    </div>
  );
}
