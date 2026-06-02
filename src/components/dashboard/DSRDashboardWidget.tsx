import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/supabase-service';
import { fetchEntries } from '@/lib/dsr-service';
import { ClipboardList, TrendingUp, Users, ChevronRight } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { calculateFinancials } from '@/lib/accounting-logic';

/** Compact DSR analytics widget — last 7 days. */
export default function DSRDashboardWidget({
  basePath = '/admin',
  employeeId,
  viewType = 'weekly',
  reportMonth,
  customStartDate,
  customEndDate
}: {
  basePath?: string;
  employeeId?: string;
  viewType?: 'monthly' | 'weekly' | 'annual' | 'custom';
  reportMonth?: string;
  customStartDate?: string;
  customEndDate?: string;
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

      const [rYear, rMonth] = reportMonth ? reportMonth.split('-').map(Number) : [now.getFullYear(), now.getMonth() + 1];

      if (viewType === 'custom' && customStartDate && customEndDate) {
        fromStr = customStartDate;
        toStr = customEndDate;
      } else if (viewType === 'weekly' && reportMonth) {
        const endOfMonth = new Date(rYear, rMonth, 0);
        const weekStart  = new Date(endOfMonth);
        weekStart.setDate(endOfMonth.getDate() - 6);
        fromStr = weekStart.toISOString().split('T')[0];
        toStr = endOfMonth.toISOString().split('T')[0];
      } else if (viewType === 'weekly') {
        const start = new Date(); start.setDate(now.getDate() - 6);
        fromStr = start.toISOString().split('T')[0];
        toStr = now.toISOString().split('T')[0];
      } else if (viewType === 'monthly' && reportMonth) {
        const lastDay = new Date(rYear, rMonth, 0).getDate();
        fromStr = `${rYear}-${String(rMonth).padStart(2, '0')}-01`;
        toStr = `${rYear}-${String(rMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      } else if (viewType === 'annual' && reportMonth) {
        fromStr = `${rYear}-01-01`;
        toStr = `${rYear}-12-31`;
      }

      const allEntries = await fetchEntries({
        employeeId,
        fromDate: fromStr,
        toDate: toStr,
        isAdmin: true
      });

      const [profilesRes] = await Promise.all([
        !employeeId ? supabase.from('profiles').select('user_id, status').eq('status', 'active') : Promise.resolve({ data: null })
      ]);

      let entries = allEntries;

      // Removed inactive employee filter to ensure historical data is included in totals
      // if (!employeeId) {
      //   const activeEmpIds = new Set((profilesRes.data || []).map((p: any) => p.user_id));
      //   entries = entries.filter((e: any) => activeEmpIds.has(e.employee_id));
      // }

      const financials = calculateFinancials(entries);
      const sales = financials.revenue;
      const profit = financials.profit;
      const employees = new Set(entries.map((e: any) => e.employee_id)).size;

      const dailyMap = new Map<string, { profit: number; sales: number }>();

      // Fill dates for the chart based on the actual fromStr -> toStr range
      try {
        if (viewType === 'annual') {
          const y = fromStr.split('-')[0];
          for (let i = 1; i <= 12; i++) {
            dailyMap.set(`${y}-${String(i).padStart(2, '0')}`, { profit: 0, sales: 0 });
          }
        } else {
          // Fill each day in the range using a UTC-safe approach to avoid timezone shifts
          const start = new Date(fromStr + 'T00:00:00Z');
          const end = new Date(toStr + 'T00:00:00Z');
          
          let curr = new Date(start);
          let safety = 0;
          while (curr <= end && safety < 65) {
            const dateKey = curr.toISOString().split('T')[0];
            dailyMap.set(dateKey, { profit: 0, sales: 0 });
            curr.setUTCDate(curr.getUTCDate() + 1);
            safety++;
          }
        }
      } catch (err) {
        console.error("Error generating dailyMap:", err);
      }

      entries.forEach((e: any) => {
        if (!e.entry_date) return;
        try {
          // Normalize the date key to YYYY-MM-DD regardless of input format
          const dStr = e.entry_date.trim();
          const d = new Date(dStr.includes('T') ? dStr : dStr + 'T00:00:00Z');
          const key = d.toISOString().split('T')[0];
          
          if (viewType === 'annual') {
            const annualKey = key.slice(0, 7);
            const ex = dailyMap.get(annualKey);
            if (ex) { 
              ex.profit += Number(e.profit_amount || 0); 
              ex.sales += Number(e.sale_amount || 0); 
            }
          } else {
            const ex = dailyMap.get(key);
            if (ex) { 
              ex.profit += Number(e.profit_amount || 0); 
              ex.sales += Number(e.sale_amount || 0); 
            }
          }
        } catch (err) {
          console.warn('[DSRWidget] Failed to parse entry_date:', e.entry_date);
        }
      });

      const daily = Array.from(dailyMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([k, v]) => ({
          day: viewType === 'annual' ? (k.length >= 7 ? new Date(k + '-01').toLocaleDateString('en-US', { month: 'short' }) : k) : k.slice(k.length - 2),
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
        .filter(e => e.profit !== 0 || e.name !== 'Unknown')
        .sort((a, b) => b.profit - a.profit)
        .slice(0, 5);

      setStats({ count: entries.length, sales, profit, employees, daily, topEmps });
      setLoading(false);
    })();
  }, [employeeId, viewType, reportMonth, customStartDate, customEndDate]);

  return (
    <div className="card-nawi space-y-3 border-2 border-primary/20 shadow-[0_0_15px_rgba(var(--primary-rgb),0.1)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-primary" />
          <h3 className="text-base font-semibold font-display">
            DSR — {viewType === 'weekly' ? 'Last 7 Days' : viewType === 'monthly' ? 'Monthly Overview' : viewType === 'annual' ? 'Annual Performance' : 'Custom Range'}
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
