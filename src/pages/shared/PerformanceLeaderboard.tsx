import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { formatCurrency } from '@/lib/supabase-service';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Trophy, TrendingUp, Briefcase, MessagesSquare, ClipboardList, Crown, Medal, Award, Layers, Info } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

type EmpStat = {
  user_id: string; name: string; photo_url: string | null;
  dsr_sales: number; dsr_profit: number; dsr_count: number;
  clients_added: number; clients_converted: number;
  clients_sales: number; clients_profit: number;
  leads_taken: number; leads_converted: number;
  attendance_score: number;
  scores: { dsr: number; leads: number; clients: number; overall: number };
};

const RANGES = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
];

function rangeBounds(key: string) {
  const now = new Date();
  const end = now.toISOString().split('T')[0];
  const start = new Date(now);
  if (key === 'week') start.setDate(now.getDate() - 6);
  else if (key === 'month') start.setDate(1);
  else if (key === 'year') { start.setMonth(0); start.setDate(1); }
  return { from: start.toISOString().split('T')[0], to: end };
}

const CATEGORIES = [
  { key: 'overall', label: 'Overall', icon: Layers },
  { key: 'dsr', label: 'Daily Sales (DSR)', icon: TrendingUp },
  { key: 'leads', label: 'Social Leads', icon: MessagesSquare },
  { key: 'clients', label: 'Clients', icon: Briefcase },
] as const;

export default function PerformanceLeaderboard() {
  const { user, isAdmin } = useAuth();
  const [range, setRange] = useState('month');
  const [category, setCategory] = useState<'overall' | 'dsr' | 'leads' | 'clients'>('overall');
  const [stats, setStats] = useState<EmpStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { from, to } = rangeBounds(range);

      const [profRes, dsrRes, clientsRes, leadsRes, attRes, rolesRes] = await Promise.all([
        supabase.from('profiles').select('user_id, name, photo_url, status').eq('status', 'active'),
        supabase.from('dsr_entries').select('employee_id, sale_amount, profit_amount').gte('entry_date', from).lte('entry_date', to),
        supabase.from('clients').select('created_by, status, created_at, revenue, profit').gte('created_at', `${from}T00:00:00`).lte('created_at', `${to}T23:59:59`),
        supabase.from('social_leads').select('assigned_to, status, assigned_at, converted_at'),
        supabase.from('attendance').select('employee_id, status').gte('date', from).lte('date', to),
        supabase.from('user_roles').select('user_id, role'),
      ]);

      const adminIds = new Set((rolesRes.data || []).filter((r: any) => r.role === 'admin').map((r: any) => r.user_id));
      const employees = (profRes.data || []).filter((p: any) => !adminIds.has(p.user_id));
      const dsr = dsrRes.data || [];
      const clients = clientsRes.data || [];
      const leads = (leadsRes.data || []).filter((l: any) => {
        if (!l.assigned_at) return true; // include conversions even if assigned outside range
        const d = l.assigned_at.split('T')[0];
        return d >= from && d <= to;
      });
      const att = attRes.data || [];

      const rows: EmpStat[] = employees.map((e: any) => {
        const myDsr = dsr.filter((d: any) => d.employee_id === e.user_id);
        const myClients = clients.filter((c: any) => c.created_by === e.user_id);
        const myLeads = leads.filter((l: any) => l.assigned_to === e.user_id);
        const myAtt = att.filter((a: any) => a.employee_id === e.user_id);

        const dsr_sales = myDsr.reduce((s, d: any) => s + Number(d.sale_amount || 0), 0);
        const dsr_profit = myDsr.reduce((s, d: any) => s + Number(d.profit_amount || 0), 0);
        const dsr_count = myDsr.length;
        const clients_added = myClients.length;
        const clients_converted = myClients.filter((c: any) => c.status === 'Completed' || c.status === 'Success').length;
        const clients_sales = myClients.reduce((s, c: any) => s + Number(c.revenue || 0), 0);
        const clients_profit = myClients.reduce((s, c: any) => s + Number(c.profit || 0), 0);
        const leads_taken = myLeads.length;
        const leads_converted = myLeads.filter((l: any) => l.status === 'CONVERTED').length;
        const present = myAtt.filter((a: any) => a.status === 'Present').length;
        const late = myAtt.filter((a: any) => a.status === 'Late').length;
        const totalDays = Math.max(1, myAtt.length);
        const attendance_score = Math.round(((present + late * 0.7) / totalDays) * 100);

        const scoreDsr = Math.round(dsr_profit / 100) + dsr_count * 2;
        const scoreLeads = leads_converted * 30 + leads_taken * 5;
        const scoreClients = clients_converted * 50 + clients_added * 10;
        const scoreOverall = scoreDsr + scoreLeads + scoreClients + attendance_score;

        return {
          user_id: e.user_id, name: e.name, photo_url: e.photo_url,
          dsr_sales, dsr_profit, dsr_count,
          clients_added, clients_converted,
          clients_sales, clients_profit,
          leads_taken, leads_converted,
          attendance_score,
          scores: { dsr: scoreDsr, leads: scoreLeads, clients: scoreClients, overall: scoreOverall },
        };
      });

      setStats(rows);
      setLoading(false);
    })();
  }, [user, range]);

  const sorted = useMemo(() => {
    return [...stats].sort((a, b) => b.scores[category] - a.scores[category]);
  }, [stats, category]);

  const myRank = useMemo(() => sorted.findIndex(s => s.user_id === user?.id) + 1, [sorted, user]);
  const myRow = sorted.find(s => s.user_id === user?.id);
  const visible = isAdmin ? sorted : sorted.slice(0, 10);
  const top3 = sorted.slice(0, 3);

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Trophy className="h-7 w-7 text-warning" />
          <div>
            <h1 className="text-2xl font-bold font-display">Performance Leaderboard</h1>
            <p className="text-sm text-muted-foreground">{isAdmin ? 'Team rankings across all KPIs' : 'Your standing on the team'}</p>
          </div>
        </div>
        <Tabs value={range} onValueChange={setRange}>
          <TabsList>{RANGES.map(r => <TabsTrigger key={r.key} value={r.key}>{r.label}</TabsTrigger>)}</TabsList>
        </Tabs>
      </div>

      <Tabs value={category} onValueChange={(v) => setCategory(v as any)}>
        <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full md:w-auto">
          {CATEGORIES.map(c => (
            <TabsTrigger key={c.key} value={c.key} className="gap-2">
              <c.icon className="h-3.5 w-3.5" />{c.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {CATEGORIES.map(c => (
          <TabsContent key={c.key} value={c.key} className="space-y-6 mt-4">


            {top3.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {top3.map((s, i) => (
                  <Card key={s.user_id} className={i === 0 ? 'border-warning/60 bg-warning/5' : i === 1 ? 'border-muted-foreground/30' : 'border-border'}>
                    <CardContent className="pt-6 flex items-center gap-4">
                      <div className="relative">
                        {s.photo_url ? <img src={s.photo_url} className="w-14 h-14 rounded-full object-cover" alt="" />
                          : <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center font-bold">{s.name.split(' ').map(n => n[0]).join('').slice(0, 2)}</div>}
                        <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-card border flex items-center justify-center">
                          {i === 0 ? <Crown className="w-3.5 h-3.5 text-warning" /> : i === 1 ? <Medal className="w-3.5 h-3.5 text-muted-foreground" /> : <Award className="w-3.5 h-3.5 text-orange-600" />}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{s.name}</p>
                        <p className="text-xs text-muted-foreground">Rank #{i + 1} · {c.label}</p>
                        {category === 'overall' ? (
                          <p className="text-lg font-bold text-primary">{s.scores.overall} pts</p>
                        ) : category === 'dsr' ? (
                          <p className="text-lg font-bold text-success">{formatCurrency(s.dsr_profit)} profit</p>
                        ) : category === 'clients' ? (
                          <p className="text-lg font-bold text-success">{formatCurrency(s.clients_profit)} profit</p>
                        ) : (
                          <p className="text-lg font-bold text-primary">{s.leads_converted} converted</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><c.icon className="h-4 w-4" /> {c.label} Leaderboard</CardTitle></CardHeader>
              <CardContent>
                {loading ? <div className="text-center py-8 text-muted-foreground">Loading…</div>
                  : visible.length === 0 ? <div className="text-center py-8 text-muted-foreground">No data yet</div>
                  : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="border-b text-xs text-muted-foreground">
                          <th className="text-left py-2 px-2">#</th>
                          <th className="text-left py-2 px-2">Employee</th>
                          {category === 'dsr' && <><th className="text-right">Entries</th><th className="text-right">Sales</th><th className="text-right">Profit</th></>}
                          {category === 'leads' && <><th className="text-right">Taken</th><th className="text-right">Converted</th></>}
                          {category === 'clients' && <><th className="text-right">Added</th><th className="text-right">Converted</th><th className="text-right">Sales</th><th className="text-right">Profit</th></>}
                          {category === 'overall' && <>
                            <th className="text-right">Total Sales</th>
                            <th className="text-right">Total Profit</th>
                            <th className="text-right">DSR</th>
                            <th className="text-right">Clients</th>
                            <th className="text-right">Leads</th>
                            <th className="text-right">Attend.</th>
                            <th className="text-right pr-2">
                              <div className="flex items-center justify-end gap-1">
                                Score
                                <button title="Scoring Formula:&#10;• DSR: 1 pt per $100 Profit + 2 pts per entry&#10;• Clients: 50 pts per Conversion + 10 pts per Added&#10;• Leads: 30 pts per Conversion + 5 pts per Taken&#10;• Attendance: Percentage-based score">
                                  <Info className="w-3.5 h-3.5 text-muted-foreground hover:text-primary" />
                                </button>
                              </div>
                            </th>
                          </>}
                        </tr></thead>
                        <tbody>
                          {visible.map((s, i) => (
                            <tr key={s.user_id} className={`border-b last:border-0 ${s.user_id === user?.id ? 'bg-primary/5' : ''}`}>
                              <td className="py-2 px-2 font-bold">{i + 1}</td>
                              <td className="py-2 px-2 flex items-center gap-2">
                                {s.photo_url ? <img src={s.photo_url} className="w-7 h-7 rounded-full object-cover" alt="" />
                                  : <div className="w-7 h-7 rounded-full bg-muted text-xs flex items-center justify-center font-semibold">{s.name.split(' ').map(n => n[0]).join('').slice(0,2)}</div>}
                                <span className="font-medium">{s.name}</span>
                              </td>
                              {category === 'dsr' && <>
                                <td className="text-right">{s.dsr_count}</td>
                                <td className="text-right">{formatCurrency(s.dsr_sales)}</td>
                                <td className="text-right text-success font-medium">{formatCurrency(s.dsr_profit)}</td>
                              </>}
                              {category === 'leads' && <>
                                <td className="text-right">{s.leads_taken}</td>
                                <td className="text-right text-success font-medium">{s.leads_converted}</td>
                              </>}
                              {category === 'clients' && <>
                                <td className="text-right">{s.clients_added}</td>
                                <td className="text-right text-success font-medium">{s.clients_converted}</td>
                                <td className="text-right">{formatCurrency(s.clients_sales)}</td>
                                <td className="text-right text-success font-medium">{formatCurrency(s.clients_profit)}</td>
                              </>}
                              {category === 'overall' && <>
                                <td className="text-right font-medium">{formatCurrency(s.dsr_sales + s.clients_sales)}</td>
                                <td className="text-right font-bold text-success">{formatCurrency(s.dsr_profit + s.clients_profit)}</td>
                                <td className="text-right">{s.dsr_count}</td>
                                <td className="text-right">{s.clients_added}/{s.clients_converted}</td>
                                <td className="text-right">{s.leads_taken}/{s.leads_converted}</td>
                                <td className="text-right">{s.attendance_score}%</td>
                                <td className="text-right pr-2 font-bold text-primary">{s.scores.overall}</td>
                              </>}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
